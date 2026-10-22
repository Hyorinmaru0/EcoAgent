# EcoAgent

EcoAgent is a React, TypeScript, and Vite prototype for e-waste handling guidance, educational content, and a collection-facility directory.

## Run locally

```powershell
npm install
npm run dev
```

Open the local address printed by Vite. EcoAgent Ask Bot's API is available from the same server at `POST /api/chat`; send JSON in the form `{"message":"How should I handle an old laptop?"}`. Optional recent context can be sent as `history`, an array of up to eight `{ "role": "user" | "assistant", "content": "..." }` messages. `GET /api/health` checks API availability. The Vite preview server also exposes these endpoints.

The chatbot uses the `@google/genai` SDK when `GEMINI_API_KEY` is configured in the root `.env` or `.env.local` file. The key is read by the Vite server and is never sent to browser code. `GEMINI_MODEL` is optional and defaults to `gemini-3.5-flash-lite`, matching the model used by `test-gemini.mjs`; use a model enabled for your Google AI Studio project. Restart Vite after changing environment settings. Without a key, the local EcoAgent guidance remains available. When Gemini is unavailable, quota-limited, or rejects the configured key, Ask Bot labels its response as local guidance instead of presenting it as a Gemini answer.

Gemini receives recent conversation context and project-provided collection-location data. The directory entries are unverified and do not establish accepted items, addresses, schedules, fees, availability, accreditation, or outcomes. The assistant does not store chat messages server-side. Item registration, collection requests, and private status lookups are not connected to authorized backend operations, so it does not claim to complete them.

The chatbot uses the community collection-options directory in `data/collection-locations.json`, which contains project-provided Metro Manila location names and status notes. These entries have not been independently verified and do not specify accepted items, current addresses, or schedules; confirm current operation, public access, accepted items, and hours with the operator or local environment office before traveling. The main UI also contains sample facility cards and demo recommendation content; those are illustrative and are not used as real chatbot recommendations. No record establishes accreditation.

## Checks

```powershell
npm run typecheck
npm run test:ecobot
npm run build
```

## Prototype limitations

The app does not yet use a hosted centralized database or production accreditation registry. Its collection records contain project-provided Metro Manila location names and status notes only, not verified accepted items, current addresses, schedules, fees, accreditation, availability, or recycling outcomes. Verify real-world facility details and item-specific safety requirements with qualified local sources.
