"""Compare identity models on labeled photos; reports diagnostics, not certification."""
import argparse
import json
import sys
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "ml/tv_training"))
sys.path.insert(0, str(root / "ml/device_detection"))
from onnx_detector import OnnxDetector
from visual_verifier import VisualVerifier

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--dataset", type=Path, required=True)
parser.add_argument("--reference", type=Path, required=True)
parser.add_argument("--output", type=Path, default=root / "reports/device-model-benchmark.json")
args = parser.parse_args()
models = {"custom": OnnxDetector(root / "ml/device_detection/weights/best.onnx", threads=4), "reference": OnnxDetector(args.reference, threads=4)}
verifier = VisualVerifier()
aliases = {"laptops": "laptop", "tv": "television"}
targets = {62: "television", 63: "laptop", 67: "cell phone"}

def iou(a, b):
    intersection = max(0, min(a[2], b[2]) - max(a[0], b[0])) * max(0, min(a[3], b[3]) - max(a[1], b[1]))
    union = (a[2]-a[0])*(a[3]-a[1]) + (b[2]-b[0])*(b[3]-b[1]) - intersection
    return intersection / union if union else 0

rows = []
for path in sorted((args.dataset / "images/train2017").glob("*.jpg")):
    truth = []
    label_path = args.dataset / "labels/train2017" / f"{path.stem}.txt"
    for line in label_path.read_text().splitlines() if label_path.exists() else []:
        c, cx, cy, w, h = map(float, line.split())
        if int(c) in targets:
            truth.append({"className": targets[int(c)], "box": [cx-w/2, cy-h/2, cx+w/2, cy+h/2]})
    with Image.open(path) as original:
        image = original.convert("RGB")
    row = {"image": path.name, "truth": truth}
    for name, model in models.items():
        predictions = []
        for c, score, box in model.predict(image, 0.25, 100):
            cls = aliases.get(model.names[c], model.names[c])
            if cls not in targets.values():
                continue
            detection = {"className": cls, "score": round(score, 6), "box": box}
            if name == "custom" and score >= 0.7:
                detection["verification"] = verifier.verify(image, detection)
            predictions.append(detection)
        row[name] = predictions
    rows.append(row)

summaries = []
for name in models:
    for threshold in [0.25, 0.5, 0.7]:
        tp = fp = fn = 0
        per_class = {cls: {"tp": 0, "fp": 0, "fn": 0} for cls in targets.values()}
        for row in rows:
            matched = set()
            for d in sorted((d for d in row[name] if d["score"] >= threshold), key=lambda d: -d["score"]):
                possibilities = [(i, iou(d["box"], t["box"])) for i, t in enumerate(row["truth"]) if i not in matched and t["className"] == d["className"]]
                best = max(possibilities, key=lambda t: t[1], default=(-1, 0))
                if best[1] >= 0.5:
                    matched.add(best[0]); tp += 1; per_class[d["className"]]["tp"] += 1
                else:
                    fp += 1; per_class[d["className"]]["fp"] += 1
            for i, t in enumerate(row["truth"]):
                if i not in matched:
                    fn += 1; per_class[t["className"]]["fn"] += 1
        summaries.append({"model": name, "threshold": threshold, "tp": tp, "fp": fp, "fn": fn, "per_class": per_class})
report = {"note": "COCO128 is a training subset for COCO-pretrained models; these scores are diagnostic and biased, not independent validation.", "images": len(rows), "positive_images": sum(bool(r["truth"]) for r in rows), "summaries": summaries, "rows": rows}
args.output.write_text(json.dumps(report, indent=2))
print(json.dumps({k: v for k, v in report.items() if k != "rows"}, indent=2))
