"""Use a broad learned detector to corroborate the custom three-class model."""
from visual_verifier import INCONCLUSIVE_LABELS

REFERENCE_MIN_SCORE = 0.6
# A confident reference box may stand on its own only when the visual check has
# no competing explanation at all (weak "other object"/"room" verdicts).
REFERENCE_CLEAR_SCORE = 0.7
REFERENCE_STRONG_SCORE = 0.85
SUPPORTED = {"laptop": "laptop", "tv": "television", "television": "television", "cell phone": "cell phone"}
DAMAGE_CLASSES = {"laptop": "damaged_laptop", "television": "damaged_tv", "cell phone": "damaged_phone"}


def intersection_over_union(a, b):
    area = max(0, min(a[2], b[2]) - max(a[0], b[0])) * max(0, min(a[3], b[3]) - max(a[1], b[1]))
    union = (a[2]-a[0])*(a[3]-a[1]) + (b[2]-b[0])*(b[3]-b[1]) - area
    return area / union if union > 0 else 0


def reference_verification_box(candidate, custom):
    """Keep the whole phone silhouette instead of cherry-picking a tight crop."""
    box = list(candidate["box"])
    if candidate["className"] != "cell phone":
        return box
    for detection in custom:
        if detection.get("origin") == "damage-assisted" or detection["className"] != "cell phone" or detection["score"] < 0.5:
            continue
        if intersection_over_union(candidate["box"], detection["box"]) >= 0.5:
            other = detection["box"]
            box = [min(box[0], other[0]), min(box[1], other[1]), max(box[2], other[2]), max(box[3], other[3])]
    return box


def supports_uncertain_phone(candidate, custom, visual):
    """Two strong trained detections can corroborate a visually leading phone.

    A different visual winner (wallet/calculator) never passes this path.
    This is not a blanket relaxation of phone confidence or lookalike checks.
    """
    if candidate["className"] != "cell phone" or candidate["score"] < 0.9 or visual.get("label") != "cell phone" or visual.get("status") != "uncertain" or (visual.get("margin") or 0) <= 0:
        return False
    return any(d.get("origin") is None and d["className"] == "cell phone" and d["score"] >= 0.9 and
               d.get("verification", {}).get("label") == "cell phone" and
               d.get("verification", {}).get("status") in {"accepted", "uncertain"} and
               intersection_over_union(candidate["box"], d["box"]) >= 0.5 for d in custom)


MIN_CONSENSUS_CLASSES = {"laptop", "television"}


def corroborate_uncertain_detection(custom, reference, visual):
    """Accept an uncertain laptop/TV identity only on three-way agreement.

    The custom detector box, a second independent detector on the same object,
    and a CLIP label that already points at the same class must all agree.
    Phones never take this path, so the wallet/lookalike gate is untouched.
    """
    cls = custom.get("className")
    if cls not in MIN_CONSENSUS_CLASSES or custom.get("origin") is not None:
        return visual
    if visual.get("status") != "uncertain" or visual.get("label") != cls or (visual.get("margin") or 0) <= 0:
        return visual
    agrees = any(
        reference_detection.get("className") == cls
        and reference_detection.get("score", 0) >= REFERENCE_MIN_SCORE
        and reference_detection.get("verification", {}).get("status") == "accepted"
        and intersection_over_union(custom["box"], reference_detection["box"]) >= 0.5
        for reference_detection in reference
    )
    if not agrees:
        return visual
    return {**visual, "status": "accepted", "method": "trained-detector-consensus"}


def corroborate_reference(candidate, custom, damage, visual):
    """Never replace scores or use the form's requested category as evidence."""
    cls = candidate["className"]
    if candidate["score"] < REFERENCE_MIN_SCORE:
        return {**visual, "status": "uncertain", "method": "reference-below-threshold"}
    # Phones retain the explicit wallet/lookalike check even when two YOLO
    # models agree: both detectors can confidently mislabel the same wallet.
    if cls == "cell phone":
        if supports_uncertain_phone(candidate, custom, visual):
            return {**visual, "status": "accepted", "method": "trained-detector-consensus"}
        return {**visual, "method": "reference-and-visual"}
    agrees = any(d["className"] == cls and d["score"] >= 0.5 and intersection_over_union(candidate["box"], d["box"]) >= 0.5 for d in custom)
    damage_agrees = any(d["className"] == DAMAGE_CLASSES[cls] and d["score"] >= 0.7 and intersection_over_union(candidate["box"], d["box"]) >= 0.5 for d in damage)
    if agrees or damage_agrees:
        return {"status": "accepted", "label": cls, "similarity": None, "margin": None, "method": "detector-agreement"}
    # Nothing else was recognised in the crop. A confident reference box with no
    # competing visual explanation (a switched-off TV reads as "other object")
    # is accepted as a labelled fallback instead of being vetoed by indecision.
    if (candidate["score"] >= REFERENCE_CLEAR_SCORE and visual.get("status") == "uncertain"
            and (visual.get("label") == cls or visual.get("label") in INCONCLUSIVE_LABELS)):
        return {"status": "accepted", "label": cls, "similarity": visual.get("similarity"),
                "margin": visual.get("margin"), "method": "reference-detector"}
    if visual["status"] == "accepted":
        return {**visual, "method": "reference-and-visual"}
    if candidate["score"] >= REFERENCE_STRONG_SCORE:
        return {"status": "accepted", "label": cls, "similarity": None, "margin": None, "method": "reference-detector"}
    return {**visual, "method": "reference-and-visual"}
