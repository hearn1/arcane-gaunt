## Arcane Gaunt — Issue Implementation Orchestration

### Project Context

**Repo**: `C:\Users\Matt\Desktop\Code\arcane_gaunt`
**Issues**: https://github.com/hearn1/arcane-gaunt/issues
**Stack**: JavaScript + Three.js + Electron. Custom smoke test framework under `src/smoke/`. No Jest/Mocha — tests are run with `npm test` (which runs `node test/run.mjs`).
**Smoke convention**: Scenarios live in `src/smoke/scenarios/`, export a named async function, registered in `SmokeRunner.js`. Use helpers from `testHelpers.js` (`step`, `assert`, `waitFor`, `nextFrame`, `killAllEnemies`, etc.).
**Game wiring**: `src/core/Game.js` creates everything (camera, player, block, spells, enemies, UI). A shared `world` object is passed around which exposes all systems via getters.

**Key files**:
- `src/enemies/Enemy.js` — base class with `applyStun`, `applyFreeze`, `applySlow`, `isBoss` on elite subclasses
- `src/core/Profile.js` — save schema, versioned (currently v1), `sanitizeProfile`, `recordRunCompleted`
- `src/spells/spellDefinitions.js` — frozen map of 6 spells with damage, cooldown, castType, etc.
- `src/spells/Effects.js` — dispatch for all cast types (projectile, hitscan_chain, ground_aoe)
- `src/player/SpellCaster.js` — player loadout, `tryCastSpell(world, spell)` computes origin/aim and calls `Effects.js`
- `src/player/Block.js` — stamina-based block with 0.22s perfect window, `mitigate()`, `notePerfect()`, `noteBlock()`
- `src/core/Game.js` — central orchestrator, game states (menu/focus/playing/reward/gameover/summary)
- `src/level/waveModifiers.js` — existing mutator system
- `src/core/Settings.js` — settings persistence
- `src/ui/ui.js` — all UI rendering
- `src/core/RunStats.js` — run statistics tracking

---

### The 6 Issues (in recommended implementation order)

#### 1. Issue #20 — Shield visual: gold glow while blocking
https://github.com/hearn1/arcane-gaunt/issues/20

**Files**: `src/player/ShieldView.js` (new), `src/core/Game.js`, `src/smoke/scenarios/waveClear.js`
**Scope**: Procedural gold disc/hemisphere viewmodel that appears while blocking, pulses on perfect-block, fades on release. Camera-attached, `block.blocking` gating. No gameplay change.
**Instructions**: Create `ShieldView.js` with `attach(camera)`, `update(dt, block)` reading `block.blocking`, `block.perfectRatio()`, block pulses. Wire in `Game.js` — instantiate after camera, call update each frame, hide outside PLAYING state. Use additive blending, `depthWrite: false`, `transparent: true`.

---

#### 2. Issue #21 — Spell variety: differentiate projectile spells
https://github.com/hearn1/arcane-gaunt/issues/21

**Files**: `src/spells/spellDefinitions.js`, `src/projectile/Projectile.js`, `src/projectile/HitResolver.js`, `src/core/VFX.js`, `src/enemies/Enemy.js`, `src/spells/upgradeTrees.js`, `src/smoke/scenarios/` (new `spellMechanicsValidate.js` or extend `dataValidate.js`), `BALANCE_NOTES.md`
**Scope**: 4 spells get unique mechanics:
- Arcane Bolt: cadence stacking (damage ramp on sustained fire, decays after pause)
- Fireball: arcing lob trajectory (gravity on projectile), burn patch on impact (lingering AoE hazard)
- Frost Bolt: 3 chill stacks → freeze + shatter burst (bonus damage + slow ring)
- Poison Bolt: contagion — DOT spreads to nearby enemies (capped depth 1)
**Instructions**: Add new fields to `spellDefinitions.js`. Modify `HitResolver.js` for per-spell on-hit branches. Add `chillStacks` to `Enemy.js` with decay timer. Add gravity support to `Projectile.js`. Add VFX helpers in `VFX.js`. Audit `upgradeTrees.js` for overlap. Re-tune damage to keep TTK within ±15%. New smoke scenario validating contagion/shatter/burn-patch.

---

#### 3. Issue #22 — Wizard staff viewmodel
https://github.com/hearn1/arcane-gaunt/issues/22

**Files**: `src/player/StaffView.js` (new), `src/player/SpellCaster.js`, `src/spells/Effects.js`, `src/core/Game.js`, `src/core/Settings.js`, `src/ui/ui.js`
**Scope**: Procedural staff group attached to camera, `tipWorldPos()` used as spell origin instead of camera center. Cast animation (recoil + tip flash + particle burst). Idle sway/walk bob. Block lowers staff.
**Instructions**: Create `StaffView.js` — `THREE.Group` with cylinder shaft + sphere gem. Position `(0.35, -0.35, -0.6)` in camera space. `playCast(spellColor)` triggers 0.18s recoil tween + emissive flash. In `SpellCaster.js`, change cast origin to `world.staffView.tipWorldPos()` when available. In `Game.js`, instantiate after camera, store as `this.staffView`, call update each frame, hide outside PLAYING. New `settings.display.viewmodel` toggle.

---

#### 4. Issue #24 — Boss difficulty: CC immunity, phase 2 attacks
https://github.com/hearn1/arcane-gaunt/issues/24

**Files**: `src/enemies/Enemy.js`, `src/spells/Effects.js`, `src/ui/ui.js`, `src/core/RunStats.js` (optional `bossesDefeated`), `src/smoke/scenarios/bossCcImmune.js` (new), `BALANCE_NOTES.md`
**Scope**: Bosses immune to stun/freeze, partial slow only. Stat boosts (dmg ×1.5, speed ×1.2, HP multipliers). Faster attack cadence. Phase 2 at <50% HP with new attack per boss (TwinWarden ground slam, Reaver fan of orbs, Sentinel triple-shot). Telegraph on phase entry. "CC IMMUNE" tag on boss bar.
**Instructions**: Add `isBoss` checks in `applyStun`/`applyFreeze`/`applySlow` in `Enemy.js`. Modify boss constructor stat values. Add phase 2 logic in boss behavior methods. Reuse existing VFX helpers for telegraph. Add CC immune hint to boss bar in `ui.js`. New smoke scenario testing CC immunity. Verify `Effects.js` stunOnHit routes through `applyStun` guard (no boss-specific branch needed there).

---

#### 5. Issue #23 — Difficulty tiers + progressive spell unlocks
https://github.com/hearn1/arcane-gaunt/issues/23

**Files**: `src/core/Difficulty.js` (new), `src/core/Profile.js`, `src/core/Game.js`, `src/level/LevelManager.js`, `src/enemies/Enemy.js`, `src/player/SpellCaster.js`, `src/ui/ui.js`, `src/level/waveModifiers.js`, `src/smoke/scenarios/difficultyUnlock.js` (new), `BALANCE_NOTES.md`
**Scope**: 10 difficulty tiers with HP/damage/spawn/gold multipliers and mutators. Spell roster gates (Arcane Bolt always starter, others unlock at level thresholds). Profile v2 migration. Difficulty selector in main menu. `recordRunProgress()` that grants unlocks crossing multiple thresholds at once.
**Instructions**: Create `Difficulty.js` with frozen `DIFFICULTY_TIERS` array and helpers. Extend `Profile.js` — new `unlocks` schema, bump to v2 with migration from v1, add `recordRunProgress`. Apply difficulty multipliers in `LevelManager.js` (spawn counts rounded) and `Enemy.js` (HP/damage scaling). `SpellCaster.reset()` falls back to arcane_bolt for locked spells. UI: difficulty selector pills, locked spells desaturated. Wire mutator forcing in `waveModifiers.js`. New smoke scenario for unlock flow.

---

#### 6. Issue #25 — Release-readiness audit gaps
https://github.com/hearn1/arcane-gaunt/issues/25

**Scope**: Meta-issue with 10+ items across audio, onboarding, visuals, settings, accessibility, save migration, telemetry, localization, content depth, release checklist. Pick the highest-value items that fit the timeline:
- **Priority**: Save migration safety (needed by #23 profile v2)
- **Audio**: 3–4 CC0 music tracks + boss enrage sting
- **Settings**: Key remapping + FOV slider
- **Accessibility**: Colorblind-safe spell palette + "reduce screen shake" toggle
- **Visual**: Procedural gradient sky + selective bloom
- **Localization**: String extraction pass (`t("key")` wrapper)
- **Onboarding**: End-to-end audit of `src/ui/Onboarding.js`
- **Telemetry**: Opt-in crash report uploader
**Instructions**: Implement a reasonable subset (aim for save migration, key remapping, FOV slider, colorblind palette, reduce shake toggle, skybox, localization string extraction). Each sub-item should be cleanly separated into its own commit.

---

### Implementation Order & Dependency Notes

```
#20 (Shield) — standalone, no deps
#21 (Spell variety) — standalone, no deps  
#22 (Staff viewmodel) — best after #20 since both touch Game.js camera wiring
#24 (Boss difficulty) — touches Enemy.js, use a feature branch
#23 (Difficulty tiers) — touches Profile.js (v2), Enemy.js, SpellCaster, ui.js — wait for #24 to land first on Enemy.js
#25 (Release audit) — save migration depends on #23's v2 profile changes
```

**Merge conflict risk areas**:
- `Game.js` — touched by #20, #22, #23 → coordinate or merge sequentially
- `Enemy.js` — touched by #21, #23, #24 → accumulate changes in order
- `ui.js` — touched by #22, #23, #24 → moderate risk, mostly additive
- `Profile.js` — touched by #23 and #25 → coordinate migration carefully

---

### General Instructions for Each Subagent

1. **Read full issue before coding**: Each issue on GitHub has detailed implementation plans with exact code sketches, file lists, edge cases. Re-read it if you hit ambiguity.
2. **Follow existing code style**: No semicolons in JS (project convention). No JSDoc comments. No unnecessary comments. Use `const`/`let`, arrow functions, template literals where appropriate. Three.js patterns: `new THREE.Vector3()`, `Object3D` group parenting.
3. **Smoke tests**: After implementing, run `npm test` to verify existing tests still pass. For new scenarios, verify with `node test/run.mjs <scenario-key>`.
4. **Commit discipline**: One commit per issue with a descriptive message (e.g., `feat: add shield visual gold glow while blocking`). Don't commit unless explicitly asked.
5. **Cross-issue awareness**: When touching a file that other issues also modify, keep changes additive where possible and note the conflict risk.
6. **Balance notes**: Update `BALANCE_NOTES.md` for any tuning changes (#21, #23, #24).
