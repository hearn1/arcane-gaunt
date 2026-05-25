# ArcaneGaunt Game Design

## Genre

First-person wizard shooter roguelike.

## Game Pillars

### 1. Active Spell Combat

The player actively aims and casts spells in first person. Combat should require movement, positioning, cooldown awareness, and target priority.

### 2. Build Discovery

The player’s run evolves through spell unlocks and buffs. Each reward choice should create meaningful build identity.

### 3. Escalating Waves

Each cleared level leads to harder waves. The game should be simple to restart and replay.

### 4. Readable Feedback

Spell impacts, enemy damage, wave completion, reward choices, and death summary stats should be easy to understand.

## Core Gameplay Loop

```text
Start Run
→ Equip starting spell(s)
→ Spawn wave
→ Fight
→ Clear wave
→ Grant gold
→ Show reward screen
→ Select reward
→ Spawn next wave
→ Continue until death
→ Game over + summary
```

## Player

The player is a wizard using FPS controls.

### Baseline Capabilities

- Move with standard FPS movement.
- Look/aim with mouse.
- Cast spells from equipped spell list.
- Swap active spell or use hotkeys depending on implementation.
- Blink for mobility.
- Take damage and die.

### Blink

Blink is a short-range mobility action.

Recommended behavior:

- Triggered by key press.
- Moves player forward or in input direction.
- Has cooldown.
- Uses raycast/collision checks so the player does not blink through walls.
- Can be represented by a simple flash/particle effect if assets are available.

### Block

A stamina-based block is implemented:

- Hold right-click to block.
- Blocking reduces incoming damage to 55%.
- Stamina (100 max, drains 38/s, regenerates 24/s after 0.8s delay) limits uptime.
- Perfect block window (first 0.22s) reflects projectiles back as 2×-damage Redirect shots and refunds stamina.
- Perfect-blocked melee attacks stun the attacker.
- HUD shows stamina bar with low/draining/perfect states, crosshair reacts with visual states.
- Block synergizes with the Parry Dynamo relic (+80% next cast after perfect block).

## Spell System Design

The spell system should separate static design data from mutable runtime stats.

### Spell Data

Static spell definition. In Unity this would be a `ScriptableObject`; in a web implementation this can be JSON/TypeScript data.

Suggested fields:

- Stable spell ID.
- Display name.
- Description.
- Icon or placeholder icon.
- Cast type.
- Damage.
- Cooldown.
- Projectile speed.
- Range.
- Area radius.
- Chain count.
- Pierce count.
- Split count.
- Ricochet count.
- DOT damage/duration/tick rate.
- Slow amount/duration.
- Knockback/knockup.
- Visual effect IDs.
- Sound effect IDs.

### Spell Instance

Runtime copy of the spell data. Buffs mutate the instance, not the static spell definition.

Important rule:

```text
Spell data is static design data.
Spell instance/runtime stats are mutable run data.
```

## Starter Spell Set

The implementation should attempt several spells rather than only one.

Recommended MVP spell roster:

### Arcane Bolt

- Simple projectile.
- Direct damage.
- Low cooldown.
- Baseline spell.

### Fireball

- Projectile with area damage on impact.
- Medium cooldown.
- Useful for clustered enemies.

### Chain Lightning

- Hits a target, then chains to nearby enemies.
- Chain should originate from the latest hit target, not always the player.
- Should not bounce infinitely.

### Poison Cloud / Poison Bolt

- Applies damage over time.
- DOT should be counted as spell damage in run stats.
- If contagion/spread exists, cap propagation to avoid infinite spread.

### Ice Shard / Frost Bolt

- Deals damage and applies slow.
- Utility value matters even if damage is lower.

### Meteor / Ground Spell

- Ground-targeted or delayed AoE spell.
- Can use a visible indicator before impact if practical.

## Spell Effect Rules

- Damage is applied through a central health/damage path.
- Ownership rules prevent friendly fire unless intentionally enabled.
- DOT, AoE, chain, split, and pierce should all report damage to the same stats path.
- Utility spells should not be judged by the UI as “best”; show numbers neutrally.

## Enemies

Enemies should create different pressure patterns while remaining simple.

### Melee Enemy

- Chases player.
- Attacks at close range.
- Baseline threat.

### Ranged Enemy

- Keeps distance if possible.
- Fires projectile attacks.
- Pressures strafing and positioning.

### Dasher Enemy

- Telegraphs briefly.
- Dashes toward player.
- Creates burst movement pressure.

### Mage Enemy

- Casts slower but more dangerous projectiles or AoE.
- Can be visually distinct with free assets or placeholders.

### Boss / Elite

Boss waves appear every 5th level with 3 distinct boss types on a 15-level rotation:

- **Twin Warden** (level 5, 20, 35…): two elite enemies that sync-cast and rage on partner death.
- **Reaver** (level 10, 25, 40…): a surge-dashing elite with linebreaker-style behavior.
- **Sentinel** (level 15, 30, 45…): spawns melee minions (cap 3).

All bosses use the same health/damage framework as standard enemies and do not break wave progression.

## Level / Wave Progression

- Game starts at level 1.
- Each level spawns a wave.
- Wave composition scales with level.
- When all enemies die, the wave is cleared.
- Gold is granted.
- Reward UI opens.
- After the reward, the next level starts.

## Rewards

Reward choices should support build discovery.

### Reward Types

- New spell unlock.
- Spell damage increase.
- Cooldown reduction.
- AoE increase.
- Chain count increase.
- DOT improvement.
- Slow duration increase.
- Multishot/split/pierce if supported.
- Player max health increase.
- Blink cooldown reduction.
- Extra reward choice / extra pick if practical.

### Reward Rules

- Show around 3 choices by default.
- Avoid duplicate new-spell rewards for spells already owned.
- Buffs should only appear if they apply to the current build or are valid global/player buffs.
- Keep the reward screen dynamic, not hardcoded to fixed button content.

## Gold

Gold is a run resource with these implemented uses:

- Award gold after clearing a wave (modifiers grant bonus gold).
- Show current gold on HUD.
- Track total gold earned for death summary (spending does not reduce this total).

Spending/store behavior is optional. If added, spending should not reduce “gold earned” in the run summary.

## Death Summary

The death summary should inform the player without dictating what was good.

Required metrics:

- Total damage dealt.
- Damage done by each spell.
- Gold earned.
- Enemies killed.
- Levels cleared.

Do not label a “top spell” in V1 because utility spells may be valuable without leading damage.

## Visual Style

The game uses a mix of external CC0 assets and procedural content:

### External Assets (all CC0 1.0)

- **Enemy models:** 5 GLB models from Quaternius Ultimate Monsters (Orc, GreenSpikyBlob, Ninja, Wizard, Yeti) with colored-capsule fallback if any fails to load.
- **Arena textures:** ambientCG stone floor, wall, and pillar JPGs.
- **Audio:** 14 OGG samples from Kenney.nl Sci-Fi / Impact / Interface packs with procedural Web Audio fallback per slot.

### Procedural Content

- **Spell VFX:** Points bursts, beams, lightning arcs, rings, shockwaves, flash, mist (via `src/core/VFX.js`).
- **Player mesh:** first-person controller with no visible external mesh.
- **UI:** plain HTML/CSS panels, buttons, and HUD.
- **Skybox:** flat fog color (no cubemap sourced).
- **Projectile trails:** per-spell procedural visuals (beams, flashes, bursts).

The game boots with zero assets present and falls back to Lambert-colored placeholders for any missing texture, model, or audio slot.
