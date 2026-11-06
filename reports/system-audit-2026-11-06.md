# EcoAgent system audit — 6 November 2026

The tested application flows pass after the fixes below. The audit used a
production build in headless Microsoft Edge, desktop and 390 × 844 mobile
viewports, and a separate temporary database with synthetic accounts. Existing
user accounts and saved records were not used for browser tests.

| Validation | Result |
| --- | --- |
| JavaScript/API/component tests (`npm test`) | 101 passed |
| Python identity, corroboration, and crop tests | 16 passed |
| Browser workflow checks | 46 passed |
| TypeScript | Passed |
| Production build | Passed |
| Live Gemini first question and contextual Filipino follow-up | Both returned `gemini-chat`, HTTP 200 |
| Uncaught browser JavaScript errors | None |

## Fixes and improvements

- Account requests now time out, explain network failures, and reject malformed
  successful responses before they can corrupt profile or workspace state.
- Logout checks the expected account ID. A stale tab cannot sign out a different
  account that signed in elsewhere. Signing in rotates the browser's previous
  session; focus/visibility changes refresh the current account in the UI.
- Profile changes no longer reset an already saved item's idempotency key or
  saved indicator. Editing a name or city cannot enable an accidental second
  save of the same identification attempt. Location remains optional.
- Client validation matches server field limits. The API rejects malformed item
  keys and non-string profile locations rather than silently clearing them.
- Pending chat requests are cancelled when the account changes. Old answers
  cannot appear in the next account's conversation; error retries and Gemini
  source labels were exercised in the browser.
- Gemini 3.5 Flash-Lite is the default in server configuration, environment
  examples, documentation, and mocked integration tests.
- Directory loading has a timeout, response checks, and an explicit retry action.
  A simulated outage followed by a successful retry was tested.
- Both map views share one Google Maps loader with a timeout. Memoized map input
  prevents unrelated form and chat updates from rebuilding all facility pins.
- Photo analysis cannot restore an obsolete submitted result after item fields
  change. Camera callbacks ignore closed/restarted sessions; keyboard focus stays
  inside the camera dialog and returns to the original control on close.
- Camera text now explains that using a captured photo starts an upload for
  automatic analysis. Map fallback messages remain useful to site visitors.
- Isolated component tests no longer start the application's API plugins, file
  watchers, dependency scanner, or conflicting HMR servers. The baseline map
  component test timed out; the corrected full suite completes in about two
  seconds locally.
- Removed obsolete directory demo wording and added the site's existing logo as
  its favicon. The built favicon link and image resource were checked separately.

## Browser coverage

Ten desktop routes and seven mobile routes were checked for rendering and
horizontal overflow. Other checks cover directory search and empty states,
address/source details, nearest-facility ranking with a controlled location,
Google Maps initialization, manual identification, photo category invalidation,
camera denial and Escape, educational cards, registration, session restoration,
profile persistence and cancellation, bookmarks, saved items, profile edits
after saving an item, logout, wrong passwords, duplicate registration, login,
directory retries, chatbot retries, source labels, and cancelling a delayed
chat answer on logout.

Real model samples passed for a phone, TV, open laptop, and laptop close-up.
A wallet was rejected, and a phone submitted as a laptop was blocked. These are
six workflow regression cases, not a broad model accuracy benchmark. The two
laptop examples that failed in the 5 November report now pass with the current
installed models; model weights and acceptance thresholds were not changed by
this audit.

The browser report intentionally includes HTTP 503 responses and a chat error
from the outage fixtures. A favicon 404 was observed during the initial browser
run and corrected afterward. These are distinguished from uncaught JavaScript
errors, of which there were none.

## Evidence and limits

- [Detailed browser results](system-audit-2026-11-06.json)
- [Desktop profile preview](system-profile-desktop-2026-11-06.png)
- [Mobile profile preview](system-profile-mobile-2026-11-06.png)
- Run `npm test`, `npm run typecheck`, and `npm run test:browser` to repeat the
  automated checks. Browser and local photo-fixture prerequisites are documented
  in the README. The browser runner builds, starts a temporary server/database,
  and cleans up its own temporary files.

Physical phone cameras, real GPS accuracy, deployed hosting, holiday schedules,
and facility access were not verified. Facility visit notes retain their source
links and distinguish venue hours from confirmed collection hours. Detection
outputs remain model estimates, and the local identity system still has no
email verification or password-reset flow.
