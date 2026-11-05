# Visible-damage training experiment

**Update:** the later [Round 2 experiment](ROUND2.md) completed, but its model was
subsequently deactivated after user-reported failures. The previous damage-model
setting is restored. The results below describe the earlier three-class experiments.

This is an isolated experiment for **visible damage on phones, laptops and TVs**.
The original identity detector, damage models and source datasets remain intact.
Candidate weights are never installed automatically.

A photograph cannot establish whether a device powers on, charges, has a working
mainboard, or is electrically beyond repair. These datasets do **not** provide
verified Working / electrically Broken / Damaged labels for all three devices.
Intact-looking photos are negative examples, not proof of working electronics.

## Sources downloaded for this experiment

| Source | Actual public download | Publisher's license | Use |
| --- | --- | --- | --- |
| [Axon Labs smartphone sample](https://www.kaggle.com/datasets/axondata/cracked-and-intact-smartphone-images-dataset), version 1 | 71 photos: 37 broken, 34 intact | CC BY-NC 4.0 | Intact training/validation/test; reviewed broken photos reserved for development comparison |
| [DataCluster Labs cracked screens](https://www.kaggle.com/datasets/dataclusterlabs/cracked-screen-dataset), version 4 | 300 photos and 300 Pascal VOC XML annotations | CC0, as declared by publisher | Manually reviewed subset for extended phone training; corrupt/ambiguous examples omitted |
| [Wikimedia Commons](https://commons.wikimedia.org/) | Three damaged-TV photos, two devices | Per-file license/author preserved in `sources/commons-tv/attribution.json` | Small external diagnostic only; not training |

Axon's description refers to a larger commercial collection. Only **71 actual
public sample photos** were downloaded. The 300-photo DataCluster download is
also a sample, not its advertised larger commercial collection. No API keys,
paid downloads, or private accounts were used. Raw archives and publisher
metadata are retained in the ignored `sources/` directory.

The earlier project data remain the primary training source: 1,006 phone images,
2,010 laptop images and 174 usable TV frames. Unannotated laptop photos are
excluded from the initial dataset because absence of annotations does not prove
absence of damage. Thirty selected intact-looking laptop photos were subsequently
reviewed for the extended dataset. Original labels are never changed.

## Dataset design

`prepare.py` creates a separate dataset with 2,300 training, 266 validation and
251 test photos. It groups augmented versions using the original filename before
`.rf.` and verifies no exact SHA-256 duplicates cross those splits. All TV frames
from the single recording remain in training; there is no independent TV test in
that dataset. Presence labels cover the whole photo: they are **not precise crack
locations** and must not be represented as such in the UI.

`extend.py` adds reviewed DataCluster phone positives to `dataset/v2`. It excludes
exact duplicates and perceptual lookalikes of reserved AXON photos, comparing
both original images and annotated crops after removing screenshot letterboxing.
This does not guarantee physical-device independence across different views.
AXON comparison results are development diagnostics, not a final unbiased
accuracy estimate. The limited intact-phone test contains only two photos.

## Reproducing training

The separate `.venv-train` environment contains CUDA PyTorch for the RTX 4060.
The application's `.venv` is preserved. Training starts from the existing general
COCO `yolo11n.pt`, rather than the old damage checkpoint that saw older splits.

```powershell
.venv-train/Scripts/python.exe ml/condition_training/prepare.py
.venv-train/Scripts/python.exe ml/condition_training/train.py --epochs 15
.venv-train/Scripts/python.exe ml/condition_training/extend.py
```

The additional thirty laptop negatives are recorded with exact review indices in
`dataset/v2/reviewed-laptop-negatives.json`; that optional curation is separate
from `extend.py`. To fine-tune the first candidate on the extended dataset:

```powershell
.venv-train/Scripts/python.exe ml/condition_training/train.py --epochs 8 --data ml/condition_training/dataset/v2/data.yaml --model ml/condition_training/runs/visible-damage-v1/weights/best.pt --name visible-damage-v2 --batch 32 --workers 2
```

Each run writes weights, learning curves, test metrics and an ONNX export in its
own directory. `visible-damage-v1-result.json` and `visible-damage-v2-result.json`
record results after completion. The interrupted preliminary warm-start run was
preserved under `runs/warmstart-incomplete` and is not used for reported results.

The second run improved damaged-phone recall but produced intact-photo false
alarms. `balance.py` builds a third experiment using the **same 2,484 unique
training photos**, repeating training-only intact photos during sampling (3,210
training draws, not 3,210 different photographs). This correction does not move
validation or test examples into training.

```powershell
.venv-train/Scripts/python.exe ml/condition_training/balance.py
.venv-train/Scripts/python.exe ml/condition_training/train.py --epochs 5 --data ml/condition_training/dataset/v3/data.yaml --model ml/condition_training/runs/visible-damage-v2/weights/last.pt --name visible-damage-v3 --batch 32 --workers 2
```

```powershell
.venv/Scripts/python.exe ml/condition_training/check_candidate.py --weights ml/condition_training/runs/visible-damage-v2/weights/best.onnx --output reports/condition-candidate-independent.json
```

Compare with `reports/condition-baseline-independent.json` at the same thresholds.
Do not quote a single overall accuracy from the internal mAP: whole-photo labels,
source imbalance, scarce negative examples, possible different views of the same
device, and missing independent TV/laptop-negative coverage limit that metric.
Actual application regression checks are also required before installing a
candidate through `DAMAGE_DETECTOR_WEIGHTS`.

## Completed experiment outcome

All three runs completed (28 epochs total). The final candidate improved the
reviewed cracked-phone diagnostic from 1/35 to 34/35 at threshold 0.50, but still
reported damage on three of seven other intact photos and missed all three
external TV photos. It was **not installed**. The original active models remain
unchanged. See [the final report](../../reports/condition-training-results.md)
for counts, source limitations, and per-photo evidence.
