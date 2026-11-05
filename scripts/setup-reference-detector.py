"""Install a pinned, separate YOLO11m reference; preserve custom trained weights.

Requires ml/tv_training/requirements-export.txt for the one-time ONNX export.
Runtime uses ONNX Runtime and never sends photos to a remote model.
"""
import hashlib
import json
import urllib.request
from pathlib import Path

root = Path(__file__).resolve().parents[1]
directory = root / "ml/device_detection/reference"
revision = "8b8ac7d1fae7468f85dbf89670dd66f41f485aab"
url = f"https://huggingface.co/Ultralytics/YOLO11/resolve/{revision}/yolo11m.pt"
directory.mkdir(parents=True, exist_ok=True)
checkpoint = directory / "yolo11m.pt"
if not checkpoint.exists():
    print("Downloading pinned reference checkpoint ...", flush=True)
    temporary = checkpoint.with_suffix(".download")
    urllib.request.urlretrieve(url, temporary)
    temporary.replace(checkpoint)
onnx = checkpoint.with_suffix(".onnx")
if not onnx.exists():
    import torch
    from ultralytics import YOLO
    torch.set_num_threads(4)
    YOLO(str(checkpoint)).export(format="onnx", imgsz=640, opset=17, simplify=False, dynamic=False, batch=1, nms=False, device="cpu")
manifest = {"source": url, "revision": revision, "model": "YOLO11m COCO pretrained", "allowedOutputClasses": ["laptop", "cell phone", "television"], "customWeightsReplaced": False,
            "sha256": hashlib.file_digest(checkpoint.open("rb"), "sha256").hexdigest(), "onnxSha256": hashlib.file_digest(onnx.open("rb"), "sha256").hexdigest()}
(directory / "manifest.json").write_text(json.dumps(manifest, indent=2))
print("Reference detector installed separately. Custom weights are unchanged.", flush=True)
