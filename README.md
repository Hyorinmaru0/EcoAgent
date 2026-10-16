# EcoAgent

EcoAgent is a React, TypeScript, and Vite prototype for e-waste handling guidance, educational content, and a collection-facility directory.

## Run locally

```powershell
npm install
npm run dev
```

Open the local address printed by Vite. EcoBot's project-owned API is available from the same server at `POST /api/chat`; send JSON in the form `{"message":"How should I handle an old laptop?"}`. `GET /api/health` checks API availability. The Vite preview server also exposes these endpoints.

EcoBot uses a small, curated set of project guidance and facility examples. It does not call an external AI provider, require an API key, or store chat messages. Facility listings are illustrative and must be verified directly before travel. Answers outside the site's subject matter receive a clarification rather than an invented answer.

The community collection-options directory includes Metro Manila locations and verification notes supplied for this project in `data/collection-locations.json`. These entries have not been independently verified; confirm current operation, public access, accepted items, and schedules with the location or local environment office before visiting.

## Checks

```powershell
npm run typecheck
npm run test:ecobot
npm run build
```

## Prototype limitations

The app does not yet use a hosted centralized database or a production accreditation registry. Verify real-world facility details and item-specific safety requirements with qualified local sources.
