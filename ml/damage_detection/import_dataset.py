"""Import a public detection dataset into the damage dataset.

Supports Roboflow YOLO exports, generic YOLO folders, and COCO JSON folders or
zips. Classes are remapped into the names already listed in ``dataset/data.yaml``
so several datasets can be merged into one training set.

Examples:
    python import_dataset.py --dataset laptop_defects --source C:\\Downloads\\laptop-defects.zip
    python import_dataset.py --source .\\cracked --format yolo --target-class damaged_phone
    python import_dataset.py --source .\\coco --format coco --class-map "cracked=damaged_phone"

Nothing is written until every class can be resolved. Re-running is safe:
images already present are skipped by content hash.
"""
import argparse
import hashlib
import json
import random
import shutil
import sys
import tempfile
import zipfile
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}
SPLIT_ALIASES = {
    "train": "train",
    "training": "train",
    "valid": "val",
    "validation": "val",
    "val": "val",
    "test": "test",
    "testing": "test",
}
TOLERANCE = 1e-6


@dataclass
class Sample:
    split: str | None
    image: Path
    boxes: list
    labeled: bool


def canonical(value):
    cleaned = "".join(character.lower() if character.isalnum() else " " for character in str(value))
    return " ".join(cleaned.split())


def canonical_split(value):
    return SPLIT_ALIASES.get(canonical(value).replace(" ", ""))


def load_yaml(path):
    try:
        import yaml
    except ImportError as error:
        raise SystemExit("PyYAML is required. Install ml/tv_training/requirements-export.txt.") from error
    with path.open(encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


def normalize_names(names):
    if isinstance(names, list):
        return {index: str(name) for index, name in enumerate(names)}
    if isinstance(names, dict):
        return {int(key): str(value) for key, value in names.items()}
    raise SystemExit("Class names must be a list or a mapping.")


def read_names(path):
    if path.suffix.lower() in {".yaml", ".yml"}:
        data = load_yaml(path)
        names = data.get("names")
        if names is None:
            return None
        return normalize_names(names)
    if path.suffix.lower() in {".txt", ".names"}:
        lines = [line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
        return {index: name for index, name in enumerate(lines)} or None
    return None


def find_names(root, groups):
    candidates = [root / "data.yaml", root / "data.yml", root / "classes.txt", root / "obj.names"]
    for _, images_dir, labels_dir in groups:
        for directory in (images_dir, images_dir.parent, labels_dir, labels_dir.parent if labels_dir else None):
            if directory:
                candidates.extend([directory / "data.yaml", directory / "classes.txt", directory / "obj.names"])
    for candidate in candidates:
        if candidate.is_file():
            names = read_names(candidate)
            if names:
                return names
    return None


def file_hash(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def scan_existing_hashes(root):
    hashes = set()
    for split in ("train", "val", "test"):
        directory = root / "images" / split
        if not directory.is_dir():
            continue
        for path in directory.rglob("*"):
            if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES:
                hashes.add(file_hash(path))
    return hashes


def normalize_box(x, y, width, height):
    left = max(0.0, min(1.0, x - width / 2))
    top = max(0.0, min(1.0, y - height / 2))
    right = max(0.0, min(1.0, x + width / 2))
    bottom = max(0.0, min(1.0, y + height / 2))
    new_width = right - left
    new_height = bottom - top
    if new_width <= TOLERANCE or new_height <= TOLERANCE:
        return None
    return ((left + right) / 2, (top + bottom) / 2, new_width, new_height)


def effective_root(root):
    current = root
    for _ in range(5):
        if any((current / name).is_dir() for name in ("images", "train", "valid", "val", "test")):
            return current
        children = [
            child for child in current.iterdir()
            if child.is_dir() and not child.name.startswith("__MACOSX")
        ]
        if len(children) != 1:
            return current
        current = children[0]
    return current


def yolo_groups(root):
    groups = []
    images_root = root / "images"
    labels_root = root / "labels"
    if images_root.is_dir():
        split_dirs = [child for child in images_root.iterdir() if child.is_dir() and canonical_split(child.name)]
        if split_dirs:
            for child in sorted(split_dirs):
                split = canonical_split(child.name)
                labels = labels_root / child.name
                if not labels.is_dir():
                    labels = labels_root / split
                groups.append((split, child, labels if labels.is_dir() else None))
        else:
            groups.append((None, images_root, labels_root if labels_root.is_dir() else None))

    for child in sorted(root.iterdir()):
        if not child.is_dir():
            continue
        split = canonical_split(child.name)
        if not split or any(group[0] == split for group in groups):
            continue
        images = child / "images"
        labels = child / "labels"
        if images.is_dir():
            groups.append((split, images, labels if labels.is_dir() else None))
            continue
        sibling_labels = root / "labels" / child.name
        if any(path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES for path in child.rglob("*")):
            groups.append((split, child, sibling_labels if sibling_labels.is_dir() else None))

    if not groups and any(path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES for path in root.iterdir()):
        labels = root / "labels"
        groups.append((None, root, labels if labels.is_dir() else None))

    if not groups:
        raise SystemExit(f"No YOLO images found under {root}. Expected images/ and labels/ folders.")
    return groups


def collect_yolo_samples(groups, names):
    samples = []
    for split, images_dir, labels_dir in groups:
        for image in sorted(images_dir.rglob("*")):
            if not image.is_file() or image.suffix.lower() not in IMAGE_SUFFIXES:
                continue
            relative = image.relative_to(images_dir)
            label = labels_dir / relative.with_suffix(".txt") if labels_dir else None
            labeled = bool(label and label.is_file())
            boxes = []
            if labeled:
                for line_number, line in enumerate(label.read_text(encoding="utf-8").splitlines(), 1):
                    fields = line.split()
                    if not fields:
                        continue
                    if len(fields) != 5 and (len(fields) < 7 or len(fields) % 2 == 0):
                        print(f"WARNING: {label}:{line_number}: expected a YOLO box or polygon, skipping.")
                        continue
                    try:
                        class_id = int(fields[0])
                        coordinates = [float(value) for value in fields[1:]]
                    except ValueError:
                        print(f"WARNING: {label}:{line_number}: non-numeric fields, skipping.")
                        continue
                    if len(coordinates) == 4:
                        x, y, width, height = coordinates
                    else:
                        points = list(zip(coordinates[::2], coordinates[1::2]))
                        left = min(point[0] for point in points)
                        top = min(point[1] for point in points)
                        right = max(point[0] for point in points)
                        bottom = max(point[1] for point in points)
                        x, y = (left + right) / 2, (top + bottom) / 2
                        width, height = right - left, bottom - top
                    source_name = str(names[class_id]) if names and class_id in names else str(class_id)
                    boxes.append((source_name, x, y, width, height))
            samples.append(Sample(split, image, boxes, labeled))
    return samples


def infer_split(value):
    text = canonical(value).replace(" ", "")
    for alias, split in SPLIT_ALIASES.items():
        if alias in text:
            return split
    return None


def coco_json_files(root):
    found = []
    for path in sorted(root.rglob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(data, dict) and {"images", "annotations", "categories"} <= data.keys():
            found.append((path, data))
    return found


def resolve_image(root, json_path, file_name):
    relative = Path(str(file_name).replace("\\", "/"))
    candidates = [
        json_path.parent / relative,
        json_path.parent / "images" / relative,
        root / relative,
        root / "images" / relative,
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    for candidate in root.rglob(relative.name):
        if candidate.is_file():
            return candidate
    return None


def image_dimensions(image, image_path):
    width = image.get("width")
    height = image.get("height")
    if width and height:
        return float(width), float(height)
    try:
        from PIL import Image
    except ImportError as error:
        raise SystemExit("Pillow is required for COCO images without width/height.") from error
    with Image.open(image_path) as handle:
        return (float(value) for value in handle.size)


def coco_box(image, image_path, bbox):
    left, top, width, height = (float(value) for value in bbox)
    image_width, image_height = image_dimensions(image, image_path)
    if image_width <= 0 or image_height <= 0:
        return None
    return (
        (left + width / 2) / image_width,
        (top + height / 2) / image_height,
        width / image_width,
        height / image_height,
    )


def collect_coco_samples(root):
    samples = []
    seen_images = set()
    for json_path, data in coco_json_files(root):
        split = infer_split(json_path.stem) or infer_split(json_path.parent.name)
        categories = {int(category["id"]): str(category["name"]) for category in data["categories"]}
        annotations = {}
        for annotation in data["annotations"]:
            annotations.setdefault(annotation.get("image_id"), []).append(annotation)
        for image in data["images"]:
            image_path = resolve_image(root, json_path, image.get("file_name", ""))
            if image_path is None:
                print(f"WARNING: image not found for COCO entry {image.get('file_name')} in {json_path}.")
                continue
            key = image_path.resolve()
            if key in seen_images:
                continue
            seen_images.add(key)
            boxes = []
            for annotation in annotations.get(image.get("id"), []):
                bbox = annotation.get("bbox")
                if not bbox or len(bbox) != 4:
                    continue
                box = coco_box(image, image_path, bbox)
                if box is None:
                    continue
                source_name = categories.get(int(annotation.get("category_id")), str(annotation.get("category_id")))
                boxes.append((source_name, *box))
            samples.append(Sample(split, image_path, boxes, True))
    if not samples:
        raise SystemExit(f"No COCO images found under {root}.")
    return samples


def extract_zip(archive_path, destination):
    destination = destination.resolve()
    with zipfile.ZipFile(archive_path) as archive:
        for member in archive.infolist():
            target = (destination / member.filename).resolve()
            if destination != target and destination not in target.parents:
                raise SystemExit(f"Unsafe path in zip archive: {member.filename}")
            archive.extract(member, destination)


@contextmanager
def source_root(source, keep_temp=False):
    if source.is_dir():
        yield source
        return
    if source.suffix.lower() != ".zip":
        raise SystemExit(f"Source must be a folder or .zip file: {source}")
    temporary = Path(tempfile.mkdtemp(prefix="ecocycle_dataset_"))
    try:
        extract_zip(source, temporary)
        yield temporary
    finally:
        if keep_temp:
            print(f"Kept extracted dataset at {temporary}")
        else:
            shutil.rmtree(temporary, ignore_errors=True)


def build_resolver(target_names, explicit, target_class):
    target_by_key = {canonical(name): class_id for class_id, name in target_names.items()}

    def target_id(value):
        key = canonical(value)
        if key in target_by_key:
            return target_by_key[key]
        if str(value).isdigit() and int(value) in target_names:
            return int(value)
        raise SystemExit(f"Unknown target class '{value}'. Available: {', '.join(target_names.values())}.")

    resolved = {canonical(source): target_id(destination) for source, destination in explicit.items()}
    default = target_id(target_class) if target_class else None

    def resolve(source_name):
        key = canonical(source_name)
        if key in resolved:
            return resolved[key]
        if default is not None:
            return default
        raise SystemExit(
            f"Source class '{source_name}' has no mapping. "
            "Pass --target-class for single-class datasets or --class-map for a mapping."
        )

    return resolve


def parse_class_map(value):
    mapping = {}
    if not value:
        return mapping
    for item in value.split(","):
        item = item.strip()
        if not item:
            continue
        if "=" not in item:
            raise SystemExit(f"Invalid --class-map entry '{item}'. Use source=target.")
        source, destination = item.split("=", 1)
        mapping[source.strip()] = destination.strip()
    return mapping


def sanitize(value):
    cleaned = "".join(character if character.isalnum() or character in "-_" else "_" for character in value)
    return cleaned.strip("_") or "dataset"


def choose_split(digest, val_ratio, test_ratio):
    bucket = int(digest[:8], 16) % 10000 / 10000
    if bucket < test_ratio:
        return "test"
    if bucket < test_ratio + val_ratio:
        return "val"
    return "train"


def unique_path(path):
    if not path.exists():
        return path
    for index in range(2, 10000):
        candidate = path.with_name(f"{path.stem}-{index}{path.suffix}")
        if not candidate.exists():
            return candidate
    raise SystemExit(f"Could not find a free filename for {path}.")


def write_label(path, boxes):
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        f"{class_id} {x:.6f} {y:.6f} {width:.6f} {height:.6f}"
        for class_id, x, y, width, height in boxes
    ]
    path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")


def load_registry(path):
    if not path.is_file():
        return {}
    return load_yaml(path).get("datasets", {}) or {}


def main():
    root = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True, help="Dataset folder or .zip file.")
    parser.add_argument("--data", type=Path, default=root / "dataset" / "data.yaml")
    parser.add_argument("--format", choices=("auto", "yolo", "coco"), default="auto")
    parser.add_argument("--dataset", help="Registry entry from datasets.yaml.")
    parser.add_argument("--registry", type=Path, default=root / "datasets.yaml")
    parser.add_argument("--target-class", help="Map every unmapped source class to this target class.")
    parser.add_argument("--class-map", help="Comma-separated source=target pairs.")
    parser.add_argument("--class-map-file", type=Path, help="YAML or JSON file of source: target pairs.")
    parser.add_argument("--name", help="Prefix for imported files. Defaults to the source name.")
    parser.add_argument("--val-ratio", type=float, default=0.15)
    parser.add_argument("--test-ratio", type=float, default=0.0)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--include-unlabeled", action="store_true", help="Treat images without labels as negatives.")
    parser.add_argument("--skip-dedup", action="store_true")
    parser.add_argument("--limit", type=int, help="Only import the first N samples.")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-verify", action="store_true")
    parser.add_argument("--keep-temp", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    if not args.source.exists():
        raise SystemExit(f"Source not found: {args.source}")
    if not args.data.is_file():
        raise SystemExit(f"Target config not found: {args.data}")
    if args.val_ratio < 0 or args.test_ratio < 0 or args.val_ratio + args.test_ratio >= 1:
        parser.error("--val-ratio and --test-ratio must be non-negative and sum to less than 1.")

    registry = load_registry(args.registry)
    entry = registry.get(args.dataset, {}) if args.dataset else {}
    if args.dataset and not entry:
        raise SystemExit(f"Unknown --dataset '{args.dataset}'. Available: {', '.join(registry) or 'none'}.")
    dataset_format = args.format if args.format != "auto" else entry.get("format", "auto")
    target_class = args.target_class or entry.get("target_class")

    explicit = parse_class_map(args.class_map)
    if args.class_map_file:
        if args.class_map_file.suffix.lower() in {".yaml", ".yml"}:
            explicit.update(load_yaml(args.class_map_file))
        else:
            explicit.update(json.loads(args.class_map_file.read_text(encoding="utf-8")))
    if entry.get("class_map"):
        explicit = {**entry["class_map"], **explicit}

    target_names = normalize_names(load_yaml(args.data).get("names") or {})
    if not target_names:
        raise SystemExit(f"{args.data} has no class names.")
    resolve = build_resolver(target_names, explicit, target_class)

    target_root = args.data.parent
    slug = sanitize(args.name or args.source.stem)

    with source_root(args.source, keep_temp=args.keep_temp) as source:
        if dataset_format == "auto":
            dataset_format = "coco" if coco_json_files(source) else "yolo"
        if dataset_format == "yolo":
            source = effective_root(source)
        if dataset_format == "coco":
            samples = collect_coco_samples(source)
            names = None
        else:
            groups = yolo_groups(source)
            names = find_names(source, groups)
            samples = collect_yolo_samples(groups, names)
        if args.limit:
            samples = samples[: args.limit]

        existing = set() if args.skip_dedup else scan_existing_hashes(target_root)
        seen = set()
        split_counts = {"train": 0, "val": 0, "test": 0}
        class_counts = {class_id: 0 for class_id in target_names}
        skipped_duplicates = 0
        skipped_unlabeled = 0
        skipped_invalid = 0
        imported = 0

        for sample in samples:
            if not sample.labeled and not args.include_unlabeled:
                skipped_unlabeled += 1
                continue

            boxes = []
            for source_name, x, y, width, height in sample.boxes:
                box = normalize_box(x, y, width, height)
                if box is None:
                    skipped_invalid += 1
                    continue
                boxes.append((resolve(source_name), *box))
            if entry.get("box_mode") == "whole_image" and boxes:
                boxes = [(boxes[0][0], 0.5, 0.5, 1.0, 1.0)]

            digest = file_hash(sample.image)
            if digest in existing or digest in seen:
                skipped_duplicates += 1
                continue
            seen.add(digest)

            split = sample.split or choose_split(digest, args.val_ratio, args.test_ratio)
            destination = target_root / "images" / split / f"{slug}__{sample.image.stem}{sample.image.suffix.lower()}"
            label = target_root / "labels" / split / f"{destination.stem}.txt"
            if not args.dry_run:
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination = unique_path(destination)
                label = target_root / "labels" / split / f"{destination.stem}.txt"
                shutil.copyfile(sample.image, destination)
                write_label(label, boxes)

            imported += 1
            split_counts[split] += 1
            for class_id, *_ in boxes:
                class_counts[class_id] += 1

        summary = {
            "dataset": args.dataset,
            "source": str(args.source),
            "format": dataset_format,
            "imported": imported,
            "splits": split_counts,
            "instancesPerClass": {target_names[key]: value for key, value in class_counts.items()},
            "skipped": {
                "duplicates": skipped_duplicates,
                "unlabeled": skipped_unlabeled,
                "invalidBoxes": skipped_invalid,
            },
            "dryRun": args.dry_run,
        }

        verification = None
        verify_result = None
        if not args.skip_verify and not args.dry_run and args.json:
            import subprocess

            verify_result = subprocess.run(
                [sys.executable, str(root / "verify_dataset.py"), "--data", str(args.data), "--json"],
                capture_output=True,
                text=True,
            )
            try:
                verification = json.loads(verify_result.stdout)
            except json.JSONDecodeError:
                verification = {"raw": verify_result.stdout, "stderr": verify_result.stderr}
            verification["passed"] = verify_result.returncode == 0

        if args.json:
            if verification is not None:
                summary["verification"] = verification
            print(json.dumps(summary, indent=2))
        else:
            print(f"Imported {imported} images from {args.source} ({dataset_format}).")
            print("  " + ", ".join(f"{split}={count}" for split, count in split_counts.items()))
            print("  boxes: " + ", ".join(f"{target_names[key]}={count}" for key, count in class_counts.items()))
            print(
                "  skipped: "
                f"{skipped_duplicates} duplicates, {skipped_unlabeled} unlabeled, "
                f"{skipped_invalid} invalid boxes"
            )
            if args.dry_run:
                print("Dry run only. Re-run without --dry-run to write files.")
            if names is None and dataset_format == "yolo":
                print("WARNING: no class-name file found; source class ids were used as names.")
            if not args.skip_verify and not args.dry_run:
                import subprocess

                print("Verifying merged dataset...")
                verify_result = subprocess.run(
                    [sys.executable, str(root / "verify_dataset.py"), "--data", str(args.data)],
                    text=True,
                )

    if verify_result is not None:
        return verify_result.returncode
    return 0


if __name__ == "__main__":
    sys.exit(main())
