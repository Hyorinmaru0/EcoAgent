# EcoAgent system audit — 5 November 2026

The system is functional in several main flows, but it is not accurate or complete
across all supported devices. In particular, both tested laptop photos failed to
produce an accepted laptop result. No product code was changed during this audit.

| Check group | Result | Interpretation |
| --- | --- | --- |
| Existing automated tests | 64 passed, 4 failed, 68 total | Four assertions currently disagree with UI wording or directory ordering. These are not model accuracy measurements. |
| Real browser checks, Microsoft Edge | 33 passed, 4 failed, 37 total | Includes actual photo uploads, live local APIs, authentication, maps, desktop and mobile layouts. |
| Real model photo checks | 8 passed, 2 failed, 10 cases | Four cases are compression variants of the same wallet photo. This is not an independent ten-photo dataset or an accuracy estimate. |
| Production build | Passed | Vite successfully produced the client build. |
| TypeScript check | Failed | Missing declarations for `server/facility-api.mjs` and `server/auth-api.mjs`, imported at `vite.config.ts:7` and `:8`. |

## Confirmed findings

1. **Laptop recognition is unreliable in the tested examples.** An open laptop
   received a laptop candidate but was rejected by the verifier as uncertain.
   A second laptop close-up was incorrectly classified as a phone by YOLO at
   about 90%; the visual verifier blocked it. Blocking the wrong label is good,
   but neither case completed the correct laptop identification workflow.
   Reproduction: upload either tested laptop image, select Laptop, fill the other
   required fields, and analyze. The result is unverified with no item guidance.

2. **Dashboard counts disagree with the registered-item list.** The Dashboard
   displays five registered items, while Registered E-Waste contains three demo
   cards. The Dashboard count is hardcoded at `src/App.tsx:1039`; the demo array
   starts at `src/App.tsx:1841`. These are not an account's real saved history.

3. **Profile Save Changes is not durable.** For an actual newly registered test
   account, changing the name and saving updates the current UI, but reloading
   restores the account's original name. The form at `src/App.tsx:1888` only
   displays a local-preferences notice; it does not update the database.

4. **Automated tests need reconciliation with current behavior.** Independently
   reproduced failing assertions:
   - Registration markup expects “Terms and Conditions”; the current UI describes
     account information storage instead.
   - Two chatbot tests expect specific facilities immediately after the city
     heading. The actual directory output uses a different ordering.
   - The location test expects “site settings”; the current error says
     “this site's browser settings.”
   These failures should be reviewed rather than hidden. Updating the assertions
   does not fix or validate laptop recognition.

## What passed in the browser

- Ten desktop routes rendered without horizontal overflow: Home, Dashboard,
  Identify, Facility Guidance, Directory, Learn, How It Works, Profile,
  Registered E-Waste, and Login/Register.
- Home, Identify, Directory, Dashboard, and Login/Register fit a 390 × 844
  viewport without horizontal overflow. This checks responsive layout in Edge,
  not physical Android/iOS behavior.
- The directory API served 47 records. A named search returned the expected
  listing after expanding its municipality; a nonexistent search returned an
  empty state.
- A simulated accurate position at SM North EDSA ranked that venue first at
  zero straight-line distance. Google Maps initialized, and a directions link
  was available. Actual user GPS accuracy and real-world collection-bin locations
  were not verified.
- Manual guidance is labeled as having no photo verification. Changing category
  invalidates the previous result and its nearest-facility panel.
- The wallet screenshot photo was blocked end to end, without an accepted box
  or item guidance. A phone uploaded while Laptop was selected was also blocked.
- The tested real phone and existing TV sample completed photo analysis and
  displayed guidance.
- Camera denial displayed a saved-file fallback; Escape closed the dialog.
  Physical camera capture/retake was not tested with real hardware.
- All five learning cards opened and closed their content.
- The chat UI sent an unsupported-device question and displayed the scoped
  response. This does not validate factual accuracy of Gemini-generated answers.
- A new account was created in a disposable database; its session survived a
  reload and used an HttpOnly cookie. Logout invalidated the session. Wrong
  passwords and duplicate registration were rejected. The login form worked.
- No uncaught browser JavaScript errors were recorded during the final run.

## Detection sample details

| Input | Expected | Actual final decision |
| --- | --- | --- |
| Wallet extracted from the user's screenshot, PNG | Reject | Rejected as unverified |
| Same wallet, JPEG quality 95 | Reject | Rejected as unverified |
| Same wallet, JPEG quality 82 | Reject | Rejected as unverified |
| Same wallet, JPEG quality 60 | Reject | Rejected as unverified |
| Bus/person street photo | Reject | Rejected as uncertain |
| People photo | Reject | No match |
| Phone photo | Mobile Phone | Accepted as Mobile Phone |
| TV validation frame | TV | Accepted as TV |
| Open laptop photo | Laptop | Rejected as unverified — failure |
| Laptop close-up photo | Laptop | YOLO phone candidate blocked — failure |

The four supported-device photos yielded two correct accepted results and two
rejections. The unsupported cases were rejected, but the wallet variants are
correlated. No general sensitivity, precision, or accuracy percentage is justified
by this small, selected sample. The TV frame is from an existing project dataset,
so it is not independent generalization evidence. The original wallet camera file
was not available: testing used an extracted screenshot region.

Public sample sources:
- Bus/people: Ultralytics YOLOv5 repository `data/images/bus.jpg` and `zidane.jpg`.
- Phone: `https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=1000&q=85`.
- Laptop close-up: `https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=1000&q=85`.
- Open laptop: `https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=1000&q=85`.

## Reproduction and artifacts

The browser audit used a separate Vite instance on port 5180 with
`ECOCYCLE_DB_PATH` pointing to a disposable SQLite database in the system temp
directory. Existing user accounts were not used. The user's port-5173 server
was left running. Browser cookies and test credentials are not included in reports.

- `system-audit-results.json`: final 37 browser checks and their evidence.
- `detection-photo-tests.txt`: raw model outputs from ten photo cases.
- `detection-photo-manifest.local.json`: local file manifest; temporary photo
  paths are specific to this workstation and may cease to exist.
- `failing-automated-tests.txt`: independent reproduction of four failing
  automated assertions, with failure details.
- `scripts/audit-system.mjs`: reusable browser audit. It requires Playwright
  installed in the documented temporary directory, Microsoft Edge, a disposable
  server on port 5180, and the local photo fixtures.

Commands used:

```
node --test tests/auth.test.mjs tests/ecobot.test.mjs tests/tv-detection.test.mjs tests/device-detection-policy.test.mjs
npm run typecheck
npm run build
node scripts/audit-system.mjs
npm run smoke:rejection -- reports/detection-photo-manifest.local.json
```

Recommended order: improve and validate laptop detection using a separate labeled
photo set; connect counts/history to real data; implement durable profile saves;
then resolve TypeScript declarations and reconcile outdated test expectations.
Current facility schedules, acceptance policies, accreditation, fees, and actual
collection operations were not independently verified by this code/browser audit.
