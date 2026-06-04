# ArcaneGaunt Asset Guidelines

## Asset Philosophy

Use free assets where they improve readability or feel, but never block core implementation on art/audio.

The game must remain functional with placeholders.

## Allowed Asset Sources

The implementation agent may search for free assets when needed. Good sources may include:

- Kenney assets.
- OpenGameArt.
- itch.io free asset packs.
- Poly Pizza / Quaternius / other free low-poly model sources when license allows.
- Freesound or similar for SFX when license allows.
- Engine built-in primitives/materials/particles.

## License Requirements

For any external asset:

- Confirm the license permits use in this prototype.
- Prefer CC0, public domain, MIT, or clearly free commercial-use assets.
- Avoid unclear licenses.
- Avoid ripped assets from commercial games.
- Avoid assets requiring attribution unless the project includes a `CREDITS.md` entry.
- Record source URL, author, license, and usage in `CREDITS.md` or equivalent.

## Fallback Rules

If free assets are unavailable or slow to integrate, use placeholders:

### Enemies

- Melee: red capsule/cube.
- Ranged: blue capsule/cube.
- Dasher: orange fast capsule/cube.
- Mage: purple capsule/cube.
- Boss/elite: larger dark model/primitive.

### Spells

- Arcane Bolt: small blue/purple sphere with trail.
- Fireball: orange/red sphere with explosion ring.
- Frost: cyan projectile and slow indicator.
- Poison: green projectile/cloud.
- Chain Lightning: line renderer / beam between targets.
- Meteor: falling sphere with AoE decal/indicator.

### UI

- Simple panels with readable text.
- Basic icons using emoji/simple shapes if needed.

### Audio

- If no safe SFX are found, use generated/simple oscillator sounds or omit audio.

## Visual Clarity Priorities

Prioritize assets/effects that communicate gameplay:

1. Projectile direction.
2. Spell impact.
3. Enemy type.
4. Enemy hit/death.
5. Reward selection.
6. Game over/death summary readability.

## Do Not Do

- Do not spend excessive time searching for perfect assets.
- Do not use copyrighted game assets.
- Do not make the project fail if assets are missing.
- Do not overbuild asset pipelines before the core loop works.
