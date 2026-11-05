"""Audit and improve a YOLO detection dataset.

The damage dataset is small and uneven: laptop labels cover the whole photo,
phone labels are tight crack rectangles, and there are no TV examples at all.
This script keeps the source images untouched while making the labels and
splits easier to learn from.

Actions
-------
audit
    Report split counts, class balance, negatives, box sizes, exact
    duplicates, and source-image leakage. Read-only.

whole-labels
    Replace every non-empty label file with one whole-image box per class
    present in that image. This keeps the "is this device damaged?" task while
    removing tiny crack boxes that disappear at 320-640 px. A timestamped
    backup of the old labels is written first.

import-tv
    Copy the reviewed damaged-TV frames from ``ml/tv_training`` into the damage
    dataset as class ``damaged_tv``. Frames where the screen is only a narrow
    side view are skipped, and the chronological split leaves a gap between
    train/val/test so adjacent frames do not leak across splits.

Examples
--------
python ml/damage_detection/curate.py audit --data ml/damage_detection/dataset_whole/data.yaml
python ml/damage_detection/curate.py whole-labels --data ml/damage_detection/dataset_whole/data.yaml --apply
python ml/damage_detection/curate.py import-tv --data ml/damage_detection/dataset_whole/data.yaml --apply
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}
SPLITS = ("train", "val", "test")
TOLERANCE = 1e-6
TINY_BOX_AREA = 0.0005


def load_yaml(path: Path) -> dict:
    try:
        import yaml
    except ImportError as error:  # pragma: no cover - dependency guidance
        raise SystemExit(
            "PyYAML is required. Install ml/tv_training/requirements-export.txt."
        ) from error
    with path.open(encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


def dataset_root(yaml_path: Path, data: dict) -> Path:
    root = Path(data.get("path") or ".")
    if not root.is_absolute():
        root = (yaml_path.parent / root).resolve()
    return root


def class_names(data: dict) -> dict[int, str]:
    names = data.get("names") or {}
    if isinstance(names, list):
        return {index: str(name) for index, name in enumerate(names)}
    if isinstance(names, dict):
        return {int(key): str(value) for key, value in names.items()}
    raise SystemExit("data.yaml 'names' must be a list or mapping.")


def split_directories(root: Path, value) -> list[Path]:
    if value is None:
        return []
    values = [value] if isinstance(value, str) else list(value)
    return [Path(item) if Path(item).is_absolute() else (root / item) for item in values]


def image_files(directory: Path) -> list[Path]:
    if not directory.exists():
        return []
    return sorted(
        path for path in directory.rglob("*")
        if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
    )


def labels_directory(directory: Path) -> Path:
    parts = list(directory.parts)
    for index in range(len(parts) - 1, -1, -1):
        if parts[index] == "images":
            return Path(*parts[:index], "labels", *parts[index + 1:])
    return directory.parent / "labels"


def label_for(image: Path) -> Path:
    parts = list(image.parts)
    for index in range(len(parts) - 1, -1, -1):
        if parts[index] == "images":
            return Path(*parts[:index], "labels", *parts[index + 1:]).with_suffix(".txt")
    return image.with_suffix(".txt")


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_label(path: Path) -> list[tuple[int, float, float, float, float]]:
    boxes = []
    for line in path.read_text(encoding="utf-8").splitlines():
        fields = line.split()
        if len(fields) != 5:
            continue
        try:
            class_id = int(fields[0])
            x, y, width, height = (float(value) for value in fields[1:])
        except ValueError:
            continue
        boxes.append((class_id, x, y, width, height))
    return boxes


def source_stem(image: Path) -> str:
    """Roboflow exports name augmented copies ``<source>.rf.<hash>.jpg``."""
    return image.name.split(".rf.")[0]


def split_images(root: Path, splits: dict[str, list[Path]]) -> list[tuple[str, Path]]:
    rows = []
    for split, directories in splits.items():
        for directory in directories:
            for image in image_files(directory):
                rows.append((split, image))
    return rows


def audit_data(root: Path, splits: dict[str, list[Path]], names: dict[int, str]) -> dict:
    summary: dict = {
        "dataset": str(root),
        "classes": {str(key): value for key, value in names.items()},
        "splits": {},
        "sourceLeakage": [],
        "exactDuplicates": [],
        "warnings": [],
    }
    hashes: dict[str, list[tuple[str, Path]]] = defaultdict(list)
    stems: dict[str, list[tuple[str, Path]]] = defaultdict(list)
    overall_sources: Counter = Counter()

    for split, directories in splits.items():
        images = [image for directory in directories for image in image_files(directory)]
        images_per_class: Counter = Counter()
        boxes_per_class: Counter = Counter()
        empty = 0
        tiny = 0
        box_areas = []
        missing = 0
        for image in images:
            label = label_for(image)
            hashes[file_hash(image)].append((split, image))
            stems[source_stem(image)].append((split, image))
            overall_sources[source_stem(image)] += 1
            if not label.is_file():
                missing += 1
                continue
            boxes = parse_label(label)
            if not boxes:
                empty += 1
                continue
            for class_id, _, _, width, height in boxes:
                boxes_per_class[class_id] += 1
                area = width * height
                box_areas.append(area)
                if area < TINY_BOX_AREA:
                    tiny += 1
            for class_id in {box[0] for box in boxes}:
                images_per_class[class_id] += 1
        box_areas.sort()
        summary["splits"][split] = {
            "images": len(images),
            "missingLabels": missing,
            "negativeImages": empty,
            "imagesPerClass": {
                f"{key}:{names.get(key, key)}": images_per_class.get(key, 0)
                for key in names
            },
            "boxesPerClass": {
                f"{key}:{names.get(key, key)}": boxes_per_class.get(key, 0)
                for key in names
            },
            "tinyBoxes": tiny,
            "boxArea": {
                "min": round(box_areas[0], 6) if box_areas else None,
                "median": round(box_areas[len(box_areas) // 2], 6) if box_areas else None,
                "max": round(box_areas[-1], 6) if box_areas else None,
            },
        }

    for digest, entries in hashes.items():
        split_names = {split for split, _ in entries}
        if len(entries) > 1:
            record = {
                "split": sorted(split_names),
                "files": [f"{split}:{path.name}" for split, path in entries],
            }
            if len(split_names) > 1:
                summary["exactDuplicates"].append(record)
            else:
                summary["warnings"].append(
                    f"{len(entries)} exact duplicate(s) within {entries[0][0]}: "
                    f"{entries[0][1].name}"
                )

    for stem, entries in stems.items():
        split_names = {split for split, _ in entries}
        if len(split_names) > 1:
            summary["sourceLeakage"].append(
                {
                    "source": stem,
                    "splits": sorted(split_names),
                    "files": [f"{split}:{path.name}" for split, path in entries],
                }
            )

    if summary["exactDuplicates"]:
        summary["warnings"].append(
            f"{len(summary['exactDuplicates'])} exact image duplicate group(s) span splits."
        )
    if summary["sourceLeakage"]:
        summary["warnings"].append(
            f"{len(summary['sourceLeakage'])} source image(s) have augmented copies in more than one split."
        )
    if not any(
        details["boxesPerClass"].get(f"2:{names.get(2, '')}", 0)
        for details in summary["splits"].values()
    ) and 2 in names:
        summary["warnings"].append(
            "Class 2 (damaged_tv) has no boxes. The model cannot predict TV damage."
        )
    return summary


def print_audit(summary: dict) -> None:
    print(f"Dataset: {summary['dataset']}")
    print("Classes: " + ", ".join(f"{key}={value}" for key, value in summary["classes"].items()))
    for split, details in summary["splits"].items():
        print(f"  {split}: {details['images']} images, "
              f"{sum(details['boxesPerClass'].values())} boxes, "
              f"{details['negativeImages']} negative, "
              f"{details['tinyBoxes']} tiny (< {TINY_BOX_AREA})")
        print("    images/class: " + ", ".join(
            f"{key}={value}" for key, value in details["imagesPerClass"].items()
        ))
        print("    boxes/class:  " + ", ".join(
            f"{key}={value}" for key, value in details["boxesPerClass"].items()
        ))
    for warning in summary["warnings"]:
        print(f"WARNING: {warning}")
    if not summary["warnings"]:
        print("No structural warnings.")


def whole_labels(root: Path, splits: dict[str, list[Path]], names: dict[int, str], apply: bool) -> dict:
    """Keep one whole-image box per class present in each positive image."""
    backup = None
    if apply:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        backup = root / f"labels_backup_{stamp}"
        shutil.copytree(root / "labels", backup, dirs_exist_ok=True)
        print(f"Backed up labels to {backup}")

    changed = 0
    skipped_empty = 0
    for split, directories in splits.items():
        for directory in directories:
            for image in image_files(directory):
                label = label_for(image)
                if not label.is_file():
                    continue
                boxes = parse_label(label)
                if not boxes:
                    skipped_empty += 1
                    continue
                classes = sorted({box[0] for box in boxes if box[0] in names})
                if not classes:
                    continue
                text = "".join(f"{class_id} 0.5 0.5 1.0 1.0\n" for class_id in classes)
                if apply:
                    label.write_text(text, encoding="utf-8")
                changed += 1
    return {
        "imagesChanged": changed,
        "negativesUnchanged": skipped_empty,
        "backup": str(backup) if backup else None,
        "applied": apply,
    }


def tv_frame_split(index: int, train_end: int, val_start: int, val_end: int, test_start: int) -> str | None:
    if index <= train_end:
        return "train"
    if val_start <= index <= val_end:
        return "val"
    if index >= test_start:
        return "test"
    return None


def import_tv(
    root: Path,
    splits: dict[str, list[Path]],
    names: dict[int, str],
    tv_root: Path,
    min_width: float,
    box_mode: str,
    train_end: int,
    val_start: int,
    val_end: int,
    test_start: int,
    apply: bool,
) -> dict:
    if 2 not in names:
        raise SystemExit("The target data.yaml has no class 2 (damaged_tv).")

    existing_hashes = {
        file_hash(image)
        for _, image in split_images(root, splits)
    }
    split_dirs = {
        split: directories[0]
        for split, directories in splits.items()
        if directories
    }
    manifest_rows = []
    imported = Counter()
    skipped = Counter()

    for source_split in ("train", "val"):
        images_dir = tv_root / "dataset" / "images" / source_split
        labels_dir = tv_root / "dataset" / "labels" / source_split
        for image in image_files(images_dir):
            match = image.stem.rsplit("_", 1)
            try:
                index = int(match[-1])
            except ValueError:
                skipped["unreadable-name"] += 1
                continue
            label = labels_dir / f"{image.stem}.txt"
            boxes = parse_label(label) if label.is_file() else []
            split = tv_frame_split(index, train_end, val_start, val_end, test_start)
            reason = "keep"
            if not boxes:
                reason = "missing-label"
            elif min(width for _, _, _, width, _ in boxes) < min_width:
                reason = "narrow-side-view"
            elif split is None:
                reason = "split-gap"
            if reason != "keep":
                skipped[reason] += 1
                manifest_rows.append(
                    {"source": f"{source_split}/{image.name}", "split": split or "", "action": "skip", "reason": reason}
                )
                continue
            digest = file_hash(image)
            if digest in existing_hashes:
                skipped["duplicate"] += 1
                manifest_rows.append(
                    {"source": f"{source_split}/{image.name}", "split": split, "action": "skip", "reason": "duplicate"}
                )
                continue
            existing_hashes.add(digest)

            destination_name = f"damaged-tv__{image.stem}{image.suffix.lower()}"
            if apply:
                destination_dir = split_dirs.get(split) or (root / "images" / split)
                destination = destination_dir / destination_name
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(image, destination)
                if box_mode == "whole":
                    text = "2 0.5 0.5 1.0 1.0\n"
                else:
                    text = "".join(
                        f"2 {x:.6f} {y:.6f} {width:.6f} {height:.6f}\n"
                        for _, x, y, width, height in boxes
                    )
                label_dir = labels_directory(destination_dir)
                label_dir.mkdir(parents=True, exist_ok=True)
                (label_dir / f"{destination.stem}.txt").write_text(text, encoding="utf-8")
            imported[split] += 1
            manifest_rows.append(
                {"source": f"{source_split}/{image.name}", "split": split, "action": "import", "reason": "keep"}
            )

    if apply:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        manifest = root / f"tv_frames_manifest_{stamp}.csv"
        with manifest.open("w", encoding="utf-8", newline="") as handle:
            handle.write("source,split,action,reason\n")
            for row in manifest_rows:
                handle.write(f"{row['source']},{row['split']},{row['action']},{row['reason']}\n")
        print(f"Wrote {manifest}")

    return {
        "imported": dict(imported),
        "skipped": dict(skipped),
        "boxMode": box_mode,
        "minimumBoxWidth": min_width,
        "applied": apply,
    }


def build_splits(root: Path, data: dict) -> dict[str, list[Path]]:
    return {
        "train": split_directories(root, data.get("train")),
        "val": split_directories(root, data.get("val")),
        "test": split_directories(root, data.get("test")),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--data",
        type=Path,
        default=Path(__file__).resolve().parent / "dataset_whole" / "data.yaml",
        help="Dataset YAML to use.",
    )
    parser.add_argument(
        "action",
        choices=("audit", "whole-labels", "import-tv"),
        help="What to do.",
    )
    parser.add_argument("--apply", action="store_true", help="Write changes. Without it the action is a dry run.")
    parser.add_argument("--json", action="store_true", help="Print a JSON result.")
    parser.add_argument("--tv-dataset", type=Path, default=Path(__file__).resolve().parent.parent / "tv_training")
    parser.add_argument("--min-box-width", type=float, default=0.30, help="Skip TV frames with narrower boxes.")
    parser.add_argument("--tv-box-mode", choices=("whole", "original"), default="whole")
    parser.add_argument("--train-end", type=int, default=140)
    parser.add_argument("--val-start", type=int, default=145)
    parser.add_argument("--val-end", type=int, default=174)
    parser.add_argument("--test-start", type=int, default=179)
    args = parser.parse_args()

    if not args.data.is_file():
        raise SystemExit(f"Dataset config not found: {args.data}")
    data = load_yaml(args.data)
    root = dataset_root(args.data, data)
    names = class_names(data)
    splits = build_splits(root, data)

    if args.action == "audit":
        result = audit_data(root, splits, names)
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            print_audit(result)
        return 0

    if args.action == "whole-labels":
        result = whole_labels(root, splits, names, args.apply)
    else:
        result = import_tv(
            root,
            splits,
            names,
            args.tv_dataset,
            args.min_box_width,
            args.tv_box_mode,
            args.train_end,
            args.val_start,
            args.val_end,
            args.test_start,
            args.apply,
        )

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(json.dumps(result, indent=2))
        if not args.apply:
            print("Dry run only. Re-run with --apply to write changes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
