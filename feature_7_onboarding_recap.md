# feature_7 — Onboarding & Death Recap Polish

## Rationale

A new player today gets a single line of keybind hints on the main menu
and a generic Game Over screen. They have no in-context teaching for
block, blink, Auto-Cast unlocks, objective markers, hazards, or boss
waves, and the death summary lists per-spell damage rows without
celebrating progress relative to best run. Both of these matter
disproportionately for review-time impressions and player retention on
Steam.

This feature is purely UX — no gameplay numbers move. It adds
context-sensitive prompts on first-run encounters and elevates the
post-run summary.

## Depends On

- None (standalone for the UI shell).
- **feature_1 (Gamepad)** is recommended first if it has landed, because
  onboarding prompts must use device-aware glyphs (KB/M vs gamepad).
  If feature_1 hasn't shipped, onboarding writes KB/M strings only and
  feature_1's UI sweep updates them.

## Files Touched

### Created

- `src/ui/Onboarding.js` — Small state machine that owns the first-run
  flag (persisted in `profile.meta.tutorialSeen`), tracks which prompts
  have already fired this run, and exposes
  `triggerIf(world, eventName)` for combat-side hooks.
- `src/ui/onboardingPrompts.js` — Catalog of prompt entries:
  `{ id, trigger, text, persistKey }`. Pure data; no DOM logic.

### Modified

- `src/core/Profile.js` — Already has a `meta` field; add a
  `tutorialSeen` boolean and a `firstRunAt` timestamp. Keep the
  `sanitizeProfile` path backwards compatible.
- `src/core/Game.js`
  - Construct `this.onboarding = new Onboarding(this.profile.meta)`.
  - In `startRun`, reset run-scoped prompts via `onboarding.startRun()`.
  - In the existing combat event hooks (block.notePerfect,
    blink.trigger, objectiveManager onActivate, layoutEvents on
    rift-surge warn, levelManager on boss-wave-start, caster on
    auto-cast unlock), call `onboarding.triggerIf(world, eventName)`.
  - On `pickReward`, if the player chose the spell-unlock reward,
    record `onboarding.markSpellUnlocked()`.
- `src/ui/ui.js`
  - Add `showOnboardingToast(text, opts)` — a longer-lived, higher-
    contrast variant of the existing `toast()` (does not auto-dismiss
    until the player presses a key / button or the trigger event ends).
  - Refactor existing `toast()` only by extracting shared CSS into a
    common class so onboarding toasts inherit hurt-safe layout.
  - `summary()` — Restructure the run summary screen:
    - Top: "Wave X reached" with a comparison strip ("Best: wave Y").
    - Middle: damage breakdown rows (existing).
    - New: "Run highlights" — top 1–2 facts (e.g., "Perfect blocks: 12",
      "Spells unlocked: Fireball").
    - "Lifetime totals" small footer (kills, damage, gold).
    - Continue button (existing) and a new "Show details" toggle that
      shows/hides advanced rows.
- `index.html`
  - Add CSS for `.onboarding-toast` (sticky-style, slower fade, larger
    glyph row).
  - Restructure `.summary-grid` to a two-column layout supporting the
    highlights section.
- `README.md` — Add a note that first-run prompts are persisted under
  `profile.meta.tutorialSeen` and how to reset them (Reset Records
  flow already clears them).

### Not modified

- No combat module changes. The Onboarding hooks consume events that
  already exist; they do not change emit timing.
- No new save file. Tutorial state lives inside the existing
  `profile.meta` object (already part of the schema).

## Implementation Plan

1. Author the prompt catalog in `onboardingPrompts.js`:
   - `move_first_keypress` — "Move with WASD / left-stick" — fires on
     first WASD press in PLAYING.
   - `look_first_mouse` — "Look around" — fires on first sustained
     mouse movement / right-stick.
   - `cast_first_fire` — "Left-click / RT casts your spell" — fires on
     first attempted cast.
   - `block_first_incoming` — "Hold right-click / LT to block. Time it
     just before a hit for a perfect block." — fires the first time a
     ranged enemy projectile is in flight.
   - `blink_first_low_hp` — "Blink (Shift/Q/B) to dash through danger."
     — fires when HP first drops below 60%.
   - `objective_first_active` — "Objective active! Read the banner."
     — fires on first objective start.
   - `hazard_first_step` — "Rift surge — get out!" — fires on first
     hazard tick (replaces the existing one-off toast).
   - `boss_first_spawn` — "Boss wave. Watch the health bar." — fires
     on first boss spawn.
   - `autocast_first_unlock` — "Auto-Cast unlocked. You can take a new
     spell next reward." — fires when first Auto-Cast node is owned.
2. Implement `Onboarding`:
   - Constructor reads `profile.meta.tutorialSeen` and tracks a
     per-run `seenThisRun` set.
   - `triggerIf(world, eventName)`: if the event matches a prompt
     whose `persistKey` is unset (or `id` not in `seenThisRun`), call
     `world.ui.showOnboardingToast(text, ...)` and mark seen.
   - On run end, persist any new `persistKey` flags via the existing
     `persistProfile` flow.
3. Update `Profile.sanitizeProfile`:
   - Allow `meta.tutorialSeen` (object), `meta.firstRunAt` (string).
   - Preserve unknown meta keys for forward-compat.
4. Wire `Game` event sites (constructor + run boundary methods) to call
   `onboarding.triggerIf(world, ...)`. Each call is one line; existing
   combat code does not change shape.
5. Add `showOnboardingToast` in `ui.js` with a `pinUntil` predicate so
   the toast can persist until the player performs the action it
   describes (or a max timeout fires).
6. Refactor `summary()`:
   - Compute highlight values from `runStats`:
     - `perfectBlocks` (if RunStats tracks them — confirm; if not,
       expose a minimal counter on `Block` and feed it to RunStats).
     - `spellsUnlocked` from `caster.loadout.length - 1`.
     - `goldSpent` from `Currency.lifetimeSpent` (already tracked).
   - Build a comparison strip from `profile.bestRun`.
   - Render new layout under existing summary screen.
7. Add the "Show details" toggle. Hidden by default; reveals per-spell
   damage rows.
8. Update `clearTransientCombatUi` to also dismiss any pinned
   onboarding toast on pause / death / menu transitions.

## Verification

### Automated

- `?smoke=boot-start-menu` continues to pass.
- The feature_2 `deathRestart` scenario should be extended to also
  assert that the summary screen renders the highlights section and
  the comparison strip.
- Optional: a `?smoke=onboarding-first-run` scenario that resets the
  profile, starts a run, simulates a first cast, and asserts the
  matching onboarding toast appeared.

### Manual

- Fresh profile (after Reset Records):
  - Start run. Confirm first-move, first-look, first-cast prompts
    appear in sequence and dismiss themselves on the corresponding
    action.
  - Take damage; confirm low-HP blink prompt fires once.
  - Trigger an objective wave (force one via DevTools if needed);
    confirm objective prompt fires.
  - Step into a rift; confirm hazard prompt replaces the generic
    "Rift damage — move!" toast on first contact only.
  - Survive to boss wave 5; confirm boss prompt fires once.
  - Buy an Auto-Cast node; confirm unlock prompt fires.
- Restart the run; confirm prompts do NOT re-fire (persistent).
- Reset Records; confirm prompts re-fire on next run.
- Trigger death; confirm summary screen shows wave reached vs best,
  highlight rows, and the new toggle.

### Console / logs

- No new error log entries.
- `profile.v1.json` after first run shows the new `meta.tutorialSeen`
  keys populated.

## Guardrails

- Do not change combat behavior, damage numbers, or wave composition.
  Onboarding is purely observational.
- Do not add new gameplay events. Onboarding hooks only into events
  that already exist in `Game`, `Block`, `Blink`, `ObjectiveManager`,
  `LayoutEventManager`, and `LevelManager`.
- Do not move tutorial state outside `profile.meta`. No new save file.
- Do not write tutorial state to a global cookie or IndexedDB — use
  the existing `SaveStorage` abstraction.
- Do not extend the summary screen with judgmental labels ("Top spell
  was X"). README explicitly excludes those; keep the recap factual.
- Do not block player input or pause the game during onboarding
  toasts. They overlay; play continues.
- Do not depend on feature_1 (Gamepad). If gamepad has shipped, the
  prompts already pull device-aware glyphs; if not, KB/M strings are
  fine and feature_1 will sweep them later.
