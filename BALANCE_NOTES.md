# Balance Notes

## Target Curve

**Median Run**: ~12 minutes, 8-12 waves cleared
**Expected Death**: Level 10-14 (second/third run player)
**Wave 1 Clear**: ≤45 seconds for all starter spells (no upgrades)
**Boss Clear**: ~60 seconds with 1-2 upgrades (waves 5/10/15)
**Economy Budget (12-wave run)**: 4-6 upgrades + 1 service + ≤1 reroll

---

## Changes Summary

### Spell Tuning (spellDefinitions.js)

| Spell | Stat | Before | After | Rationale |
|-------|------|--------|-------|-----------|
| arcane_bolt | damage | 22 | 24 | Slight buff to solidify as baseline |
| arcane_bolt | cooldown | 0.42 | 0.45 | Slight CD increase to normalize |
| fireball | damage | 30 | 32 | Slight damage buff for AoE tradeoff |
| fireball | areaRadius | 6.5 | 7.0 | Better wave clear identity |
| frost_bolt | damage | 16 | 19 | +18% damage buff (was underperforming) |
| frost_bolt | slowAmount | 0.5 | 0.55 | Slightly stronger slow identity |
| poison_bolt | damage | 8 | 10 | Better upfront impact |
| poison_bolt | dotDamage | 7 | 8 | Slight DOT buff |
| poison_bolt | dotDuration | 4.0 | 4.5 | Longer window for damage |
| chain_lightning | damage | 18 | 16 | Damage reduction (chain was too strong) |
| chain_lightning | chainCount | 3 | 3 | Unchanged (identity) |
| chain_lightning | cooldown | 1.3 | 1.4 | Slight CD increase to balance |
| meteor | damage | 55 | 58 | Slight buff to heavy AoE identity |
| meteor | areaRadius | 8.5 | 9.0 | Larger impact zone |
| meteor | cooldown | 2.6 | 2.5 | Slight CD reduction |

**DPS Comparison (after tuning, single-target)**:
- Arcane Bolt: 24 / 0.45 = 53.3 DPS (baseline single-target)
- Fireball: 32 / 1.1 = 29.1 DPS + AoE
- Frost Bolt: 19 / 0.7 = 27.1 DPS + slow
- Poison Bolt: 10 + (8/0.5 * 4.5) = 82 total over 4.5s = ~18.2 DPS + DOT pressure
- Chain Lightning: 16 / 1.4 = 11.4 DPS × 3 chains = 34.3 total DPS
- Meteor: 58 / 2.5 = 23.2 DPS + heavy AoE

---

### Enemy Composition (LevelManager.js)

Smoother progression per level. Original had abrupt jumps at levels 2 and 4.

**Before per-level enemy count**:
- Lvl 1: 3 melee
- Lvl 2: 4 melee + 2 ranged = 6 (+3 jump)
- Lvl 3: 5 melee + 2 ranged + 1 dasher = 8 (+2 jump)
- Lvl 4: 6 melee + 3 ranged + 2 dasher + 1 linebreaker + 1 mage = 13 (+5 jump!)

**After tuning** (formula adjustments):
```javascript
const melee = 4 + Math.floor(level * 0.8);     // +1 base, slower scaling
const ranged = (level >= 2 ? 1 : 0) + Math.floor((level - 1) * 0.4);  // slower
const dasher = (level >= 3 ? 1 : 0) + Math.floor((level - 3) * 0.4);  // slower
const linebreaker = (level >= 5 ? 1 : 0) + Math.floor((level - 5) / 5);  // delay unlock
const mage = (level >= 4 ? 1 : 0) + Math.floor((level - 4) * 0.3);     // unchanged
```

**New per-level enemy count**:
- Lvl 1: 4 melee = 4 (+1 from 3)
- Lvl 2: 5 melee + 1 ranged = 6 (+2 jump, smoother)
- Lvl 3: 6 melee + 1 ranged + 1 dasher = 8 (+2 jump)
- Lvl 4: 7 melee + 2 ranged + 1 dasher + 1 mage = 11 (+3 jump, was +5)
- Lvl 5: 8 melee + 2 ranged + 1 dasher + 1 mage + 1 linebreaker = 13 (+2 jump)

---

### Enemy Stats (Enemy.js)

**Archetype Stats (base at level 1)**:

| Archetype | Stat | Before | After | Rationale |
|-----------|------|--------|-------|-----------|
| melee | base HP | 34 | 42 | More HP for wave 1 target time |
| melee | HP scale | 0.2 | 0.18 | Slightly slower scaling |
| melee | base speed | 5.6 | 5.2 | Slightly less oppressive |
| melee | touchDamage | 9 | 8 | Slight damage reduction |
| ranged | base HP | 24 | 28 | More durable |
| ranged | bolt damage | 8 | 7 | Less punishing chip damage |
| ranged | fireCd | 2.0 | 2.2 | Slightly slower cadence |
| dasher | base HP | 26 | 30 | More durable |
| dasher | touchDamage | 12 | 10 | Slight reduction |
| dasher | telegraph time | 0.65s | 0.7s | More reaction time |
| linebreaker | base HP | 44 | 48 | Tankier identity |
| linebreaker | touchDamage | 15 | 12 | Damage reduction |
| linebreaker | surge cooldown | 2.2s | 2.6s | Less frequent surges |
| mage | base HP | 30 | 34 | More durable |
| mage | orb damage | 13 | 11 | Slight reduction |
| mage | fireCd | 3.2s | 3.6s | Slower cadence |
| elite | base HP | 220 | 190 | 60s boss target adjustment |
| elite | touchDamage | 18 | 15 | Less punishing |

**Boss Adjustments**:
- Twin Warden: 0.85× elite HP → 0.9× (two targets, slightly tougher)
- Reaver: 1.6× elite HP → 1.5× (single target, adjust for 60s)
- Sentinel: 1.5× elite HP → 1.45× (spawns minions, slight adjust)

---

### Wave Modifiers (waveModifiers.js)

| Modifier | Stat | Before | After | Target |
|----------|------|--------|-------|--------|
| swift_horde | speed multiplier | 1.24 | 1.25 | 20-30% |
| swift_horde | extra melee | 1 + floor(level/4) | 1 + floor((level-1)/5) | Slightly reduced |
| armored | HP multiplier | 1.35 | 1.25 | +25% EHP |
| armored | speed reduction | 0.9 | 0.88 | Slightly slower for balance |
| volatile | radius | 4.2 | 4.5 | More readable |
| volatile | base damage | 8 | 7 | Slightly reduced |
| regenerating | base regen | 1.2 | 1.0 | Slightly reduced |
| regenerating | level scaling | 0.18 | 0.15 | Slightly reduced |
| elite_vanguard | count | 1 | 1 | Unchanged |
| roll chance | base | 0.35 at lvl2+ | 0.30 at lvl2+ | Slightly reduced |
| roll chance | cap | none | 0.55 at lvl10+ | Cap before wave 10 |

**Roll Chance Formula**:
```javascript
// Before: 35% chance at level 2+, never capped
// After: Base 30%, ramps +3% per level, caps at 55% at level 10+
const baseChance = 0.30 + Math.min(0.25, (level - 2) * 0.03);
```

---

### Rewards & Buffs (rewardDefinitions.js)

**Rarity Weights** (already balanced):
- Common: 70
- Uncommon: 25
- Rare: 7

**Buff Magnitude Check** (6 upgrades target: ~2× DPS, not 3×):

| Buff | Effect | Stacking |
|------|--------|----------|
| +25% Damage | ×1.25 | 6 stacks = ×3.81 (too strong if all damage) |
| -18% Cooldown | ×0.82 CD | 6 stacks = ×0.30 CD = ×3.33 DPS (too strong) |

**Adjustment**: Buff values slightly reduced to prevent exponential scaling:
- +25% Damage → +22% Damage (6 stacks = ×3.35, still strong but manageable)
- -18% Cooldown → -15% Cooldown (6 stacks = ×0.377 CD = ×2.65 DPS)

**Note**: Players choose mixed builds (damage + CD + utility + health), so effective scaling is lower. These values keep upgrade paths meaningful without being game-breaking.

---

### Economy (Game.js)

**Reroll Cost Formula**:
```javascript
// Before: 18 + level * 6 + rerolls * 14
// After: 20 + level * 7 + rerolls * 16
```

| Level | 0 rerolls (before/after) | 1 reroll (before/after) |
|-------|--------------------------|--------------------------|
| 1 | 24g / 27g | 38g / 43g |
| 5 | 48g / 55g | 62g / 71g |
| 10 | 78g / 90g | 92g / 106g |

**Service Options**:
- Heal amount: 35 + level * 3 (unchanged)
- Heal cost: 24 + level * 6 → 26 + level * 7 (slight increase)
- Sharpen/Stance cost: 40 + level * 5 → 42 + level * 6
- Cull cost: 45 + level * 6 → 48 + level * 7

---

### Upgrade Node Costs (upgradeTrees.js)

Costs already reasonable for the economy. Minor adjustments:

| Node Type | Before | After |
|-----------|--------|-------|
| dmg (tier1) | 25 | 25 |
| cd (tier2) | 45 | 45 |
| branch nodes | 70-80 | 75-85 (slight increase) |
| auto | 135 | 140 |
| capstone | 150-180 | 160-190 |

---

## Objectives (ObjectiveManager.js)

| Objective | Stat | Before | After |
|-----------|------|--------|-------|
| hold_sigil | required time | min(11, 7.5 + level*0.35) | min(12, 8.0 + level*0.4) |
| hold_sigil | radius | 4.8 | 5.0 |
| cleanse_rift | anchor HP | 42 + level*4 | 45 + level*4.5 |
| cleanse_rift | pulse damage | 5 + level*0.35 | 6 + level*0.4 |
| cleanse_rift | pulse interval | 7.0s | 7.5s |
| interrupt_ritual | anchor HP | 72 + level*7 | 78 + level*7.5 |
| interrupt_ritual | timer | 11.5s | 12.0s |
| interrupt_ritual | pulse damage | 7 + level*0.45 | 8 + level*0.5 |
| interrupt_ritual | spawn extras | 2 (first 3), then 1 | 2 (first 3), then 1 (unchanged) |
| base chance | OBJECTIVE_CHANCE | 0.36 | 0.32 |
| level gate | OBJECTIVE_LEVEL_GATE | 3 | 3 (unchanged) |

---

## Layout Events (LayoutEventManager.js)

| Event | Stat | Before | After |
|-------|------|--------|-------|
| gate_shift | warn time | 1.25s | 1.3s |
| gate_shift | open duration | 5.2s | 5.5s |
| gate_shift | close warn | 1.15s | 1.2s |
| gate_shift | cooldown after | 12-17s | 14-19s |
| rift_surge | warn time | 1.65s | 1.8s |
| rift_surge | active time | 4.2s | 4.5s |
| rift_surge | damage mult | 1.85 | 1.75 |
| rift_surge | cooldown after | 13-19s | 15-21s |

---

## Ballpark Targets for Run Summary

| Stat | Wave 5 | Wave 10 | Wave 15 |
|------|--------|---------|---------|
| Expected Gold | 120-180 | 300-450 | 500-700 |
| Upgrades Bought | 1-2 | 3-5 | 5-7 |
| Enemies Killed | 35-50 | 100-140 | 180-240 |
| Damage Dealt | 8k-12k | 25k-35k | 45k-60k |

These are estimates for validation. Actual values will vary by build and skill.

---

---

## Issue #23 — Difficulty Tiers + Progressive Spell Unlocks

### Difficulty Tiers (Difficulty.js)

10 tiers selectable from the main menu. Each tier modifies enemy stats, spawn density, gold rewards, and wave modifier count. Tiers unlock progressively by reaching a specific player level on the prerequisite tier.

| # | Tier | Unlock | HP × | Dmg × | Spawn × | Gold × | Mutators |
|---|------|--------|------|-------|---------|--------|----------|
| 1 | Apprentice | Default | 1.00 | 1.00 | 1.00 | 1.00 | 0 |
| 2 | Initiate | Reach lvl 10 on Apprentice | 1.15 | 1.10 | 1.05 | 1.05 | 0 |
| 3 | Adept | Reach lvl 15 on Initiate | 1.30 | 1.20 | 1.10 | 1.10 | 1 |
| 4 | Conjurer | Reach lvl 20 on Adept | 1.45 | 1.30 | 1.15 | 1.15 | 1 |
| 5 | Magus | Reach lvl 20 on Conjurer | 1.60 | 1.40 | 1.20 | 1.20 | 1 |
| 6 | Sorcerer | Reach lvl 25 on Magus | 1.75 | 1.50 | 1.25 | 1.25 | 2 |
| 7 | Archmage | Reach lvl 25 on Sorcerer | 1.95 | 1.65 | 1.30 | 1.30 | 2 |
| 8 | Voidcaller | Reach lvl 30 on Archmage | 2.15 | 1.80 | 1.35 | 1.35 | 2 |
| 9 | Eternal | Reach lvl 30 on Voidcaller | 2.40 | 2.00 | 1.40 | 1.40 | 3 |
| 10 | Apotheosis | Reach lvl 35 on Eternal | 2.70 | 2.25 | 1.50 | 1.50 | 3 |

- **hpMult**: Applied to enemy max HP after base scaling
- **damageMult**: Applied to enemy touch/melee damage after base scaling (projectile damage not affected; only touchDamage)
- **spawnMult**: Multiplied against each archetype group count in wave composition (min 1 per group)
- **goldMult**: Gold earned per kill scaled via the modifier's goldMult chain (mutators multiply together)
- **mutatorCount**: Guaranteed wave modifiers per wave (picks unique modifiers, falls back to fewer if insufficient eligible)

### Spell Unlock Gates

Spells are permanently unlocked account-wide after the player reaches the required player level on any difficulty tier:

| Spell | Unlock |
|-------|--------|
| Arcane Bolt | Starter (always) |
| Fireball | Reach level 5 |
| Frost Bolt | Reach level 10 |
| Poison Bolt | Reach level 15 |
| Chain Lightning | Reach level 20 |
| Meteor | Reach level 30 |

Unlock progression is tracked in the profile via `unlockedSpells[]` and `unlocks.highestLevelByTier`. Locked spells appear dimmed with a lock icon and tooltip in the main menu. Attempting to start a run with a locked spell falls back to Arcane Bolt.

### Profile Version Bump

Profile schema bumped to version 2. Migration from v1 adds `unlockedSpells: ["arcane_bolt"]` and `unlocks: { highestLevelByTier: {}, unlockedTiers: [1] }`.

---

## Issue #21 — Spell Variety: Differentiated Projectile Mechanics

### 1. Arcane Bolt — Cadence Stacks

Each arcane bolt stacks cadence per hit (pierce builds faster). Each stack adds +6 bonus damage (cap 3). Decays after 0.6s of no hit. At 3 stacks, impact VFX includes an extra spark burst.

| Field | Value |
|-------|-------|
| cadenceMaxStacks | 3 |
| cadenceDamagePerStack | 6 |
| cadenceDecayTime | 0.6s |
| base damage | 24 → 20 (-4, compensated by cadence) |

### 2. Fireball — Arcing Lob + Burn Patch

Fireball now has gravity (18 units/s² pull downward), giving it a lobbed arc. Burn patch is now baseline (was upgrade node `fireball_cinder_patch`). The upgrade node now grants `cinderPotency`: +25% burn tick damage.

| Field | Value |
|-------|-------|
| gravity | 18 |
| burnPatch | true (baseline) |
| base damage | 32 → 30 |

### 3. Frost Bolt — Chill Stacks → Freeze + Shatter

Replaced flat slow with a stacking chill mechanic. Each hit applies 1 chill stack (max 3). Each stack slows by 0.2 (60% total at max). Decays after 2.5s. When at max stacks, next hit triggers **shatter**: 28 bonus damage in 4m radius, resets stacks.

| Field | Value |
|-------|-------|
| chillStacks | true (baseline) |
| chillMaxStacks | 3 |
| chillDecayTime | 2.5s |
| chillSlowPerStack | 0.2 |
| shatterDamage | 28 |
| shatterRadius | 4 |
| base damage | 19 → 18 |

### 4. Poison Bolt — Contagion

Contagion is now baseline: on hit, DOT spreads once to the nearest enemy within 6m. Green mist VFX on spread target. Upgrade node `poison_bolt_contagion` now grants +30% DOT damage instead of enabling the flag.

| Field | Value |
|-------|-------|
| contagion | true (baseline) |
| base damage | 10 (unchanged) |

### Upgrade Tree Adjustments

| Node | Change |
|------|--------|
| `fireball_cinder_patch` | Now sets `cinderPotency` (+25% burn tick damage) instead of enabling burn patch |
| `frost_bolt_chill_stack` | Now adds +0.15 chillSlowPerStack and +1 chillMaxStacks instead of enabling chill stacks |
| `poison_bolt_contagion` | Now adds +30% DOT damage (contagion flag is already baseline) |

---

## New Content (Feature_6)

### Upgrade Tree Nodes

**Frost Bolt** (15 total, was 8):
| Node | Cost | Effect |
|------|------|--------|
| chill_stack | 65 | Hitting same enemy within 3s stacks slow (max 3): +0.1 slow, +0.5s each |
| icicle_splinter | 70 | Impact fires 2 shards at nearby enemies for 40% damage |
| cold_snap | 85 | Sub-30% HP enemies have 25% freeze chance on hit |
| cryo_slow ↔ hard_shatter | 90 / 95 | +2s slow duration, 0.9 cap / +40% dmg on freeze break |
| cryo_conduit | 120 | Slowed enemies spread 30% chill to nearby enemies every 2s |
| shatter_storm | 130 | Shattering a frozen enemy creates 3m icy explosion (50% dmg) |
| capstone | 150 (req 6) | Glacial Lance — pierces all, leaves 2s slow zone |

**Poison Bolt** (14 total, was 8):
| Node | Cost | Effect |
|------|------|--------|
| plague_spread | 75 | On enemy death, spreads remaining poison to nearest enemy |
| wide_spread ↔ deep_stack | 95 / 100 | +2 spread jumps / poison stacks 3x, +30% DOT per stack |
| corrosive_veins | 120 | Each stack reduces target damage by 5% |
| necrotic_bloom | 140 (req 4) | Poisoned enemy death: 4m AoE dealing 60% remaining poison dmg |
| capstone | 155 (req 5) | Pandemic — seeds on all enemies within 4m on hit |

**Chain Lightning** (14 total, was 8):
| Node | Cost | Effect |
|------|------|--------|
| jump_range | 70 | +25% chain jump distance |
| overcharge_first | 85 | First target takes +30% damage |
| chain_low_hp ↔ chain_elites | 95 / 95 | Prefers sub-50% HP / +25% vs elites |
| voltaic_overflow | 125 | Chain kill refunds 0.3s CD (low-HP path) |
| breaker_shock | 120 | Elite hits reduce their damage 10% for 3s (elite path) |
| capstone | 165 (req 5) | Chain Storm — +2 chains, +30% arc range |

**Meteor** (14 total, was 8):
| Node | Cost | Effect |
|------|------|--------|
| secondary_impacts | 65 | Follow-up meteors deal +10% damage each |
| scorched_earth | 75 | Impact leaves burning ground 3s, 6 dmg/tick |
| blast_radius ↔ travel_speed | 90 / 85 | +30% radius, -15% speed / +40% speed, -10% radius |
| magma_core | 125 | Scorched Earth: +25% dmg, +1s linger |
| comet_trail | 120 | Travel path damages enemies for 4 dmg/tick |
| capstone | 180 (req 5) | Cataclysm — 1s stun + molten pool 3s |

### New Relics

| Relic | Rarity | Mechanic |
|-------|--------|----------|
| Embered Footing | rare | Stand still 1.5s → next cast +35% dmg |
| Stormwitness | rare | Chain hit → -0.3s blink CD |
| Frostbitten Crown | rare | Slowed enemies take +20% dmg from all sources |
| Vermilion Catalyst | rare | Every 5th cast: +50% dmg + 2.5m AoE splash |
| Hollow Sigil | rare | 2 consecutive zero-upgrade reward cycles → +15% permanent dmg |
| Riftborn Mantle | rare | In hazard: 1 HP/s heal, but casts cost +20% CD |

### Hook Locations

- **CombatBonuses.preparePlayerCast**: Embered Footing (standingTimer), Vermilion Catalyst (castCounter), Riftborn Mantle (hazard CD penalty)
- **CombatBonuses.applyPlayerDamage**: Frostbitten Crown (target.slowTimer), Stormwitness (source spellId check)
- **Game.js.updateArenaHazards**: Riftborn Mantle (hazard healing)
- **Game.js._frame**: Embered Footing (standingTimer accumulation)
- **Game.js.resumeFromUpgrade**: Hollow Sigil (consecutive skip tracking)

All nodes use existing `requires`/`excludes` fork mechanics. No changes to UpgradeManager contract. New instance flags added to SpellInstance.js for each behavioral node.

---

## Issue #24 — Boss Difficulty: CC Immunity & Phase 2

### CC Immunity

Boss enemies (`isBoss = true`) are now immune to hard crowd control:

| CC Type | Effect |
|---------|--------|
| Stun (`applyStun`) | No-op. Spark burst VFX plays to indicate immunity. |
| Freeze (`applyFreeze`) | No-op. |
| Slow (`applySlow`) | 60% reduced effectiveness (`amount *= 0.4`). Different emissive color (`0x441122`) hints at partial resist. |

### Boss Stat Boosts

All bosses received stat upgrades to increase difficulty:

| Boss | Stat Change |
|------|-------------|
| Twin Warden | fireCd 2.6s → 1.8s (raged 1.3s → 0.9s) |
| Reaver | fireCd 3.0s → 2.1s |
| Sentinel | fireCd 2.4s → 1.7s |
| All bosses | speed ×1.2, touchDamage ×1.5 |

### Phase 2 (Triggered at <50% HP)

When a boss drops below 50% HP, a one-time phase transition fires with a telegraph shock ring and emissive change:

| Boss | Attack | Details |
|------|--------|---------|
| Twin Warden | Ground Slam | 8-radius shock VFX + 20 damage to player and all enemies in radius |
| Reaver | Fan of Orbs | Shoots 3 mage_orbs in a spread (-0.3, 0, +0.3 radians) |
| Sentinel | Triple Shot | Shoots 3 mage_orbs rapidly (0s, 0.15s, 0.3s delays) |

---
