# Training completed; candidate not deployed

Three completed GPU runs: 15 + 8 + 5 epochs on NVIDIA RTX 4060 Laptop GPU.
The original datasets, identity weights and active damage weights are preserved.

Downloaded 71 AXON sample photos (37 broken, 34 intact) and 300 DataCluster
photos with XML annotations. Added 154 reviewed DataCluster positives and 30
reviewed intact-looking laptop negatives to the experiment. There are 2,484
unique training images, 266 validation images and 251 internal test images.
The balancing run uses 3,210 training draws, including repetitions.

At the same 0.50 threshold:

| Diagnostic | Original model | Final candidate |
| --- | ---: | ---: |
| Reviewed cracked phones: detected | 1/35 | 34/35 |
| Intact AXON test phones: correctly no phone damage | 2/2 | 2/2 |
| Other reviewed intact photos: correctly no same-device damage | 5/7 | 4/7 |
| User's shattered phone: detected | 0/1 | 1/1 |
| External damaged-TV photos: detected | 0/3 | 0/3 |

The three false damage reports are on intact stock phone photos. The TV sample
contains two devices photographed three times. These are small development
samples, not a representative general accuracy evaluation. Perceptual duplicate
screening cannot prove physical-device independence. Internal mAP is misleadingly
high because whole-photo labels and source patterns make that task easy.

**Candidate kept separate because the observed quality is insufficient.**
No app configuration or active weights were changed for these experiments.
The candidate and ONNX export remain available under
`ml/condition_training/runs/visible-damage-v3/weights/`.

The trained classes remain `damaged_phone`, `damaged_laptop`, `damaged_tv`.
Intact negatives do not establish electrical function. This is not a verified
Working / Broken / Damaged classifier. Better balanced intact-phone data and
independent TV/laptop examples are necessary before deployment.

Source links, licenses, reproduction commands and limitations:
[Training README](../ml/condition_training/README.md).
Detailed per-photo scores: [candidate](condition-v3-independent.json),
[baseline](condition-baseline-independent.json).
