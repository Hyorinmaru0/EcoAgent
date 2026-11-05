# Damage detector: phones, laptops, and TVs

This folder trains and installs an optional YOLO model that flags possible
damage on phones, laptops, and TVs. The website runs it alongside the existing
device-identity and damaged-TV models. It is not a diagnosis, severity rating,
repair estimate, or safety assessment.

Current `dataset_whole` snapshot: 2,766 train / 222 validation / 202 test
images, with 1,012 `damaged_phone`, 1,603 `damaged_laptop`, and 174
`damaged_tv` boxes. The installed weights predate the TV import, so retrain
with `npm run train:damage` before expecting TV damage candidates.

## 0. Import a public dataset

`datasets.yaml` lists datasets that fit this model. Download one from its page,
export it as YOLO (or COCO), then import it. YOLO segmentation polygons are
converted to bounding rectangles, so the model trains as an object detector and
does not learn the exact crack outline.

The project page currently lists 2,010 laptop-defect images across 14 defect
classes and 386 cracked-screen phone images. Both project pages list CC BY 4.0.
The laptop registry entry maps each positive photo to one box covering the full
photo; many source images show a laptop close-up or a single side. Phone crack
polygons become bounding rectangles around the labeled screen area.
The `broken_mobile_phone` alternative has 96 images and labels the whole phone.
The project contains no downloaded damage dataset by default, so download an
export before running the training command. Check the dataset page and export
version for its current license, class names, and split counts.

The bundled dataset also includes the reviewed damaged-TV frames from
`ml/tv_training` as `damaged_tv`. `curate.py import-tv` skips narrow side views
where the screen is not visible and leaves a gap between the chronological
train/val/test boundaries so adjacent frames do not land in different splits.
That gives the damage model its first TV examples, but they still come from one
recording of one TV. Treat them as a starting point, not independent evidence,
and import a larger TV dataset when one is available.

```powershell
npm run import:damage -- --dataset laptop_defects --source C:\Downloads\laptop-defects.zip
npm run import:damage -- --dataset cracked_screen --source C:\Downloads\cracked-screen.zip
npm run import:damage -- --dataset broken_mobile_phone --source C:\Downloads\broken-mobile-phone.zip
npm run import:damage -- --dataset large_screen_defect --source C:\Downloads\large-screen-defect.zip
```

The importer reads `dataset/data.yaml`, remaps every source class to
`damaged_phone`, `damaged_laptop`, or `damaged_tv`, copies images and labels
into the right split, skips duplicates, and runs `verify_dataset.py`. Re-running
is safe.

For a dataset that is not in the registry:

```powershell
npm run import:damage -- --source C:\Downloads\my-data --format yolo --target-class damaged_phone
npm run import:damage -- --source C:\Downloads\my-coco --format coco --class-map "cracked=damaged_phone"
```

Use `--dry-run` to preview counts. Use `--include-unlabeled` only when unlabeled
images are true negatives. Imported images and labels are ignored by Git; keep
the source archive if you need to rebuild.

## 1. Put the dataset here

Use standard YOLO detection format:

```
ml/damage_detection/dataset/
  data.yaml
  images/train/  images/val/  images/test/
  labels/train/  labels/val/  labels/test/
```

`dataset_whole` is the default training set and the one the installed model
uses. It keeps one whole-device box per laptop image so the model learns "is
this device damaged?" instead of chasing tiny defect regions that disappear at
the inference image size. `dataset` keeps the original tight defect boxes for
experiments that need localization.

Each image needs a matching `.txt` file with the same name. Each label line is
`class_id x_center y_center width height`, normalized to 0..1.

Edit `dataset/data.yaml` so `names` matches your label class ids. The template
starts with:

```yaml
names:
  0: damaged_phone
  1: damaged_laptop
  2: damaged_tv
```

Two valid labeling strategies:

- **Whole-device damage** (`damaged_phone`, `damaged_laptop`, `damaged_tv`):
  box the entire damaged device. Easier to label and matches the existing TV
  practice model, but it does not localize the crack or fault.
- **Damage-region classes** (`screen_crack`, `battery_swelling`,
  `chassis_damage`, ...): box the damage itself. More useful for guidance, but
  needs tighter and more consistent labels.

Pick one strategy and keep it consistent across the whole dataset.

### Labeling tips

- Include undamaged devices and non-target scenes as negatives (empty label
  files are allowed) so the model does not call every device damaged.
- Cover many devices, angles, lighting conditions, and backgrounds.
- Do not split adjacent video frames across train and test; split by device or
  recording session.
- Keep a real `test` split. `verify_dataset.py` fails on images that appear in
  more than one split.
- Thin screen cracks are hard to see at low resolution. Prefer `--imgsz 640`
  and tight labels, or use segmentation for crack outlines.

## 2. Check the dataset

```powershell
.\.venv\Scripts\python.exe ml\damage_detection\verify_dataset.py
```

It reports image/box counts per split and class, missing labels, bad
coordinates, duplicate images, and train/val/test leakage. Fix errors before
training.

For a deeper quality report, including class balance, negatives, tiny boxes,
and source-image leakage from augmented Roboflow copies:

```powershell
npm run curate:damage -- audit --data ml\damage_detection\dataset_whole\data.yaml
```

The same tool can normalize labels or import the bundled TV frames again:

```powershell
npm run curate:damage -- whole-labels --data ml\damage_detection\dataset_whole\data.yaml --apply
npm run curate:damage -- import-tv --data ml\damage_detection\dataset_whole\data.yaml --apply
```

Both write a timestamped backup or manifest next to the dataset. Without
`--apply` they are dry runs.

## 3. Build in one command

```powershell
.\.venv\Scripts\python.exe -m pip install -r ml\tv_training\requirements-export.txt
npm run train:damage
```

`npm run train:damage` now uses `dataset_whole` by default. To run the
region-label experiment instead, pass its dataset config explicitly:

```powershell
npm run train:damage -- --data ml/damage_detection/dataset/data.yaml
```

The command uses the same `.venv` as the website. You can also run
`python ml/damage_detection/build.py` directly. Pass training options after
`--`, for example `npm run train:damage -- --epochs 150 --imgsz 640 --batch 4`.

`build.py` verifies the data, trains, copies `best.pt` into
`ml/damage_detection/weights/`, exports `best.onnx`, and writes
`model-manifest.json`. Useful options:

```powershell
python ml/damage_detection/build.py --epochs 150 --imgsz 640 --batch 4 --model yolo11n.pt
python ml/damage_detection/build.py --skip-train   # re-export existing weights
```

Training runs on CPU. A one-epoch smoke run is a good first check:

```powershell
python ml/damage_detection/build.py --epochs 1 --name smoke
```

## 4. Run the website with it

Restart `npm run dev`. The server automatically passes
`ml/damage_detection/weights/best.pt` (or `.onnx`) to the detector when the
file exists. Override the path if needed:

```
DAMAGE_DETECTOR_WEIGHTS=ml/damage_detection/weights/best.pt
```

If the file is absent, the app keeps working without damage results.

## 5. Evaluate honestly

```powershell
python ml/damage_detection/evaluate.py --split test
```

Report per-class mAP50-95, precision, and recall from a genuinely independent
test split. A high score on frames from the same recording as training is not
real-world accuracy. Keep the UI disclaimer until you have independent results.

## Files

- `dataset/data.yaml` — dataset paths and class names.
- `datasets.yaml` — recommended public datasets and default class mappings.
- `import_dataset.py` — imports YOLO/COCO exports, remaps classes, dedupes, verifies.
- `curate.py` — audit class balance/leakage, normalize labels, import curated TV frames.
- `verify_dataset.py` — dataset checks and JSON summary.
- `train.py` — CPU training entry point.
- `evaluate.py` — per-class metrics on a chosen split.
- `export_onnx.py` — exports ONNX weights for the lightweight runtime.
- `build.py` — verify → train → export → install → manifest.
- `weights/` — installed `best.pt` and `best.onnx` (created by `build.py`).
- `runs/` — Ultralytics training output (not committed).
