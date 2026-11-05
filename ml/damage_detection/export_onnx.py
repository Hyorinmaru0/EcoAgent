"""Export damage weights to ONNX for the lightweight website runtime."""
import argparse
import shutil
from pathlib import Path


def main():
    root = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--weights", type=Path, default=root / "weights" / "best.pt")
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--opset", type=int, default=17)
    args = parser.parse_args()

    from ultralytics import YOLO

    if not args.weights.is_file():
        raise SystemExit(f"Weights not found: {args.weights}")
    model = YOLO(str(args.weights), task="detect")
    exported = Path(model.export(
        format="onnx",
        imgsz=args.imgsz,
        opset=args.opset,
        simplify=False,
        dynamic=False,
        device="cpu",
    ))
    target = args.output or args.weights.with_suffix(".onnx")
    if exported.resolve() != target.resolve():
        shutil.copyfile(exported, target)
    print(target)


if __name__ == "__main__":
    main()
