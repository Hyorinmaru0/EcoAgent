# EcoAgent TV photo workflow

This folder copies the user's `YOLO_TV/tv_training` dataset and training scripts.
Original image and label bytes, the 160/40 split, and `split_manifest.csv` are
preserved. `weights/best.pt` is copied from the completed 30-epoch
`runs/damaged_tv/weights/best.pt` run; it is not the one-epoch smoke-test model.
The original folder is unchanged. See `model-manifest.json` for its checksum.

## Run the website with the detector

The frontend remains React/TypeScript. The Vite server launches a local Python
process when a TV photo is analyzed. No image is sent to Gemini or an external
service. Images are read in memory, not saved as new training examples.

On this machine, `.env.local` selects the existing
`C:/Users/Ahron/YOLO_TV/yolo-env/Scripts/python.exe` interpreter. No new environment
or training run is required. Run `npm.cmd run dev`, select **Identify E-Waste**,
choose **TV**, upload a JPG, PNG, or WEBP photo (up to 5 MB and 20 megapixels),
and select **Analyze E-Waste**. The analysis panel shows TV candidate boxes and
model scores. The original item details and recommendation navigation remain.
Phones and laptops continue to use entered-detail guidance.

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
`TV_DETECTOR_WEIGHTS` optionally selects different trained weights. Restart Vite
after changing environment variables. For CPU installations, use an appropriate
CPU build of PyTorch as described in the original training README.

`POST /api/tv-detection` takes `{ "image": "data:image/jpeg;base64,..." }`.
The response includes normalized `[x1, y1, x2, y2]` boxes, model scores,
image dimensions, and the dataset limitation note. Invalid inputs, missing
dependencies, timeouts, and concurrent requests return explicit errors.
The route is available with both Vite dev and Vite preview. A static deployment
alone does not run this Python/Node endpoint; deploy that backend as well.

## Checks

```powershell
npm.cmd run typecheck
npm.cmd run test:tv
npm.cmd run test:ecobot
npm.cmd run smoke:tv
npm.cmd run build
```

`smoke:tv` runs a real prediction through the HTTP API using a supplied validation
frame. It checks that the integration works; it is not an independent model
evaluation. To check all copied images and annotations:

```powershell
C:\Users\Ahron\YOLO_TV\yolo-env\Scripts\python.exe ml/tv_training/verify_dataset.py
```

## Interpretation

The single `damaged_tv` class marks the whole TV in frames from one recording.
The model does not locate cracks, classify electrical safety, establish repair
needs, or reliably distinguish damaged TVs from undamaged TVs. Model scores are
not damage probabilities. No detection means no candidate passed the threshold,
not that a TV is healthy. Keep the entered condition separate from this output.
Use independent TVs, negative examples, and recording-level train/test splits
before evaluating real-world damaged-TV recognition.

The inference interface follows the
[Ultralytics prediction documentation](https://docs.ultralytics.com/modes/predict/).
