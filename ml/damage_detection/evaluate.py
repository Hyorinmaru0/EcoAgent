"""Evaluate trained damage weights on a validation or test split.

    python evaluate.py --weights weights/best.pt --split val
    python evaluate.py --weights weights/best.pt --split test
"""
import argparse
import json
from pathlib import Path

from train import resolve_data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    root = Path(__file__).resolve().parent
    parser.add_argument("--weights", type=Path, default=root / "weights" / "best.pt")
    parser.add_argument("--data", type=Path, default=root / "dataset" / "data.yaml")
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=4)
    parser.add_argument("--split", choices=("train", "val", "test"), default="val")
    args = parser.parse_args()

    from ultralytics import YOLO

    if not args.weights.is_file():
        raise SystemExit(f"Weights not found: {args.weights}")
    data = resolve_data(args.data)
    model = YOLO(str(args.weights), task="detect")
    metrics = model.val(
        data=str(data),
        split=args.split,
        imgsz=args.imgsz,
        batch=args.batch,
        device="cpu",
        workers=0,
        plots=True,
    )
    per_class = {}
    metric_indexes = {
        int(class_id): index
        for index, class_id in enumerate(metrics.box.ap_class_index)
    }
    for class_id, class_name in model.names.items():
        index = metric_indexes.get(int(class_id))
        per_class[class_name] = None if index is None else {
            "precision": float(metrics.box.p[index]),
            "recall": float(metrics.box.r[index]),
            "map50": float(metrics.box.ap50[index]),
            "map50_95": float(metrics.box.ap[index]),
        }
    print(json.dumps({
        "split": args.split,
        "precision": float(metrics.box.mp),
        "recall": float(metrics.box.mr),
        "map50": float(metrics.box.map50),
        "map50_95": float(metrics.box.map),
        "perClass": per_class,
    }, indent=2))


if __name__ == "__main__":
    main()
