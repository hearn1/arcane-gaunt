# feature_2 — Expanded Smoke Tests

## Rationale

The browser smoke harness currently only covers `boot-start-menu`. To safely
land balance changes, gamepad work, Electron metadata changes, and Steamworks
integration without regressing the core loop, we need automated coverage of
wave clear → reward pick → death → restart, settings persistence after reload,
and the Reset Records flow. The smoke harness is the cheapest possible
regression net for a game with no build step and no unit-test framework.

## Depends On

- None (standalone). Independent of gamepad work; later features can lean on
  the new scenarios but they aren't required for landing this one.

## Files Touched

### Created

- `src/smoke/scenarios/waveClear.js` — Drives a real wave to completion by
  manipulating enemy HP through `applyDamage` and asserts reward state.
- `src/smoke/scenarios/rewardAndUpgrade.js` — Verifies reward pick, upgrade
  panel render, gold spend on a service, and resume.
- `src/smoke/scenarios/deathRestart.js` — Forces player death, asserts game
  over UI, summary, and restart-at-full-health.
- `src/smoke/scenarios/settingsPersistence.js` — Writes test settings via the
  Settings save flow, simulates a fresh `Game` instance (or asserts
  `loadSettings()` round-trip), and confirms values survive.
- `src/smoke/scenarios/resetRecords.js` — Records a fake completed run,
  triggers `confirmResetProfile`, and asserts profile is cleared but
  settings remain.
- `src/smoke/testHelpers.js` — Shared `step`, `assert`, `waitFor`,
  `inputIsClear`, `nextFrame`, `cloneJson`, plus new helpers like
  `killAllEnemies(world)`, `killPlayer(world)`, `setGold(world, n)`.

### Modified

- `src/smoke/SmokeRunner.js` — Replace the inline `boot-start-menu` scenario
  body with an imported scenario module, register the new scenarios in a
  small map, and accept either a single scenario name or `all` to run them
  in sequence. Continue to suppress audio and persist-profile side effects.
- `src/main.js` — No code change; smoke entry already gates on the
  `?smoke=...` query parameter.
- `README.md` — Document the new smoke scenarios and the `?smoke=all` mode.
- `electron/main.cjs` — No code change; smoke runs in renderer only.

## Implementation Plan

1. Extract helpers (`step`, `assert`, `waitFor`, `nextFrame`, `cloneJson`,
   `inputIsClear`, `renderResultPanel`) from `SmokeRunner.js` into
   `src/smoke/testHelpers.js`. Update existing imports.
2. Move the current `runBootStartMenuSmoke` body into
   `src/smoke/scenarios/bootStartMenu.js` and export a default async function
   that takes `(game, result)`.
3. Register a `SCENARIOS = { "boot-start-menu": runBootStartMenuSmoke, ... }`
   map in `SmokeRunner.js`. Accept `scenario === "all"` to iterate the map
   in a deterministic order, resetting profile/state between runs.
4. Add `waveClear` scenario:
   - Boot, start run, begin playing (mirrors current scenario).
   - Use `killAllEnemies(world)` helper that calls `applyDamage` on each
     alive enemy until `enemyManager.aliveCount === 0`.
   - Wait until `game.state === "reward"` and assert reward cards rendered.
5. Add `rewardAndUpgrade` scenario:
   - Continues from a wave clear or sets up state directly with
     `openReward(level, gold)`.
   - Picks the first reward, asserts state transitions to upgrade panel.
   - Sets `currency.gold` to a large number, calls `buyService("heal")`
     (after damaging the player), asserts heal applied and gold spent.
   - Calls `resumeFromUpgrade`, asserts focus prompt visible.
6. Add `deathRestart` scenario:
   - Boot → start → begin playing.
   - Use `killPlayer(world)` helper that calls
     `applyDamage(player, 9999, { owner: "enemy", spellId: "test" })`.
   - Assert `game.state === "gameover"`, HUD hidden, summary reachable.
   - Trigger restart via the same callback the Game Over button uses, assert
     `player.health.current === player.health.max` and state returns to
     focus.
7. Add `settingsPersistence` scenario:
   - Snapshot current settings, call `updateSettings` with custom values
     (mute on, volume 0.55, mouse sensitivity 1.4, render scale 0.85, VFX
     density reduced), then `flushSettings`.
   - Call `loadSettings()` (re-imported fresh) and assert returned values
     match. Restore original settings via the same flush path.
8. Add `resetRecords` scenario:
   - Persist a synthetic best-run via `recordRunCompleted` + `persistProfile`.
   - Call `confirmResetProfile` and synthetically click confirm
     (programmatically invoking the confirm callback).
   - Reload `loadProfile()`; assert totals and best-run match
     `cloneDefaultProfile()`.
   - Reload `loadSettings()`; assert settings unchanged from a snapshot
     taken at the start.
9. Make smoke output (`window.__arcaneSmokeResult`) include an array of
   per-scenario results when running `?smoke=all`. Keep the on-screen panel
   format the same; show pass/fail counts in the panel header.
10. Update `README.md` smoke section with the full scenario list and the new
    `?smoke=all` URL.

## Verification

### Automated

- `?smoke=boot-start-menu` continues to pass with no behavior changes.
- Each new scenario passes on a clean boot in Chrome and in Electron via
  `npm start` with the same URL (Electron uses `arcane://game/index.html?smoke=...`).
- `?smoke=all` returns `status: "passed"` and each step entry shows
  `passed`.

### Manual (browser)

- After running smoke, no DOM artifacts (toast, wave banner, fatal panel,
  smoke result panel from prior run) leak into a manual play session that
  starts from the same tab.
- Profile and settings round-trip through localStorage and (in Electron)
  through the JSON bridge with no errors logged to `renderer.log`.

### Console / logs

- No `[ArcaneGaunt:*]` error entries during a clean smoke pass.
- Any failure produces a single `[smoke] failed: <step>` line with the
  step name and a serialized stack in `window.__arcaneSmokeResult.error`.

## Guardrails

- Do not modify gameplay code to make tests pass. If a scenario can't be
  driven without poking at internals, expose the seam via a public method on
  the relevant manager rather than reaching into private state.
- Do not introduce a test framework or a build step. Stay on plain
  ES-modules with `?smoke=` query gating.
- Do not write profile or settings to real localStorage during smoke runs
  unless the scenario explicitly tests persistence — keep the existing
  `game.persistProfile = noop` pattern.
- Do not add real timing-based waits longer than ~1s; prefer manipulating
  state directly (kill enemies, set gold) over playing real combat.
- Do not introduce a smoke scenario that requires controller input until
  feature_1 has shipped — gamepad-driven scenarios belong with that feature.
