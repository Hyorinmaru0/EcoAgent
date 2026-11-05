Device identification and rejection
===================================

The API and UI share `deviceDetectionPolicy.mjs`. The current pipeline also uses
a separately installed official YOLO11m reference detector. Its output is limited
to the same three device types; original custom checkpoints are preserved.
Confirmed custom-model candidates are considered first; reference candidates are
fallbacks when the custom model cannot confirm an identity. Reference phones still need
the independent phone/wallet check, using the union of overlapping phone proposals
so a tight crop cannot hide wallet edges. Reference TVs/laptops need at least
0.60 confidence with overlapping model support or visual agreement; a 0.85 score
can also pass the reference-detector policy. A reference box scoring at least
0.70 also passes on its own when the CLIP check has no competing explanation —
its top label is the same class or a weak generic label ("other object", "room")
under 0.28 similarity. Such generic verdicts count as "I do not know", not a
rival identity, so they return "uncertain" instead of "rejected"; a confident
generic verdict (>= 0.28) or any real competing object (monitor, book, wallet)
still rejects. This fixes a switched-off TV being vetoed by CLIP indecision
while leaving lookalike rejections intact. Conflicting accepted classes cause
abstention. These thresholds are prototype operating points, not calibrated
accuracy guarantees. Optional reference failures retain custom results and return
a warning.

Install the reference separately with:

```
.venv/Scripts/python -m pip install -r ml/tv_training/requirements-export.txt
.venv/Scripts/python scripts/setup-reference-detector.py
```

Source, revision, and hashes are recorded under the ignored `reference/` folder.
`REFERENCE_DETECTOR_WEIGHTS` can override its path. The original custom weights
remain unchanged. Current results: 10/10 selected photo regressions and 4/4 new
clear stock photos passed; 18/20 cracked-phone validation samples produced damage
results. In the broader COCO128 pipeline diagnostic, 0/120 labeled non-target
scenes were accepted, but only 3/8 positive scenes were correctly localized and
accepted. Small, occluded, and stacked devices remain weaknesses. COCO128 overlaps
COCO pretraining; none of these small smoke tests establishes general accuracy.
See `reports/device-pipeline-rebuild-2026-11-05.md` for the full protocol and limits.

The custom-model path needs a supported
whole-device detection with a score of at least 0.70, no competing supported
class above that threshold, and at least a 0.15 score lead over other classes.
The highest candidate must also pass a separate local CLIP visual verifier.
The verifier compares the detected object crop with supported-device descriptions
and competing objects (wallet, remote, calculator, tablet, monitor, book, etc.).
Phone descriptions cover keypad/feature phones, flip phones, and slider phones
as well as smartphones. A visually leading phone with an insufficient CLIP margin
can be corroborated when both the original and reference trained detectors score
at least 0.90 and their phone boxes overlap at IoU >= 0.50. A visual winner of
wallet/calculator never passes that consensus path. For a laptop or TV only, a
custom box whose CLIP label already points at the same class but stays
"uncertain" is accepted when the reference detector independently reports the
same class at >= 0.60 with an overlapping box (IoU >= 0.50); phones never take
this path, so wallet/lookalike checks are unchanged. The custom identity and raw
model score remain the primary output when corroborated; no checkpoints change.
The crop includes 8% context and preserves the entire object when resized.
Its top label must agree with YOLO, have cosine similarity at least 0.22,
and lead the next competing label by at least 0.01. Neither model's scores
are probabilities. For a laptop only, when the detector score is at least 0.75
and visual similarity is at least 0.26, a 0.005 lead is allowed to reduce
laptop/monitor over-rejection. This is a prototype heuristic, not an independently
validated threshold. Phone/wallet verification requirements are unchanged.
A missing, failed, uncertain, or disagreeing verifier cannot
unlock guidance or suggest a category, even with a 99% detector score.

These are conservative initial acceptance settings, not calibrated probabilities
or evidence of a particular accuracy. Multiple supported device types require a
new single-device photo. The selected form category never overrides predictions.

Uncertain, no-match, ambiguous, and mismatched photos cannot unlock photo-based
item guidance. Manual guidance without a photo is labeled as unverified.
The detector still returns candidates from 0.25 for diagnostic purposes; the
API exposes a separate acceptance threshold and assessment. Damage predictions
never establish device identity without independent visual verification.
Strong damage-model boxes can now propose recovery identities when the primary
model misses a damaged phone. Recovery candidates need a 0.85 minimum
score and visual verification, and scores from the two models are assessed
separately. They never override an accepted primary identity, mismatch, or
ambiguity.

`damageAssessment.mjs` decides the photo condition independently of identity:
a candidate must reach 0.70 (0.80 for the single-recording TV practice model)
and overlap the accepted device before the UI reports damage. A CLIP-only
visual comparison reports "uncertain" with its evidence attached unless it
reaches 0.45 similarity and a 0.05 margin, because those zero-shot scores are
not calibrated damage probabilities. Anything weaker never outlines the photo
as damaged. A damage box covering at least 90% of the photo is treated as
non-localizing and reports "uncertain" instead of damage, because it marks
the whole image rather than a damaged part. For laptops and TVs, a damage
model candidate is additionally reported as damage only when the independent
zero-shot condition check on the accepted device crop says "indicated"; when
the check exists but stays "uncertain" (for example an intact laptop that the
crop model still labelled `damaged_laptop`), the result is "uncertain" with
the evidence attached. Phones keep the crop model alone as before.

Run `npm run test:detection` for rejection and category-matching regressions.
Run `npm run smoke:rejection` for actual weights on two public unsupported
photos (bus/people from the Ultralytics YOLOv5 repository) and the existing TV
frame. This test needs internet for the two public photos. It does not validate
phone/laptop performance or independent TV generalization.

For the actual demonstration devices, prepare a JSON manifest:

```json
[
  { "path": "photos/phone.jpg", "expected": "Mobile Phone" },
  { "path": "photos/laptop.jpg", "expected": "Laptop" },
  { "path": "photos/tv.jpg", "expected": "TV" },
  { "path": "photos/calculator.jpg", "expected": null },
  { "path": "photos/remote.jpg", "expected": null },
  { "path": "photos/book.jpg", "expected": null }
]
```

Run `npm run smoke:rejection -- path/to/manifest.json`. Paths in a manifest
are relative to that manifest. Include multiple lighting conditions, viewpoints,
backgrounds, and supported devices plus hard negatives (remote controls,
calculators, books, picture frames, monitors, tablets, bottles, and empty desks).
Retain the expected labels before inference and record wrong accepted classes,
false positives, and rejected supported devices separately. Never tune on the
final held-out evaluation set.

For a local COCO128 dataset, the optional diagnostic is:
`.venv/Scripts/python scripts/evaluate-device-rejection.py --dataset PATH`.
Training provenance of the supplied device weights is unknown, so overlap
cannot be excluded. This dataset is a diagnostic, not independent validation.

Local visual verifier setup
--------------------------

```
.venv/Scripts/python -m pip install -r ml/device_detection/requirements-setup.txt
.venv/Scripts/python scripts/setup-device-verifier.py
```

Setup downloads pinned Xenova/clip-vit-base-patch32 ONNX files (~150 MB) and
builds small local text-embedding caches (`labels.npz`,
`phone-damage-labels.npz`, `device-damage-labels.npz`). Runtime uses only ONNX
Runtime, NumPy, and Pillow; user photos are not sent to a remote model. Downloaded
files live under the ignored `ml/device_detection/verifier/` directory. Run setup
again after changing text descriptions — the caches are fingerprinted and are
silently ignored when the prompts change, which disables the laptop/TV damage
corroboration until rebuilt. The application fails closed if assets are absent.

The verifier reduces some high-confidence false positives, but it also rejects
some valid devices. Do not lower thresholds using a single failing example or
claim all three device types are independently validated from these smoke tests.
Validate the combined pipeline on a separate, representative set of actual
photos. Screenshot crops are useful regressions but are not the original camera
file and do not prove behavior on the original capture.

Wallet regression: the user's screenshot photo was extracted locally to a
temporary file (not committed). The original YOLO model gives a ~93% phone
score. The combined pipeline rejects it because the verifier cannot confidently
distinguish it from competing objects. A real phone photo and the existing TV
sample are accepted. One public laptop close-up was misclassified by YOLO and
rejected; another laptop photo was correctly detected but rejected by the verifier
as uncertain. These are known recall limitations, not passing validations.

If unsupported objects still receive high scores, collect those actual negative
photos and retrain the three-class detector with correctly labeled positive
images and background images containing no supported targets. Raising the
threshold alone cannot guarantee rejection of unfamiliar objects. Use separate
training/validation/test photos and re-export ONNX after retraining: the runtime
prefers `best.onnx` beside the PT weights.

References:
- https://academy.ultralytics.com/courses/train-your-first-yolo/predict-on-image
- https://docs.ultralytics.com/datasets/detect/
- https://huggingface.co/Xenova/clip-vit-base-patch32
- https://huggingface.co/docs/transformers/model_doc/clip
