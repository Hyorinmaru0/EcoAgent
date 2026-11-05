# Phone damage pipeline diagnosis

The installed damage model detected strong `damaged_phone` candidates on many
existing cracked-phone validation photos, but the identity gate blocked them
before condition results could be displayed.

On the same first 20 sorted cracked-phone validation images:

| Pipeline | Accepted phone with damage result | Identity blocked |
| --- | --- | --- |
| Before | 10 | 10 |
| After | 17 | 3 |

This is a diagnostic comparison on existing project validation data, not an
independent accuracy estimate. No confidence thresholds were lowered. The exact
photo reported as failing by the user was not supplied in this turn.

Changes:
- Run the existing damage detector during automatic upload analysis as well as
  explicit category analysis.
- Allow strong damaged-device proposals to recover a missing identity only if
  the local visual verifier confirms the device class.
- Evaluate recovery and primary-model scores separately; never override an
  accepted primary identity, category mismatch, or ambiguous primary result.
- Run damage inference on verified device crops with a small context border;
  map crop boxes back into original-image coordinates for the overlay.
- Retain the existing identity and damage acceptance thresholds.

Verification:
- Fifteen JavaScript detection/damage policy tests passed.
- Two Python crop geometry and verification-gating tests passed.
- Four targeted detection API regressions passed.
- In a real Edge browser against the built preview, a previously blocked
  cracked-phone photo displayed damage immediately after upload; the normal
  phone sample showed no visible damage; the wallet remained blocked.
- All six unsupported cases in the existing photo manifest remained rejected
  (four variants of one wallet, bus, people). The normal phone and TV samples
  remained accepted. Both known laptop examples still failed; this change does
  not resolve those earlier failures.
- Build passed. TypeScript still reports the two existing missing declarations
  for the facility and auth API modules.

Evidence: `phone-damage-diagnostic.jsonl`, `phone-damage-pipeline-before.json`,
and `phone-damage-pipeline-after.json`. Reproduce the validation diagnostic with
`node scripts/diagnose-phone-damage.mjs`.
