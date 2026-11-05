# Damaged TV: practice YOLO training package

This package combines the 200 original pictures from Damage_TV.zip with your
200 Make Sense YOLO annotation files. Original image and label bytes are preserved.
The labels locate the whole visible TV with class 0, damaged_tv; they do not
outline individual cracks or establish that the TV is electrically functional.

## Open the package

Extract the ZIP into C:\Users\Ahron\YOLO_TV. The ZIP contains a tv_training folder.
Keep your existing yolo-env alongside tv_training. Do not create a second environment.

In the VS Code PowerShell terminal, run:

```powershell
Set-Location C:\Users\Ahron\YOLO_TV
.\yolo-env\Scripts\python.exe .\tv_training\verify_dataset.py
```

Expected: 160 training images, 40 validation images, and 200 boxes in total.

## First training run

Run a one-epoch check of the training pipeline first:

```powershell
.\yolo-env\Scripts\python.exe .\tv_training\train.py --epochs 1
```

Once that completes, train for 30 epochs:

```powershell
.\yolo-env\Scripts\python.exe .\tv_training\train.py
```

The script uses the small pretrained YOLO26n model, CPU, image size 416,
batch size 4, four CPU threads, and zero data-loader subprocesses.
Internet access is required for the first pretrained-weight download.
Run time depends on your processor. The script prints the exact best.pt path.
Training outputs go under tv_training\runs. The one-epoch check uses a separate
smoke_test run; the full run uses damaged_tv. Repeated runs get numbered folders.
The downloaded pretrained yolo26n.pt is not your trained damaged-TV model.

If imports fail, install the training and export packages with
`python -m pip install -r requirements-export.txt`. Do not install NVIDIA CUDA
packages for this CPU setup.

## Export for the website (ONNX)

The website runs the exported ONNX models and does not need PyTorch. After
training or replacing a weight file, export it once:

```powershell
.\yolo-env\Scripts\python.exe .\tv_training\export_onnx.py --weights .\tv_training\weights\best.pt --imgsz 416
.\yolo-env\Scripts\python.exe .\tv_training\export_onnx.py --weights ..\device_detection\weights\best.pt --imgsz 640
```

The export writes `best.onnx` beside each `.pt` file. The website runtime only
needs `requirements.txt` (onnxruntime, numpy, and Pillow). If an `.onnx` file is
missing, inference falls back to the `.pt` weights and `requirements-export.txt`.

## Test with a separate picture

For the first full run, replace the source path in this example:

```powershell
.\yolo-env\Scripts\python.exe .\tv_training\predict.py --weights .\tv_training\runs\damaged_tv\weights\best.pt --source "C:\path\to\new_tv_photo.jpg"
```

If you repeated training, use the actual best.pt path printed by that run.
Annotated predictions are saved under tv_training\predictions.

## Dataset split and limits

The split is chronological: frames 000001-000160 train, 000161-000200 validation.
split_manifest.csv records each exact pairing. No images are randomly shuffled
between the two splits when preparing the package. Training may shuffle batches.

All images appear to come from one recording of the same TV. The validation
set still shares the same object, room, and recording session as training,
including nearby frames at the boundary. It is for checking the pipeline only.
Do not describe its mAP, precision, or recall as independent real-world accuracy.
There is no independent test set in this package.

Collect multiple TVs, recording sessions, backgrounds, lighting conditions, and
viewpoints. Include undamaged TVs and scenes without damaged TVs as negative
examples. Split by TV or recording session, keeping related frames together.
Without such examples, this model may learn TV appearance or this room rather
than reliable damage cues. A single positive class does not require a second
class for healthy TVs, but appropriate unannotated negative examples matter.

Nine sample annotations were visually reviewed; see annotation_samples.jpg.
Frame 000075 shows a narrow side view with no visible screen damage. Review
similar views if your intended task requires damage to be visible in the image.
All original labels have been preserved; none were automatically corrected.

## Validation performed before delivery

- 200 image files paired with 200 annotation files; no missing or extra pairs.
- Every image decodes and every annotation contains one class-0 box.
- All rows have five fields and finite normalized coordinates in [0, 1].
- All box widths/heights are positive and boxes remain within image boundaries.
- Image-label filenames are disjoint between the two practice splits.
- Training and prediction scripts pass Python syntax compilation.

Training itself has not been run here; execute the one-epoch check on your PC.

## References

- https://docs.ultralytics.com/datasets/detect/
- https://docs.ultralytics.com/modes/train/
