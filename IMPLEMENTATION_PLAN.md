# ArcaneGaunt — What Was Built

All 11 phases below are **complete**. This document records what was built during each phase, not a forward plan.

## Stack

**Three.js r160** (vendored, no build step) + **vanilla ES-module JavaScript** + **DOM/CSS UI** + **Web Audio** + **Python dev server** + **Electron desktop wrapper**.

## Phase 1 — Core First-Person Arena

Built: first-person FPS controller (WASD + pointer-lock mouse), arena with floor/walls/pillars using procedural geometry + ambientCG textures, randomized arena layouts with lane blockers and cover clusters, player spawn with collision boundaries, basic HUD shell.

## Phase 2 — Health, Damage, and Game Over

Built: `Health` class (max/current HP, faction, death callback, mitigation), `Damage.js` central damage path (`applyDamage` with faction rules, overkill clamping, stat reporting), HP bar in HUD, game over screen, restart and main menu flow, death vignette overlay.

## Phase 3 — Spell System and Projectile Combat

Built: `spellDefinitions.js` (6 spells, Object.freeze'd), `SpellInstance` (mutable runtime stats), `Effects.js` (cast dispatch for projectile/hitscan/AoE/ground), `SpellCaster` (loadout, cooldowns, auto-cast, manual switching), `Projectile` class (movement, trail VFX, homing), `HitResolver` (AoE, chain, DOT, pierce, split, redirect, ground effects).

## Phase 4 — Enemy Types and AI

Built: `Enemy.js` base class (steering, separation, stuck nudge, status effects, death/drop) with 9 concrete classes: MeleeEnemy, RangedEnemy, DasherEnemy, LinebreakerEnemy, MageEnemy, EliteEnemy, plus 3 boss variants (TwinWardenElite, ReaverElite, SentinelElite). Slow/freeze/stun/DOT hooks built in. Quaternius GLB models with capsule fallback.

## Phase 5 — Level/Wave Progression

Built: `LevelManager` (wave composition by level, difficulty scaling, boss wave rotation), `EnemyManager` (spawn, track, wave-clear firing), `ObjectiveManager` (3 types: Hold the Sigil, Cleanse the Rift, Interrupt the Ritual), `waveModifiers.js` (5 modifiers: Swift Horde, Armored, Volatile, Regenerating, Elite Vanguard), `LayoutEventManager` (gate shifts, rift surges).

## Phase 6 — Reward and Buff System

Built: `rewardDefinitions.js` (weighted rarity pools: common 70, uncommon 25, rare 7; per-spell stat buffs, tradeoff cards, 5 relics, player rewards, spell unlocks), `RewardGenerator.js` (filtering, eligibility, auto-cast gating for unlocks, 55% unlock bias, rare-at-3+ rule). 3 dynamic cards per reward, rerollable for escalating gold.

## Phase 7 — Gold and HUD

Built: `Currency` class (balance + lifetime earned), gold display in HUD, level indicator, enemy count, wave modifier display, objective display, spell slots with cooldown fill bars, blink cooldown, stamina bar, block indicator, crosshair (idle/blocking/perfect-window/block-hit/perfect-hit states), boss health bar, wave banner.

## Phase 8 — Blink and Block

Built: `Blink.js` (forward dash, collision-safe destination, 4s cooldown, VFX/SFX, blinkstrike timer for combat bonus), `Block.js` (stamina-based, 55% mitigation, 0.22s perfect window, projectile redirect as 2×-damage "Redirect" source, melee stun on perfect block, crosshair feedback states).

## Phase 9 — Death Summary

Built: `RunStats` (passive collector: levelsCleared, enemiesKilled, goldEarned, totalDamage, damageBySpell), `Profile` (best-run + lifetime aggregates, reset flow), death summary UI with sorted per-spell damage breakdown, best-run context, no "top spell" label.

## Phase 10 — Assets, Feedback, and Polish

Built: 5 Quaternius CC0 enemy GLB models, 3 ambientCG CC0 arena textures, 14 Kenney CC0 OGG audio samples, procedural VFX (burst, beam, lightning, ring, shock, flash, mist) via `VFX.js`, procedural Web Audio fallback in `AudioSys`, full `CREDITS.md` attributions, fatal error overlay, Electron logs.

## Phase 11 — Bosses and Elite Encounters

Built: 3 boss types on a 15-level rotation — Twin Warden (pair, sync-cast, rage), Reaver (surge dasher), Sentinel (minion spawner, cap 3). Elite base class with gold bonus, boss bar in HUD, all using existing health/damage framework.

## Post-Phases — Production Readiness (Milestone 1)

- Persistent settings and profile saves (localStorage + Electron file bridge).
- Settings menu (audio mute/volume, mouse sensitivity, fullscreen, render scale, effects density).
- Pause menu (Esc: Resume, Settings, Main Menu).
- Reset Records flow with confirmation.
- Error handling (fatal overlay, Electron `logs/renderer.log` + `logs/main.log`).
- Browser smoke test harness (`?smoke=boot-start-menu`).
- Electron packaging: `npm run pack:win` (unpacked), `npm run dist:win` (NSIS installer), `npm run dist:portable`.
