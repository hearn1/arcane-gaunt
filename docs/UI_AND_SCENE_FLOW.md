# ArcaneGaunt UI and Scene Flow

## Overall Flow

```text
Main Menu
→ Game / Arena
→ Wave combat
→ Reward screen
→ Next wave
→ Game over
→ Death summary / restart / main menu
```

These are application states managed by the `Game` state machine (MENU → FOCUS → PLAYING → REWARD → GAMEOVER → SUMMARY), not separate scenes.

## Main Menu

### Elements

- Title: ArcaneGaunt.
- Start Run button.
- Spell archetype selection grid (6 spells).
- Profile strip (best run, runs started, kills, damage).
- Settings button → settings panel.
- Reset Records button with confirmation flow.
- Controls hint.
- Credits note with license link.
- Quit/exit button in Electron (omitted in browser).

### Start Run Behavior

- Reset run state.
- Reset player stats/loadout.
- Start at level 1.
- Load or show game arena.

## HUD

### Elements

- Player health bar + numeric readout.
- Stamina bar (low/draining/perfect/hit states).
- Block indicator (BLOCKING / PARRY WINDOW / PERFECT).
- Current gold.
- Current level/wave.
- Equipped spell slots with cooldown fill bars (manual + passive slots).
- Blink cooldown indicator.
- Enemy count remaining.
- Wave modifier name + description.
- Objective name + description + completion state.
- Crosshair (idle, blocking, perfect window, block hit, perfect hit states).
- Boss health bar on boss waves.
- Dead vignette overlay on death.

## Reward Screen

### Flow

```text
Wave cleared
→ grant gold
→ register level cleared
→ pause combat/spawning
→ open reward UI
→ player selects reward
→ apply reward
→ close reward UI
→ spawn next wave
```

### Layout

```text
RewardPanel
├── Title: Choose a Reward
├── RewardOptionsRoot
│   ├── RewardCard/Button
│   ├── RewardCard/Button
│   └── ...
└── Reroll button (escalating gold cost)
```

### Reward Card Content

- Reward title.
- Reward description.
- Rarity badge (common / uncommon / rare).
- Affected spell if relevant.

### Reward UI Rules

- Dynamic cards; not hardcoded to a fixed count.
- Default to 3 choices (rerollable for escalating gold).
- Avoid duplicate spell unlocks.
- Filter spell-specific buffs to current manual spell.
- Weighted rarity pools (common weight 70, uncommon 25, rare 7).

## Game Over Screen

### Required Elements

- Text: Game Over / You Died.
- Button: View Run Summary.
- Button: Restart.
- Button: Main Menu.

### Behavior

- Disable player controls when game over opens.
- Stop enemy spawning/attacking.
- Preserve run stats until restart/main menu.
- Death wins same-frame race against objective/wave-clear events.

## Death Summary Screen

### Purpose

Inform the player what happened during the run without telling them what was “best.”

### Required Metrics

- Levels cleared.
- Enemies killed.
- Gold earned.
- Total damage dealt.
- Damage by spell.

### Layout

```text
DeathSummaryPanel
├── Title: Run Summary
├── LevelsClearedText (with best-run context)
├── EnemiesKilledText (with best-run context)
├── GoldEarnedText (with best-run context)
├── TotalDamageText (with best-run context)
├── DamageBreakdownList
│   ├── DamageRow: Spell Name | Damage
│   ├── DamageRow: Spell Name | Damage
│   └── ...
├── RestartButton
└── MainMenuButton
```

### Damage Breakdown Rules

- Sort by damage descending.
- Show all spells with damage > 0.
- Use spell display name when available.
- Use stable spell ID as fallback.
- Do not show “top spell,” medals, or judgmental labels.

## Controls

- **W A S D** — Move.
- **Mouse** — Look (pointer lock).
- **Left click** — Cast equipped spell.
- **Right click (hold)** — Block; perfect timing reflects projectiles.
- **Space** — Jump.
- **Shift / Q** — Blink.
- **Digit1–9 / mouse wheel** — Switch manual spell.
- **Esc** — Pause menu (resume, settings, main menu).

## Implementation

- Plain DOM overlays (no React/framework).
- All screens in `src/ui/ui.js`, driven by `Game` state transitions.
- No separate scenes — application states in the `Game` state machine.

## UI Priority

Functionality beats polish.

The UI can be simple text/buttons if it clearly supports:

- Starting a run.
- Reading combat state.
- Choosing rewards.
- Seeing game over.
- Viewing death summary.
- Restarting.
