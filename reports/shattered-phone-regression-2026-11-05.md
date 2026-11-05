# Supplied shattered-phone image regression

The image supplied in this turn has an extensively shattered phone screen.
The installed whole-device damage model missed it: its strongest full-image
`damaged_phone` score was about 0.031, and a device-crop pass instead produced
a weak `damaged_laptop` result. Filtering correctly refused the wrong class.
Lowering a display threshold alone would not repair that class error.

Added a separate local CLIP visual-comparison check for verified phones. It
compares screen-damage descriptions against intact screens, glare, smudges,
phone backs, and empty cases. Initial acceptance heuristics require cosine
similarity >= 0.30 and a margin >= 0.01 over competing descriptions. These are
not calibrated probabilities, independently validated operating points, or
evidence that the original YOLO damage model has improved.

The API exposes this as `visualDamageCandidates`, independently of YOLO's
`damageDetections`. The condition helper labels the evidence source as
`visual-comparison`. The UI explains that the specialized detector did not
confirm the result and that the outline marks the assessed phone, not the
precise crack locations. Existing identity verification and category/geometry
checks still gate the final condition result.

Actual checks:
- Original supplied PNG: damage indicated by visual comparison.
- JPEG versions at qualities 95, 82, and 60: damage indicated.
- Existing normal-phone sample: uncertain, not marked damaged.
- Existing wallet sample: identity blocked, no damage assessment.
- In headless Microsoft Edge, uploading the actual supplied PNG through the
  application's normal browser resize/JPEG path produced “Possible damaged /
  broken device,” the correct evidence-source note, and an orange outline.
  Normal-phone and wallet UI regressions passed too. No uncaught browser errors.
- Nineteen detection/condition policy tests passed; production build passed.
  The two existing TypeScript declaration errors remain unrelated to this change.

The supplied PNG includes an existing green detection box, so these results
apply to that exact supplied image and its tested conversions. It was processed
locally from the attachment's temporary path; the photo was not committed or
uploaded to a remote inference service. A representative unseen set of damaged
and intact phones is still needed to measure false positives and missed damage.
