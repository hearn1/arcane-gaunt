// Per-enemy variants that layer on top of base archetypes to add visual and
// mechanical variety as runs progress. Independent of WAVE_MODIFIERS.
//
// Variants begin appearing at wave 6 (after the first boss wave at wave 5).
// Chance formula: min(0.45, 0.10 + (wave - 6) * 0.025).
// At most one variant per enemy; boss enemies are never eligible.

export const ENEMY_VARIANTS = Object.freeze([
  Object.freeze({
    id: "fast",
    name: "Fast",
    description: "Smaller hitbox, higher speed, lower HP.",
    applyEnemy(enemy) {
      const s = 0.78;
      enemy.radius *= s;
      enemy.eyeH *= s;
      enemy.mesh.scale.multiplyScalar(s);
      enemy.speed *= 1.45;
      enemy.health.setMax(Math.round(enemy.health.max * 0.70));
      enemy._baseEmissive = 0x0a6688;
      enemy._setEmissive?.(0x0a6688);
    },
  }),
  Object.freeze({
    id: "brute",
    name: "Brute",
    description: "Larger hitbox, higher HP, slower speed, harder melee hit.",
    applyEnemy(enemy) {
      const s = 1.28;
      enemy.radius *= s;
      enemy.eyeH *= s;
      enemy.mesh.scale.multiplyScalar(s);
      enemy.speed *= 0.72;
      enemy.health.setMax(Math.round(enemy.health.max * 1.65));
      if (enemy.touchDamage > 0) enemy.touchDamage = Math.round(enemy.touchDamage * 1.40);
      enemy._baseEmissive = 0x703010;
      enemy._setEmissive?.(0x703010);
    },
  }),
  Object.freeze({
    id: "rapid",
    name: "Rapid",
    description: "Faster attack cadence; reduced damage per shot.",
    applyEnemy(enemy) {
      enemy.fireCdMult = 0.55;
      enemy.shotDamageMult = 0.60;
      enemy._baseEmissive = 0x886600;
      enemy._setEmissive?.(0x886600);
    },
  }),
  Object.freeze({
    id: "armored",
    name: "Armored",
    description: "Heavy plating grants extra effective HP at the cost of speed.",
    applyEnemy(enemy) {
      enemy.health.setMax(Math.round(enemy.health.max * 1.80));
      enemy.speed *= 0.78;
      enemy._baseEmissive = 0x304828;
      enemy._setEmissive?.(0x304828);
    },
  }),
]);

export function pickEnemyVariant(wave) {
  if (wave < 6) return null;
  const chance = Math.min(0.45, 0.10 + (wave - 6) * 0.025);
  if (Math.random() >= chance) return null;
  return ENEMY_VARIANTS[Math.floor(Math.random() * ENEMY_VARIANTS.length)];
}
