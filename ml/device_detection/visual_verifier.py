"""Local CLIP crop verifier; never treats a detector score as proof of identity."""
from pathlib import Path
import hashlib
import json

import numpy as np

MODEL_REVISION = "4c1807b705b1d015fb032789cc4d221b23025a6f"
MODEL_REPO = "Xenova/clip-vit-base-patch32"
MODEL_DIR = Path(__file__).resolve().parent / "verifier"
# Compare against competing supported devices AND common unsupported lookalikes.
LABELS = {
    "cell phone": [
        "a mobile phone", "a smartphone viewed from the back",
        "a smartphone with its screen turned off", "a broken mobile phone with a cracked screen",
        "a basic mobile phone with physical number buttons and a small screen",
        "a mobile feature phone with a numeric keypad",
        "a flip mobile phone with a keypad",
        "a sliding mobile phone with a keypad",
    ],
    "laptop": ["an open laptop computer", "a closed laptop computer", "a damaged laptop computer"],
    "television": ["a television set", "a flat screen television", "an old CRT television", "a broken television with a cracked screen"],
    "wallet": ["a leather wallet", "a closed leather wallet held in a hand", "a purse or coin pouch"],
    "remote control": ["a television remote control"],
    "calculator": ["a handheld calculator"],
    "tablet": ["a tablet computer", "an ebook reader"],
    "computer monitor": ["a desktop computer monitor"],
    "book": ["a closed book", "a notebook or diary"],
    "phone case": ["an empty protective phone case"],
    "power bank": ["a portable power bank or battery pack"],
    "box": ["a small rectangular box", "a plastic container"],
    "bottle": ["a drinking bottle or cup"],
    "keyboard": ["a computer keyboard"],
    "bag": ["a handbag or small bag"],
    "person": ["a person's face", "an empty hand"],
    "room": ["a room without an electronic device"],
    "other object": ["an unidentified household object"],
}
MIN_SIMILARITY = 0.22
MIN_MARGIN = 0.01
# A weak, generic top label means CLIP has no competing explanation, not that
# the object was identified as something else. Those verdicts must not veto a
# confident detector box (a dark, switched-off TV scores like this).
INCONCLUSIVE_LABELS = {"other object", "room"}
INCONCLUSIVE_MAX_SIMILARITY = 0.28
PROMPT_FINGERPRINT = hashlib.sha256(json.dumps(LABELS, sort_keys=True).encode()).hexdigest()
PHONE_DAMAGE_PROMPTS = {
    "visible_screen_damage": [
        "a mobile phone with a shattered glass screen",
        "a mobile phone with a cracked screen",
        "a broken mobile phone with spiderweb cracks on its screen",
    ],
    "other_appearance": [
        "an undamaged mobile phone with an intact screen",
        "a mobile phone with a clean black screen",
        "a mobile phone with reflections and glare on an intact screen",
        "a mobile phone with fingerprints and smudges on an intact screen",
        "the back of a mobile phone",
        "an empty phone case",
    ],
}
PHONE_DAMAGE_FINGERPRINT = hashlib.sha256(json.dumps(PHONE_DAMAGE_PROMPTS, sort_keys=True).encode()).hexdigest()
# Zero-shot condition evidence for the other two supported devices. It is used
# only to confirm or contradict a damage-box claim, never as a damage score.
DEVICE_DAMAGE_PROMPTS = {
    "laptop": {
        "damaged": [
            "a damaged laptop computer with a cracked screen",
            "a broken laptop with a shattered display",
            "a laptop with visible cracks on its screen",
        ],
        "intact": [
            "an open laptop computer with an intact screen",
            "a closed laptop computer",
            "a laptop with a clean working screen",
        ],
    },
    "television": {
        "damaged": [
            "a broken television with a cracked screen",
            "a damaged flat screen television",
            "a television with a shattered display",
        ],
        "intact": [
            "a flat screen television with an intact screen",
            "a television set with a clean screen",
            "a switched off television with a dark screen",
        ],
    },
}
DEVICE_DAMAGE_FINGERPRINT = hashlib.sha256(json.dumps(DEVICE_DAMAGE_PROMPTS, sort_keys=True).encode()).hexdigest()
DAMAGE_CLASS_NAMES = {"cell phone": "damaged_phone", "laptop": "damaged_laptop", "television": "damaged_tv"}
# Initial conservative heuristics, not calibrated damage probabilities.
PHONE_DAMAGE_MIN_SIMILARITY = 0.30
PHONE_DAMAGE_MIN_MARGIN = 0.01


def identity_verification_status(class_name, detector_score, label, similarity, margin):
    if label == class_name:
        # Laptop/monitor similarities are close even on clear laptop views. This
        # class-specific heuristic leaves the phone/wallet operating point unchanged.
        required_margin = 0.005 if class_name == "laptop" and detector_score >= 0.75 and similarity >= 0.26 else MIN_MARGIN
        return "accepted" if similarity >= MIN_SIMILARITY and margin >= required_margin else "uncertain"
    if label in INCONCLUSIVE_LABELS and similarity < INCONCLUSIVE_MAX_SIMILARITY:
        # Nothing else was recognised, so this is "I do not know", not a rival
        # identity. Keep it uncertain so a strong detector box can still pass
        # the reference policy; wallets, monitors, remotes stay rejections.
        return "uncertain"
    return "rejected"


def preprocess(image):
    from PIL import Image

    image = image.convert("RGB")
    # Keep the WHOLE detected object. Center-cropping a wide TV removes its
    # frame/stand and makes verification depend on the screen contents alone.
    width, height = image.size
    scale = 224 / max(width, height)
    image = image.resize((max(1, round(width * scale)), max(1, round(height * scale))), Image.Resampling.BICUBIC)
    canvas = Image.new("RGB", (224, 224), (123, 117, 104))
    canvas.paste(image, ((224 - image.width) // 2, (224 - image.height) // 2))
    array = np.asarray(canvas, dtype=np.float32) / 255
    mean = np.array([0.48145466, 0.4578275, 0.40821073], dtype=np.float32)
    std = np.array([0.26862954, 0.26130258, 0.27577711], dtype=np.float32)
    return np.transpose((array - mean) / std, (2, 0, 1))[None].astype(np.float32)


class VisualVerifier:
    def __init__(self, model_dir=MODEL_DIR):
        import onnxruntime as ort

        with np.load(model_dir / "labels.npz", allow_pickle=False) as data:
            self.embeddings = data["embeddings"]
            self.labels = data["labels"].tolist()
            self.prompt_labels = data["prompt_labels"].tolist()
            if self.labels != list(LABELS) or data["revision"].item() != MODEL_REVISION or data["prompt_fingerprint"].item() != PROMPT_FINGERPRINT:
                raise RuntimeError("Visual verifier assets are out of date. Run setup-device-verifier.py.")
        options = ort.SessionOptions()
        options.intra_op_num_threads = 4
        self.session = ort.InferenceSession(str(model_dir / "vision_model_quantized.onnx"), sess_options=options, providers=["CPUExecutionProvider"])
        self.phone_damage_embeddings = None
        damage_path = model_dir / "phone-damage-labels.npz"
        if damage_path.exists():
            with np.load(damage_path, allow_pickle=False) as data:
                if data["prompt_fingerprint"].item() == PHONE_DAMAGE_FINGERPRINT and data["revision"].item() == MODEL_REVISION:
                    self.phone_damage_embeddings = data["embeddings"]
                    self.phone_damage_labels = data["prompt_labels"].tolist()
        self.device_damage_embeddings = None
        device_damage_path = model_dir / "device-damage-labels.npz"
        if device_damage_path.exists():
            with np.load(device_damage_path, allow_pickle=False) as data:
                if data["prompt_fingerprint"].item() == DEVICE_DAMAGE_FINGERPRINT and data["revision"].item() == MODEL_REVISION:
                    self.device_damage_embeddings = data["embeddings"]
                    self.device_damage_labels = data["prompt_labels"].tolist()

    def _assess_damage(self, image, detection, class_name, embeddings, labels, damaged_key, intact_key):
        """Shared zero-shot damaged/intact comparison for one device crop."""
        verification = detection.get("verification", {})
        if embeddings is None or labels is None or detection["className"] != class_name or verification.get("status") != "accepted" or verification.get("label") != class_name:
            return None
        x1, y1, x2, y2 = detection["box"]
        crop = image.crop((int(x1 * image.width), int(y1 * image.height), int(x2 * image.width), int(y2 * image.height)))
        if min(crop.size) < 24:
            return None
        embedding = self.session.run(["image_embeds"], {"pixel_values": preprocess(crop)})[0][0]
        embedding /= max(float(np.linalg.norm(embedding)), 1e-12)
        scores = embeddings @ embedding
        damaged = max(float(s) for s, label in zip(scores, labels) if label == damaged_key)
        intact = max(float(s) for s, label in zip(scores, labels) if label == intact_key)
        margin = damaged - intact
        indicated = damaged >= PHONE_DAMAGE_MIN_SIMILARITY and margin >= PHONE_DAMAGE_MIN_MARGIN
        return {"className": DAMAGE_CLASS_NAMES[class_name],
                "status": "indicated" if indicated else "uncertain",
                "method": "local-clip-visual-comparison",
                "similarity": round(damaged, 6), "margin": round(margin, 6), "box": detection["box"]}

    def assess_phone_damage(self, image, detection):
        """Separate zero-shot visual evidence, never fabricated YOLO scores."""
        return self._assess_damage(image, detection, "cell phone", self.phone_damage_embeddings,
                                   getattr(self, "phone_damage_labels", None),
                                   "visible_screen_damage", "other_appearance")

    def assess_device_damage(self, image, detection):
        """Confirm or contradict a laptop/TV damage box with the same method."""
        class_name = detection.get("className")
        if class_name not in DEVICE_DAMAGE_PROMPTS:
            return None
        return self._assess_damage(image, detection, class_name, self.device_damage_embeddings,
                                   getattr(self, "device_damage_labels", None), "damaged", "intact")

    def verify(self, image, detection):
        x1, y1, x2, y2 = detection["box"]
        # A small, fixed context border retains frame edges and hinges when the
        # detector box is tight. Never classify the entire room as confirmation.
        width, height = x2 - x1, y2 - y1
        x1, y1 = max(0, x1 - width * 0.08), max(0, y1 - height * 0.08)
        x2, y2 = min(1, x2 + width * 0.08), min(1, y2 + height * 0.08)
        crop = image.crop((max(0, int(x1 * image.width)), max(0, int(y1 * image.height)),
                           min(image.width, int(np.ceil(x2 * image.width))), min(image.height, int(np.ceil(y2 * image.height)))))
        if min(crop.size) < 24:
            return {"status": "uncertain", "label": None, "similarity": None, "margin": None}
        outputs = self.session.run(["image_embeds"], {"pixel_values": preprocess(crop)})
        embedding = outputs[0][0]
        embedding /= max(float(np.linalg.norm(embedding)), 1e-12)
        prompt_similarities = self.embeddings @ embedding
        # Match any supported viewpoint/condition without averaging a CRT and
        # flat-screen TV into a single description. Competing objects also get
        # their strongest prompt, so a wallet can win despite a high YOLO score.
        similarities = np.array([max(float(s) for s, label in zip(prompt_similarities, self.prompt_labels) if label == name) for name in self.labels])
        ranked = np.argsort(similarities)[::-1]
        best, second = int(ranked[0]), int(ranked[1])
        label = self.labels[best]
        similarity = float(similarities[best])
        margin = float(similarities[best] - similarities[second])
        # A laptop can closely resemble a monitor. When both independent models
        # agree on laptop and their absolute evidence is strong, use a narrower
        # lead requirement for that class; phone/wallet checks stay unchanged.
        status = identity_verification_status(detection["className"], detection["score"], label, similarity, margin)
        return {"status": status, "label": label, "similarity": round(similarity, 6), "margin": round(margin, 6)}
