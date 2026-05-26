# ArcaneGaunt

A first-person wizard shooter roguelike. Pick one spell archetype on the main
menu, take it into the arena as your whole run build, choose rewards between
waves, and see how deep you get before you die.

> This README covers running and developing the build. The original design
> documents are still in this folder: `PROJECT_OVERVIEW.md`, `GAME_DESIGN.md`,
> `TECHNICAL_ARCHITECTURE.md`, `IMPLEMENTATION_PLAN.md`, `UI_AND_SCENE_FLOW.md`,
> and `ASSET_GUIDELINES.md`.

## Privacy

ArcaneGaunt does not collect, transmit, or store any personal data off your device.
No remote telemetry, analytics, or crash reporting. See [`PRIVACY_POLICY.md`](./PRIVACY_POLICY.md)
for full details, including local save and log paths.

## Release

The operator release checklist is at [`RELEASE_CHECKLIST.md`](./RELEASE_CHECKLIST.md),
covering capsule art, store descriptions, packaged-file audit, credits/license audit,
privacy policy, screenshots, trailer, and the Steam client install smoke test.

## Stack

- **three.js** (vendored at `vendor/three.module.js`) for WebGL 3D.
- **Vanilla ES-module JavaScript** with no build step and no bundler.
- **DOM/CSS** for all UI; **Web Audio** for procedural SFX.
- **Python `http.server`** as the static browser dev server.
- **Electron** as the desktop wrapper/package target.

Why: a vendored-three.js + plain-ESM browser game runs instantly, works offline,
and keeps Electron as a thin desktop shell rather than an app framework.

## Run in a browser for development

```sh
python serve.py
```

Then open <http://localhost:8000>. Optional custom port:

```sh
python serve.py 8080
```

No install step is needed for browser development. Any static file server pointed
at the project root also works; `serve.py` just adds no-cache headers and
correct ES-module MIME types.

## Browser smoke check

With `serve.py` running, open:

```text
http://localhost:8000/?smoke=boot-start-menu
```

This runs the lightweight automated smoke harness in the browser. The following
scenarios are available as the `smoke` query parameter:

| Scenario | Description |
|----------|-------------|
| `boot-start-menu` | Boot, start run, enter first wave, pause, return to main menu — verifies HUD/crosshair/banner, enemy, projectile, timer, and input cleanup. |
| `wave-clear` | Clear a full wave by killing all enemies, assert reward state and reward cards. |
| `reward-and-upgrade` | Pick a reward, verify upgrade panel renders, buy a heal service, resume to focus prompt. |
| `death-restart` | Force player death, assert game-over UI and summary reachable, restart at full health. |
| `settings-persistence` | Write custom settings, round-trip through save/load, restore originals. |
| `reset-records` | Persist a synthetic best run, trigger reset, assert profile cleared but settings unchanged. |
| `gamepad-menu-nav` | Programmatic uiNav focus/activate through main menu, pause, and settings screens (no real gamepad). Verifies data-nav wiring and new settings rows. |
| `steam-noop-when-unavailable` | Verify `Steam.event()` is a no-op in browser dev (no bridge, no errors). |
| `privacy-no-network` | Assert no external network requests (`fetch`/`XMLHttpRequest` to non-local origins) during gameplay. |

Pass `?smoke=all` to run every scenario in sequence:

```text
http://localhost:8000/?smoke=all
```

Each scenario runs independently with state restored between them. The result
panel shows per-scenario pass/fail counts, and `window.__arcaneSmokeResult`
exposes the full result tree.

The smoke runner is inert unless the `smoke` query parameter is present, skips
audio startup, and avoids writing profile progress while it drives the flow.
All scenarios use the same query-parameter harness rather than a separate app
architecture.

## Run as a desktop app

Install the desktop packaging dependencies once:

```sh
npm install
```

Launch directly into the game window:

```sh
npm start
```

This uses Electron only as a thin shell. The game still loads `index.html`,
`src/`, `vendor/`, and `assets/` as static files, with no bundler or framework
rewrite. Electron serves those files through an internal `arcane://` app
protocol instead of `file://`, which keeps ES-module imports, GLB models,
textures, OGG audio, and fallback behavior on the same app origin.

## Package for Windows

Create a Steam-friendly unpacked Windows app folder:

```sh
npm run pack:win
```

Output:

```text
dist/win-unpacked/ArcaneGaunt.exe
```

Create a Windows installer:

```sh
npm run dist:win
```

Create a portable single-file launcher:

```sh
npm run dist:portable
```

Output:

```text
dist/ArcaneGaunt 1.0.0.exe
```

## Steam upload

SteamPipe build scripts live in `steampipe/`. To prepare a Windows build for
Steam upload:

```sh
npm run steam:prep
```

This runs `pack:win` and produces `dist/win-unpacked/ArcaneGaunt.exe`. See
`steampipe/README.md` for the full operator guide — installing SteamCMD,
substituting App ID / Depot ID placeholders, running the upload, and the
recommended branch/promotion strategy.

SteamCMD and Steamworks credentials are not bundled in this repository.

## Steamworks Integration

ArcaneGaunt integrates Steamworks through a thin Electron-side wrapper
(`electron/steamworks.cjs`) so the static ES-module game code never imports
Steamwork APIs directly. The main process initializes the SDK on app ready;
the renderer fires fire-and-forget events via the existing IPC bridge.

**Steamworks is optional.** The game runs fully in browser dev and when
launched outside Steam. If Steam init fails, the main process logs
`[steam] init failed — running without Steam` and continues normally.

### Achievements (7)

| API Name | Display Name | Condition |
|----------|-------------|-----------|
| `ACH_FIRST_RUN` | First Blood | Complete one run |
| `ACH_WAVE_5` | Wave Warrior | Reach wave 5 |
| `ACH_WAVE_10` | Double Digits | Reach wave 10 |
| `ACH_WAVE_15` | Fifteen Deep | Reach wave 15 |
| `ACH_PERFECT_BLOCK_10` | Bulletproof | 10 perfect blocks (lifetime) |
| `ACH_BOSS_TRIPLE` | Boss Collector | Defeat all three boss variants |
| `ACH_RELIC_COLLECTOR` | Relic Collector | Own 3 relics in a single run |

### Stats (6)

`STAT_RUNS_COMPLETED`, `STAT_HIGHEST_WAVE`, `STAT_LIFETIME_KILLS`,
`STAT_LIFETIME_DAMAGE`, `STAT_PERFECT_BLOCKS`, `STAT_RELICS_OWNED_PEAK`.

### Steam Cloud

Steam Cloud mirrors the existing save paths:

```
%APPDATA%/ArcaneGaunt/saves/*  ↔  saves/*
```

On the Steamworks partner site, configure the Cloud section with:
- **Root override:** `%APPDATA%/ArcaneGaunt/saves/` (mapped to install root)
- **File mappings:** `saves/settings.v1.json` and `saves/profile.v1.json`

The game's save code is unchanged — Steam handles sync at the filesystem level.

### CSV exports

`assets/store/achievements.csv` and `assets/store/stats.csv` mirror the
achievement and stat definitions for upload to the Steamworks partner site.

Notes for feature tracking:

- **Feature 3 complete**: Windows `.ico` and 512×512 `.png` icons are checked in
  at `assets/icons/` (source SVG under `assets/icons/icon_sources/`).
  `build.win.icon`, `build.nsis.installerIcon`, and `build.nsis.uninstallerIcon`
  are set in `package.json`. `app.setAppUserModelId` is set in `electron/main.cjs`.
  See `assets/icons/icon_sources/README.md` to regenerate.
- `productName` and the main window title are `ArcaneGaunt`.

## Controls

| Input | Gamepad | Action |
|-------|---------|--------|
| `W A S D` | Left Stick | Move |
| Mouse | Right Stick | Look |
| Left Click | RT / A | Cast the selected run spell |
| Right Click (hold) | LT (hold) | Block; perfect-timed block reflects projectiles |
| `Space` | A | Jump |
| `Shift` / `Q` | B | Blink (short dash) |
| `Esc` | Start | Pause / release mouse |
| `1`–`6` | D-Pad | Select equipped spell |
| Mouse Wheel | LB / RB | Cycle equipped spell |
| — | Back / View | Open settings (main menu) |

**Stick Look Sensitivity** and **Invert Y-Axis** are configurable in the
Settings menu. Stick sensitivity defaults to 1.0× (range 0.3×–2.0×).

Runs still begin from one manual spell. If you buy that spell's Auto-Cast node,
it keeps firing passively while not blocking and can unlock a new manual spell
reward. Number keys / mouse wheel switch the one manual spell when a run has
attuned extras; reward cards focus the current manual spell, while gold upgrade
trees remain available for every owned spell.

## Gameplay Loop

Main Menu -> choose one spell archetype -> arena -> fight wave -> clear wave ->
gold + reward screen -> pick a reward -> spend gold in spell upgrade trees or
between-wave services -> next harder wave in a refreshed arena layout -> death
-> Game Over -> Run Summary -> Restart or Main Menu. Elites appear every 5th
level, and later waves can roll modifiers such as Swift Horde, Armored,
Volatile, Regenerating, or Elite Vanguard.

Restart keeps the previous spell choice. Return to Main Menu to choose a
different run archetype.

## Local Saves And Steam Cloud Paths

Audio mute, audio volume, mouse sensitivity, fullscreen preference, render
scale, and effects density persist locally. Best-run records and aggregate
player stats also persist locally. Browser development uses these localStorage
keys:

```text
arcaneGaunt.settings.v1
arcaneGaunt.profile.v1
```

The Electron build writes the same JSON shapes to:

```text
%APPDATA%/ArcaneGaunt/saves/settings.v1.json
%APPDATA%/ArcaneGaunt/saves/profile.v1.json
```

These relative paths are the current Steam Cloud targets:

```text
saves/settings.v1.json
saves/profile.v1.json
```

The profile save currently stores `version`, `bestRun`, aggregate `totals`, and
reserved `meta` / `unlocks` objects for future use. The main menu has a
confirmed **Reset Records** flow that clears best-run and lifetime totals only;
settings are kept unless a future reset flow explicitly says otherwise.

The performance settings are intentionally small: render scale lowers internal
WebGL resolution, and reduced effects density trims nonessential particle/fork
counts while keeping gameplay, projectiles, hazards, rewards, and combat rules
unchanged. In Electron, the fullscreen preference also seeds the next app window
through the same settings save path. In a browser, fullscreen still depends on
the browser's user-gesture rules.

## Local Error Logs

ArcaneGaunt does not send crash reports, analytics, telemetry, or logs over the
network. Browser development keeps failures local to the console plus the
readable on-screen fatal error panel.

The Electron build also writes local JSON-lines logs under the app user data
folder:

```text
%APPDATA%/ArcaneGaunt/logs/renderer.log
%APPDATA%/ArcaneGaunt/logs/main.log
```

`renderer.log` records renderer fatal errors, unhandled promise rejections, and
boot failures reported through the preload bridge. Recoverable renderer storage
fallback failures are reported once per operation so settings/profile issues are
debuggable without spamming normal browser development. `main.log` records
practical main-process startup, protocol, storage, load, and process-failure
errors. These logs are local debugging files only and are not Steam Cloud
targets.

## Architecture

Engine-agnostic separations from `TECHNICAL_ARCHITECTURE.md`:

- **Static spell data** `src/spells/spellDefinitions.js` is `Object.freeze`d and
  never mutated. **`SpellInstance`** holds mutable runtime `stats`; buffs only
  touch instances.
- **One-manual-spell loadout**: `src/player/SpellCaster.js` starts from the
  main-menu spell. Auto-Cast milestones can add more spells, but only one is
  manually equipped; auto-cast spells fire passively when ready and not
  blocking.
- **One damage path**: `src/core/Damage.js#applyDamage`. Direct, AoE, chain,
  DOT, split, and enemy hits all route through it.
- **Projectiles/collision** (`src/projectile/`) are separate from player input
  (`src/player/`).
- **`EnemyManager`** owns wave-level tracking and fires wave-clear once;
  individual enemies own their AI (`src/enemies/Enemy.js`).
- **`RewardGenerator`** builds spell rewards from the current manual spell plus
  general player/relic/unlock rewards; `src/ui/ui.js` only renders.
- **`RunStats`** is a passive collector, reset on Start Run.

```text
src/core       Game loop, state machine, Damage, Health, RunStats, Currency, Audio, VFX, Input
src/player     PlayerController, SpellCaster, Blink
src/spells     spellDefinitions (static), SpellInstance (runtime), Effects, upgradeTrees
src/projectile Projectile, HitResolver
src/enemies    Enemy (6 types + 3 bosses), EnemyManager
src/level      LevelManager (wave composition + clear flow)
src/rewards    rewardDefinitions (catalog), RewardGenerator
src/ui         ui.js (all DOM screens + HUD)
```

## Content

- **Run spell archetypes (6):** Arcane Bolt, Fireball, Frost Bolt, Poison Bolt,
  Chain Lightning, and Meteor. All are selectable on the main menu. In-run spell
  unlocks are gated by Auto-Cast: when an owned spell becomes passive, reward
  drafts can offer a new manual spell.
- **Rewards:** weighted common/uncommon/rare choices. Common cards still cover
  selected-spell and player fundamentals, while uncommon cards add tradeoffs
  like point-blank pierce, compressed blasts, or shorter chain patterns.
- **Relics:** rare passive rewards add run identity outside the spell tree:
  Duelist Sigil rewards close-range hits, Blinkstrike Ember rewards casting
  immediately after blink, Parry Dynamo rewards perfect blocks, Adrenal Lens
  rewards low-health risk, and Glass Focus trades max health for spell power.
- **Arena layouts:** each run rebuilds the arena with lane blockers, cover
  clusters, gate-like walls, and occasional phase-rift hazard strips. Solid
  geometry blocks player/enemy movement, blink destinations, projectiles, and
  ranged enemy line of sight.
- **Spell upgrade trees:** each owned spell has a branching gold-bought tree.
  The model supports prerequisite branches and mutually exclusive paths through
  `requires` and `excludes`. Arcane Bolt and Fireball now have deeper proof
  trees with posture choices and branch follow-ups; the other spells have
  smaller branching trees ready to grow toward the same 10-20 upgrade target.
- **Between-wave gold sinks:** reward cards can be rerolled for escalating gold
  before choosing. After picking a reward, repeatable services offer healing,
  next-cast focus damage, or run-long guard stamina without adding more spell
  tree nodes.
- **Block:** hold right-click to block (stamina-limited, reduces damage). A
  perfect-timed block negates the hit and reflects enemy projectiles back,
  credited as "Redirect" damage; perfect-blocked melee is stunned. The HUD
  crosshair and stamina bar now show the parry window, low stamina, blocked hits,
  and successful perfect blocks. With Parry Dynamo, perfect blocks also empower
  the next cast.
- **Wave modifiers:** Level 2+ waves may roll combat rules that change target
  priority and positioning: faster hordes, armored enemies, volatile death
  bursts, regenerating enemies, or extra elite pressure.
- **Death Summary:** levels cleared, enemies killed, gold earned, total damage,
  per-spell damage rows, and light best-run / lifetime run context. No "top
  spell" judgment labels.

## Assets

External assets live in `assets/` (~5.7 MB, all **CC0 1.0**). Audio samples
(Kenney.nl Sci-Fi / Impact / Interface packs), arena floor / wall / pillar
textures (ambientCG), and enemy GLB models (Quaternius Ultimate Monsters)
replace the original procedural stand-ins. VFX and UI remain procedural. See
`CREDITS.md` for per-file attribution.

The game still runs fully offline after first load. All assets are static files
in the repo, with no runtime CDN fetches. If any asset 404s or fails to decode,
the affected slot falls back to the original procedural path with a warning
instead of crashing.

## Status

**Implemented:** full loop (menu -> spell archetype selection -> combat -> waves
-> rewards -> spell upgrades and services -> death -> summary -> restart), FPS
movement/look/jump, randomized solid arena layouts with cover/projectile/LoS
blocking and rift hazards, 6 solo-viable spells incl. AoE/chain/DOT/slow/split/
pierce/meteor, auto-cast-gated in-run spell unlocks, branching per-spell upgrade
trees with mutually exclusive forks, focused current-manual-spell reward
filtering, reward rarity, build-defining relics, randomized wave modifiers,
hold-to-block with stamina + perfect-block projectile redirect, 6 enemy pressure
types incl. elite and linebreaker, wave scaling, gold sinks, blink, HUD, procedural
VFX/SFX, central damage + run stats, persistent settings/profile saves, safe
record reset, fullscreen/windowed preference, lightweight performance options,
and Electron packaging.

**Not done / known limitations:**

- Collision is lightweight AABB/sphere based rather than navmesh/pathfinding;
  enemies steer around cover opportunistically and can still get awkward near
  tight blockers.
- No meta-progression behavior or detailed run history yet; only best-run and
  aggregate profile stats persist.
- Block mitigation is omnidirectional.
- Enemy AI is intentionally simple.
- Balance is first-pass and will need tuning now that every spell is a solo
  archetype.
