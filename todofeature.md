# ArcaneGaunt Production Release Todo

The original gameplay checklist is complete. Remaining production work is
tracked at two levels:

- **This file** is the high-level tracker. It lists what is done, what is
  outstanding, and which `feature_*.md` planning file owns each remaining
  item.
- **`feature_*.md` files** at the project root contain per-feature
  rationale, file lists, implementation steps, verification, and
  guardrails. Each is sized for a single implementation session.

Do not duplicate per-feature detail in this file. Update both when scope
changes.

## P0 — Release Blocker (all done)

All release-blocking items are complete. See the completed milestones below.

## P1 — Game Polish & Balance

| # | Item | Status | Owner |
|---|------|--------|-------|
| 12 | Shield visual (gold glow while blocking) | **Done** | — |
| 13 | Wizard staff viewmodel | **Done** | — |
| 14 | Spell variety — cadence, arcing lob, chill stacks, contagion | **Done** | — |
| 15 | Boss difficulty — CC immunity, phase 2 attacks | **Done** | — |
| 16 | Difficulty tiers + progressive spell unlocks | **Done** | — |
| 17 | Release-readiness audit (FOV, key remapping, colorblind, shake toggle, skybox, i18n) | **Done** | — |
| 18 | Expand underfilled spell upgrade trees | **Done** | [feature_6](feature_6_content_expansion.md) |
| 19 | Add more build-defining relics | **Done** | [feature_6](feature_6_content_expansion.md) |
| 20 | First-run onboarding for block / blink / Auto-Cast / objectives / hazards / bosses | **Not started** | [feature_7](feature_7_onboarding_recap.md) |
| 21 | Polish run summary and death recap | **Not started** | [feature_7](feature_7_onboarding_recap.md) |

### Completed Milestone 2 — Production Polish — 2026-05-26

- **Shield visual (Issue #20)**: Procedural gold hemisphere viewmodel attached to camera, appears while blocking, pulses on perfect block. Already implemented and wired.
- **Staff viewmodel (Issue #22)**: `src/player/StaffView.js` — procedural cylinder+spere staff in camera space with idle sway, walk bob, block lowering, cast recoil tween with gem flash + particle burst. `world.staffView` getter. Cast origin moved to staff tip via `tipWorldPos()`. "Show Weapon" toggle in settings.
- **Spell variety (Issue #21)**: Arcane Bolt cadence stacking (3 stacks, +6 dmg/stack, decay 0.6s). Fireball arcing lob (gravity 18) + baseline burn patch. Frost Bolt chill stacks (3 max, 2.5s decay, freeze+shatter at max stacks, 28 shatter damage). Poison Bolt baseline contagion. Upgrade trees adjusted. Balance tuned to ±15% TTK.
- **Boss difficulty (Issue #24)**: CC immunity for all bosses (stun/freeze no-op with spark VFX, slow 60% resisted). Stat boosts (speed ×1.2, touchDamage ×1.5, fire CDs -30%). Phase 2 attacks at <50% HP (Twin Warden ground slam, Reaver fan of orbs, Sentinel triple-shot). "CC IMMUNE" label on boss bar. Smoke scenario `boss-cc-immune`.
- **Difficulty tiers (Issue #23)**: `src/core/Difficulty.js` — 10 tiers (Apprentice→Grandmaster) with HP/damage/spawn/gold multipliers. Progressive spell unlocks (Arcane Bolt always, Chain Lightning@tier3, Frost Bolt@tier5, Fireball@tier7, Poison Bolt@tier8, Meteor@tier10). Profile v2 migration. UI difficulty selector with locked spell display. Smoke scenario `difficulty-unlock`.
- **Release audit (Issue #25)**: Key remapping (`Input.rebind`, click-to-rebind UI). FOV slider (60-110). Colorblind-safe spell palette (alternate hex per spell). Screen shake toggle. Procedural gradient skybox (vertex-colored sphere). i18n string extraction (`src/core/i18n.js`, all ui strings wrapped in `t()`). Save corruption warning.

### Completed Milestone 1 Foundation — 2026-05-22

- Persistent settings (audio mute/volume, mouse sensitivity, fullscreen,
  render scale, effects density).
- Persistent profile (runs started/completed, best run, levels cleared,
  enemies killed, gold earned, total damage).
- Confirmed Reset Records flow that clears run records but keeps settings.
- Settings menu reachable from main menu and pause menu.
- Pause menu (Esc → Resume / Settings / Main Menu).
- Storage abstraction: browser localStorage fallback + Electron JSON bridge.
- Electron fullscreen IPC + startup fullscreen seeding.
- Renderer render-scale + effects-density support (no gameplay impact).
- Input cleared across every menu / state transition.
- Production crash/error handling with fatal overlay, browser console
  fallback, narrow Electron renderer-log IPC, and local
  `%APPDATA%/ArcaneGaunt/logs/{renderer,main}.log` files.
- Run/reward boundary hardening so death wins same-frame races and reward
  transitions require a live player at a safe location.
- Browser smoke harness at `?smoke=boot-start-menu` (boot, start, pause,
  main menu cleanup).
- Steam Cloud save paths documented (`saves/settings.v1.json`,
  `saves/profile.v1.json`).

### Remaining Milestone 1 Work

- Production Electron metadata — tracked in
  [feature_3](feature_3_electron_metadata.md).
- Re-run `node --check`, `npm start`, and packaged Electron launch
  verification in an environment with working Node/npm/Electron.

## P1 — Game Polish & Balance

| # | Item | Status | Owner |
|---|------|--------|-------|
| 12 | Define target run length, wave pacing, and difficulty curve | **Not started** | [feature_5](feature_5_balance_pass.md) |
| 13 | Balance six starter spells across early/mid/boss waves | **Not started** | [feature_5](feature_5_balance_pass.md) |
| 14 | Balance reward economy, reroll, upgrade, and service costs | **Not started** | [feature_5](feature_5_balance_pass.md) |
| 15 | Tune objective waves | **Not started** | [feature_5](feature_5_balance_pass.md) |
| 16 | Tune dynamic layout events (gates, rift surges) | **Not started** | [feature_5](feature_5_balance_pass.md) |
| 17 | Tune boss waves | **Not started** | [feature_5](feature_5_balance_pass.md) |
| 18 | Expand underfilled spell upgrade trees | **Done** | [feature_6](feature_6_content_expansion.md) |
| 19 | Add more build-defining relics | **Done** | [feature_6](feature_6_content_expansion.md) |
| 20 | First-run onboarding for block / blink / Auto-Cast / objectives / hazards / bosses | **Not started** | [feature_7](feature_7_onboarding_recap.md) |
| 21 | Polish run summary and death recap | **Not started** | [feature_7](feature_7_onboarding_recap.md) |

## P2 — Steam & Store Readiness

| # | Item | Status | Owner |
|---|------|--------|-------|
| 22 | Steamworks achievements + run stats | **Not started** | [feature_8](feature_8_steamworks_integration.md) |
| 23 | Steam Cloud configuration | **Partial prep** (save paths stable) | [feature_8](feature_8_steamworks_integration.md) |
| 24 | Leaderboards (optional) | **Not scoped** | [feature_8](feature_8_steamworks_integration.md) (guarded behind first release) |
| 25 | Store capsules, library art, screenshots, trailer | **Not started** | [feature_9](feature_9_store_release_audit.md) |
| 26 | Capsule rules audit | **Not started** | [feature_9](feature_9_store_release_audit.md) |
| 27 | Packaged-file audit | **Not started** | [feature_9](feature_9_store_release_audit.md) |
| 28 | Credits / license audit | **Not started** | [feature_9](feature_9_store_release_audit.md) |
| 29 | Privacy policy | **Not started** | [feature_9](feature_9_store_release_audit.md) |
| 30 | Steam client install test | **Not started** | [feature_9](feature_9_store_release_audit.md) |

## Feature File Index

- [feature_1 — Gamepad + Steam Deck](feature_1_gamepad_steam_deck.md)
- [feature_2 — Expanded Smoke Tests](feature_2_smoke_tests.md)
- [feature_3 — Electron Metadata](feature_3_electron_metadata.md)
- [feature_4 — SteamPipe Build Scripts](feature_4_steampipe_build.md)
- [feature_5 — Difficulty Curve & Balance Tuning](feature_5_balance_pass.md)
- [feature_6 — Upgrade Tree & Relic Expansion](feature_6_content_expansion.md)
- [feature_7 — Onboarding & Death Recap Polish](feature_7_onboarding_recap.md)
- [feature_8 — Steamworks Integration](feature_8_steamworks_integration.md)
- [feature_9 — Store Assets & Release Audit](feature_9_store_release_audit.md)

## Dependency Graph

```
feature_2 (smoke tests)  ──────────────► feature_5 (balance) ──► feature_6 (content)
                                                                       │
feature_3 (electron metadata) ──► feature_4 (steampipe) ──► feature_8 (steamworks)
                                                                       │
feature_1 (gamepad)              feature_7 (onboarding)                │
                                                                       ▼
                                       feature_9 (store + release audit)
```

- feature_1, feature_2, feature_3 are standalone and can land in parallel.
- feature_4 depends on feature_3 (final identity) and benefits from
  feature_2 (smoke coverage on the upload pipeline).
- feature_5 depends on feature_2 (regression safety) and is recommended
  before feature_6 so new content lands on a stable base curve.
- feature_6 expands content; depends on feature_5.
- feature_7 is standalone but benefits from feature_1 (gamepad prompts).
- feature_8 depends on feature_3 and feature_4 (app id + depots) and
  benefits from feature_2 (no-op coverage).
- feature_9 is the final feature; depends on most of the above for
  screenshots, store assets, and the install test.

## Recommended Implementation Order

1. **feature_2** — Smoke tests first. Every subsequent feature is safer to
   land with regression coverage in place.
2. **feature_3** — Electron metadata. Small, low-risk, unlocks feature_4
   and feature_8.
3. **feature_1** — Gamepad + Steam Deck. Independent of feature_3/4; the
   sooner controller support exists, the sooner downstream UI work
   (feature_7) can include device-aware prompts in one pass.
4. **feature_4** — SteamPipe build scripts. Needs feature_3.
5. **feature_5** — Balance tuning. Use feature_2 to validate.
6. **feature_6** — Content expansion on top of the stable balance.
7. **feature_7** — Onboarding + recap polish. Best after balance/content
   are stable so prompts reflect real shipping numbers.
8. **feature_8** — Steamworks integration. Needs feature_3 + feature_4.
9. **feature_9** — Store assets + release audit. Last; needs everything
   above to capture shipping-quality screenshots and pass the install
   smoke test.
