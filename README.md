# EcoAgent

EcoAgent is a React, TypeScript, and Vite prototype for e-waste handling guidance, educational content, and a collection-facility directory.

The current item-guidance pilot supports only TVs, mobile phones, and laptops. Other device categories are not implemented for item-specific classification or handling guidance.

## Run locally

Use Node.js 22.13 or later. The backend stores collection facilities in
`data/ecocycle.sqlite`, creating and seeding the SQLite database from the
project's supplied facility and coordinate data the first time the server
starts. The database file stays local and is excluded from Git. The
`GET /api/facilities` endpoint serves the shared records to the directory and
map; the chatbot reads the same database. Facility updates are read-only for
now because the app does not yet have real admin authentication.

```powershell
npm install
npm run dev
```

Open the local address printed by Vite. EcoAgent Ask Bot's API is available from the same server at `POST /api/chat`; send JSON in the form `{"message":"How should I handle an old laptop?"}`. Optional recent context can be sent as `history`, an array of up to eight `{ "role": "user" | "assistant", "content": "..." }` messages. `GET /api/health` checks API availability. The Vite preview server also exposes these endpoints.

The chatbot uses the `@google/genai` SDK when `GEMINI_API_KEY` is configured in the root `.env` or `.env.local` file. The key is read by the Vite server and is never sent to browser code. `GEMINI_MODEL` is optional and defaults to Gemini 3.1 Flash-Lite (`gemini-3.1-flash-lite`); use a model enabled for your Google AI Studio project. Restart Vite after changing environment settings. Without a key, the local EcoAgent guidance remains available. When Gemini is unavailable, quota-limited, or rejects the configured key, Ask Bot labels its response as local guidance instead of presenting it as a Gemini answer.

Gemini receives recent conversation context and project-provided collection-location data. Location entries include the supplied device-acceptance notes, addresses, and operating schedules where available. Those details have not been independently verified and do not establish current operation, fees, availability, accreditation, or recycling outcomes. Confirm acceptance, schedules, operation, and public access with the listed operator before traveling. The assistant does not store chat messages server-side. Item registration, collection requests, and private status lookups are not connected to authorized backend operations, so it does not claim to complete them.

The directory, facility API, and chatbot read the same Metro Manila collection data from SQLite. The first-run seed comes from `data/collection-locations.json` and `data/facility-coordinates.json`. Listings flag details that require confirmation about local arrangements, devices, public access, or schedules. No record establishes accreditation. Other facility cards used elsewhere in the prototype remain illustrative demo recommendations.

## Nearest facility and map

Identify E-Waste uses browser geolocation instead of a location dropdown. After
the required item fields are completed, analyzing an item requests location
access and shows the nearest mapped collection option for that device when the
device reports accuracy within one kilometer. Facility Guidance also offers a
**Use my location** button. HTTPS or localhost is required. The app no longer
uses a separate IP-location service or city-center estimates for nearest results. Permission
denial, imprecise location, unavailable location, and timeouts leave the full
directory available without guessing a starting point.

Matching venues are ordered by straight-line distance, including options across
city boundaries. Distances are not road distances or travel times. The closest
mapped venue is pinned in a Google Maps embed, with Google Maps directions
available on click. The user's coordinates are held in browser memory, are not
sent to Ask Bot, and are not saved to the profile. Opening directions shares the
origin and destination with Google Maps.

`data/facility-coordinates.json` records OpenStreetMap venue coordinates and a
source link for each mapped listing. Map data is © OpenStreetMap contributors
under the [Open Database License](https://www.openstreetmap.org/copyright).
Coordinates identify venue centers, not verified collection bins. Listings with
no confirmed coordinates remain in the directory and are excluded from distance
ranking. Confirm the exact drop-off point, device acceptance, and current
collection arrangements before visiting.

## Device photo analysis

The local photo workflow runs the three-class model in
`ml/device_detection/weights/` for TVs, phones, and laptops. Analysis starts
automatically after a photo is selected. If no category is chosen yet, the
identity pipeline proposes one and the interface asks the user to confirm it
before running the category-specific guidance. Photos up to 25 MB are resized
and re-encoded in the browser before upload, which also removes EXIF metadata.
An additional YOLO11m reference detector can recognize broader views missed by
the narrow custom model. Install it separately with
`.venv/Scripts/python scripts/setup-reference-detector.py` after installing the
export requirements. Original custom weights remain unchanged. Only TVs,
phones, and laptops are exposed to the app. Phone/wallet visual checks remain
mandatory; agreeing YOLO phone predictions alone cannot bypass them. The API
records candidate sources and warns if the optional reference fails. See
`ml/device_detection/VALIDATION.md` for measured limitations; the current system
is not certified accurate on all photos.
The damage model now also runs during upload: a strong damaged-device proposal
can recover a missed identity only after a separate visual check confirms its
device class. It cannot override an already accepted identity or an ambiguous
multi-device result. Damage inference additionally examines verified device
crops so small cracks are less likely to disappear in whole-image resizing.
The later [Round 2 condition model](ml/condition_training/ROUND2.md) was tested
locally, then deactivated following user-reported failures. The previous damage
model setting is restored; experimental weights remain available. The experimental
model detects `visible_damage` only on
verified device crops, while the original three-class identity weights and their
original auxiliary support remain intact. Device-bound damage evidence cannot
be attributed to another object's crop. This condition model does not infer
electrical function or exact crack locations. Its measured failures, source
attributions and installation hashes are documented in the Round 2 report.
The photo area also has a **Take a photo** action that opens a live camera
preview with capture, retake, and review. Camera access requires HTTPS or
localhost; when it is unavailable, denied, or the browser has no camera, the
dialog falls back to a saved file or the phone's camera app.
When the selected category is TV, it also runs the TV-specific practice model in
`ml/tv_training/weights/` on the same image. If
`ml/damage_detection/weights/best.pt` (or `.onnx`) exists, it additionally runs
the optional damage model for phones, laptops, and TVs. All results are shown
as a device overlay and a separate photo-condition check. An accepted device
can show **Possible damaged / broken device**, **Damage could not be confirmed**,
or **Damage assessment not available yet**. Matching damage candidates need a
model score of at least 0.50 and overlap with the accepted device; predictions
for another device class or background region do not determine its condition.
The orange outline is a damage candidate and may cover the whole device.
The installed models do not distinguish specific faults or prove that a device
is working. The form's condition remains the user's own observation.
For accepted phones, a separate local CLIP visual comparison also checks visible
screen damage against intact screens, glare, smudges, phone backs, and empty
cases. It can provide an explicitly labeled visual estimate when the specialized
damage detector misses a shattered screen. This comparison is separate from the
retrained condition model; its similarity values are not YOLO confidence scores
or probabilities.
Run `scripts/setup-device-verifier.py` again when upgrading an older local model
cache so the phone-condition text embeddings are available.
Inference uses the exported ONNX weights by default and
needs only `onnxruntime`, `numpy`, and `Pillow`; PyTorch and Ultralytics are
optional fallbacks. Images stay on the local backend and are not sent to
Gemini. See [`ml/tv_training/INTEGRATION.md`](ml/tv_training/INTEGRATION.md)
for setup and limitations. Model outputs are not verified item identity,
condition, damage, or safety assessments.

To train the optional damaged-phone/laptop/TV model, import a public dataset
with `npm run import:damage -- --dataset laptop_defects --source <export.zip>`
(or place your own YOLO data in `ml/damage_detection/dataset/`), then run
`npm run train:damage`. See
[`ml/damage_detection/README.md`](ml/damage_detection/README.md) for the folder
layout, dataset list, labeling guidance, and evaluation steps.

## Checks

Registration and login use the local SQLite `users` table through
`POST /api/auth/register` and `POST /api/auth/login`. Passwords are stored as
scrypt hashes with per-user salts; signed-in sessions use an HttpOnly cookie
and server-side token hashes, expire after seven days, and are removed on
logout. `GET /api/auth/me` returns the current public profile. Only an email
may be remembered in browser storage; passwords and session tokens are not.
Guest access remains available. This local prototype does not provide email
verification, password reset, or a hosted production identity service.
Authentication UI and validation are in `src/components/auth/`.

Accounts also persist saved item/analysis summaries, facility bookmarks and profile
preferences in the same SQLite database. Use **Save to My Items** after analysis;
the uploaded photo is not stored with the record. **My Items** can reopen matching
facility recommendations or remove records. The dashboard displays actual saved
records and bookmarks. Facility bookmarks refer to directory records and are keyed
by municipality and name, so similarly named venues remain separate. Profile name,
user type and location changes survive logout and login. A matching saved city is
used as a rough location fallback; it does not replace GPS. Guests can identify
devices but must sign in to save records. All account queries use the authenticated
session's user ID; another account's records cannot be read or removed.

```powershell
npm run typecheck
npm run test:auth
node --test tests/account-workspace.test.mjs
npm run test:ecobot
npm run test:tv
npm run build
```

## Prototype limitations

The app does not yet use a hosted centralized database or production accreditation registry. Its collection records contain project-provided Metro Manila location names, status notes, acceptance information, and some operating schedules, not verified accepted items, current addresses, schedules, fees, accreditation, availability, or recycling outcomes. Verify real-world facility details and item-specific safety requirements with qualified local sources.
