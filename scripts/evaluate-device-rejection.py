"""Evaluate the actual device ONNX model on YOLO/COCO-format held-out photos.

Usage: .venv/Scripts/python scripts/evaluate-device-rejection.py --dataset PATH
PATH must contain images/train2017 and labels/train2017 (e.g. COCO128).
This is a diagnostic, not an independent accuracy certification: training
provenance for the supplied device weights is unknown.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ml/tv_training"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ml/device_detection"))
from onnx_detector import OnnxDetector
from visual_verifier import VisualVerifier
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--dataset", type=Path, required=True)
args = parser.parse_args()
model = OnnxDetector(Path(__file__).resolve().parents[1] / "ml/device_detection/weights/best.onnx", threads=4)
verifier = VisualVerifier()
aliases = {"tv": "television", "cellphone": "cell phone", "laptops": "laptop"}
names = {i: aliases.get(n.lower().replace("_", " "), n.lower().replace("_", " ")) for i, n in model.names.items()}
targets = {62: "television", 63: "laptop", 67: "cell phone"}
rows = []
for path in sorted((args.dataset / "images/train2017").glob("*.jpg")):
    label = args.dataset / "labels/train2017" / (path.stem + ".txt")
    truth = {targets[int(line.split()[0])] for line in label.read_text().splitlines() if line.strip() and int(line.split()[0]) in targets} if label.exists() else set()
    with Image.open(path) as original:
        image = original.convert("RGB")
    predictions = model.predict(image, 0.25, 20)
    candidates = [{"class": names[i], "score": round(score, 4)} for i, score, box in predictions if box[0] < box[2] and box[1] < box[3]]
    best = candidates[0] if candidates else None
    competitor = next((d for d in candidates if best and d["class"] != best["class"]), None)
    accepted = best and best["score"] >= 0.7 and not (competitor and (competitor["score"] >= 0.7 or best["score"] - competitor["score"] < 0.15))
    if accepted:
        class_id, score, box = predictions[0]
        verification = verifier.verify(image, {"className": names[class_id], "box": box})
        accepted = verification["status"] == "accepted" and verification["label"] == best["class"]
    rows.append({"image": path.name, "truth": sorted(truth), "candidates": candidates, "accepted": best["class"] if accepted else None})
negative = [r for r in rows if not r["truth"]]
positive = [r for r in rows if r["truth"]]
print(json.dumps({"images": len(rows), "negative_images": len(negative), "positive_images": len(positive),
    "false_positive_images_at_025": sum(bool(r["candidates"]) for r in negative),
    "false_positive_images_after_policy": sum(bool(r["accepted"]) for r in negative),
    "positive_images_with_correct_accepted_class": sum(r["accepted"] in r["truth"] for r in positive),
    "false_positives": [r for r in negative if r["accepted"]],
    "positive_results": positive}, indent=2))
