"""Verify, train, export, and install the damage detector in one command.

    python ml/damage_detection/build.py
    python ml/damage_detection/build.py --epochs 150 --imgsz 640 --batch 4

The script stops if dataset validation fails. On success it copies
``best.pt`` and ``best.onnx`` into ``ml/damage_detection/weights`` and writes
``model-manifest.json`` so the website can report what it is running.
"""
import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


def run(command, **kwargs):
    print("$ " + " ".join(str(part) for part in command), flush=True)
    result = subprocess.run(command, **kwargs)
    if result.returncode != 0:
        raise SystemExit(f"Command failed with exit code {result.returncode}.")
    return result


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_classes(path):
    import yaml

    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    names = data.get("names") or {}
    if isinstance(names, list):
        return {str(index): name for index, name in enumerate(names)}
    return {str(key): value for key, value in names.items()}


def main():
    root = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=root / "dataset_whole" / "data.yaml")
    parser.add_argument("--model", default="yolo11n.pt")
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=4)
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--patience", type=int, default=20)
    parser.add_argument("--name", help="Training run name. Defaults to a timestamp.")
    parser.add_argument("--skip-verify", action="store_true")
    parser.add_argument("--skip-train", action="store_true")
    args = parser.parse_args()

    if not args.skip_verify:
        summary = run(
            [sys.executable, str(root / "verify_dataset.py"), "--data", str(args.data), "--json"],
            capture_output=True,
            text=True,
        )
        verification = json.loads(summary.stdout)
        print(
            "Dataset OK: " + ", ".join(
                f"{split}={details['images']} images"
                for split, details in verification["splits"].items()
                if details["images"]
            )
        )
    else:
        verification = {"splits": {}, "classes": {}}

    weights_dir = root / "weights"
    weights_dir.mkdir(parents=True, exist_ok=True)
    installed = weights_dir / "best.pt"
    if args.skip_train:
        if not installed.is_file():
            raise SystemExit(f"--skip-train requires existing weights at {installed}.")
        best = installed
    else:
        name = args.name or ("damage_" + datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S"))
        best = root / "runs" / name / "weights" / "best.pt"
        run([
            sys.executable, str(root / "train.py"),
            "--data", str(args.data),
            "--model", args.model,
            "--epochs", str(args.epochs),
            "--imgsz", str(args.imgsz),
            "--batch", str(args.batch),
            "--threads", str(args.threads),
            "--patience", str(args.patience),
            "--name", name,
        ])
        if not best.is_file():
            raise SystemExit(f"Training finished but best weights were not found at {best}.")
        shutil.copyfile(best, installed)
        print(f"Installed {installed}")

    run([
        sys.executable, str(root / "export_onnx.py"),
        "--weights", str(installed),
        "--imgsz", str(args.imgsz),
    ])

    try:
        import ultralytics
        version = ultralytics.__version__
    except ImportError:
        version = "unknown"
    names = read_classes(args.data) or verification.get("classes", {})
    manifest = {
        "classes": names,
        "modelFile": "weights/best.pt",
        "onnxFile": "weights/best.onnx",
        "sha256": sha256(installed),
        "sourceRun": str(best.relative_to(root)),
        "trainingEpochs": args.epochs,
        "datasetConfig": str(args.data),
        "imageSize": args.imgsz,
        "onnxImageSize": args.imgsz,
        "splits": verification.get("splits", {}),
        "instancesPerClass": verification.get("instancesPerClass", {}),
        "independentTestSet": verification.get("splits", {}).get("test", {}).get("images", 0) > 0,
        "ultralyticsVersion": version,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    (root / "model-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {root / 'model-manifest.json'}")
    print("Restart the dev server to load the new damage model.")


if __name__ == "__main__":
    main()
