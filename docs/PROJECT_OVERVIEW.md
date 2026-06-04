# ArcaneGaunt Project Overview

## Project Identity

**ArcaneGaunt** is a first-person wizard shooter roguelike. The player controls a wizard in first person, fights waves of enemies in arena-style encounters, earns gold and rewards, upgrades spells, unlocks new spell options, and continues deeper into the run until death.

The core fantasy is:

> "I am a powerful but fragile wizard improvising a spell build while surviving escalating enemy waves."

This is not an auto-battler, party management game, or shop economy game. It is an active first-person combat game.

## Target Experience

The game should feel like a lightweight indie roguelike FPS prototype with:

- Fast first-person movement and aiming.
- Active spellcasting with projectiles and impact feedback.
- Wave-based arena encounters.
- Enemy pressure from melee, ranged, mage, and dasher behaviors.
- Reward selection after each cleared wave.
- Spell build experimentation through upgrades and new spell unlocks.
- Gold earned from progression.
- Game over flow with restart and main menu options.
- Death summary screen showing player-driven run stats.

The complete prototype was built in one implementation pass and is now in production-readiness phase.

## Engine / Platform

- **Three.js** (vendored at `vendor/three.module.js`) for WebGL 3D rendering.
- **Vanilla ES-module JavaScript** — no build step, no bundler.
- **DOM/CSS** for all UI; **Web Audio** for procedural SFX with OGG sample fallback.
- **Python `http.server`** for browser development.
- **Electron** as the desktop wrapper for Steam-style distribution.

## Core Loop

```text
Main Menu
→ Start run
→ Spawn into FPS arena
→ Fight enemy wave
→ All enemies defeated
→ Grant gold
→ Reward screen appears
→ Player selects spell/buff/reward
→ Next level spawns
→ Repeat until death
→ Game Over canvas/screen
→ View run summary / restart / return to main menu
```

## Player Actions

The player can:

1. Move in first person (WASD).
2. Aim with mouse (pointer-lock).
3. Cast equipped spells (left click).
4. Blink as a mobility action (Shift / Q).
5. Block with stamina and perfect-block reflect (right-click hold).
6. Fight 6 enemy types plus 3 boss variants.
7. Clear waves with objectives and wave modifiers.
8. Choose rewards from weighted rarity pools.
9. Upgrade spells through gold-bought branching upgrade trees.
10. Buy between-wave services (heal, sharpen, stance drill, battlefield read).
11. Reroll reward cards for escalating gold.
12. Earn gold from cleared waves.
13. Die and view a detailed death summary.
14. Restart or return to main menu.

## Implemented Features

All features described below are fully implemented.

### Core Combat

- First-person controller with jump, gravity, and collision.
- Player health, stamina, block, and death.
- Spell casting with cooldowns and auto-cast.
- Projectiles with homing, pierce, and split.
- Collision / damage resolution with ownership rules.
- Visual feedback (procedural VFX) and audio feedback (OGG samples + procedural fallback).

### Spells

6 spells with a data-driven static-definition + runtime-instance architecture:

- **Arcane Bolt** — direct projectile, low cooldown.
- **Fireball** — projectile with AoE on impact.
- **Chain Lightning** — hitscan chain to 3+ targets.
- **Poison Bolt** — projectile with DOT and contagion spread.
- **Frost Bolt** — projectile with slow, freeze, and frost nova.
- **Meteor** — ground-targeted delayed AoE.

Each spell has a branching upgrade tree (7–13 nodes) with mutually exclusive forks, capstones, and an auto-cast milestone. New spells can be added by extending `spellDefinitions.js` without touching player controls.

### Enemies

9 enemy classes across 6 archetype types (each with Quaternius GLB models and capsule fallbacks):

- **Melee** — chases and deals contact damage.
- **Ranged** — keeps distance, fires projectiles.
- **Dasher** — telegraphs then dashes at the player.
- **Linebreaker** — cuts off escape with surge attacks.
- **Mage** — slow, fires AoE orbs.
- **Elite** — large, extra health, shoots mage orbs.
- **Boss variants:** Twin Warden (pair), Reaver (surge dasher), Sentinel (minion spawner).

### Run / Level Progression

- Level/wave manager with escalating difficulty.
- Enemy wave spawning per level composition.
- Wave clear detection (all enemies + objectives).
- Boss waves every 5th level on a 3-pattern rotation.
- Reward screen after wave clear; next wave after selection.
- Wave modifiers (Swift Horde, Armored, Volatile, Regenerating, Elite Vanguard).
- Wave objectives (Hold the Sigil, Cleanse the Rift, Interrupt the Ritual).

### Rewards / Buffs

- Dynamic reward options from weighted rarity pools (common/uncommon/rare).
- Spell unlock rewards (gated behind auto-cast).
- Spell buff rewards (stat upgrades and tradeoff cards).
- Player/run buff rewards (max HP, blink CD, full heal, stamina, Hunter's Eye).
- 5 build-defining relics (Duelist Sigil, Blinkstrike Ember, Parry Dynamo, Adrenal Lens, Glass Focus).
- Duplicate prevention and spell-specific eligibility filtering.
- 3 choices per reward (rerollable for escalating gold).

### Gold & Between-Wave Services

- Gold awarded on cleared waves; gold modifier bonuses.
- Gold shown in HUD; lifetime earned tracked.
- Gold spent on spell upgrade trees, rerolls, and services.
- Services: Full Heal, Sharpen Auto-Cast, Stance Drill, Battlefield Read.

### Death Summary

- Total damage dealt.
- Damage by spell (sorted descending, no "top spell" label).
- Gold earned.
- Enemies killed.
- Levels cleared.
- Best-run / lifetime context from profile.
- Accessible from game over screen.

## Production/Release Work Remaining

Items not yet complete for a Steam release:

- Full gamepad / controller support.
- Steam Deck UI readiness.
- Production Electron metadata (app icon, Windows icon, version metadata).
- SteamPipe app/depot build scripts and launch verification.
- Steamworks integration (achievements, stats, Steam Cloud).
- Comprehensive balance tuning across spells, economy, and pacing.
- Expanded automated smoke test coverage.
- Final store assets (capsules, screenshots, trailer).

## Important Exclusions

Do not add Dungeon Debt mechanics:

- Debt.
- Payroll.
- Auto-battler party management.
- Hero hiring.
- Formation slots.
- Rival guild ghost combat.
