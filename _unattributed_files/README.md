# Files found in the workspace that were NOT written by this project's work

Found in `frontend/` while building Phase 1 (timestamps 14:37–14:42 on 2026-11-07). Nothing in `frontend/src` references them; the app builds and all tests pass without them. **They have not been run, reviewed or relied upon.**

- `unreferenced/` — `components/PageHeader.jsx`, `components/TableToolbar.jsx`, `hooks/useCrudList.js`, `lib/axios.js`, `pages/ForcePasswordChange.jsx`, `pages/Login.jsx`, `pages/Profile.jsx`
- `test/` — a vitest end-to-end test written against a *different* UI (custom store picker, form placeholders, a "proceed" button) — it would not pass against this UI
- `config/navigation.js` — an alternative menu definition (with `ready` flags); the app uses `src/utils/navigation.js`
- `validators/password.validator.js` — the old BizTrack password rule (6 chars + number + special)
- `package.json.as-found`, `vite.config.js.as-found` — the two config files as they were found, containing extra `vitest`/`testing-library`/`jsdom` entries and a `test:` block

Decision for the user: keep / merge / delete. If he does not recognise them, delete this folder.
