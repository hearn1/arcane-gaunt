# feature_8 — Steamworks Integration

## Rationale

Steam expects shipping games to wire achievements, stats, and Cloud
save so the game integrates with players' libraries. ArcaneGaunt today
writes saves to `%APPDATA%/ArcaneGaunt/saves/` and documents Cloud
relative paths but has no Steamworks SDK initialization, no
achievement triggers, and no stats pushes. Leaderboards are listed as
optional in todofeature.md item 24.

This feature stays as a thin native sidecar so the static
ES-modules architecture and the vanilla gameplay code do not need to
import Steamworks at all. The Electron main process talks to
Steamworks; the renderer uses the existing storage / log bridge
pattern to fire events.

## Depends On

- **feature_3 (Electron Metadata)** — App ID and product identity must
  be settled before Steamworks init can attach.
- **feature_4 (SteamPipe Build Scripts)** — A real depot has to exist
  before achievement / stat data is meaningful.
- **feature_2 (Smoke Tests)** strongly recommended so achievement
  hooks can be exercised without manual play.

## Files Touched

### Created

- `electron/steamworks.cjs` — Wraps the chosen Steamworks Node module
  (e.g. `steamworks.js` or `greenworks`, whichever ships current
  Electron support — to be selected during implementation). Exports
  a small interface:
  - `init(appId)` — call once on app ready.
  - `triggerAchievement(apiName)` — fire and forget.
  - `setStat(apiName, value)` — incremental or absolute per stat type.
  - `storeStats()` — flush pending stat writes.
  - `getCloudFile(path)` / `setCloudFile(path, buffer)` (optional —
    only if Steam Cloud auto-quota isn't used).
  - `shutdown()` — on app quit.
- `electron/achievements.cjs` — Pure data: array of achievement
  definitions with `{ apiName, condition }`. Conditions are evaluated
  in main from the renderer-supplied event payloads.
- `assets/store/achievements.csv` — Operator-facing list mirrored from
  `achievements.cjs` for upload to the Steamworks partner site.
- `assets/store/stats.csv` — Operator-facing list of stat schemas.

### Modified

- `package.json`
  - Add the chosen Steamworks Node module as a `dependency` (not
    devDependency — it ships in the packaged app).
  - Add the module to `build.extraResources` if its native binaries
    need to land outside asar.
  - Add `build.asarUnpack` for any native `.dll`/`.node` files.
- `electron/main.cjs`
  - On `app.whenReady`, attempt `steamworks.init(<APPID>)`. If init
    fails (e.g., launched outside Steam), continue without it —
    Steamworks is optional, never required.
  - Add IPC handler `arcane:steam-event` that accepts
    `{ event, payload }` from the renderer, dispatches into the
    achievement / stats logic, and returns success.
  - On `app.before-quit`, call `steamworks.shutdown()`.
- `electron/preload.cjs`
  - Expose `window.arcaneSteam = { available: <boolean>, event(name, payload) }`.
- `src/core/Steam.js` (created)
  - Thin renderer-side facade:
    `Steam.event(name, payload)` → `window.arcaneSteam?.event(name, payload)`.
  - Caches `available` flag for HUD use.
  - Safe to call from any module; resolves to no-op in browser dev.
- `src/core/Profile.js` — On a completed run, also call
  `Steam.event("run.completed", { highestWave, kills, gold, damage, starterSpellId })`.
- `src/level/LevelManager.js` — On wave clear, call
  `Steam.event("wave.cleared", { wave })`.
- `src/enemies/EnemyManager.js` — On boss kill, call
  `Steam.event("boss.killed", { variant })`.
- `src/player/Block.js` — On perfect block, call
  `Steam.event("block.perfect", { spellId })` (no spam — gate to
  per-frame already in place).
- `src/spells/UpgradeManager.js` — On node bought, call
  `Steam.event("upgrade.bought", { spellId, nodeId })`.
- `src/core/Settings.js` / `Profile.js` — No content change; Steam
  Cloud uses the existing `%APPDATA%/ArcaneGaunt/saves/` paths since
  Steam Cloud is configured to mirror that directory in Steamworks.
- `README.md`
  - Document that Steamworks is optional and the game runs without it
    in browser/dev and when launched outside Steam.
  - Note Steam Cloud config (the Steamworks site setting) maps
    `%APPDATA%/ArcaneGaunt/saves/*` ↔ `saves/*`.
- `BALANCE_NOTES.md` (if created) — No content change.
- `steampipe/README.md` — Add a "Cloud configuration" subsection.

### Not modified

- No new logic in `Damage.js`, `Health.js`, `Currency.js`, `Game.js`
  state machine, or any UI screen.
- No changes to localStorage behavior — Cloud sync is handled by
  Steam at the filesystem level on `%APPDATA%/ArcaneGaunt/saves/`.

## Implementation Plan

1. Select a Steamworks Node binding. Validate that it builds against
   the Electron version pinned in package.json (`^42.1.0`) and that
   it has prebuilt binaries for win-x64. Document the choice in
   `electron/steamworks.cjs` header comment.
2. Define achievements in `electron/achievements.cjs`:
   - `ACH_FIRST_RUN` — Complete one run.
   - `ACH_WAVE_5`, `ACH_WAVE_10`, `ACH_WAVE_15` — Reach the wave.
   - `ACH_NO_DAMAGE_WAVE` — Clear any wave without taking damage.
   - `ACH_PERFECT_BLOCK_10` — Stat-driven, lifetime ≥ 10 perfects.
   - `ACH_ALL_STARTERS` — Reach wave 3 with each of the six starter
     spells.
   - `ACH_BOSS_TRIPLE` — Defeat all three boss variants.
   - `ACH_RELIC_COLLECTOR` — Own 3 relics in one run.
3. Define stats schema in `electron/achievements.cjs`:
   - `STAT_RUNS_COMPLETED`, `STAT_HIGHEST_WAVE`,
     `STAT_LIFETIME_KILLS`, `STAT_LIFETIME_DAMAGE`,
     `STAT_PERFECT_BLOCKS`, `STAT_RELICS_OWNED_PEAK`.
4. Author `electron/steamworks.cjs` wrapper. Wrap every Steamworks
   call in try/catch — failures are logged to `main.log` and never
   thrown to the renderer.
5. Wire IPC: renderer fires `arcane:steam-event`; main dispatches
   into a small reducer in `achievements.cjs` that updates the stat
   table and triggers the right achievement when its condition
   evaluates true.
6. Add `src/core/Steam.js` renderer facade. Import lazily where
   needed (`Steam.event(...)`).
7. Insert event calls at the five renderer sites (Profile,
   LevelManager, EnemyManager, Block, UpgradeManager). Each insertion
   is one line at the existing event boundary — no new event timing.
8. Configure Steam Cloud in the Steamworks partner site:
   - Root override: install root + `%APPDATA%/ArcaneGaunt/saves/`.
   - Map `saves/settings.v1.json` and `saves/profile.v1.json`.
9. Export `achievements.csv` and `stats.csv` mirroring the
   `.cjs` source, upload to Steamworks partner site.
10. Test in Steam client with the dev app key. Verify achievement
    pop-ups in-game, stat increments visible in user data.

## Verification

### Automated

- All existing smoke scenarios continue to pass. They run in browser
  where `window.arcaneSteam` is undefined; `Steam.event` becomes
  a no-op.
- New optional scenario `?smoke=steam-noop-when-unavailable` —
  verifies `Steam.event(...)` resolves cleanly in browser dev.

### Manual (browser)

- Play through a wave clear, perfect block, upgrade buy, and run
  completion. No errors in `renderer.log`. `arcane:steam-event`
  channel is not fired because the bridge isn't exposed.

### Manual (Electron, launched outside Steam)

- `npm start` from source. The main process logs a single
  `[steam] init failed — running without Steam` info entry in
  `main.log`. Game plays normally.

### Manual (Steam client)

- Install the dev build via SteamPipe (feature_4 internal-test branch)
  and launch from Steam. Confirm:
  - First run completes → `ACH_FIRST_RUN` pops.
  - Wave 5 reached → `ACH_WAVE_5` pops.
  - Triggering each boss variant across runs → `ACH_BOSS_TRIPLE`
    pops at the third unique variant.
  - Stat dashboard in Steam shows `STAT_LIFETIME_KILLS` incrementing.
  - Save files round-trip through Steam Cloud when the user switches
    machines.

### Console / logs

- `main.log` contains one info entry per session for Steam init
  status. No error entries during normal play.
- `renderer.log` continues to be empty during a clean session.

## Guardrails

- Steamworks must be _optional_. The game must continue to play in
  browser dev and when launched outside Steam. No code path may throw
  if the bridge is missing.
- Do not introduce a synchronous Steamworks call on the renderer
  hot path. Every interaction is fire-and-forget via the existing
  IPC bridge.
- Do not write achievement-trigger logic in the renderer. Conditions
  live in `electron/achievements.cjs` so the renderer cannot lie.
- Do not move save files. Steam Cloud mirrors the existing
  `%APPDATA%/ArcaneGaunt/saves/` paths — preserve that exact
  filesystem layout so existing installs continue to work.
- Do not add Steam APIs that send arbitrary telemetry. Only the
  documented achievement / stat / cloud calls.
- Do not bundle the Steamworks SDK headers or dynamic libs without
  confirming the license allows redistribution in a packaged Electron
  app. Document the chosen binding's license alongside it.
- Do not weaken Electron `contextIsolation` / `sandbox` to attach
  the Steamworks bridge — use IPC like the storage / log bridges.
- Leaderboards (todofeature.md #24) are listed as "consider" — leave
  them out of this feature unless explicitly scoped in. A future
  feature_8b can add them after first release.
