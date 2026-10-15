# EcoCycle AI — Local Figma Make Front-End Starter

This folder contains the source files retrieved from the Figma Make **Environmental Technology Dashboard** project (EcoCycle AI), adapted for running as a regular standalone React + TypeScript + Vite website.

### Run on Windows (VS Code terminal)

```powershell
npm install
npm run dev
```

Open the local address shown by Vite (usually **http://localhost:5173/**).

For a production build:

```powershell
npm run build
```

## Notes
- `src/App.tsx` and `src/index.css` are the Figma Make source and styling as retrieved. This starter is **not a complete official ZIP export** and doesn't include Figma-only configuration files.
- The original `vite.config.ts` referenced Figma-private configuration/plugins. It was replaced with a standard Vite config so the site runs outside Figma Make; the HTML was updated for standalone use.
- The existing front end uses demo item and facility data. **Do not treat claims of accreditation or facility details as verified.**
- The project includes pages and prototype interactions, but does not implement a production authentication service, database, or trained AI agent.
- The PDF research documents are not bundled here. Place them in `docs/` if you want Codex to reference them.

## Module 1: Login and Registration

Open **Login / Register** in the header, or visit `http://localhost:5173/#login`.
The reusable authentication components live in `src/components/auth/`, with scoped
styles that extend the existing Figma Make layout. Other modules retain their
existing prototype behavior. The Laboratory Activity 5.1 PDF is not bundled, so
Figures 1 and 2 could not be visually cross-checked.

- Demo login accepts any valid email and a password of at least 8 characters with
  a letter and a number. For example, `raven@example.com` / `EcoCycle123`.
- Registration requires a full name, email, password, matching confirmation,
  user type, and acceptance of the displayed demo Terms and Conditions.
- Login, registration, and **Continue as Guest** navigate to the Dashboard.
- A registered profile is kept in React state for the current page session. Logging
  in again with that email restores its name and user type until the page reloads.
- **Remember Me** saves only the email address in localStorage. Unchecking it and
  logging in removes the remembered email. Passwords never leave form state and
  are cleared when the form unmounts. No authentication token is created.

Validation commands (the authentication tests use Node.js 24):

```powershell
npm.cmd run typecheck
npm.cmd run test:auth
npm.cmd run build
```

For a manual check, submit blank forms, try an invalid email, weak and mismatched
passwords, and unaccepted terms; then submit valid details and verify the Dashboard
greeting. Test both password visibility buttons, remembered-email behavior after
a reload, and guest access. Check the stacked layout and controls on mobile as
well as the two-column desktop layout.
