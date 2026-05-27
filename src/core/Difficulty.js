export const DIFFICULTY_TIERS = Object.freeze([
  Object.freeze({ level: 1,  name: "Apprentice",  description: "A gentle introduction to the arcane arts.",              hpMult: 1.00, damageMult: 1.00, spawnMult: 1.00, goldMult: 1.00, mutatorCount: 0, unlock: null }),
  Object.freeze({ level: 2,  name: "Initiate",    description: "Reach level 10 on Apprentice to unlock.",               hpMult: 1.15, damageMult: 1.10, spawnMult: 1.05, goldMult: 1.05, mutatorCount: 0, unlock: { tierId: 1, level: 10 } }),
  Object.freeze({ level: 3,  name: "Adept",       description: "Reach level 15 on Initiate to unlock.",                hpMult: 1.30, damageMult: 1.20, spawnMult: 1.10, goldMult: 1.10, mutatorCount: 1, unlock: { tierId: 2, level: 15 } }),
  Object.freeze({ level: 4,  name: "Conjurer",    description: "Reach level 20 on Adept to unlock.",                   hpMult: 1.45, damageMult: 1.30, spawnMult: 1.15, goldMult: 1.15, mutatorCount: 1, unlock: { tierId: 3, level: 20 } }),
  Object.freeze({ level: 5,  name: "Magus",       description: "Reach level 20 on Conjurer to unlock.",                hpMult: 1.60, damageMult: 1.40, spawnMult: 1.20, goldMult: 1.20, mutatorCount: 1, unlock: { tierId: 4, level: 20 } }),
  Object.freeze({ level: 6,  name: "Sorcerer",    description: "Reach level 25 on Magus to unlock.",                   hpMult: 1.75, damageMult: 1.50, spawnMult: 1.25, goldMult: 1.25, mutatorCount: 2, unlock: { tierId: 5, level: 25 } }),
  Object.freeze({ level: 7,  name: "Archmage",    description: "Reach level 25 on Sorcerer to unlock.",                hpMult: 1.95, damageMult: 1.65, spawnMult: 1.30, goldMult: 1.30, mutatorCount: 2, unlock: { tierId: 6, level: 25 } }),
  Object.freeze({ level: 8,  name: "Voidcaller",  description: "Reach level 30 on Archmage to unlock.",                hpMult: 2.15, damageMult: 1.80, spawnMult: 1.35, goldMult: 1.35, mutatorCount: 2, unlock: { tierId: 7, level: 30 } }),
  Object.freeze({ level: 9,  name: "Eternal",     description: "Reach level 30 on Voidcaller to unlock.",              hpMult: 2.40, damageMult: 2.00, spawnMult: 1.40, goldMult: 1.40, mutatorCount: 3, unlock: { tierId: 8, level: 30 } }),
  Object.freeze({ level: 10, name: "Apotheosis",  description: "Reach level 35 on Eternal to unlock.",                 hpMult: 2.70, damageMult: 2.25, spawnMult: 1.50, goldMult: 1.50, mutatorCount: 3, unlock: { tierId: 9, level: 35 } }),
]);

export const SPELL_UNLOCK_LEVELS = Object.freeze({
  fireball: 5,
  frost_bolt: 10,
  poison_bolt: 15,
  chain_lightning: 20,
  meteor: 30,
});

export function getDifficultyTier(level) {
  const idx = Math.max(1, Math.min(10, Math.round(level || 1))) - 1;
  return DIFFICULTY_TIERS[idx];
}

export function getUnlockedSpells(tier, profile) {
  if (profile && Array.isArray(profile.unlockedSpells) && profile.unlockedSpells.length > 0) {
    return [...profile.unlockedSpells];
  }
  const spells = ["arcane_bolt"];
  return spells;
}

export function getNextLockedTier(profile) {
  const unlockedTiers = profile?.unlocks?.unlockedTiers || [1];
  for (const tier of DIFFICULTY_TIERS) {
    if (!unlockedTiers.includes(tier.level)) return tier;
  }
  return null;
}

export function getTierUnlockDescription(tier) {
  if (!tier.unlock) return null;
  const prereq = DIFFICULTY_TIERS[tier.unlock.tierId - 1];
  if (!prereq) return null;
  return `Reach level ${tier.unlock.level} on ${prereq.name} to unlock`;
}
