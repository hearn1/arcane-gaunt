# ArcaneGaunt Production Release Todo

The original feature checklist is complete. This file now tracks the production
verticals that need to be flushed out before a Steam release. Keep changes
focused on stabilization, product completeness, release readiness, and polish
rather than rebuilding the core game loop.

## P0 - Release Blockers

1. [x] Add persistent settings for audio volume/mute, mouse sensitivity, fullscreen/windowed mode, and any performance options. **Done:** audio mute/volume, mouse sensitivity, fullscreen preference, render scale, and effects density persist through the shared settings save.
2. [ ] Add save persistence for best runs, player stats, selected preferences, and any future unlock/meta state. **Partial:** selected settings/preferences, best-run records, and aggregate player stats persist through the shared storage abstraction; future unlock/meta behavior remains reserved but not built.
3. [x] Add a safe reset/delete-save flow. **Done:** main-menu Reset Records flow uses a confirmation step and clears profile best-run/lifetime totals while keeping settings.
4. [x] Choose and document a Steam Cloud-ready save location. **Done:** Electron stores settings at `%APPDATA%/ArcaneGaunt/saves/settings.v1.json` and profile stats at `%APPDATA%/ArcaneGaunt/saves/profile.v1.json`; `saves/settings.v1.json` and `saves/profile.v1.json` are documented Steam Cloud targets.
5. [ ] Add full gamepad support for gameplay, menus, rewards, upgrades, pause, restart, and main menu flow.
6. [ ] Make UI and prompts work cleanly for Steam Deck-style controller use.
7. [x] Add a pause/settings menu that can be reached without relying on pointer-lock release alone.
8. [ ] Add production Electron metadata: app icon, Windows icon, version metadata, and final product identity.
9. [ ] Add SteamPipe app/depot build scripts and verify launch options against the packaged executable.
10. [x] Add production crash/error handling with a user-readable fallback and local log output. **Done:** renderer boot/runtime fatal errors and unhandled promise rejections show a readable overlay; Electron writes local `logs/renderer.log` and `logs/main.log` files through a narrow preload IPC bridge, with browser fallback to console/on-screen error output.
11. [ ] Establish automated smoke tests for boot, start run, wave clear, reward pick, death, restart, and main menu cleanup. **Partial:** `?smoke=boot-start-menu` now drives the real browser app through boot, start-run focus, first-wave entry, pause, and main-menu cleanup assertions; wave clear, reward pick, death, and restart coverage remain.

### Completed Milestone 1 Foundation - 2026-05-22

- Added persistent settings for audio mute, audio volume, and mouse sensitivity.
- Added persistent fullscreen/windowed preference plus small render scale and effects density performance options.
- Added persistent profile stats for runs started/completed, best run, levels cleared, enemies killed, gold earned, and total damage.
- Added a confirmed Reset Records flow that clears run records without changing settings.
- Added a basic Settings menu reachable from the main menu, focus/continue prompts, and pause menu.
- Reworked Esc/pointer-lock loss into a practical pause menu with Resume, Settings, and Main Menu actions.
- Added a storage abstraction with a browser localStorage fallback and an Electron JSON bridge for settings and profile saves.
- Added Electron fullscreen IPC and startup fullscreen seeding from the settings save.
- Added renderer render-scale application and reduced effects-density support without changing gameplay systems.
- Tightened input clearing across menu, settings, pause, reward, upgrade, summary, restart, and reset transitions.
- Added production crash/error handling with a readable renderer fallback panel, browser console fallback, narrow Electron renderer-log IPC, recoverable storage fallback diagnostics, and local Electron log files under `%APPDATA%/ArcaneGaunt/logs/`.
- Hardened run/reward boundaries so death wins same-frame objective/wave-clear races, reward and next-wave advancement require a live player, and run starts / reward transitions perform player health and safe-location checks.
- Added the first browser smoke harness at `?smoke=boot-start-menu` for boot, start-run focus, first-wave entry, pause, and main-menu cleanup.
- Added explicit transient combat UI cleanup for pause, death, fatal, new-run, and main-menu transitions so wave banners and combat indicators do not linger outside active play.
- Documented the Steam Cloud-friendly settings/profile paths and reset behavior in `README.md`.
- Documented local Electron error log paths and no-network log behavior in `README.md`.
- Documented the browser smoke harness in `README.md`.
- Verified boot, settings persistence after reload, start run, pause/settings/menu return, restart starting at full health after death, Reset Records behavior, profile cleanup, and renderer/performance options in the browser with no console warnings/errors.
- Node/npm/Electron command verification remains blocked in the current Codex desktop environment: `node.exe` is access-denied from the WindowsApps Codex bundle, `.bin/electron.cmd` hits the same blocked Node path, and `npm` is not on PATH.

### Remaining Milestone 1 Work

- Add production Electron metadata such as final icon/version identity.
- Expand automated smoke tests to cover wave clear, reward pick, death, restart, and deeper main menu cleanup.
- Re-run `node --check`, `npm start`, and packaged/direct Electron launch verification in an environment where Node/npm/Electron are available.

## P1 - Game Polish And Balance

12. Define target run length, wave pacing, and expected difficulty curve.
13. Balance all six starter spells for solo viability across early, mid, and boss waves.
14. Balance reward economy, reroll costs, upgrade costs, and between-wave services.
15. Tune objective wave frequency, completion timing, damage pressure, and reward pacing.
16. Tune dynamic layout events so gates and rift surges stay readable, fair, and cleanup-safe.
17. Tune boss waves so they remain distinct without causing unfair layout or collision pressure.
18. Expand underfilled spell upgrade trees toward comparable depth and quality.
19. Add more build-defining relics and behavior-changing rewards where replay variety is thin.
20. Improve first-run onboarding for block, blink, Auto-Cast unlocks, objectives, hazards, and boss waves.
21. Polish run summary and death recap so progress, damage sources, and best-run info feel release-ready.

## P2 - Steam And Store Readiness

22. Add Steamworks integration for achievements and run stats.
23. Add Steam Cloud support once save persistence is finalized. **Partial prep:** settings/profile save file paths are now stable and documented; Steamworks/Steam Cloud configuration remains.
24. Consider leaderboards for highest wave or other stable score categories.
25. Create final Steam store capsules, library assets, screenshots, trailer, and short/long descriptions.
26. Verify Steam graphical assets follow current capsule rules: artwork, game name, and official subtitle only on base capsules.
27. Audit final packaged files so unused source asset folders, dev artifacts, and large build leftovers are not included.
28. Audit credits and licenses for all bundled assets and Electron dependencies.
29. Add a privacy policy if telemetry, analytics, or crash reporting sends data off-device.
30. Run a Steam client install test from a private branch/default branch build before release review.

## Suggested Milestones

1. Settings, save system, pause menu, clean packaging, and no console warnings.
2. Controller support and Steam Deck readiness pass.
3. Balance/content polish across spells, bosses, objectives, modifiers, and rewards.
4. Steamworks achievements/stats/cloud and SteamPipe release pipeline.
5. Store assets, trailer, screenshots, release checklist, and external playtest.
