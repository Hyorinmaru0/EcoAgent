"""Read one image from stdin and emit a local damaged-TV prediction as JSON."""
import argparse
import contextlib
import io
import json
import sys
import warnings
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--weights", type=Path, required=True)
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

            if not args.weights.is_file():
                raise RuntimeError("The trained damaged-TV model is missing.")
            torch.set_num_threads(4)
            model = YOLO(str(args.weights), task="detect")
            if model.names != {0: "damaged_tv"}:
                raise RuntimeError("Use the trained damaged_tv weights supplied with this dataset.")
            result = model.predict(
                source=image, device="cpu", imgsz=416, conf=0.25,
                max_det=20, verbose=False, save=False,
            )[0]
            detections = []
            for box in result.boxes:
                detections.append({
                    "className": "damaged_tv",
                    "score": round(float(box.conf[0]), 6),
                    "box": [round(max(0.0, min(1.0, float(v))), 6)
                            for v in box.xyxyn[0].tolist()],
                })
        print(json.dumps({
            "model": "damaged_tv",
            "source": "local-yolo",
            "threshold": 0.25,
            "image": {"width": image.width, "height": image.height},
            "detections": detections,
        }))
    except ValueError as error:
        print(json.dumps({"error": str(error), "status": 400}))
        return 1
    except ImportError:
        print(json.dumps({"error": "The detector Python environment needs ultralytics and Pillow.", "status": 503}))
        return 1
    except Exception:
        # Keep local filesystem paths and internal model errors out of API responses.
        print(json.dumps({"error": "The local TV detector could not run. Check its Python environment and trained weights.", "status": 503}))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
