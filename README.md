# EcoAgent

EcoAgent is a React, TypeScript, and Vite prototype for e-waste handling guidance, educational content, and a collection-facility directory.

The current item-guidance pilot supports only TVs, mobile phones, and laptops. Other device categories are not implemented for item-specific classification or handling guidance.

## Run locally

```powershell
npm install
npm run dev
```

Open the local address printed by Vite. EcoAgent Ask Bot's API is available from the same server at `POST /api/chat`; send JSON in the form `{"message":"How should I handle an old laptop?"}`. Optional recent context can be sent as `history`, an array of up to eight `{ "role": "user" | "assistant", "content": "..." }` messages. `GET /api/health` checks API availability. The Vite preview server also exposes these endpoints.

The chatbot uses the `@google/genai` SDK when `GEMINI_API_KEY` is configured in the root `.env` or `.env.local` file. The key is read by the Vite server and is never sent to browser code. `GEMINI_MODEL` is optional and defaults to `gemini-3.5-flash-lite`, matching the model used by `test-gemini.mjs`; use a model enabled for your Google AI Studio project. Restart Vite after changing environment settings. Without a key, the local EcoAgent guidance remains available. When Gemini is unavailable, quota-limited, or rejects the configured key, Ask Bot labels its response as local guidance instead of presenting it as a Gemini answer.

Gemini receives recent conversation context and project-provided collection-location data. Location entries include the supplied device-acceptance notes, addresses, and operating schedules where available. Those details have not been independently verified and do not establish current operation, fees, availability, accreditation, or recycling outcomes. Confirm acceptance, schedules, operation, and public access with the listed operator before traveling. The assistant does not store chat messages server-side. Item registration, collection requests, and private status lookups are not connected to authorized backend operations, so it does not claim to complete them.

The directory page and chatbot use the same Metro Manila collection-options data in `data/collection-locations.json`. It lists TVs, mobile phones, and laptops where supplied, while flagging entries that require confirmation about local arrangements, specific devices, household access, or schedules. No record establishes accreditation. Other facility cards used elsewhere in the prototype remain illustrative demo recommendations.

## Checks

```powershell
npm run typecheck
npm run test:ecobot
npm run build
```

## Prototype limitations

The app does not yet use a hosted centralized database or production accreditation registry. Its collection records contain project-provided Metro Manila location names, status notes, acceptance information, and some operating schedules, not verified accepted items, current addresses, schedules, fees, accreditation, availability, or recycling outcomes. Verify real-world facility details and item-specific safety requirements with qualified local sources.
