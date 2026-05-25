export const WAVE_MODIFIERS = Object.freeze([
  Object.freeze({
    id: "swift_horde",
    name: "Swift Horde",
    description: "More bodies, faster movement.",
    minLevel: 2,
    weight: 3,
    goldMult: 1.12,
    modifyComposition(comp, level) {
      const out = comp.map((g) => ({ ...g }));
      const melee = out.find((g) => g.type === "melee");
      if (melee) melee.count += 1 + Math.floor(level / 4);
      if (level >= 4) out.push({ type: "dasher", count: 1 });
      return out;
    },
    applyEnemy(enemy) {
      enemy.speed *= 1.24;
    },
  }),
  Object.freeze({
    id: "armored",
    name: "Armored",
    description: "Enemies are tougher but slower and worth more gold.",
    minLevel: 2,
    weight: 3,
    goldMult: 1.22,
    applyEnemy(enemy) {
      enemy.health.setMax(Math.round(enemy.health.max * 1.35));
      enemy.speed *= 0.9;
      enemy._setEmissive?.(0x202030);
    },
  }),
  Object.freeze({
    id: "volatile",
    name: "Volatile",
    description: "Enemies burst when killed. Keep your spacing.",
    minLevel: 3,
    weight: 2,
    goldMult: 1.18,
    applyEnemy(enemy, level) {
      enemy.volatileExplosion = {
        radius: 4.2,
        damage: 8 + level * 1.2,
      };
    },
  }),
  Object.freeze({
    id: "regenerating",
    name: "Regenerating",
    description: "Enemies slowly heal, rewarding focus fire.",
    minLevel: 3,
    weight: 2,
    goldMult: 1.16,
    applyEnemy(enemy, level) {
      enemy.regenRate = 1.2 + level * 0.18;
      enemy._setEmissive?.(0x183b20);
    },
  }),
  Object.freeze({
    id: "elite_vanguard",
    name: "Elite Vanguard",
    description: "An extra elite anchors the wave.",
    minLevel: 4,
    weight: 1,
    goldMult: 1.08,
    modifyComposition(comp) {
      const out = comp.map((g) => ({ ...g }));
      out.push({ type: "elite", count: 1 });
      return out;
    },
  }),
]);

export function pickWaveModifier(level) {
  if (level < 2 || Math.random() < 0.35) return null;
  const eligible = WAVE_MODIFIERS.filter((m) => level >= m.minLevel);
  const total = eligible.reduce((sum, m) => sum + m.weight, 0);
  let roll = Math.random() * total;
  for (const mod of eligible) {
    roll -= mod.weight;
    if (roll <= 0) return mod;
  }
  return eligible[eligible.length - 1] || null;
}
