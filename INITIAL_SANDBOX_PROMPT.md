# Initial sandbox.dev Prompt for ArcaneGaunt

Copy and paste this prompt into sandbox.dev after uploading the project documentation files.

---

You are helping me recreate **ArcaneGaunt** from scratch.

ArcaneGaunt is a **first-person wizard shooter roguelike**, not an auto-battler. Ignore any Dungeon Debt concepts such as debt, hero parties, shop hiring, formations, payroll, or rival guild auto-combat.

I have uploaded the following documentation files. Treat them as the source of truth:

- `PROJECT_OVERVIEW.md`
- `GAME_DESIGN.md`
- `TECHNICAL_ARCHITECTURE.md`
- `IMPLEMENTATION_PLAN.md`
- `UI_AND_SCENE_FLOW.md`
- `ASSET_GUIDELINES.md`

## Important implementation direction

Do **not** limit this to only a first vertical slice.

Attempt to implement the **complete playable ArcaneGaunt prototype up to the current designed/previously reached state** in this session. That means you should attempt the full loop:

```text
Main Menu
→ First-person arena
→ Spell combat
→ Enemy waves
→ Wave clear
→ Gold reward
→ Reward/buff selection
→ Next wave
→ Death
→ Game over
→ Death summary
→ Restart/main menu
```

If you cannot complete everything in one pass, keep the project playable and document what remains incomplete.

## Technology freedom

You are **not required to use Unity**.

Choose the best technology stack available in this sandbox to make the game functional and playable. Unity/C# is acceptable if practical, but you may instead use Godot, Three.js, Babylon.js, React/TypeScript/WebGL, or another stack that will produce a working first-person game in this environment.

Prioritize:

1. A playable result.
2. Clear source structure.
3. Maintainable gameplay systems.
4. Fast iteration in sandbox.dev.

Document your chosen stack and why you chose it.

## Asset direction

Look for free assets when needed, especially for spell effects, enemy placeholders, UI, and sound.

Rules:

- Prefer CC0/public-domain/MIT/free-commercial-use assets.
- Do not use ripped/copyrighted assets from commercial games.
- Add a `CREDITS.md` file with source, author, license, and usage for every external asset.
- If asset search slows progress, use simple placeholders instead.
- The game must work even if external assets are missing.

## Required completed-state features to attempt

Implement as much of the following as possible:

### Core app/game flow

- Main menu/start run.
- Playable first-person arena.
- Restart and main menu return.
- Game over on player death.

### Player

- First-person movement and mouse look.
- Health.
- Spell casting.
- Spell cooldowns.
- Blink/mobility action if practical.

### Spells

Use a static definition + runtime instance/stat model, even if implemented in JSON/TypeScript rather than Unity ScriptableObjects.

Attempt these spells:

- Arcane Bolt: direct projectile.
- Fireball: AoE projectile.
- Frost Bolt/Ice Shard: damage + slow.
- Poison spell: DOT.
- Chain Lightning: chained damage.
- Meteor or another ground/AoE spell if feasible.

### Projectile/damage architecture

- Centralized damage path.
- Ownership rules so player spells damage enemies and enemy attacks damage player.
- Projectiles/collision separated from player input.
- DOT/AoE/chain damage should still report through the same damage/stat path.

### Enemies

Attempt multiple enemy types:

- Melee chaser.
- Ranged attacker.
- Dasher with telegraph.
- Mage/caster if feasible.
- Optional larger elite/boss placeholder.

### Wave progression

- Enemy manager.
- Level/wave manager.
- Spawn waves by level.
- Detect all enemies defeated.
- Grant gold.
- Open reward screen.
- Start next wave after reward choice.
- Difficulty escalates over levels.

### Rewards and buffs

- Dynamic reward screen.
- New spell unlock rewards.
- Spell buff rewards.
- Player/run buff rewards if practical.
- Duplicate prevention and basic eligibility filtering.
- Rewards mutate runtime spell/player state, not static definitions.

### HUD/UI

- Health.
- Current gold.
- Current level/wave.
- Equipped spells and cooldowns.
- Reward screen.
- Game over screen.
- Death summary screen.

### Death summary

Track and display:

- Total damage dealt.
- Damage by spell.
- Gold earned.
- Enemies killed.
- Levels cleared.

Do not label a “top spell”; just show the numbers neutrally.

## Architecture rules

Follow these rules regardless of stack:

- Static spell definitions are not mutated during a run.
- Runtime spell instances/stats are mutable and receive buffs.
- Damage is centralized.
- Run stats are passive collectors.
- Reward generation is separate from reward UI rendering.
- Enemy manager handles wave-level tracking; individual enemies handle their behavior.
- Keep systems simple and inspectable.
- Prefer working gameplay over perfect visuals.

## Work style

Proceed in this order:

1. Inspect the sandbox environment and choose the stack.
2. Create the project structure.
3. Build the core first-person arena.
4. Add health/damage/game over.
5. Add spell definitions, spell instances, casting, and projectiles.
6. Add enemies and waves.
7. Add rewards/buffs and gold.
8. Add death summary.
9. Add blink and polish if not already done.
10. Search/add free assets only where useful and license-safe.
11. Run/build/test the project.
12. Provide a final summary, how to run/test, what was completed, and what remains.

Do not stop after the first working projectile. Continue toward the complete playable prototype unless blocked.
