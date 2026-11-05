"""Validate a YOLO detection dataset before training.

Checks image/label pairing, class ids, normalized coordinates, positive box
sizes, duplicate images, and image leakage between splits. Exits non-zero when
an error is found.

Usage:
    python verify_dataset.py
    python verify_dataset.py --data dataset/data.yaml --json
"""
import argparse
import hashlib
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}
TOLERANCE = 1e-6


def load_yaml(path):
    try:
        import yaml
    except ImportError as error:
        raise SystemExit("PyYAML is required. Install requirements-export.txt.") from error
    with path.open(encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


def dataset_root(yaml_path, data):
    root = Path(data.get("path") or ".")
    if not root.is_absolute():
        root = (yaml_path.parent / root).resolve()
    return root


def class_names(data):
    names = data.get("names") or {}
    if isinstance(names, list):
        return {index: str(name) for index, name in enumerate(names)}
    if isinstance(names, dict):
        return {int(key): str(value) for key, value in names.items()}
    raise SystemExit("data.yaml 'names' must be a list or mapping.")


def split_directories(root, value):
    if value is None:
        return []
    values = [value] if isinstance(value, str) else list(value)
    return [Path(item) if Path(item).is_absolute() else (root / item) for item in values]


def image_files(directory):
    if not directory.exists():
        return []
    return sorted(
        path for path in directory.rglob("*")
        if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
    )


def labels_directory(directory):
    parts = list(directory.parts)
    for index in range(len(parts) - 1, -1, -1):
        if parts[index] == "images":
            return Path(*parts[:index], "labels", *parts[index + 1:])
    return directory.parent / "labels"


def label_for(image, root):
    parts = list(image.parts)
    for index in range(len(parts) - 1, -1, -1):
        if parts[index] == "images":
            return Path(*parts[:index], "labels", *parts[index + 1:]).with_suffix(".txt")
    return (root / "labels" / image.relative_to(root)).with_suffix(".txt")


def file_hash(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_label(label_path, names, counts, errors):
    text = label_path.read_text(encoding="utf-8")
    instances = 0
    for line_number, line in enumerate(text.splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        fields = line.split()
        if len(fields) != 5:
            errors.append(f"{label_path}:{line_number}: expected 5 fields, found {len(fields)}.")
            continue
        try:
            class_id = int(fields[0])
            x, y, width, height = (float(value) for value in fields[1:])
        except ValueError:
            errors.append(f"{label_path}:{line_number}: fields must be numeric.")
            continue
        if class_id not in names:
            errors.append(f"{label_path}:{line_number}: class id {class_id} is not in data.yaml names.")
            continue
        if not all(-TOLERANCE <= value <= 1 + TOLERANCE for value in (x, y, width, height)):
            errors.append(f"{label_path}:{line_number}: coordinates must be normalized to 0..1.")
            continue
        if width <= 0 or height <= 0:
            errors.append(f"{label_path}:{line_number}: box width and height must be positive.")
            continue
        if (x - width / 2 < -TOLERANCE or y - height / 2 < -TOLERANCE or
                x + width / 2 > 1 + TOLERANCE or y + height / 2 > 1 + TOLERANCE):
            errors.append(f"{label_path}:{line_number}: box extends outside the image.")
            continue
        counts[class_id] += 1
        instances += 1
    return instances


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=Path(__file__).resolve().parent / "dataset" / "data.yaml")
    parser.add_argument("--json", action="store_true", help="Print a JSON summary only.")
    parser.add_argument("--skip-hashes", action="store_true", help="Skip duplicate and leakage checks.")
    args = parser.parse_args()

    if not args.data.is_file():
        raise SystemExit(f"Dataset config not found: {args.data}")

    data = load_yaml(args.data)
    root = dataset_root(args.data, data)
    names = class_names(data)
    splits = {
        "train": split_directories(root, data.get("train")),
        "val": split_directories(root, data.get("val")),
        "test": split_directories(root, data.get("test")),
    }

    errors = []
    warnings = []
    counts = Counter()
    summary = {"dataset": str(root), "classes": names, "splits": {}}
    hashes = defaultdict(list)

    for split, directories in splits.items():
        images = [image for directory in directories for image in image_files(directory)]
        instances = 0
        missing_labels = 0
        labels_without_images = []
        if not images and split != "test":
            errors.append(f"{split}: no images found in {[str(d) for d in directories]}.")
        for image in images:
            label = label_for(image, root)
            if not label.is_file():
                errors.append(f"Missing label for {image}: expected {label}.")
                missing_labels += 1
                continue
            instances += validate_label(label, names, counts, errors)
            if not args.skip_hashes:
                hashes[file_hash(image)].append((split, image))
        for directory in directories:
            label_dir = labels_directory(directory)
            if not label_dir.exists():
                continue
            directory_images = image_files(directory)
            image_stems = {
                image.relative_to(directory).with_suffix("") for image in directory_images
            }
            for label in label_dir.rglob("*.txt"):
                if label.relative_to(label_dir).with_suffix("") not in image_stems:
                    labels_without_images.append(str(label))
        if labels_without_images:
            warnings.append(f"{split}: {len(labels_without_images)} label file(s) have no matching image.")
        summary["splits"][split] = {
            "images": len(images),
            "instances": instances,
            "missingLabels": missing_labels,
            "labelsWithoutImages": len(labels_without_images),
        }

    if not args.skip_hashes:
        for digest, entries in hashes.items():
            split_names = {split for split, _ in entries}
            if len(split_names) > 1:
                errors.append(
                    "Image leakage between splits: " +
                    ", ".join(f"{split}:{path}" for split, path in entries)
                )
            elif len(entries) > 1:
                warnings.append(f"Duplicate image within {entries[0][0]}: {entries[0][1]}")

    summary["instancesPerClass"] = {
        f"{class_id}:{names[class_id]}": counts.get(class_id, 0) for class_id in names
    }
    summary["errors"] = errors
    summary["warnings"] = warnings

    if args.json:
        print(json.dumps(summary, indent=2))
    else:
        print(f"Dataset: {root}")
        print("Classes: " + ", ".join(f"{key}={value}" for key, value in names.items()))
        for split, details in summary["splits"].items():
            print(
                f"  {split}: {details['images']} images, {details['instances']} boxes, "
                f"{details['missingLabels']} missing labels"
            )
        print("Boxes per class: " + ", ".join(
            f"{names[key]}={counts.get(key, 0)}" for key in names
        ))
        for warning in warnings:
            print(f"WARNING: {warning}")
        for error in errors:
            print(f"ERROR: {error}")
        if not errors:
            print("Dataset check passed.")

    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
