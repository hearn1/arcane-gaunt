// STATIC design data. Frozen — never mutated during a run. Buffs mutate a
// SpellInstance copy, never these objects.
export const SPELL_DEFINITIONS = Object.freeze({
  arcane_bolt: Object.freeze({
    id: "arcane_bolt",
    displayName: "Arcane Bolt",
    description: "Fast direct-damage bolt. Reliable, low cooldown.",
    castType: "projectile",
    damage: 20,
    cooldown: 0.45,
    projectileSpeed: 70,
    range: 80,
    color: 0x9a6cff,
    colorblindColor: 0xffdd44,
    soundId: "arcane",
    starter: true,
    cadenceStacks: true,
    cadenceMaxStacks: 3,
    cadenceDamagePerStack: 6,
    cadenceDecayTime: 0.6,
    // castShake: 0 — fires every 0.45s, constant shake would be miserable (§94).
    castShake: 0,
    trailVfxId: "arcane_spiral",
    impactVfxId: "arcane_pop",
    trailInterval: 0.028,
  }),
  fireball: Object.freeze({
    id: "fireball",
    displayName: "Fireball",
    description: "Lobbed projectile that explodes for area damage on impact.",
    castType: "projectile_aoe",
    damage: 30,
    cooldown: 1.1,
    projectileSpeed: 42,
    range: 80,
    areaRadius: 7.0,
    color: 0xff7a33,
    colorblindColor: 0xff5530,
    soundId: "fire",
    gravity: 18,
    burnPatch: true,
    castShake: 0.04, // noticeable — heavy spell (§94)
    trailVfxId: "fire_embers",
    trailInterval: 0.045,
  }),
  frost_bolt: Object.freeze({
    id: "frost_bolt",
    displayName: "Frost Bolt",
    description: "Damages and chills the target, slowing its movement.",
    castType: "projectile",
    damage: 18,
    cooldown: 0.7,
    projectileSpeed: 60,
    range: 80,
    chillStacks: true,
    chillMaxStacks: 3,
    chillDecayTime: 2.5,
    chillSlowPerStack: 0.2,
    shatterDamage: 28,
    shatterRadius: 4,
    color: 0x5cc8ff,
    colorblindColor: 0x22ddff,
    soundId: "frost",
    castShake: 0.02, // faint (§94)
    trailVfxId: "frost_mist",
    impactVfxId: "frost_shatter",
    trailInterval: 0.038,
  }),
  poison_bolt: Object.freeze({
    id: "poison_bolt",
    displayName: "Poison Bolt",
    description: "Light impact, then poisons the target for damage over time.",
    castType: "projectile_dot",
    damage: 10,
    cooldown: 0.85,
    projectileSpeed: 55,
    range: 80,
    dotDamage: 8,
    dotDuration: 4.5,
    dotTickRate: 0.5,
    contagion: true,
    contagionRadius: 3.5,
    contagionPotency: 0.6,
    color: 0x66dd55,
    colorblindColor: 0xff9933,
    soundId: "poison",
    castShake: 0.015, // faint (§94)
    trailVfxId: "poison_cloud",
    impactVfxId: "poison_lingering",
    trailInterval: 0.085,
  }),
  chain_lightning: Object.freeze({
    id: "chain_lightning",
    displayName: "Chain Lightning",
    description: "Instantly strikes a target, arcing to nearby enemies.",
    castType: "hitscan_chain",
    damage: 16,
    cooldown: 1.4,
    range: 55,
    chainCount: 3,
    color: 0xa9e7ff,
    colorblindColor: 0xffffff,
    soundId: "chain",
    castShake: 0.025, // moderate (§94)
  }),
  meteor: Object.freeze({
    id: "meteor",
    displayName: "Meteor",
    description: "Marks the ground you aim at, then crashes down for heavy AoE.",
    castType: "ground_aoe",
    damage: 58,
    cooldown: 2.5,
    range: 70,
    areaRadius: 9.0,
    color: 0xff5530,
    colorblindColor: 0xff44aa,
    soundId: "meteor",
    // Cast shake on meteor mark (separate, larger impact shake fires on landing).
    castShake: 0.06, // noticeable — heaviest spell (§94)
  }),
});

export const STARTER_SPELL_ID = "arcane_bolt";
export const UNLOCKABLE_SPELL_IDS = Object.keys(SPELL_DEFINITIONS).filter(
  (id) => !SPELL_DEFINITIONS[id].starter
);

// Optional fields allowed on a spell definition (not required by dataValidate).
// Documented here for reference — trailVfxId/impactVfxId/trailInterval drive
// the VfxLibrary trail/impact resolver; chain_lightning and meteor have no
// projectile trail so they omit these fields intentionally.
// OPTIONAL_SPELL_FIELDS: trailVfxId, impactVfxId, trailInterval
