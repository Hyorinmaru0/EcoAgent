"""Download pinned local CLIP assets and precompute text embeddings once.

No user photos leave the computer. Runtime needs only ONNX Runtime, NumPy, Pillow.
Setup additionally needs tokenizers (pip install -r ml/device_detection/requirements-setup.txt).
"""
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ml/device_detection"))
from visual_verifier import LABELS, MODEL_DIR, MODEL_REPO, MODEL_REVISION, PROMPT_FINGERPRINT
from visual_verifier import PHONE_DAMAGE_PROMPTS, PHONE_DAMAGE_FINGERPRINT
from visual_verifier import DEVICE_DAMAGE_PROMPTS, DEVICE_DAMAGE_FINGERPRINT
import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

MODEL_DIR.mkdir(parents=True, exist_ok=True)
for remote in ["onnx/vision_model_quantized.onnx", "onnx/text_model_quantized.onnx", "tokenizer.json"]:
    target = MODEL_DIR / Path(remote).name
    if not target.exists():
        print(f"Downloading {remote} ...", flush=True)
        temporary = target.with_suffix(target.suffix + ".download")
        urllib.request.urlretrieve(f"https://huggingface.co/{MODEL_REPO}/resolve/{MODEL_REVISION}/{remote}", temporary)
        temporary.replace(target)
tokenizer = Tokenizer.from_file(str(MODEL_DIR / "tokenizer.json"))
tokenizer.enable_truncation(max_length=77)
tokenizer.enable_padding(length=77, pad_id=49407, pad_token="<|endoftext|>")
options = ort.SessionOptions()
options.intra_op_num_threads = 4
session = ort.InferenceSession(str(MODEL_DIR / "text_model_quantized.onnx"), sess_options=options, providers=["CPUExecutionProvider"])
embeddings = []
prompt_labels = []
for label, descriptions in LABELS.items():
    encodings = tokenizer.encode_batch([f"a photo of {text.removeprefix('a ').removeprefix('an ')}." for text in descriptions])
    inputs = {"input_ids": np.array([e.ids for e in encodings], dtype=np.int64), "attention_mask": np.array([e.attention_mask for e in encodings], dtype=np.int64)}
    outputs = session.run(["text_embeds"], {i.name: inputs[i.name] for i in session.get_inputs()})[0]
    outputs /= np.linalg.norm(outputs, axis=1, keepdims=True)
    embeddings.extend(outputs)
    prompt_labels.extend([label] * len(descriptions))
np.savez(MODEL_DIR / "labels.npz", embeddings=np.array(embeddings), labels=np.array(list(LABELS)), prompt_labels=np.array(prompt_labels), revision=np.array(MODEL_REVISION), prompt_fingerprint=np.array(PROMPT_FINGERPRINT))
damage_embeddings, damage_labels = [], []
for label, descriptions in PHONE_DAMAGE_PROMPTS.items():
    encodings = tokenizer.encode_batch([f"a photo of {text}." for text in descriptions])
    inputs = {"input_ids": np.array([e.ids for e in encodings], dtype=np.int64), "attention_mask": np.array([e.attention_mask for e in encodings], dtype=np.int64)}
    outputs = session.run(["text_embeds"], {i.name: inputs[i.name] for i in session.get_inputs()})[0]
    outputs /= np.linalg.norm(outputs, axis=1, keepdims=True)
    damage_embeddings.extend(outputs)
    damage_labels.extend([label] * len(descriptions))
np.savez(MODEL_DIR / "phone-damage-labels.npz", embeddings=np.array(damage_embeddings), prompt_labels=np.array(damage_labels), revision=np.array(MODEL_REVISION), prompt_fingerprint=np.array(PHONE_DAMAGE_FINGERPRINT))
device_damage_embeddings, device_damage_labels = [], []
for groups in DEVICE_DAMAGE_PROMPTS.values():
    for state, descriptions in groups.items():
        encodings = tokenizer.encode_batch([f"a photo of {text}." for text in descriptions])
        inputs = {"input_ids": np.array([e.ids for e in encodings], dtype=np.int64), "attention_mask": np.array([e.attention_mask for e in encodings], dtype=np.int64)}
        outputs = session.run(["text_embeds"], {i.name: inputs[i.name] for i in session.get_inputs()})[0]
        outputs /= np.linalg.norm(outputs, axis=1, keepdims=True)
        device_damage_embeddings.extend(outputs)
        device_damage_labels.extend([state] * len(descriptions))
np.savez(MODEL_DIR / "device-damage-labels.npz", embeddings=np.array(device_damage_embeddings), prompt_labels=np.array(device_damage_labels), revision=np.array(MODEL_REVISION), prompt_fingerprint=np.array(DEVICE_DAMAGE_FINGERPRINT))
print("Local visual verifier is ready.", flush=True)
