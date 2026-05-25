# ArcaneGaunt Technical Architecture

## Technology Stack

- **Rendering:** Three.js r160, vendored at `vendor/three.module.js`.
- **Language:** Vanilla ES-module JavaScript — no build step, no bundler.
- **UI:** DOM/CSS overlays (no framework).
- **Audio:** Web Audio API with OGG sample playback and procedural fallback.
- **Dev server:** Python `http.server` with no-cache headers.
- **Desktop packaging:** Electron (thin shell, `arcane://` app protocol).

## Architectural Priorities

The implementation follows these separations:

1. Static spell definition separate from mutable runtime spell stats.
2. Central damage application path.
3. Projectile/collision logic separate from player input.
4. Enemy wave management separate from enemy AI.
5. Reward generation separate from reward UI rendering.
6. Run stats as a passive collector, not a gameplay authority.

## High-Level System Map

```text
App/Game Bootstrap
Main Menu / Start Run
Game Settings
Run Manager
Level/Wave Manager
Enemy Manager
Player Controller
Spell Loadout / Spell Caster
Spell Data / Spell Instance
Projectile / Hit Resolver
Health / Damage
Currency Manager
Reward Manager / Reward UI
Run Stats Manager
Game Over / Death Summary UI
Asset Loader / Placeholder Factory
```

## Runtime Data Model

The data model is implemented in `src/spells/` as follows:

### Spell Definition

Static spell data, defined in `spellDefinitions.js` and `Object.freeze`d:

```ts
interface SpellDefinition {
  id: string;
  displayName: string;
  description: string;
  damage: number;
  cooldown: number;
  projectileSpeed?: number;
  range?: number;
  areaRadius?: number;
  chainCount?: number;
  pierceCount?: number;
  splitCount?: number;
  ricochetCount?: number;
  dotDamage?: number;
  dotDuration?: number;
  dotTickRate?: number;
  slowAmount?: number;
  slowDuration?: number;
  castVfxId?: string;
  impactVfxId?: string;
  soundId?: string;
}
```

### Spell Instance

Runtime copy of spell definition, defined in `SpellInstance.js`:

```ts
interface SpellInstance {
  definitionId: string;
  displayName: string;
  stats: SpellRuntimeStats;
  ownerIsEnemy: boolean;
}
```

### Spell Runtime Stats

Mutable stats that buffs modify:

```ts
interface SpellRuntimeStats {
  damage: number;
  cooldown: number;
  projectileSpeed: number;
  areaRadius: number;
  chainCount: number;
  pierceCount: number;
  splitCount: number;
  ricochetCount: number;
  dotDamage: number;
  dotDuration: number;
  dotTickRate: number;
  slowAmount: number;
  slowDuration: number;
}
```

## Damage Architecture

All damage passes through one central method (`src/core/Damage.js`):

```ts
applyDamage(target: Health, amount: number, source?: DamageSource): DamageResult
```

Damage source should include:

- Whether source is player/enemy.
- Spell ID if spell damage.
- Spell display name if available.
- Whether this is DOT/AoE/chain if useful for debugging.

Rules:

- Player spells damage enemies.
- Enemy attacks damage player.
- Friendly fire is off by default.
- Final damage actually dealt should be reported to run stats.
- Damage should clamp at remaining health so overkill does not inflate stats.

## Projectile Architecture

A projectile (`src/projectile/Projectile.js` + `HitResolver.js`):

- Store source spell instance or damage source.
- Store owner faction.
- Move each frame or through physics.
- Detect collision.
- Resolve hit through a hit resolver.
- Apply damage/effects.
- Spawn impact visuals/audio.
- Destroy or continue based on pierce/ricochet/split behavior.

Implementation: `Projectile` class handles movement and visuals; `HitResolver` handles collision, damage, AoE, chain, DOT, pierce, split, and redirect logic. No component system — plain classes.

## Health System

Health (`src/core/Health.js`) supports:

- Max health.
- Current health.
- Damage application.
- Death event/callback.
- Player death routing to game over.
- Enemy death routing to enemy manager and run stats.

Pseudo-code:

```ts
function takeDamage(amount, source) {
  if (isDead || amount <= 0) return { dealt: 0 };

  if (!canDamage(source, this.faction)) return { dealt: 0 };

  const before = currentHealth;
  const finalAmount = applyMitigation(amount, source);
  currentHealth = Math.max(0, currentHealth - finalAmount);
  const dealt = before - currentHealth;

  if (dealt > 0 && source?.spellId && source.owner === 'player') {
    runStats.registerDamage(source.spellId, dealt);
  }

  if (currentHealth <= 0) die(source);

  return { dealt };
}
```

## Run Stats

Run stats are passive. They should not drive gameplay decisions.

```ts
interface RunStats {
  levelsCleared: number;
  enemiesKilled: number;
  goldEarned: number;
  totalDamage: number;
  damageBySpell: Record<string, number>;
}
```

Hook points:

- Damage: central health/damage method after final damage is known.
- Enemy kills: enemy death path.
- Gold: currency gain method.
- Levels cleared: wave clear event, not initial level spawn.

## Level / Wave Manager

Responsibilities:

- Track current level.
- Spawn wave for current level.
- Listen for all enemies defeated.
- Grant gold.
- Register level cleared.
- Open reward UI.
- Start next level after rewards.

Important:

```text
Do not count level 1 as cleared when it spawns.
Count a level as cleared only after the wave is defeated.
```

## Enemy Manager

Responsibilities:

- Spawn enemies.
- Track living enemies.
- Remove enemies on death.
- Fire `onAllEnemiesDefeated` when count reaches zero.
- Avoid firing wave clear repeatedly.

Wave scaling:

- Level 1: small melee group (3 + floor(level * 0.9)).
- Level 2+: adds ranged enemies.
- Level 3+: adds dashers, linebreakers, mages.
- Level 4+: may roll wave modifiers (Swift Horde, Armored, Volatile, Regenerating, Elite Vanguard).
- Every 5th level: boss waves on a 15-level rotation (Twin Warden → Reaver → Sentinel).

## Reward System

Reward generation is separate from rendering:

- **`rewardDefinitions.js`** — catalog of all buffs, unlocks, player rewards, and relics.
- **`RewardGenerator.js`** — weighted rarity pools, filtering, eligibility checks.
- **`ui.js`** renders dynamic reward cards (DOM/CSS).

Reward application mutates:

- A specific spell instance (e.g., +damage, +AoE radius).
- Player stats (e.g., +max HP, +stamina).
- Run state (e.g., full heal).

Filtering prevents:

- Offering already-owned spell unlocks.
- Offering spell-specific buffs for unavailable spells.
- Offering incompatible rewards.

## UI Architecture

UI reads state and calls manager methods. No gameplay logic lives inside UI components.

Key screens (all in `src/ui/ui.js`):

- Main menu (spell selection, profile strip, settings, reset records, credits).
- Focus prompt (click-to-play, fullscreen notice).
- HUD (HP, stamina, spells, cooldowns, blink, level, gold, enemies, modifiers, objectives, boss bar, crosshair).
- Pause menu (resume, settings, main menu).
- Reward screen (dynamic cards, rarity, reroll).
- Upgrade panel (per-spell trees, services).
- Wave banner (level, layout, modifier, boss, objective).
- Game over / death summary screens.
- Fatal error overlay.

## Asset Loading

- **Models:** 5 Quaternius GLB files loaded via `GLTFLoader`; fallback to colored capsules.
- **Textures:** 3 ambientCG JPGs loaded via `TextureLoader`; fallback to Lambert colors.
- **Audio:** 14 OGG samples loaded via `Audio` API; fallback to procedural Web Audio synths.
- **VFX:** fully procedural (`src/core/VFX.js`), no external assets.
- **UI:** plain HTML/CSS, no asset images.

If any asset fails to load (404, decode error), the affected slot falls back to the procedural/placeholder path with a console warning instead of crashing. The game boots with zero external assets present.
