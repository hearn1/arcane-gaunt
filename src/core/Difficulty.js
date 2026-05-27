export const DIFFICULTY_TIERS = Object.freeze([
  Object.freeze({ level: 1,  name: "Apprentice",  description: "A gentle introduction to the arcane arts.",              hpMult: 1.0,  damageMult: 1.0,  spawnMult: 1.0,  goldMult: 1.0,  mutatorCount: 0 }),
  Object.freeze({ level: 2,  name: "Adept",       description: "Slightly stronger foes test your fundamentals.",         hpMult: 1.15, damageMult: 1.1,  spawnMult: 1.0,  goldMult: 1.05, mutatorCount: 0 }),
  Object.freeze({ level: 3,  name: "Journeyman",  description: "Chain Lightning unlocked. Enemies toughen up.",          hpMult: 1.3,  damageMult: 1.2,  spawnMult: 1.05, goldMult: 1.1,  mutatorCount: 1 }),
  Object.freeze({ level: 4,  name: "Expert",      description: "Modifiers stack. Every wave brings new challenges.",     hpMult: 1.5,  damageMult: 1.35, spawnMult: 1.1,  goldMult: 1.2,  mutatorCount: 1 }),
  Object.freeze({ level: 5,  name: "Veteran",     description: "Frost Bolt unlocked. Enemies are numerous and deadly.",  hpMult: 1.7,  damageMult: 1.5,  spawnMult: 1.2,  goldMult: 1.35, mutatorCount: 1 }),
  Object.freeze({ level: 6,  name: "Master",      description: "Double modifiers. The arena grows more dangerous.",      hpMult: 2.0,  damageMult: 1.7,  spawnMult: 1.3,  goldMult: 1.5,  mutatorCount: 2 }),
  Object.freeze({ level: 7,  name: "Archmage",    description: "Fireball unlocked. Triple the chaos.",                   hpMult: 2.2,  damageMult: 1.9,  spawnMult: 1.4,  goldMult: 1.7,  mutatorCount: 2 }),
  Object.freeze({ level: 8,  name: "Sage",        description: "Poison Bolt unlocked. Only the wise survive.",           hpMult: 2.5,  damageMult: 2.1,  spawnMult: 1.5,  goldMult: 1.9,  mutatorCount: 2 }),
  Object.freeze({ level: 9,  name: "Elder",       description: "Three modifiers per wave. Extreme endurance required.",  hpMult: 2.7,  damageMult: 2.3,  spawnMult: 1.75, goldMult: 2.2,  mutatorCount: 3 }),
  Object.freeze({ level: 10, name: "Grandmaster", description: "Meteor unlocked. The ultimate trial.",                   hpMult: 3.0,  damageMult: 2.5,  spawnMult: 2.0,  goldMult: 2.5,  mutatorCount: 3 }),
]);

const UNLOCK_TIER = {
  chain_lightning: 3,
  frost_bolt: 5,
  fireball: 7,
  poison_bolt: 8,
  meteor: 10,
};

export function getDifficultyTier(level) {
  const idx = Math.max(1, Math.min(10, Math.round(level || 1))) - 1;
  return DIFFICULTY_TIERS[idx];
}

export function getUnlockedSpells(tier, profile) {
  if (profile && Array.isArray(profile.unlockedSpells) && profile.unlockedSpells.length > 0) {
    return [...profile.unlockedSpells];
  }
  const spells = ["arcane_bolt"];
  const t = tier ? tier.level : 1;
  for (const [spellId, requiredLevel] of Object.entries(UNLOCK_TIER)) {
    if (t >= requiredLevel) spells.push(spellId);
  }
  return spells;
}

export { UNLOCK_TIER };
