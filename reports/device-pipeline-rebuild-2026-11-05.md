# Device pipeline rebuild and measured limitations

The user's repeated failures were real. Earlier small smoke tests were insufficient
to claim the system was repaired generally. This revision changes the actual
learned recognition sources; it does not merely rename an unsuccessful result.

## Diagnosis

The custom PT and ONNX checkpoints produced similar failures, including a laptop
close-up classified as a phone and a wallet classified as a phone. This is not
primarily an ONNX export defect. The checkpoint records 30 epochs on
`datasets/combined_all/data_fixed.yaml`, with saved validation precision 0.90283,
recall 0.8363, and mAP50 0.89703. That original identity dataset is not in the
project; these saved metrics cannot be reproduced or generalized from weights alone.
A targeted search for `data_fixed.yaml` on Desktop, Downloads, and Documents found
no matching file. Existing damage datasets do not replace that identity dataset.

On 128 labeled COCO128 diagnostic images, containing 13 annotated target
objects in eight positive scenes, raw custom predictions at confidence 0.25 and
IoU >= 0.50 yielded 1 TP, 30 FP, and 12 FN. An official pretrained YOLO11m
reference at the same settings yielded 8 TP, 2 FP, and 5 FN. This set is a COCO
training subset and contains small and occluded devices; it is a diagnostic,
not independent validation or a deployment accuracy estimate.

## Implementation

- Preserve original custom PT/ONNX files.
- Install official pretrained YOLO11m separately, with a pinned source revision
  and export manifest. Restrict output to the same three supported device types.
- Prioritize corroborated reference predictions over a rejected custom label.
  Keep custom and damage-assisted recovery for damaged views the reference misses.
- Keep mandatory phone/lookalike verification. Two YOLO models can both call the
  wallet a phone, so agreement alone is insufficient for phone acceptance.
- Verify the full union of overlapping phone boxes. During development, a tight
  reference crop hid wallet edges and produced false accepts; full-shape
  verification now rejects all four supplied wallet variants.
- Keep explicit category mismatches and conflicting accepted classes blocked.
- Isolate an optional reference-model failure: custom results survive and the
  API reports the fallback rather than failing all detection.
- Limit ONNX thread pools to four per model to avoid oversubscription.
- Expose candidate origin and acceptance thresholds in API metadata and describe
  the broader detector truthfully in the UI.

## Results

| Check | Observed result |
| --- | --- |
| Existing 10-case photo regression | 10/10 expected identity outcomes; four cases are variants of one wallet |
| Four new clear stock photos, labeled before inference | 4/4 correct identities: two phones, one laptop, one TV |
| Existing 20 cracked-phone validation samples | 18 accepted with damage result; two abstentions |
| Full 128-image combined-pipeline diagnostic | No runtime errors; 0/120 labeled non-target scenes accepted |
| Positive scenes in that diagnostic | 3/8 correctly accepted and localized; five rejected; no incorrectly accepted positive scene |
| Optional reference deliberately replaced with an invalid test file | Custom phone detection survived; fallback warning returned |
| Browser sequence | Phone → TV → laptop close-up → open laptop → shattered phone → wallet → phone passed |
| Unit/regression checks | 22 JS policy tests, nine Python policy/crop tests, and six targeted API regressions passed |
| Build / types | Production build passed; two existing missing API declaration errors remain in TypeScript |

The new stock photos were manually inspected before assigning expected labels.
Sources were Unsplash photo IDs `1601784551446-20c9e07cdbdb`,
`1512499617640-c74ae3a79d37`, `1484788984921-03950022c9ef`, and
`1593359677879-a4bb92f829d1`. They remain in temporary storage. This
small set is not a statistically reliable precision/recall evaluation.

The browser used a disposable database and production preview. Custom checkpoints
and original accounts were preserved. Inference remained local. Supplemental
model exports live under the ignored reference directory.

## Remaining work for an accuracy claim

The system still abstains on some small, occluded, and stacked devices. The damage
models remain experimental and this identity rebuild does not independently
validate damage-condition classification. It must not be presented as 100% accurate
or as a model retrain. Real per-class precision and recall require original
labeled data, annotation review, leakage checks, and a separate representative
test set containing the group's actual devices and lookalike objects.

Evidence: `device-model-benchmark.json`, `device-model-benchmark-yolo11m.json`,
`combined-pipeline-validation.json`, `reference-integration-photo-tests.txt`,
`new-photo-validation-results.txt`, `reference-integration-phone-validation.jsonl`.

Sources: [YOLO11 documentation](https://docs.ultralytics.com/models/yolo11/),
[official checkpoint](https://huggingface.co/Ultralytics/YOLO11),
[COCO128 diagnostic mirror](https://huggingface.co/datasets/LibreYOLO/coco128).
