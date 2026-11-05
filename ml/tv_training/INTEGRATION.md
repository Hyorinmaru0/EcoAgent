# EcoAgent device photo workflow

This folder copies the user's `YOLO_TV/tv_training` dataset and training scripts.
Original image and label bytes, the 160/40 split, and `split_manifest.csv` are
preserved. `weights/best.pt` is copied from the completed 30-epoch
`runs/damaged_tv/weights/best.pt` run; it is not the one-epoch smoke-test model.
The original folder is unchanged. See `model-manifest.json` for its checksum.

The additional `ml/device_detection/weights/best.pt` model detects laptops,
cell phones, and televisions. Its class names are expected to be laptops,
cell phone, and television (common singular/underscore variants are accepted).
For TV-category photos, the app runs this model and the damaged-TV model on the
same image; for phone and laptop categories, it runs only the three-class model.
If `ml/damage_detection/weights/best.pt` or `best.onnx` exists, an optional
damage model also runs and its candidates appear as dashed red overlays. See
[`../damage_detection/README.md`](../damage_detection/README.md) to train it.
The colored overlays identify which model produced each candidate.

## Run the website with the detectors

The frontend remains React/TypeScript. The Vite server launches local Python
inference when a device photo is analyzed. No image is sent to Gemini or an
external service. Images are read in memory, not saved as new training examples.

Inference prefers the exported ONNX weights (`best.onnx`) and only needs
`onnxruntime`, `numpy`, and `Pillow` — no PyTorch or Ultralytics. If an ONNX
file is absent, it falls back to the original `.pt` weights and requires
`ultralytics` (which pulls in PyTorch).

Set `TV_DETECTOR_PYTHON` in `.env.local` to an interpreter containing the
dependencies below. Run `npm.cmd run dev`, select **Identify E-Waste**, upload a
JPG, PNG, or WEBP photo (up to 25 MB), and select **Analyze E-Waste**. The
browser resizes and re-encodes the photo before upload, removing EXIF metadata
and keeping the processed image within the server's 5 MB and 20-megapixel
limits. Analysis starts automatically after upload; if the category is still
empty, the device model proposes TV, Mobile Phone, or Laptop and the interface
asks the user to confirm it. The analysis panel shows three-class device
candidates; for a TV category it also displays TV-specific model candidates.
The original item details and recommendation navigation remain.

On another machine, create a Python environment and install the lightweight
runtime requirements, then set `TV_DETECTOR_PYTHON` in `.env.local` to that
interpreter. For example:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r ml/tv_training/requirements.txt
npm.cmd install
npm.cmd run dev
```

The repository already includes `best.onnx` next to each `.pt` weight. If you
retrain a model, export it again with an environment that has the training
packages:

```powershell
.\.venv\Scripts\python.exe -m pip install -r ml/tv_training/requirements-export.txt
.\.venv\Scripts\python.exe ml/tv_training/export_onnx.py --weights ml/device_detection/weights/best.pt --imgsz 640
.\.venv\Scripts\python.exe ml/tv_training/export_onnx.py --weights ml/tv_training/weights/best.pt --imgsz 416
```

The default detector finds `.venv/Scripts/python.exe` on Windows or
`.venv/bin/python` on other systems; otherwise it uses `python` on PATH.
`DEVICE_DETECTOR_WEIGHTS` optionally selects different three-class weights, and
`TV_DETECTOR_WEIGHTS` optionally selects different TV-specific weights. Point
these at a `.pt` path; the detector uses the matching `.onnx` file when present
and falls back to `.pt` otherwise. You may also point them directly at `.onnx`.
Restart Vite after changing environment variables. Both models use CPU inference.
The three-class device model uses image size 640 to match its training size;
the TV-specific model uses image size 416. The JSON response includes a
`runtime` field (`onnx` or `ultralytics`) for diagnostics.

`POST /api/tv-detection` takes `{ "image": "data:image/jpeg;base64,...",
"category": "TV" }`. Category may also be `Mobile Phone`, `Laptop`, or `auto`.
The `auto` option runs only the three-class device model so the frontend can
propose a category before the user confirms it. The response includes
normalized `[x1, y1, x2, y2]` boxes, model scores, image dimensions, and model
limitation notes. Invalid inputs, missing dependencies, timeouts, and
concurrent requests return explicit errors.
The route is available with both Vite dev and Vite preview. A static deployment
alone does not run this Python/Node endpoint; deploy that backend as well.
The device, TV-specific, and damage models all use a 0.25 confidence
threshold. The interface hides device detections below 25% and only auto-selects
a category from detections at or above 25%. Candidates collected above 25% are
still only findings when the shared policy accepts them: damage needs 70%
(80% from the single-recording TV practice model), and a CLIP visual comparison
alone can only report "uncertain" unless its similarity reaches 0.45 with a
0.05 margin. A damage box covering at least 90% of the photo is treated as
non-localizing, and laptop/TV damage claims additionally need the independent
CLIP condition check on the accepted device crop to say "indicated" (phones are
unchanged). Treat every remaining box as a prompt to inspect the photo rather
than as a finding. No threshold guarantees a correct result; review the image
and adjust the category if needed.

For identity, a confident reference-detector TV/laptop box (>= 0.70) with no
competing visual explanation is accepted even when CLIP's top label is only a
weak generic verdict ("other object"/"room" below 0.28 similarity); those
verdicts mean CLIP is undecided, not that the object was identified as
something else. This is what lets a clear photo of a switched-off TV return a
TV instead of "No supported device detected". Real competing objects (monitor,
book, wallet) still reject.

## Checks

```powershell
npm.cmd run typecheck
npm.cmd run test:tv
npm.cmd run test:ecobot
npm.cmd run smoke:tv
npm.cmd run build
```

`smoke:tv` runs both models through the HTTP API using a supplied validation
frame. It checks that the integration works; it is not an independent model
evaluation. To check all copied images and annotations:

```powershell
C:\Users\Ahron\YOLO_TV\yolo-env\Scripts\python.exe ml/tv_training/verify_dataset.py
```

## Interpretation

The damaged-TV model marks the whole TV in frames from one recording; it does
not locate cracks, classify electrical safety, establish repair needs, or
reliably distinguish damaged TVs from undamaged TVs. Scores from either model
are not probabilities. No detection means no candidate passed the threshold,
not that a device is absent, intact, or safe. Keep entered condition separate
from photo outputs. Evaluate on independent devices and recording-level splits
before relying on either model outside this prototype.

The inference interface follows the
[Ultralytics prediction documentation](https://docs.ultralytics.com/modes/predict/).
