# Supplied Nokia keypad-phone regression

The user was correct: the original Git logic recognizes this supplied image.
Running the unchanged PT checkpoint using the original 0.50 threshold returned
`cell phone` at 0.915597. Current ONNX inference also found the phone at 0.920548,
but the added visual verifier mislabeled the keypad layout as a calculator and
blocked the trained output. Dataset deletion or lost weights did not cause this
specific regression; the added acceptance layer did.

The phone comparison descriptions now include basic numeric-keypad phones,
feature phones, flip phones, and slider phones rather than only smartphone views.
For a visually leading phone with an insufficient similarity margin, two strong
trained phone predictions (both >= 0.90, IoU >= 0.50) can corroborate acceptance.
A different visual winner such as wallet/calculator remains blocked. Consensus
preserves the original custom candidate, box, and raw score; it does not replace
the original weights or fabricate a higher score.

Results:
- Supplied PNG: accepted as Mobile Phone using the custom model's 0.920548 score,
  supported by trained-detector consensus.
- Actual upload in headless Edge against the running localhost:5173 app:
  accepted as Mobile Phone at 0.919494 after normal browser JPEG conversion;
  CUSTOM TRAINED MODEL badge and detected-category text displayed.
- Full 16-case selected-photo regression passed, covering the supplied Nokia,
  shattered phone, smartphones, both laptop views, TVs, four wallet variants,
  and bus/people negatives. These are selected regressions, not a general accuracy
  estimate.
- Python consensus regressions and the production build passed.

The supplied image remains at its attachment temporary path; it was not committed
or sent to remote inference. Model text caches were rebuilt locally with
`scripts/setup-device-verifier.py`. Evidence: `keypad-full-regression-results.txt`
and `keypad-full-manifest.local.json`.
