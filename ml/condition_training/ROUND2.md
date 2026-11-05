# Round 2: trained model, subsequently deactivated

**Current status:** deactivated after the user's report that real photo detection
remains unreliable. `.env` now points back to
`ml/damage_detection/weights/best.pt`. Original datasets and weights are preserved.
The following results describe the experiment and its earlier activation, not
proof that the user's reported failures were fixed. See `reports/round2-rollback.json`.

The experimental condition model was
`ml/condition_training/weights/round2-binary-20261105/best.pt` with its matching
ONNX export and `damage-policy.json`. Only `DAMAGE_DETECTOR_WEIGHTS` in `.env`
was changed. Original identity, TV and damage weights were preserved. The
original damage model still supplies the existing identity pipeline's auxiliary
proposals; its condition scores do not override the new condition model.

## New data actually obtained

| Source | Downloaded photos | Used after review | Attribution / license |
| --- | ---: | ---: | --- |
| [Broken Interfaces, CHI 2014](https://github.com/MHCI/broken-interfaces) | 95, plus 95 SVG annotations | 95 | Schaub, Seifert, Honold, Mueller, Rukzio, Weber; CC BY 4.0; pinned revision `37877e61c93e17975a8a5968baefad3dba0b3231` |
| [Wikimedia Commons](https://commons.wikimedia.org/) | 133 | 85 | Per-photo author, source URL and CC/public-domain license retained in `sources/round2/manifest.json` |
| [Manufacturing Defect Detection](https://github.com/Ishannaik/Manufacturing-Defect-Detection) | 89 | 87 | Ishan Naik's public research repository; no explicit license found. Used for this local experiment; no rights to redistribute its images are asserted. Revision/URLs retained in `sources/round2/tv-hackathon-manifest.json`. |

**317 newly obtained photos; 267 used in the curated experiment.** Some downloads
were rejected/rate-limited; they are not counted as obtained. Source labels were
not blindly trusted: the TV repository mixes laptops and TVs, and some label
files contain unrelated/invalid classes. Contact-sheet review supplied the
experiment labels; two ambiguous monitor/laptop images were excluded.

Existing phone/laptop/TV data were retained. Laptop examples labeled only as
faded keys, minor scratches, stains, sticker marks or faded touchpads were
excluded from this **clear physical-damage** experiment. This does not prove
those devices are functional or defect-free. Original files remain untouched.

## Splits and training

- 2,899 unique photos: **2,136 train / 371 validation / 392 test**.
- 1,998 unique positive and 138 unique negative training photos.
- Training-only negative repetition balances exposure: **4,068 training draws**,
  not 4,068 distinct photos. Validation/test photos are not repeated for training.
- Augmented originals and available laptop serial identifiers are grouped;
  exact hashes cannot cross splits. New near-duplicates are grouped using
  perceptual hashes. These heuristics cannot establish physical-device
  independence for every image in every source.
- All old TV video frames stay in training. Additional TV/laptop photos supply
  source-reserved validation/test examples.
- 50 new-source test photos contain 19 damaged examples (11 phones, 3 laptops,
  5 TVs) and 31 intact-looking examples. Thirty new-source validation photos
  were used for checkpoint selection; test photos were not training inputs.

Completed GPU training: 12 epochs at 640 px for a three-class candidate, followed
by 8 epochs for a **single-class `visible_damage` model**. The latter deliberately
separates damage recognition from the existing three-device identity model.
Its checkpoint was selected on new-source validation data, at the unchanged
0.50 condition threshold. This is a small development experiment, not an
unbiased final estimate of performance on arbitrary user photos.

## Measured results

Standalone damage-presence diagnostic on the 50 new-source photos:

| Model | Damaged photos detected | Intact photos without a false damage report |
| --- | ---: | ---: |
| Original active damage model | 0/19 | 22/31 |
| New three-class candidate | 17/19 | 28/31 |
| Selected damage-only model | **19/19** | **29/31** |

The standalone model does not identify device type. Its per-device damage
recall groups use the dataset's device annotations, not predicted identities.

Actual application pipeline, including identity checks and per-device crops:

| Model | Correctly identified and assessed damaged photos | False damage reports on 31 intact photos |
| --- | ---: | ---: |
| Original active pipeline | 0/19 | 3 |
| New active pipeline | **16/19** | **3** |

The three remaining damaged cases are blocked by the unchanged identity checks:
two TVs and one laptop. They are **not classified as undamaged**. Among identified
damaged devices the new flow assessed 11 phones, 2 laptops and 3 TVs as damaged.
The new pipeline also produced two intact-laptop false alarms and one intact-TV
false alarm. These observed failures prevent a universal-accuracy claim.

The 16 original identity/condition regression cases passed, including wallet
rejection, basic keypad phones, intact photos and the user's shattered phone.
The live browser upload path also passed damaged-phone, intact-phone, wallet
and Nokia checks after browser resizing/compression. The user's damaged photo
returned a **0.989899 model score**, not 98.99% real-world accuracy.

Detailed evidence:

- `reports/round2-activation.json`: installed files, SHA-256 hashes, prior model.
- `reports/round2-binary-candidate-fresh-test.json`: standalone per-photo scores.
- `reports/round2-binary-candidate-fresh-pipeline.json`: actual pipeline results.
- `reports/round2-binary-pipeline-regression.json`: 16 protected regressions.
- `reports/round2-browser-check.json`: live browser upload results.
- `reports/round2-preservation-check.json`: original weights and 2,817 old photos unchanged.

## Runtime behavior

The new model runs only on accepted device crops and cannot invent device
identities. Its outputs retain the raw `visible_damage` class, actual score,
verified device class and device box. The client checks that scope before using
the evidence. Crops use no surrounding padding to reduce attribution to nearby
items. The original TV practice model remains available, but does not override
condition assessments from the configured crop model.

Photo labels cover visible damage presence, not individual crack pixels.
No model here establishes electrical **Working / non-working Broken** status.
Lack of damage evidence remains an uncertain result.

## Repeating the experiment in this prepared workspace

Raw downloads, review indexes and source archives must remain available locally.
Dataset preparation refuses to overwrite an existing experiment directory.

```powershell
.venv/Scripts/python.exe ml/condition_training/prepare_round2.py
.venv/Scripts/python.exe ml/condition_training/finalize_round2.py
.venv-train/Scripts/python.exe ml/condition_training/train.py --epochs 12 --data ml/condition_training/dataset/round2/data.yaml --name visible-damage-round2 --batch 32 --workers 2 --imgsz 640 --lr0 0.0003
.venv-train/Scripts/python.exe ml/condition_training/select_round2.py
.venv/Scripts/python.exe ml/condition_training/prepare_round2_binary.py
.venv-train/Scripts/python.exe ml/condition_training/train.py --epochs 8 --data ml/condition_training/dataset/round2-binary/data.yaml --model ml/condition_training/weights/round2-candidate/best.pt --name visible-damage-round2-binary --batch 32 --workers 2 --imgsz 640 --lr0 0.0003
.venv-train/Scripts/python.exe ml/condition_training/select_round2.py --run visible-damage-round2-binary --output-name round2-binary-candidate
```

The policy sidecar is required for any presence model: schemaVersion `1`, mode
`verified-device-crops`. Evaluate new weights before promotion; the promotion
script requires the protected regressions to pass and the real pipeline to
detect more damage without increasing the baseline false-alarm count.

To restore the previous condition model, set `.env` to:
`DAMAGE_DETECTOR_WEIGHTS=ml/damage_detection/weights/best.pt`, then restart/refresh
the development server and upload the photo again. Other model paths stay intact.
