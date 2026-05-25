import { RARITIES, spellBuffsFor, playerRewards, relicRewards, spellUnlockRewards } from "./rewardDefinitions.js";

// Builds the eligible reward pool and picks N distinct choices. No rendering
// here; UI consumes the returned instances. Spell rewards come only from the
// current manual spell. Auto-cast spells remain upgradeable through gold trees,
// but reward cards stay focused so adding passives does not flood the draft.
export class RewardGenerator {
  constructor(world) { this.world = world; }

  _pool() {
    const w = this.world;
    const pool = [];
    if (w.caster.current) {
      for (const r of spellBuffsFor(w.caster.current)) pool.push(r);
    }
    for (const r of playerRewards(w)) pool.push(r);
    for (const r of relicRewards(w)) pool.push(r);
    for (const r of spellUnlockRewards(w)) pool.push(r);
    return pool;
  }

  generate(count = 3) {
    const pool = this._pool();
    const chosen = [];
    const seen = new Set();

    const level = this.world.levelManager?.level || 1;
    const unlocks = pool.filter((r) => r.type === "Spell Unlock");
    if (unlocks.length && Math.random() < 0.55) {
      const unlock = weightedPick(unlocks);
      if (unlock) {
        chosen.push(unlock);
        seen.add(unlock.id);
      }
    }

    if (level >= 3 && Math.random() < 0.24) {
      const rares = pool.filter((r) => (r.rarity || "common") === "rare" && !seen.has(r.id));
      const rare = weightedPick(rares);
      if (rare) {
        chosen.push(rare);
        seen.add(rare.id);
      }
    }

    while (chosen.length < count) {
      const options = pool.filter((r) => !seen.has(r.id));
      if (!options.length) break;
      const r = weightedPick(options);
      if (!r) break;
      seen.add(r.id);
      chosen.push(r);
    }
    return chosen; // may have fewer than `count` if the pool is small
  }
}

function weightedPick(pool) {
  const total = pool.reduce((sum, r) => sum + (RARITIES[r.rarity || "common"]?.weight || 1), 0);
  let roll = Math.random() * total;
  for (const r of pool) {
    roll -= RARITIES[r.rarity || "common"]?.weight || 1;
    if (roll <= 0) return r;
  }
  return pool[pool.length - 1] || null;
}
