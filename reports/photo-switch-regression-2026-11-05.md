# Detection flow regression: replacing a photo

Reproduced against the user's running server on localhost:5173. The app and API
responded normally; no uncaught browser JavaScript error was observed.

Confirmed bug: after identifying a phone and selecting Mobile Phone, uploading
a TV retained Mobile Phone in the form and sent it as the requested category.
The detector identified TV correctly but the stale category caused a mismatch
and blocked the result. A new-photo render could also reuse the previous
photo's result until the new request started.

Fixes:
- Replacing a photo clears the previous category, name, quantity, and suggestion;
  condition resets to Unknown. A valid replacement is analyzed as a fresh item.
- Results are bound to their source File object, so previous boxes cannot render
  on the new photo while the next analysis is pending.
- A corroborated laptop uses a class-specific visual lead requirement when
  detector confidence and absolute visual evidence are strong. Phone/wallet
  requirements remain unchanged. This is a prototype heuristic requiring broader
  independent validation, not proof of accuracy.

Actual live-browser sequence passed: normal phone → TV → open laptop → supplied
shattered phone → wallet → normal phone. A held-response check confirmed that
the old boxes disappeared before the new result arrived. The supplied shattered
phone still produced a damage estimate, and the wallet remained rejected.

The existing ten-case photo manifest improved from 8/10 to 9/10 matching expected
identity outcomes. All six unsupported cases remained rejected, including four
versions of the same wallet. The extreme laptop close-up still fails identity
verification; it is a known model limitation. These are selected diagnostic
samples, not an independent accuracy measurement. Identity checks also do not
independently validate damage-condition accuracy on a laptop.

Nineteen JavaScript detection/condition policy tests, three Python identity-policy
tests, and two Python crop tests passed. The production build passed. The two
existing TypeScript declaration errors for facility/auth API modules remain.
