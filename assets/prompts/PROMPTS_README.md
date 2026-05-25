# On-Screen Prompts

ArcaneGaunt uses text-only prompt strings on every screen (HUD, menus,
buttons). No glyph/icon art is bundled; this file is a placeholder for a
future art pass (CC0 glyphs or in-house SVGs).

## Prompt Keys

The `ui.js` helper `devicePrompt(key)` looks up the current label based on
the active input device (`Input.lastInputDevice`: `"kbm"` or `"gamepad"`).

| Key      | KB/M label           | Gamepad label      |
|----------|----------------------|--------------------|
| move     | WASD                 | Left Stick         |
| look     | Mouse                | Right Stick        |
| cast     | Left Click           | RT                 |
| block    | Right Click (hold)   | LT (hold)          |
| blink    | Shift / Q            | B                  |
| jump     | Space                | A                  |
| pause    | Esc                  | Start              |
| cycle    | Mouse Wheel          | LB / RB            |
| select   | Number Keys          | D-Pad              |
| confirm  | Left Click           | A                  |
| back     | Esc                  | B                  |

## Future Art Pass

When CC0 controller glyphs are sourced, replace the text labels with small
inline `<svg>` or `<img>` elements keyed by device. The prompt helper can
return HTML instead of text; the `ui.js` hint strings already use `.innerHTML`
so inline SVGs will render.

Keep the text labels as a fallback for screen-reader `aria-label` attributes.
