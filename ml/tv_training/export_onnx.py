"""Export trained YOLO weights to ONNX for lightweight inference.

Usage:
    python export_onnx.py --weights ml/device_detection/weights/best.pt --imgsz 640
    python export_onnx.py --weights ml/tv_training/weights/best.pt --imgsz 416

The export writes ``best.onnx`` next to each ``best.pt`` unless ``--output``
is supplied. Run this once on a machine that has Ultralytics installed; the
runtime only needs onnxruntime, numpy, and Pillow.
"""
import argparse
import shutil
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--weights", type=Path, required=True)
    parser.add_argument("--imgsz", type=int, required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--opset", type=int, default=17)
    args = parser.parse_args()

    from ultralytics import YOLO

    if not args.weights.is_file():
        raise SystemExit(f"Weights not found: {args.weights}")

    model = YOLO(str(args.weights), task="detect")
    exported = Path(
        model.export(
            format="onnx",
            imgsz=args.imgsz,
            opset=args.opset,
            simplify=False,
            dynamic=False,
            device="cpu",
        )
    )
    target = args.output or args.weights.with_suffix(".onnx")
    if exported.resolve() != target.resolve():
        shutil.copyfile(exported, target)
    print(target)


if __name__ == "__main__":
    main()
