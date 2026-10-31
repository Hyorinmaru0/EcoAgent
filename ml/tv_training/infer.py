"""Read one image from stdin and emit local device and optional TV predictions."""
import argparse
import contextlib
import io
import json
import sys
import warnings
from pathlib import Path

CONFIDENCE_THRESHOLD = 0.5


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--device-weights", type=Path, required=True)
    parser.add_argument("--tv-weights", type=Path)
    args = parser.parse_args()
    try:
        # Keep stdout machine-readable, including on the first Ultralytics import.
        with contextlib.redirect_stdout(sys.stderr):
            import torch
            from PIL import Image, ImageOps, UnidentifiedImageError
            from ultralytics import YOLO

            Image.MAX_IMAGE_PIXELS = 20_000_000
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            payload = sys.stdin.buffer.read(5 * 1024 * 1024 + 1)
            if not payload or len(payload) > 5 * 1024 * 1024:
                raise ValueError("Choose an image smaller than 5 MB.")
            try:
                with Image.open(io.BytesIO(payload)) as original:
                    if original.format not in {"JPEG", "PNG", "WEBP"}:
                        raise ValueError("Use a JPG, PNG, or WEBP image.")
                    image = ImageOps.exif_transpose(original).convert("RGB")
            except (UnidentifiedImageError, OSError, Image.DecompressionBombError,
                    Image.DecompressionBombWarning) as error:
                raise ValueError("The image could not be read, or is larger than 20 megapixels.") from error

            if not args.device_weights.is_file():
                raise RuntimeError("The trained device detection model is missing.")
            torch.set_num_threads(4)
            device_model = YOLO(str(args.device_weights), task="detect")
            class_aliases = {
                "laptop": "laptop",
                "laptops": "laptop",
                "cell phone": "cell phone",
                "cellphone": "cell phone",
                "television": "television",
                "tv": "television",
            }
            class_names = {
                class_id: class_aliases.get(str(name).strip().lower().replace("_", " "))
                for class_id, name in device_model.names.items()
            }
            if set(class_names.values()) != {"laptop", "cell phone", "television"}:
                raise RuntimeError("Use device-detection weights trained for laptops, cell phones, and televisions.")
            device_result = device_model.predict(
                # Match the 640-pixel size used to train the three-class model.
                source=image, device="cpu", imgsz=640, conf=CONFIDENCE_THRESHOLD,
                max_det=20, verbose=False, save=False,
            )[0]
            device_detections = []
            for box in device_result.boxes:
                device_detections.append({
                    "className": class_names[int(box.cls[0])],
                    "score": round(float(box.conf[0]), 6),
                    "box": [round(max(0.0, min(1.0, float(v))), 6)
                            for v in box.xyxyn[0].tolist()],
                })
            tv_detections = []
            if args.tv_weights:
                if not args.tv_weights.is_file():
                    raise RuntimeError("The trained damaged-TV model is missing.")
                tv_model = YOLO(str(args.tv_weights), task="detect")
                if tv_model.names != {0: "damaged_tv"}:
                    raise RuntimeError("Use the trained damaged_tv weights supplied with this dataset.")
                tv_result = tv_model.predict(
                    source=image, device="cpu", imgsz=416, conf=CONFIDENCE_THRESHOLD,
                    max_det=20, verbose=False, save=False,
                )[0]
                for box in tv_result.boxes:
                    tv_detections.append({
                        "className": "damaged_tv",
                        "score": round(float(box.conf[0]), 6),
                        "box": [round(max(0.0, min(1.0, float(v))), 6)
                                for v in box.xyxyn[0].tolist()],
                    })
        print(json.dumps({
            "model": "device_detection",
            "source": "local-yolo",
            "threshold": CONFIDENCE_THRESHOLD,
            "image": {"width": image.width, "height": image.height},
            "detections": device_detections,
            "tvDetections": tv_detections,
        }))
    except ValueError as error:
        print(json.dumps({"error": str(error), "status": 400}))
        return 1
    except ImportError:
        print(json.dumps({"error": "The detector Python environment needs torch, ultralytics, and Pillow.", "status": 503}))
        return 1
    except Exception:
        # Keep local filesystem paths and internal model errors out of API responses.
        print(json.dumps({"error": "The local detector could not run. Check its Python environment and trained weights.", "status": 503}))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
