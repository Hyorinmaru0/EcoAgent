"""Train the damaged phone/laptop/TV detector on CPU.

Run verify_dataset.py first, then:
    python train.py --epochs 100 --imgsz 640 --batch 4
"""
import argparse
from pathlib import Path


def resolve_data(path):
    import yaml

    path = path.resolve()
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    root = Path(data.get("path") or ".")
    if not root.is_absolute():
        root = (path.parent / root).resolve()
    data["path"] = str(root)
    resolved = root / ".resolved-data.yaml"
    resolved.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")
    return resolved


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=Path(__file__).resolve().parent / "dataset_whole" / "data.yaml")
    parser.add_argument("--model", default="yolo11n.pt")
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=4)
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--patience", type=int, default=20)
    parser.add_argument("--name", default="damage")
    args = parser.parse_args()
    if min(args.epochs, args.imgsz, args.batch, args.threads, args.patience) < 1:
        parser.error("All settings must be positive integers.")

    import torch
    from ultralytics import YOLO

    root = Path(__file__).resolve().parent
    torch.set_num_threads(args.threads)
    data = resolve_data(args.data)
    print(f"Training {args.model} on {data} with {args.epochs} epochs.")
    model = YOLO(args.model)
    model.train(
        data=str(data),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device="cpu",
        workers=0,
        cache=False,
        amp=False,
        seed=42,
        patience=args.patience,
        project=str(root / "runs"),
        name=args.name,
        exist_ok=False,
        save=True,
        plots=True,
    )
    print(f"BEST_WEIGHTS={model.trainer.best}")
    print("Evaluate on a held-out test split before reporting real-world accuracy.")


if __name__ == "__main__":
    from multiprocessing import freeze_support

    freeze_support()
    main()
