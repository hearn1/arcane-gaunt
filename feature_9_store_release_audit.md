# feature_9 — Store Assets & Release Audit

## Rationale

Steam store presentation and release-audit hygiene are the final
release-blockers in todofeature.md (items 25–30). The store needs
capsules, library art, screenshots, a trailer, and short/long
descriptions; the package needs an unused-file audit and a final
credits/license pass; the project needs a privacy policy statement and
a Steam-client install smoke test from a private branch. None of these
are code; all are required for a Steamworks release submission.

This feature gathers everything required for store submission and the
final pre-release audits. It does not modify gameplay or Electron code
beyond credit/license string updates.

## Depends On

- **feature_3 (Electron Metadata)** — Final productName, version,
  copyright, and icon must be locked before generating screenshots and
  store assets.
- **feature_4 (SteamPipe Build Scripts)** — A private internal-test
  build must exist for the install smoke test.
- **feature_5/6/7 (Balance, Content, Onboarding)** — Strongly
  recommended so screenshots and trailer footage capture the intended
  shipping experience, not a pre-balance build.
- **feature_8 (Steamworks)** — Required for the install smoke test to
  exercise Cloud sync and the achievement pop-up.

## Files Touched

### Created

- `assets/store/capsule_header_460x215.png` — Main store capsule.
- `assets/store/capsule_main_616x353.png` — Main capsule (homepage).
- `assets/store/capsule_small_231x87.png` — Small capsule.
- `assets/store/library_capsule_600x900.png` — Vertical library
  capsule.
- `assets/store/library_hero_1920x620.png` — Library hero banner.
- `assets/store/library_logo_1280x720.png` — Library logo overlay
  (PNG with transparency).
- `assets/store/screenshots/` — 6–10 representative screenshots at
  1920×1080.
- `assets/store/trailer/README.md` — Notes on trailer source, target
  length (60–90s), and where the final mp4 should be uploaded
  (Steamworks partner site; the binary is not committed to the repo).
- `assets/store/descriptions.md` — Short description (≤300 char),
  long description (Steam BBCode), and feature bullets. Operator
  pastes these into the partner site.
- `PRIVACY_POLICY.md` — Statement that the game ships no remote
  telemetry, no analytics, no crash reporting off-device, and
  documents the local log files (`%APPDATA%/ArcaneGaunt/logs/`) and
  save paths.
- `RELEASE_CHECKLIST.md` — Operator checklist mirroring todofeature
  items 22–30: capsule rules audit, packaged-file audit,
  credits/license audit, privacy policy linked from Steam, Steam
  client install test.

### Modified

- `CREDITS.md` — Audit pass: every bundled asset and every Node
  dependency in `package.json` (including transitives surfaced by
  electron-builder) gets a license line. Confirm CC0 attribution
  text matches the source pack listings exactly.
- `package.json` — Final `version` bump (e.g. `1.0.0`). Confirm
  `license` and `author` are accurate. Trim any unused dependencies
  (none expected, but audit anyway).
- `README.md` — Add a top-level "Privacy" section pointing at
  `PRIVACY_POLICY.md`. Add a "Release" section linking to
  `RELEASE_CHECKLIST.md` for future ports.
- `.gitignore` — Ignore `assets/store/trailer/working/` and any
  Topaz/Premiere/Davinci local cache folders if the trailer is
  edited locally.
- `electron/main.cjs` — No code change unless the packaged-file audit
  surfaces a leftover bundling rule.
- `electron-builder` `build.files` array in `package.json` — Confirm
  it excludes development markdown (`PROJECT_OVERVIEW.md`,
  `GAME_DESIGN.md`, `TECHNICAL_ARCHITECTURE.md`,
  `IMPLEMENTATION_PLAN.md`, `UI_AND_SCENE_FLOW.md`,
  `ASSET_GUIDELINES.md`, `BALANCE_NOTES.md`, `RELEASE_CHECKLIST.md`,
  `INITIAL_SANDBOX_PROMPT.md`, `NEXT_SESSION_PROMPT.md`,
  `todofeature.md`, all `feature_*.md`). Keep `README.md`,
  `CREDITS.md`, and `PRIVACY_POLICY.md` shipped.

### Not modified

- No new gameplay code. No UI screens. No save schema changes.

## Implementation Plan

1. Run a packaged-file audit:
   - `npm run pack:win`, then list `dist/win-unpacked/` and the asar
     contents (`npx asar list app.asar`).
   - For each entry, decide: ship / exclude. Update
     `build.files` in `package.json` accordingly.
   - Common removals: `UltimateMonsters/` source assets (only the
     baked GLB lives in `assets/`), `dist/` recursion, development
     markdown files, `serve.py`.
2. Run a credits/license audit:
   - Enumerate every file under `assets/` and confirm its license is
     captured in `CREDITS.md`.
   - Enumerate every direct dependency in `package.json` and one
     level deep of transitives (electron, electron-builder,
     Steamworks binding from feature_8) and add a license row each.
   - Cross-check that bundled JS in `vendor/` matches the three.js
     MIT license attribution in `CREDITS.md`.
3. Author `PRIVACY_POLICY.md`:
   - No remote telemetry, no analytics, no crash reporting off-device.
   - Local save files at `%APPDATA%/ArcaneGaunt/saves/*.json`.
   - Local log files at `%APPDATA%/ArcaneGaunt/logs/*.log`.
   - Steam Cloud (when launched from Steam) syncs the saves directory
     under Steam's documented privacy policy.
4. Create capsule and library art at the Steamworks spec sizes. Art
   must respect Steam's capsule rules: artwork, game name, and any
   official subtitle ONLY on base capsules (no marketing copy,
   review quotes, awards, or promotional badges).
5. Capture screenshots:
   - 1920×1080, no debug overlays, HUD on, no smoke result panel.
   - One per starter spell archetype (six minimum).
   - At least one boss wave.
   - One reward screen.
   - One arena layout each for lanes/cross/cover/gates/rift if
     practical.
6. Capture trailer footage (operator-side, not in-repo).
   - Source: OBS recordings of 30s clips per spell + 30s boss montage.
   - Edit target: 60–90s with title card, gameplay montage, capsule
     callout, "wishlist on Steam" end card.
7. Write Steam store text in `assets/store/descriptions.md`:
   - Short: 250–300 char hook.
   - Long: full description with feature bullets, controls summary,
     and platform notes.
8. Bump `package.json` version to `1.0.0`.
9. Run the SteamPipe build (feature_4) targeting the internal-test
   branch. Install via Steam client on a clean Windows test machine.
   Validate:
   - Capsule and library art appear correctly in the library.
   - Game launches via Steam.
   - Achievements pop (feature_8).
   - Cloud sync round-trips a save by switching machines.
10. Walk `RELEASE_CHECKLIST.md` end to end and tick every item.

## Verification

### Automated

- All smoke scenarios continue to pass on the packaged build (run
  `?smoke=all` from the Electron build by setting the launch URL
  query in dev mode; the Steam-launched build does not run smoke).
- A new `?smoke=privacy-no-network` scenario can assert that
  `fetch` and `XMLHttpRequest` have not been called by the game
  outside the asset-load phase. Optional; primarily a guard for
  future regressions.

### Manual

- Run packaged-file audit and confirm `dist/win-unpacked/` contains
  no dev markdown, no `UltimateMonsters/`, no `serve.py`, no
  `node_modules/` outside the asar bundle.
- Open `CREDITS.md` and confirm every asset and library has an entry.
- Open `PRIVACY_POLICY.md` and `RELEASE_CHECKLIST.md` and confirm
  they reflect the current build behavior.
- Upload capsule art preview in Steamworks partner site and verify
  capsule rules are not flagged (Steamworks visual review tool).
- Install from Steam private branch, verify capsule, screenshots,
  description, achievements, Cloud sync, and uninstall cleanup.

### Console / logs

- Packaged build produces no `renderer.log` or `main.log` entries
  during a normal play session.
- Steamworks-side dashboards show stats incrementing if feature_8
  has shipped.

## Guardrails

- **No gameplay changes.** This feature only ships static assets,
  documentation, and metadata-level config.
- Do not commit the trailer .mp4 binary into the repo. Upload via
  Steamworks partner site only.
- Do not bundle non-CC0 art or non-MIT-equivalent libraries without
  documented attribution.
- Do not write any code that pings external services. Privacy policy
  must remain accurate.
- Do not put marketing copy, review quotes, awards, or promotional
  badges on base capsules — Steam capsule rules require they only
  appear on optional promotional capsules. Capsule auditor flags
  this automatically; do not work around it.
- Do not promote a Steam build to the default branch from this
  feature. The internal-test branch is the verification target;
  promotion is an operator action gated on the release checklist.
- Do not bundle `feature_*.md` planning files, `todofeature.md`,
  `BALANCE_NOTES.md`, or other internal docs in the packaged app.
- Final shipped markdown is README, CREDITS, and PRIVACY_POLICY only.
