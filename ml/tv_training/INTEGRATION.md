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
The colored overlays identify which model produced each candidate.

## Run the website with the detectors

The frontend remains React/TypeScript. The Vite server launches local Python
inference when a device photo is analyzed. No image is sent to Gemini or an
external service. Images are read in memory, not saved as new training examples.

Set `TV_DETECTOR_PYTHON` in `.env.local` to an interpreter containing the
dependencies below. Run `npm.cmd run dev`, select **Identify E-Waste**, choose
TV, Mobile Phone, or Laptop, upload a JPG, PNG, or WEBP photo (up to 5 MB and
20 megapixels), and select **Analyze E-Waste**. The analysis panel shows
three-class device candidates; for a TV category it also displays TV-specific
model candidates. The original item details and recommendation navigation remain.

On another machine, create a Python environment and install `requirements.txt`,
then set `TV_DETECTOR_PYTHON` in `.env.local` to that interpreter. For example:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r ml/tv_training/requirements.txt
npm.cmd install
npm.cmd run dev
```

The default detector finds `.venv/Scripts/python.exe` on Windows or
`.venv/bin/python` on other systems; otherwise it uses `python` on PATH.
`DEVICE_DETECTOR_WEIGHTS` optionally selects different three-class weights, and
`TV_DETECTOR_WEIGHTS` optionally selects different TV-specific weights. Restart
Vite after changing environment variables. Both models use CPU inference.

`POST /api/tv-detection` takes `{ "image": "data:image/jpeg;base64,...",
"category": "TV" }`. Category may also be `Mobile Phone` or `Laptop`. The
response includes normalized `[x1, y1, x2, y2]` boxes, model scores, image
dimensions, and model limitation notes. Invalid inputs, missing dependencies,
timeouts, and concurrent requests return explicit errors.
The route is available with both Vite dev and Vite preview. A static deployment
alone does not run this Python/Node endpoint; deploy that backend as well.
Both models use a 0.50 confidence threshold. The interface hides detections
below 50% and only auto-selects a category from detections at or above 50%.
This reduces weak candidates but does not guarantee a high-confidence result is
correct; review the image and adjust the category if needed.

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
