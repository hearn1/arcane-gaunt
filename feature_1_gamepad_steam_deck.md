# feature_1 — Gamepad + Steam Deck

## Rationale

ArcaneGaunt currently only supports keyboard and mouse via pointer-lock. To ship
on Steam (and especially Steam Deck), every gameplay action and every menu must
be reachable with a controller, and on-screen prompts must reflect the active
input device. Without this, the game cannot pass Steam Deck Verified review and
cannot be played on the deck or living-room couch.

## Depends On

- None (standalone). This feature touches `Input.js`, `PlayerController.js`,
  `Block.js`, `Blink.js`, `SpellCaster.js`, and `ui.js`, but does not require
  any other feature file to be merged first.

## Files Touched

### Created

- `src/core/Gamepad.js` — Polls `navigator.getGamepads()` each frame, exposes
  per-frame stick/trigger/button state, edge-triggered button events, and a
  reusable analog deadzone helper. Holds the "active input device" flag.
- `src/ui/uiNav.js` — Small DOM helper for focus-driven menu navigation:
  registers focusable buttons in a panel, moves focus on d-pad / left-stick
  flick, activates on A/Start, and falls back to ESC/B for back.
- `assets/prompts/PROMPTS_README.md` — Documents prompt-glyph keys used in
  `ui.js` (e.g. `${PROMPT.fire}`) and which strings map to keyboard vs Xbox
  vs PlayStation labels. No external glyph art added; we use short text
  prompts ("LB / Q / Shift", "RT", etc.) to avoid licensing concerns.

### Modified

- `src/core/Input.js` — Add a gamepad pump tick called from `Game._frame`,
  produce the same surface (`firing`, `rightDown`, `_selectSpell`, `_wheel`,
  `onBlink`) so downstream callers don't change. Add a `_lookAxes` pair for
  right-stick look so `PlayerController` can read it without movement deltas.
  Track and expose `lastInputDevice` ("kbm" | "gamepad").
- `src/player/PlayerController.js` — Move look from `consumeMouse()` only to
  "mouse delta + right-stick axes (with per-frame yaw/pitch deltas multiplied
  by `dt`)". Apply mouse sensitivity to both; add a separate stick sensitivity
  curve. Read left-stick as movement when keys are not pressed.
- `src/player/SpellCaster.js` — Accept LB/RB or d-pad left/right as the
  cycle-spell input alongside number keys and wheel (route through new
  `consume*` helpers in `Input`). No new state.
- `src/player/Block.js` — Treat LT as right-mouse-equivalent for block hold.
- `src/player/Blink.js` — Accept the gamepad blink button (B by default)
  via `Input.onBlink`.
- `src/core/Game.js` — Call `input.pump(dt)` once per frame (browser gamepad
  state is polled). Trigger the existing pause flow when Start is pressed
  while in `PLAYING`. When `lastInputDevice` changes, ask `UI` to re-render
  hint glyphs.
- `src/core/Settings.js` — Add `controls.stickLookSensitivity` (clamped 0.3–2)
  and `controls.invertY` (boolean) to the schema and sanitizer; preserve
  defaults so existing saves continue to load.
- `src/ui/ui.js` — Replace hard-coded "WASD / Mouse / Shift" hint strings with
  device-aware prompts that read `Input.lastInputDevice`. Wire every screen
  (mainMenu, focusPrompt, pauseMenu, confirmResetProfile, settingsMenu,
  reward, upgradePanel, gameOver, summary) to use `uiNav.js` for focus and
  d-pad navigation. Reward cards become focusable + activate on A. Add new
  rows in `settingsMenu` for stick look sensitivity and invert-Y.
- `index.html` — Tweak CSS so focused menu buttons / cards show a clear
  outline (`:focus-visible` styles) on Steam Deck.
- `electron/main.cjs` — No code change needed (Gamepad API works under
  Chromium); add a comment near `webPreferences` documenting that gamepad
  scanning is on.
- `README.md` — Add a Controls table column for gamepad. Document stick look
  sensitivity and invert-Y settings.
- `src/smoke/SmokeRunner.js` — Optional: add a `gamepad-menu-nav` scenario
  stub that drives navigation purely through `uiNav.js` callbacks (no real
  gamepad needed). Keep scope tight; see feature_2 for fuller coverage.

## Implementation Plan

1. Define the controller bindings table (Xbox naming used in code; on-screen
   labels remain device-agnostic strings):
   - Left stick — movement
   - Right stick — look
   - A — primary fire / confirm menu
   - B — blink / cancel-back in menu
   - X — manual cast (alt-binding to A in combat)
   - Y — interact (reserved; currently unused)
   - LB / RB — cycle equipped spell (wheel-equivalent)
   - LT — block (hold)
   - RT — cast (alternate to A)
   - Start — pause
   - Back / View — open settings from main menu (optional)
   - D-pad — menu navigation, also serves as 1–6 select via mapping
2. Add `src/core/Gamepad.js` that polls each connected pad on a tick, returns
   a frozen snapshot with `axes[]`, `buttons[]`, and edge-trigger flags for
   "just pressed" buttons. Apply a constant 0.18 axis deadzone.
3. Modify `src/core/Input.js`:
   - Add `pump(dt)` that calls `Gamepad.poll()` and merges results into
     existing fields: hold A or RT → `firing`, hold LT → `rightDown`, B press
     → `onBlink()`, Start press → emit a new `onPause` callback.
   - Add `lastInputDevice` updated on first mouse/keydown vs first nonzero
     stick/button.
   - Add `_lookAxes = { x, y }` derived from right-stick with deadzone +
     non-linear ramp; expose `consumeStickLook(dt)` so PlayerController can
     consume per-frame look deltas.
4. Modify `PlayerController.update`:
   - After `consumeMouse`, also call `consumeStickLook(dt)` and apply the same
     `lookSens * stickLookSensitivity` scaling.
   - Read left-stick magnitude from `Input` and translate into the same wish
     vector if WASD keys are not pressed (keys win when both active).
   - Honor `invertY` from settings.
5. Modify `SpellCaster`:
   - Accept LB/RB edge presses by mapping them to `_wheel` (negative/positive)
     in `Input` before `consumeWheel`. No code change to `SpellCaster` itself
     beyond a comment noting the new source.
6. Hook `Input.onPause` in `Game` constructor: if `state === PLAYING`, call
   `pauseGame(true)`.
7. Add `src/ui/uiNav.js`:
   - `attach(root, options)` — finds `[data-nav]` focusable items, sets initial
     focus, listens for keydown/d-pad/stick-flick to move focus, calls
     `options.onActivate(item)` on A/Enter and `options.onBack()` on B/Esc.
   - On detach, removes listeners. Each `ui.js` screen calls `attach`/detach
     in its render path.
8. Update every screen in `ui.js`:
   - Add `data-nav` attribute to focusable elements (spell choices, all
     buttons, reward cards, service cards, upgrade buy buttons, etc.).
   - Replace hint strings with device-aware lookups (e.g. `prompt("blink")`).
   - Ensure `clearTransientCombatUi()` and overlay clears also detach uiNav.
9. Add Settings UI rows for stick look sensitivity and invert-Y. Persist via
   the same `updateSettings` → `saveSettings` debounced flow.
10. Add `:focus-visible` outline styles in `index.html` (or move CSS to its
    own file; current convention keeps it inline).
11. Update README controls table and document gamepad bindings.
12. Document on-screen prompts in `assets/prompts/PROMPTS_README.md`. Keep
    prompts text-only for v1 to avoid bundling third-party glyph art; the
    file is a placeholder for a future art pass.

## Verification

### Automated

- Add a `gamepad-menu-nav` smoke scenario (or extend `boot-start-menu`) that
  programmatically calls `uiNav` focus/activate callbacks and asserts focus
  moves through main menu → spell choice → start. (Browser smoke harness has
  no real gamepad; this only verifies the focus plumbing, not real input.)
- `boot-start-menu` continues to pass — gamepad pump is inert when no pad is
  connected.

### Manual (browser)

- With an Xbox controller plugged in to Chrome:
  - Main menu: d-pad selects spell, A starts run.
  - Focus prompt: A captures the mouse (still required by browser pointer-lock
    user-gesture rules; document this limitation).
  - In-arena: left-stick moves, right-stick aims, RT casts, LT blocks, B
    blinks, LB/RB cycles equipped spell, Start pauses.
  - Pause menu: d-pad selects Resume/Settings/Main Menu, A confirms.
  - Reward and upgrade panels: d-pad selects, A buys, B closes (where
    appropriate).
  - Settings: sliders adjust on left/right d-pad presses; back returns.
- Unplugging the controller mid-run reverts seamlessly to KB/M; HUD prompts
  update.

### Manual (Electron / Deck)

- `npm run pack:win`, launch under `dist/win-unpacked/ArcaneGaunt.exe`. Plug
  in a controller and confirm the same flow.
- Steam Deck native: install via private depot (feature_4), open in gaming
  mode, confirm every menu reachable without touchscreen and without the
  on-screen keyboard.

### Console / logs

- No new `[ArcaneGaunt:*]` error log entries in renderer.log or main.log
  during a controller-only run.

## Guardrails

- Do not modify combat balance: cast cadence, projectile speed, damage,
  cooldowns, blink distance, block stamina, or wave composition.
- Do not change the spell loadout model or auto-cast gating.
- Do not require the gamepad — KB/M must remain a full first-class control
  path.
- Do not add gamepad glyph art that is not CC0; ship text-only prompts until
  a later art pass.
- Do not add network calls for input mapping (no Steam Input config push
  yet — that belongs to feature_4 / feature_6 if anywhere).
- Do not rebuild `PlayerController` movement physics — only add a parallel
  input source feeding the existing wish-vector math.
