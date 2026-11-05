"""Read one image from stdin and emit local device and optional TV predictions."""
import argparse
import contextlib
import io
import json
import math
import sys
import warnings
from pathlib import Path

CONFIDENCE_THRESHOLD = 0.25
# Below 0.25 the crop damage model only produces noise that the policy layer
# has to reject again; candidates must clear the same bar as identity boxes.
DAMAGE_CONFIDENCE_THRESHOLD = 0.25
DEVICE_IMAGE_SIZE = 640
TV_IMAGE_SIZE = 416
DAMAGE_IMAGE_SIZE = 320
DAMAGE_IOU_THRESHOLD = 0.4
MAX_DETECTIONS = 20

DEVICE_CLASS_ALIASES = {
    "laptop": "laptop",
    "laptops": "laptop",
    "cell phone": "cell phone",
    "cellphone": "cell phone",
    "television": "television",
    "tv": "television",
}
EXPECTED_DEVICE_CLASSES = {"laptop", "cell phone", "television"}


class UltralyticsDetector:
    """Fallback backend used when ONNX Runtime or an exported model is absent."""

    def __init__(self, path, image_size, iou=0.7):
        import torch
        from ultralytics import YOLO

        torch.set_num_threads(4)
        self.model = YOLO(str(path), task="detect")
        self.image_size = image_size
        self.iou = iou
        self.names = {int(key): str(value) for key, value in self.model.names.items()}

    def predict(self, image, conf, max_det):
        result = self.model.predict(
            source=image,
            device="cpu",
            imgsz=self.image_size,
            iou=self.iou,
            conf=conf,
            max_det=max_det,
            verbose=False,
            save=False,
        )[0]
        detections = []
        for box in result.boxes:
            detections.append(
                (
                    int(box.cls[0]),
                    float(box.conf[0]),
                    [round(float(value), 6) for value in box.xyxyn[0].tolist()],
                )
            )
        detections.sort(key=lambda item: item[1], reverse=True)
        return detections


def load_detector(weights, image_size, iou=0.7):
    """Prefer ONNX weights when available, otherwise fall back to Ultralytics."""
    onnx_path = weights.with_suffix(".onnx")
    if onnx_path.is_file():
        try:
            from onnx_detector import OnnxDetector

            return OnnxDetector(onnx_path, iou=iou, threads=4), "onnx"
        except ImportError:
            pass
    return UltralyticsDetector(weights, image_size, iou=iou), "ultralytics"


def format_detections(detections, class_names):
    return [
        {
            "className": class_names[class_id],
            "score": round(score, 6),
            "box": box,
        }
        for class_id, score, box in detections
    ]


def predict_damage_on_devices(model, image, devices, match_device_kind=False):
    """Zoom into verified devices so small cracks survive model resizing."""
    detections = []
    for device in devices[:MAX_DETECTIONS]:
        verification = device.get("verification", {})
        minimum = 0.6 if match_device_kind and device.get("origin") == "reference-detector" else 0.7
        if device["className"] not in EXPECTED_DEVICE_CLASSES or device["score"] < minimum or verification.get("status") != "accepted" or verification.get("label") != device["className"]:
            continue
        x1, y1, x2, y2 = device["box"]
        padding = 0 if match_device_kind else 0.08
        pad_x, pad_y = (x2 - x1) * padding, (y2 - y1) * padding
        left, top = max(0, math.floor((x1 - pad_x) * image.width + 1e-9)), max(0, math.floor((y1 - pad_y) * image.height + 1e-9))
        right, bottom = min(image.width, math.ceil((x2 + pad_x) * image.width - 1e-9)), min(image.height, math.ceil((y2 + pad_y) * image.height - 1e-9))
        if right - left < 24 or bottom - top < 24:
            continue
        crop = image.crop((left, top, right, bottom))
        for class_id, score, box in model.predict(crop, DAMAGE_CONFIDENCE_THRESHOLD, MAX_DETECTIONS):
            expected = {"cell phone": "damaged_phone", "laptop": "damaged_laptop", "television": "damaged_tv"}.get(device["className"])
            if match_device_kind and model.names[class_id] not in {expected, "visible_damage"}:
                continue
            bx1, by1, bx2, by2 = box
            detections.append({"className": model.names[class_id], "score": round(score, 6), "origin": "device-crop", **({"deviceBox": device["box"], "deviceClassName": device["className"]} if match_device_kind else {}), "box": [
                round((left + bx1 * crop.width) / image.width, 6),
                round((top + by1 * crop.height) / image.height, 6),
                round((left + bx2 * crop.width) / image.width, 6),
                round((top + by2 * crop.height) / image.height, 6),
            ]})
    return detections


def read_image(payload):
    from PIL import Image, ImageOps, UnidentifiedImageError

    Image.MAX_IMAGE_PIXELS = 20_000_000
    warnings.simplefilter("error", Image.DecompressionBombWarning)
    try:
        with Image.open(io.BytesIO(payload)) as original:
            if original.format not in {"JPEG", "PNG", "WEBP"}:
                raise ValueError("Use a JPG, PNG, or WEBP image.")
            return ImageOps.exif_transpose(original).convert("RGB")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError,
            Image.DecompressionBombWarning) as error:
        raise ValueError("The image could not be read, or is larger than 20 megapixels.") from error


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--device-weights", type=Path, required=True)
    parser.add_argument("--tv-weights", type=Path)
    parser.add_argument("--damage-weights", type=Path)
    parser.add_argument("--reference-weights", type=Path)
    args = parser.parse_args()
    try:
        # Keep stdout machine-readable, including on the first backend import.
        with contextlib.redirect_stdout(sys.stderr):
            payload = sys.stdin.buffer.read(5 * 1024 * 1024 + 1)
            if not payload or len(payload) > 5 * 1024 * 1024:
                raise ValueError("Choose an image smaller than 5 MB.")
            image = read_image(payload)

            if not args.device_weights.is_file():
                raise RuntimeError("The trained device detection model is missing.")
            device_model, device_runtime = load_detector(args.device_weights, DEVICE_IMAGE_SIZE)
            class_names = {
                class_id: DEVICE_CLASS_ALIASES.get(str(name).strip().lower().replace("_", " "))
                for class_id, name in device_model.names.items()
            }
            if set(class_names.values()) != EXPECTED_DEVICE_CLASSES:
                raise RuntimeError("Use device-detection weights trained for laptops, cell phones, and televisions.")
            device_detections = format_detections(
                device_model.predict(image, CONFIDENCE_THRESHOLD, MAX_DETECTIONS),
                class_names,
            )
            # A three-class detector can confidently call a wallet a phone.
            # Require agreement from a separate crop-level visual model.
            sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "device_detection"))
            from visual_verifier import VisualVerifier

            verifier = None
            if any(d["score"] >= 0.7 for d in device_detections):
                verifier = VisualVerifier()
                for detection in device_detections:
                    if detection["score"] >= 0.7:
                        detection["verification"] = verifier.verify(image, detection)

            tv_detections = []
            tv_runtime = None
            if args.tv_weights:
                if not args.tv_weights.is_file():
                    raise RuntimeError("The trained damaged-TV model is missing.")
                tv_model, tv_runtime = load_detector(args.tv_weights, TV_IMAGE_SIZE)
                if {int(key): str(value) for key, value in tv_model.names.items()} != {0: "damaged_tv"}:
                    raise RuntimeError("Use the trained damaged_tv weights supplied with this dataset.")
                tv_detections = format_detections(
                    tv_model.predict(image, CONFIDENCE_THRESHOLD, MAX_DETECTIONS),
                    {0: "damaged_tv"},
                )

            damage_detections = []
            damage_runtime = None
            damage_model_enabled = False
            device_crop_presence = False
            identity_damage_detections = []
            if args.damage_weights:
                if not args.damage_weights.is_file():
                    raise RuntimeError("The trained damage detection model is missing.")
                damage_model, damage_runtime = load_detector(
                    args.damage_weights, DAMAGE_IMAGE_SIZE, DAMAGE_IOU_THRESHOLD
                )
                if not damage_model.names:
                    raise RuntimeError("The damage detection model has no class names.")
                damage_model_enabled = True
                policy_path = args.damage_weights.parent / "damage-policy.json"
                if policy_path.is_file():
                    policy = json.loads(policy_path.read_text(encoding="utf-8"))
                    if policy.get("schemaVersion") != 1 or policy.get("mode") != "verified-device-crops":
                        raise RuntimeError("Unsupported damage model inference policy.")
                    device_crop_presence = True
                if not device_crop_presence:
                    damage_detections = format_detections(
                        damage_model.predict(image, DAMAGE_CONFIDENCE_THRESHOLD, MAX_DETECTIONS),
                        damage_model.names,
                    )
                    damage_detections.extend(predict_damage_on_devices(damage_model, image, device_detections))
                damage_detections.sort(key=lambda d: d["score"], reverse=True)
                identity_damage_detections = damage_detections
                if device_crop_presence:
                    # Preserve the existing identity pipeline's trained auxiliary support.
                    # Its old condition scores are NOT used as new damage evidence.
                    original_weights = Path(__file__).resolve().parents[1] / "damage_detection/weights/best.pt"
                    if original_weights.is_file() or original_weights.with_suffix(".onnx").is_file():
                        original_model, _ = load_detector(original_weights, DAMAGE_IMAGE_SIZE, DAMAGE_IOU_THRESHOLD)
                        identity_damage_detections = format_detections(
                            original_model.predict(image, DAMAGE_CONFIDENCE_THRESHOLD, MAX_DETECTIONS), original_model.names)
                        identity_damage_detections.extend(predict_damage_on_devices(original_model, image, device_detections))
                # A damaged-device model can localize a cracked phone that the
                # general identity model misses. Do not accept its class blindly:
                # verify the proposed crop independently and keep its provenance.
                recovery_classes = {"damaged_phone": "cell phone", "damaged_laptop": "laptop", "damaged_tv": "television"}
                for damage in identity_damage_detections:
                    name = recovery_classes.get(damage["className"])
                    # A condition model is not an identity model: only an
                    # unmistakable box may propose a device the custom model
                    # missed, and the visual verifier must still accept it.
                    if not name or damage["score"] < 0.85:
                        continue
                    if verifier is None:
                        verifier = VisualVerifier()
                    candidate = {"className": name, "score": damage["score"], "box": damage["box"], "origin": "damage-assisted"}
                    candidate["verification"] = verifier.verify(image, candidate)
                    device_detections.append(candidate)

            reference_runtime = None
            reference_warning = None
            if args.reference_weights:
                try:
                    from reference_identity import SUPPORTED, corroborate_reference, corroborate_uncertain_detection, reference_verification_box
                    reference_model, reference_runtime = load_detector(args.reference_weights, DEVICE_IMAGE_SIZE)
                    if not {"laptop", "cell phone", "tv"}.issubset(set(reference_model.names.values())):
                        raise RuntimeError("The reference detector does not have the expected classes.")
                    reference_candidates = []
                    for class_id, score, box in reference_model.predict(image, CONFIDENCE_THRESHOLD, 100):
                        name = SUPPORTED.get(reference_model.names[class_id])
                        if name is None or score < 0.6 or box[0] >= box[2] or box[1] >= box[3]:
                            continue
                        if verifier is None:
                            verifier = VisualVerifier()
                        candidate = {"className": name, "score": round(score, 6), "box": box, "origin": "reference-detector"}
                        visual = verifier.verify(image, {**candidate, "box": reference_verification_box(candidate, device_detections)})
                        candidate["verification"] = corroborate_reference(candidate, device_detections, identity_damage_detections, visual)
                        if candidate["verification"].get("method") == "trained-detector-consensus":
                            # Preserve the custom model's original identity/score;
                            # the reference is supporting evidence, not replacement.
                            from reference_identity import intersection_over_union
                            for original in device_detections:
                                check = original.get("verification", {})
                                if original.get("origin") is None and original["className"] == "cell phone" and original["score"] >= 0.9 and check.get("label") == "cell phone" and check.get("status") == "uncertain" and intersection_over_union(original["box"], candidate["box"]) >= 0.5:
                                    original["verification"] = {**check, "status": "accepted", "method": "trained-detector-consensus"}
                        reference_candidates.append(candidate)
                    device_detections.extend(reference_candidates)
                    # A laptop/TV box the visual verifier cannot separate from a
                    # monitor still has a second detector on the same object.
                    # Phones keep their stricter wallet/lookalike gate.
                    for detection in device_detections:
                        if detection.get("origin") is None:
                            detection["verification"] = corroborate_uncertain_detection(
                                detection, reference_candidates, detection.get("verification") or {}
                            )
                except Exception:
                    # An optional reference failure must not erase custom model results.
                    reference_runtime = None
                    reference_warning = "The additional identity detector was unavailable. These results use the custom model only."

            if device_crop_presence:
                # Presence labels cannot localize an object or recover its identity.
                # Wait for custom/reference identity checks, then assess each crop independently.
                damage_detections = predict_damage_on_devices(damage_model, image, device_detections, match_device_kind=True)
                damage_detections.sort(key=lambda detection: detection["score"], reverse=True)

            visual_damage_candidates = []
            if verifier is not None:
                # One independent condition check per accepted device crop,
                # regardless of whether the specialized YOLO model found a box.
                for class_name in ("cell phone", "laptop", "television"):
                    matches = sorted(
                        (d for d in device_detections
                         if d["className"] == class_name and
                         d.get("verification", {}).get("status") == "accepted" and
                         d.get("verification", {}).get("label") == class_name),
                        key=lambda d: (d.get("origin") == "damage-assisted", -d["score"]),
                    )
                    if not matches:
                        continue
                    evidence = (verifier.assess_phone_damage(image, matches[0]) if class_name == "cell phone"
                                else verifier.assess_device_damage(image, matches[0]))
                    if evidence is not None:
                        visual_damage_candidates.append(evidence)

            runtimes = "+".join(
                runtime for runtime in (device_runtime, tv_runtime, damage_runtime, reference_runtime) if runtime
            )
        print(json.dumps({
            "model": "device_detection",
            "source": "local-yolo",
            "runtime": runtimes,
            "threshold": CONFIDENCE_THRESHOLD,
            "image": {"width": image.width, "height": image.height},
            "detections": device_detections,
            "tvDetections": tv_detections,
            "damageDetections": damage_detections,
            "damageModel": damage_model_enabled,
            "damageInferenceMode": "verified-device-crops" if device_crop_presence else "full-image-and-device-crops",
            "visualDamageCandidates": visual_damage_candidates,
            "referenceModel": reference_runtime is not None,
            **({"referenceWarning": reference_warning} if reference_warning else {}),
        }))
    except ValueError as error:
        print(json.dumps({"error": str(error), "status": 400}))
        return 1
    except ImportError:
        print(json.dumps({"error": "The detector needs onnxruntime, numpy, and Pillow (or torch and ultralytics).", "status": 503}))
        return 1
    except Exception:
        # Keep local filesystem paths and internal model errors out of API responses.
        print(json.dumps({"error": "The local detector could not run. Check its Python environment and trained weights.", "status": 503}))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
