# Detection hardening plan — 2026-11-06

## What was going wrong

1. **Damage hallucination.** `damageAssessment.mjs` accepted any damage
   candidate at `DAMAGE_ACCEPTANCE_THRESHOLD = 0.5`, and a CLIP visual
   comparison with similarity >= 0.30 / margin >= 0.01 could mark a phone
   `damaged` on its own. Those CLIP numbers are uncalibrated zero-shot scores,
   so an intact phone with glare or a smudge crossed them. The crop damage model
   also ran at `DAMAGE_CONFIDENCE_THRESHOLD = 0.08`, which mostly produced noise
   for the policy layer to reject again.
2. **Missed TVs and laptops.** The verifier rejects a correct laptop as
   `uncertain` when CLIP cannot separate it from a monitor (documented in
   `ml/device_detection/VALIDATION.md`, lines 127-129), and nothing else could
   rescue that box. The TV condition model is fit on 200 frames of one recording
   with a chronological 160/40 split and `independentTestSet: false`, so its
   scores are not evidence about a different TV.
3. **Weak provenance on damage classes.** `ml/damage_detection/model-manifest.json`
   records `2:damaged_tv: 0` instances; damaged-TV predictions came from the
   single-recording practice model.

## Changes made in this pass

| File | Change |
| --- | --- |
| `src/components/identification/damageAssessment.mjs` | `DAMAGE_ACCEPTANCE_THRESHOLD` 0.5 -> 0.7; TV practice model needs 0.8; CLIP-only evidence reports `uncertain` unless similarity >= 0.45 and margin >= 0.05. |
| `src/components/identification/TvDetectionPanel.tsx` | Damage outline is drawn only for an accepted `damaged` result. |
| `ml/tv_training/infer.py` | `DAMAGE_CONFIDENCE_THRESHOLD` 0.08 -> 0.25; damage-assisted identity recovery needs 0.85 (was 0.70); uncertain laptop/TV identities can be accepted through reference consensus. |
| `ml/device_detection/reference_identity.py` | New `corroborate_uncertain_detection()`: laptop/TV only, requires CLIP label match + margin > 0 + overlapping accepted reference box. Phones keep the wallet gate. |
| `src/components/identification/browserLocation.mjs` | Error wording now matches the assertions in `tests/tv-detection.test.mjs` ("site settings", "invalid location"). |
| `vite.config.ts` | Ignore `ml/`, `reports/`, `runs/`, `.idea/` in the file watcher. Watching ~15k YOLO label files on OneDrive made the first request take over 60 s, which failed the component-render tests. |
| `src/index.css` | `@source not` for `../ml`, `../reports`, `../runs` so Tailwind does not scan 35 MB of training data on every compile. |
| `tests/*` | Expectations updated; added threshold, TV-practice-model, and consensus tests. |

Reference detections were already labeled `REFERENCE FALLBACK` in
`TvDetectionPanel.tsx`; that path is unchanged.

## Follow-up pass — same day, two user-reported cases

The user then reported two concrete failures: an **intact laptop flagged as
having a problem**, and a **clear TV photo returning "No supported device
detected"**. Both were reproduced locally with the real photos.

Measured root causes:

1. **TV miss.** On the user's photo the custom model only produced
   `television 0.13` (below the 0.25 diagnostic threshold). The reference
   `yolo11m` gave `tv 0.7448`, but CLIP's top label on the crop was
   `other object 0.2416`, so `identity_verification_status` returned
   `rejected` and the confident reference box was vetoed by CLIP indecision.
2. **Laptop false damage.** The crop damage model emitted
   `damaged_laptop 0.785` on an intact laptop plus a full-photo box at
   `0.7247`. The policy had no independent check on laptop/TV condition, so
   any score above 0.7 became "damaged".

Changes in this pass:

| File | Change |
| --- | --- |
| `ml/device_detection/visual_verifier.py` | `INCONCLUSIVE_LABELS = {"other object", "room"}` below 0.28 similarity now returns `uncertain` instead of `rejected` (weak generic verdict = "I do not know", not a rival identity). New zero-shot `DEVICE_DAMAGE_PROMPTS` / `DEVICE_DAMAGE_FINGERPRINT` / `DAMAGE_CLASS_NAMES`, shared `_assess_damage()`, and `assess_device_damage()` for laptop/TV condition evidence. |
| `ml/device_detection/reference_identity.py` | `REFERENCE_CLEAR_SCORE = 0.7`: a reference box >= 0.70 with no competing visual explanation (same-class or inconclusive CLIP verdict, `uncertain`) is accepted with `method: "reference-detector"`. Confident generic verdicts (>= 0.28) and real competing objects still reject. |
| `scripts/setup-device-verifier.py` | Also builds `ml/device_detection/verifier/device-damage-labels.npz`. **Must be re-run whenever damage prompts change** — caches are fingerprinted and silently ignored otherwise, disabling laptop/TV corroboration. |
| `ml/tv_training/infer.py` | Emits CLIP condition evidence (`visualDamageCandidates`) for cell phone, laptop and television — one check per accepted device crop, independent of whether the damage YOLO found a box. |
| `src/components/identification/damageAssessment.mjs` | `MAX_DAMAGE_BOX_FRACTION = 0.9`: a damage box covering >= 90% of the photo localizes nothing and reports `uncertain`. `deviceConditionEvidence()` — laptop/TV damage claims additionally need CLIP status `indicated` when evidence exists; phones unchanged. |
| `src/components/identification/useTvDetection.ts` | `VisualDamageEvidence.className` widened to `damaged_phone \| damaged_laptop \| damaged_tv`, runtime validation updated. |
| `src/components/identification/TvDetectionPanel.tsx` | Evidence wording made category-neutral. |

Before/after on the actual photos:

| Photo | Before | After |
| --- | --- | --- |
| User's TV screenshot crop | `rejected` ("other object") → no device detected | `television 0.7448`, `accepted`, `method: reference-detector` → category TV |
| Intact laptop (open) | `damaged_laptop 0.785` → "damaged" | damage box still found but CLIP evidence `uncertain` (0.29 / margin 0.007) → **uncertain**, not damaged |
| Intact phones (2 photos) | — | no damage boxes, CLIP `uncertain` → uncertain |
| Cracked-screen dataset photo | damaged | still `damaged_phone 0.944` → still reported damaged (phone path unchanged) |

Test status: `npm run typecheck` clean; `npm run build` succeeds; `python -
unittest discover -s tests -p "test_*.py"` passes 16/16; `tests/damage-assessment`,
`tests/device-detection-policy`, `tests/tv-detection` (58/58 combined), `tests/auth` and
`tests/account-workspace` all pass when each suite runs on its own. Running every
suite in one `node --test` invocation can still exceed Vite's 60 s module timeout
because several dev servers warm up at once — run the `test:*` scripts instead.
`tests/ecobot` fails on facility-listing order/content expectations; that suite
and `server/ecobot.mjs` were not touched here.

## Retraining plan (the part code cannot fix)

1. **Device model (laptop/TV recall).** Add hard negatives — monitors, tablets,
   picture frames, remotes, keyboards — and re-label the unannotated laptop
   photos in `reports/laptop-unannotated-index.json`. Split by recording/session,
   never chronologically, and hold out an independent test set before training.
2. **TV condition model.** Collect frames from *multiple* TVs and viewpoints
   (currently one recording, 200 frames). Until then the model keeps the 0.8
   acceptance bar and the `tvWarning` text.
3. **Damage model.** Add `damaged_tv` instances (manifest currently records 0),
   plus healthy negatives for every class: intact phones, intact TVs, intact
   laptops under the same lighting. The false-positive rate on intact devices is
   measured on that negative set, not on cracked-screen crops.
4. **Validation protocol.** Every retrain reports precision on an intact-device
   negative set *and* recall on a held-out positive set; thresholds above are
   re-tuned only on a development split, never on the final test set.
