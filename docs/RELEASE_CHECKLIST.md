# Release Checklist

Operator checklist for a Steam release submission. Tick each item once verified.

## Pre-Submission

- [ ] **Capsule rules audit** — Upload capsule art preview in Steamworks partner site visual review tool. Confirm no marketing copy, review quotes, awards, or promotional badges on base capsules. Game name and official subtitle only.
- [ ] **Packaged-file audit** — Run `npm run pack:win`, inspect `dist/win-unpacked/` and asar contents (`npx asar list app.asar`). Confirm no dev markdown, no `assets/source-models/UltimateMonsters/`, no `scripts/serve.py`, no `node_modules/` outside the asar bundle.
- [ ] **Credits/license audit** — Open `CREDITS.md`. Confirm every asset under `assets/` and every dependency in `package.json` (including transitives surfaced by electron-builder) has a license row.
- [ ] **Privacy policy** — Confirm `PRIVACY_POLICY.md` reflects current build behaviour. Link it from the Steam store page (Steamworks partner site → Store Page → Basic Info → Privacy Policy URL). Published at `https://hearn1.github.io/arcane-gaunt/PRIVACY_POLICY.md` via GitHub Pages.
- [ ] **Store descriptions** — Paste short and long descriptions from `assets/store/descriptions.md` into Steamworks partner site.
- [ ] **Screenshots** — Upload 6–10 representative 1920×1080 screenshots to Steamworks partner site. No debug overlays, HUD on, no smoke result panel.
- [ ] **Capsule art** — Upload all capsule sizes to Steamworks partner site: header (`460×215`), main (`616×353`), small (`231×87`), library capsule (`600×900`), library hero (`1920×620`), library logo (`1280×720`).
- [ ] **Trailer** — Upload final 60–90s trailer `.mp4` via Steamworks partner site (not committed to repo). See `assets/store/trailer/README.md` for source notes.

## Steam Client Smoke Test

- [ ] **Build & upload** — Run the SteamPipe build (`npm run steam:prep` then `scripts/steampipe/` upload script) targeting the internal-test branch.
- [ ] **Install on clean machine** — Install the build via Steam client on a Windows test machine that has never run the game.
- [ ] **Capsule & library art** — Verify capsule and library art display correctly in the Steam library.
- [ ] **Game launch** — Verify the game launches via Steam and the `arcane://` protocol serves correctly.
- [ ] **Achievements** — Verify achievements pop (requires Steamworks integration).
- [ ] **Cloud sync** — Verify Steam Cloud round-trips a save by playing on one machine, checking saves sync, then verifying on another.
- [ ] **Uninstall cleanup** — Verify uninstall removes the program files. Save files remain in `%APPDATA%/ArcaneGaunt/saves/` per user-data convention.

## Final

- [ ] **`package.json` version** — Confirm version is `1.0.0` (or the intended release version).
- [ ] **Branding & metadata** — Confirm `productName`, `copyright`, `author`, and `appId` in `package.json` and `electron/main.cjs` are correct for release.
- [ ] **Promote branch** — Promote the internal-test build to the desired release branch (operator action, not automated).
