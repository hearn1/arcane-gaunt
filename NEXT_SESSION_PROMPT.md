# ArcaneGaunt - Next Session Prompt

Paste everything below into a new Codex session opened in the `arcane_gaunt`
project directory.

---

You are continuing work on ArcaneGaunt. Read `README.md`, `todofeature.md`, and
the current code first. The original gameplay feature checklist is complete; do
not rebuild the game, replace the loop, or add a new major gameplay system.

## Current State

- Stack: vanilla ES modules, vendored Three.js, DOM/CSS UI, Web Audio, Python
  static dev server, and Electron packaging.
- Run locally with `python serve.py`, then open `http://localhost:8000`.
- The core loop is menu -> spell choice -> focus prompt -> combat -> reward ->
  upgrade/services -> next wave -> death -> summary/restart/main menu.
- Milestone 1 foundation work now includes:
  - Shared save storage in `src/core/SaveStorage.js`.
  - `src/core/Settings.js` for persisted audio, controls, display, and
    performance settings.
  - `src/core/Profile.js` for best-run and aggregate player stats.
  - Browser localStorage fallback under `arcaneGaunt.settings.v1`.
  - Browser profile fallback under `arcaneGaunt.profile.v1`.
  - Electron JSON bridge through `electron/preload.cjs` and
    `electron/main.cjs`.
  - Electron settings path:
    `%APPDATA%/ArcaneGaunt/saves/settings.v1.json`.
  - Electron profile path:
    `%APPDATA%/ArcaneGaunt/saves/profile.v1.json`.
  - Steam Cloud target relative paths:
    `saves/settings.v1.json` and `saves/profile.v1.json`.
  - Settings menu for audio mute, volume, mouse sensitivity, fullscreen,
    render scale, and effects density.
  - Electron fullscreen IPC plus startup fullscreen seeding from the settings
    save.
  - Main-menu best-run/totals strip.
  - Confirmed Reset Records flow that clears profile stats and keeps settings.
  - Pause menu reachable through Esc/pointer-lock loss with Resume, Settings,
    and Main Menu.
  - Explicit input clearing across menu, settings, pause, reward, upgrade,
    summary, restart, and reset transitions.
  - Production crash/error handling in `src/core/ErrorReporting.js`, with
    renderer boot/runtime fatal overlays, global renderer error handlers,
    browser console fallback, and Electron local logs.
  - Narrow Electron logging bridge exposed as `window.arcaneLog.write()` and
    `window.arcaneLog.meta()`.
  - Electron log paths:
    `%APPDATA%/ArcaneGaunt/logs/renderer.log` and
    `%APPDATA%/ArcaneGaunt/logs/main.log`.
  - Main-process handling for startup settings parse errors, protocol/load
    failures, storage errors, renderer process exits, uncaught exceptions, and
    unhandled rejections.
  - Run/reward boundary hardening: death wins same-frame objective/wave-clear
    races, reward and next-wave advancement require a live player, and run
    starts / reward transitions perform health and safe-location checks.
- Browser verification was clean for boot, settings persistence after reload,
  audio/control/display/performance settings, start run, pause/settings/menu
  return, profile persistence, Reset Records keeping settings, renderer options
  applying without blank canvas/layout breakage, restart starting at full health
  after death, and no console warnings/errors.
- A controlled fatal overlay trigger could not be done through the in-app
  browser because `javascript:` navigation was blocked by browser security
  policy. The fatal path was source-inspected and normal boot was verified.
- In the current Codex desktop environment, `node --check` is blocked because
  the WindowsApps Codex `node.exe` is access-denied, `.bin/electron.cmd` hits
  that same blocked Node path, and `npm` is not on PATH. Try again if your
  environment has normal Node/npm access.

## Next Task

Continue Milestone 1 production readiness with the smallest useful
production-completeness step.

Recommended priority:

1. Add automated smoke tests for the browser build.
2. If the environment has working Node/npm/Electron access, also verify or
   improve Electron launch/package readiness.
3. If automated tests are blocked, make a tightly scoped Electron metadata pass
   instead: product identity, app/window icon placeholders or final icon wiring,
   version metadata, and README/todo documentation.

Do not start controller support, Steamworks, SteamPipe, balance/content tuning,
or a UI redesign unless the user explicitly redirects.

## Suggested Automated Smoke Test Scope

- Prefer a lightweight test harness that fits the current vanilla/static setup.
- Keep it repo-local and documented; do not add a heavy framework unless there
  is a clear benefit.
- Cover the critical production loop at a high level:
  - boot to main menu with no console warnings/errors,
  - open Settings and verify persisted audio/control/display/performance values
    after reload,
  - start a run and confirm the HUD begins at full health,
  - pause/resume and return to main menu cleanly,
  - force or simulate wave clear where practical without changing gameplay
    balance,
  - reward pick -> upgrade/services -> continue flow where practical,
  - death -> summary -> restart -> full-health new run,
  - Reset Records clears profile records only and keeps settings.
- If browser automation cannot force full wave/reward/death paths safely,
  document the gap honestly and leave a focused manual checklist next to the
  automated coverage.
- Avoid remote services, telemetry, analytics, network reporting, and external
  test dependencies that complicate offline development.

## Requirements

- Preserve settings persistence.
- Preserve profile persistence and Reset Records behavior.
- Preserve fullscreen/windowed and performance settings behavior.
- Preserve crash/error logging behavior and local-only logs.
- Preserve the recent health/location boundary hardening.
- Keep partial todo items partial if controller support, automated tests,
  Electron metadata, SteamPipe, or Steamworks work remain.
- Update `todofeature.md` and `README.md` when behavior, commands, or release
  status changes.

## Guardrails

- Do not rebuild the game loop or add a new gameplay system.
- Do not change combat balance, spell balance, enemy waves, rewards,
  objectives, boss waves, or upgrade flow.
- Do not replace the current static server / vanilla ES module architecture.
- Do not add remote telemetry or send logs off-device.
- Do not claim automated smoke tests, Electron metadata, or packaging are
  complete unless they are actually implemented and verified.

## Verification Checklist

Use browser preview and console logs where possible:

- Boot with no console warnings/errors.
- Verify settings still persist across reload: audio mute/volume, mouse
  sensitivity, fullscreen, render scale, and effects density.
- Verify profile stats still persist and Reset Records still clears only
  profile records.
- Start a run and confirm the HUD begins at full health.
- Pause/resume, return to main menu, restart after death, and confirm no stale
  input state appears.
- Confirm a restarted run begins at full health.
- Confirm touched ESM/CJS parses or passes `node --check` where available.
- Try `node --check`, `npm start`, and direct/package Electron launch if normal
  Node/npm/Electron access is available.

## Handoff

At the end, report:

- Files changed.
- Production readiness behavior added or verified.
- Verification performed.
- What remains for Milestone 1.
