# EcoAgent

EcoAgent is a React, TypeScript, and Vite prototype for e-waste handling guidance, educational content, and a collection-facility directory.

The current item-guidance pilot supports only TVs, mobile phones, and laptops. Other device categories are not implemented for item-specific classification or handling guidance.

## Run locally

```powershell
npm install
npm run dev
```

Open the local address printed by Vite. EcoAgent Ask Bot's API is available from the same server at `POST /api/chat`; send JSON in the form `{"message":"How should I handle an old laptop?"}`. Optional recent context can be sent as `history`, an array of up to eight `{ "role": "user" | "assistant", "content": "..." }` messages. `GET /api/health` checks API availability. The Vite preview server also exposes these endpoints.

The chatbot uses the `@google/genai` SDK when `GEMINI_API_KEY` is configured in the root `.env` or `.env.local` file. The key is read by the Vite server and is never sent to browser code. `GEMINI_MODEL` is optional and defaults to Gemini 3.1 Flash-Lite (`gemini-3.1-flash-lite`); use a model enabled for your Google AI Studio project. Restart Vite after changing environment settings. Without a key, the local EcoAgent guidance remains available. When Gemini is unavailable, quota-limited, or rejects the configured key, Ask Bot labels its response as local guidance instead of presenting it as a Gemini answer.

Gemini receives recent conversation context and project-provided collection-location data. Location entries include the supplied device-acceptance notes, addresses, and operating schedules where available. Those details have not been independently verified and do not establish current operation, fees, availability, accreditation, or recycling outcomes. Confirm acceptance, schedules, operation, and public access with the listed operator before traveling. The assistant does not store chat messages server-side. Item registration, collection requests, and private status lookups are not connected to authorized backend operations, so it does not claim to complete them.

The directory page and chatbot use the same Metro Manila collection-options data in `data/collection-locations.json`. It lists TVs, mobile phones, and laptops where supplied, while flagging entries that require confirmation about local arrangements, specific devices, household access, or schedules. No record establishes accreditation. Other facility cards used elsewhere in the prototype remain illustrative demo recommendations.

## Nearest facility and map

Identify E-Waste uses browser geolocation instead of a location dropdown. After
the required item fields are completed, analyzing an item requests location
access and shows the nearest mapped collection option for that device. Facility
Guidance also offers a **Use my location** button. HTTPS or localhost is required;
permission denial, unavailable location, and timeouts leave the full directory
available without guessing a location.

Matching venues are ordered by straight-line distance, including options across
city boundaries. Distances are not road distances or travel times. The closest
mapped venue is pinned in an OpenStreetMap embed, with Google Maps directions
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
`ml/device_detection/weights/best.pt` for TVs, phones, and laptops. When the
selected category is TV, it also runs the TV-specific practice model in
`ml/tv_training/weights/best.pt` on the same image. Both results are shown as
separate candidate overlays. Images stay on the local backend and are not sent
to Gemini. See [`ml/tv_training/INTEGRATION.md`](ml/tv_training/INTEGRATION.md)
for setup and limitations. Model outputs are not verified item identity,
condition, damage, or safety assessments.

## Checks

Login and registration remain frontend simulations with validation, password
visibility controls, remembered email, and guest access. Passwords are not saved.
The reusable authentication components are in `src/components/auth/`.

```powershell
npm run typecheck
npm run test:auth
npm run test:ecobot
npm run test:tv
npm run build
```

## Prototype limitations

The app does not yet use a hosted centralized database or production accreditation registry. Its collection records contain project-provided Metro Manila location names, status notes, acceptance information, and some operating schedules, not verified accepted items, current addresses, schedules, fees, accreditation, availability, or recycling outcomes. Verify real-world facility details and item-specific safety requirements with qualified local sources.
