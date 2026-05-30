import { step, assert } from "../testHelpers.js";
import { ENEMY_VARIANTS, pickEnemyVariant } from "../../enemies/enemyVariants.js";

export default async function runEnemyVariantsValidate(_game, result) {
  await step(result, "ENEMY_VARIANTS — required shape for all variants", () => {
    assert(Array.isArray(ENEMY_VARIANTS), "ENEMY_VARIANTS must be an array");
    assert(ENEMY_VARIANTS.length >= 4, `Expected at least 4 variants, got ${ENEMY_VARIANTS.length}`);
    const ids = [];
    for (const v of ENEMY_VARIANTS) {
      assert(typeof v.id === "string" && v.id.length > 0, "Variant missing id");
      assert(typeof v.name === "string" && v.name.length > 0, `${v.id} missing name`);
      assert(typeof v.description === "string" && v.description.length > 0, `${v.id} missing description`);
      assert(typeof v.applyEnemy === "function", `${v.id} missing applyEnemy`);
      ids.push(v.id);
    }
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    assert(dupes.length === 0, `Duplicate variant ids: ${[...new Set(dupes)].join(", ")}`);
    const required = ["fast", "brute", "rapid", "armored"];
    for (const id of required) {
      assert(ids.includes(id), `Required variant "${id}" not found in ENEMY_VARIANTS`);
    }
  });

  await step(result, "ENEMY_VARIANTS — applyEnemy runs without error on mock enemy", () => {
    for (const v of ENEMY_VARIANTS) {
      const enemy = {
        isBoss: false,
        radius: 0.6,
        eyeH: 1.0,
        speed: 5.0,
        touchDamage: 8,
        fireCdMult: 1,
        shotDamageMult: 1,
        _baseEmissive: 0x000000,
        mesh: { scale: { multiplyScalar(f) { this._s = (this._s || 1) * f; } } },
        health: {
          max: 100,
          current: 100,
          setMax(v) { this.max = v; this.current = Math.min(this.current, v); },
        },
        _setEmissive: () => {},
      };
      try {
        v.applyEnemy(enemy);
      } catch (e) {
        assert(false, `${v.id}.applyEnemy threw: ${e.message}`);
      }
      assert(typeof enemy.radius === "number" && enemy.radius > 0, `${v.id}: radius must remain > 0`);
      assert(typeof enemy.speed === "number" && enemy.speed > 0, `${v.id}: speed must remain > 0`);
      assert(typeof enemy.health.max === "number" && enemy.health.max > 0, `${v.id}: health.max must remain > 0`);
    }
  });

  await step(result, "pickEnemyVariant — never returns a variant before wave 6", () => {
    for (let wave = 0; wave <= 5; wave++) {
      for (let i = 0; i < 200; i++) {
        const v = pickEnemyVariant(wave);
        assert(v === null, `Wave ${wave}: expected null, got variant "${v?.id}"`);
      }
    }
  });

  await step(result, "pickEnemyVariant — returns eligible variants from wave 6 onward", () => {
    const waves = [6, 10, 15, 20, 30, 50];
    for (const wave of waves) {
      let sawVariant = false;
      for (let i = 0; i < 300; i++) {
        const v = pickEnemyVariant(wave);
        if (v !== null) {
          sawVariant = true;
          assert(
            ENEMY_VARIANTS.some((ev) => ev.id === v.id),
            `Wave ${wave}: returned unknown variant id "${v.id}"`
          );
        }
      }
      assert(sawVariant, `Wave ${wave}: never saw a variant in 300 rolls (chance should be > 0)`);
    }
  });

  await step(result, "pickEnemyVariant — chance stays bounded at max 0.45", () => {
    // At wave 6: chance = 0.10; at very high waves it must cap at 0.45.
    // Verify that across 1000 rolls at wave 100, well under 600 are non-null
    // (i.e. the cap is holding — 0.45 would yield ~450 non-null on average).
    let hits = 0;
    for (let i = 0; i < 1000; i++) {
      if (pickEnemyVariant(100) !== null) hits++;
    }
    assert(hits <= 600, `Wave 100: variant hit rate too high (${hits}/1000), cap may be broken`);
    assert(hits >= 250, `Wave 100: variant hit rate suspiciously low (${hits}/1000) at cap 0.45`);
  });

  await step(result, "pickEnemyVariant — bosses must be excluded by caller (isBoss check)", () => {
    // The boss exclusion lives in EnemyManager.spawnWave; verify the contract
    // is documented by confirming variant ids never include 'twin_warden', 'reaver', 'sentinel'.
    const bossTypes = new Set(["twin_warden", "reaver", "sentinel"]);
    for (const v of ENEMY_VARIANTS) {
      assert(!bossTypes.has(v.id), `Variant id "${v.id}" clashes with a boss type name`);
    }
  });
}
