import { step, assert } from "../testHelpers.js";
import { LevelManager } from "../../level/LevelManager.js";
import { WAVE_MODIFIERS, pickWaveModifier } from "../../level/waveModifiers.js";

const VALID_ENEMY_TYPES = ["melee", "ranged", "dasher", "linebreaker", "mage", "elite", "twin_warden", "reaver", "sentinel"];

export default async function runLevelCompositionValidate(game, result) {
  await step(result, "LevelManager.composition — returns valid composition for levels 1-50", () => {
    const layouts = [null, "lanes", "cover", "gates", "rift", "cross"];
    for (let level = 1; level <= 50; level++) {
      for (const layout of layouts) {
        const world = { enemyManager: { onAllEnemiesDefeated: () => {}, aliveCount: 0 } };
        const lm = new LevelManager(world);
        const comp = lm.composition(level, layout);

        assert(Array.isArray(comp), `Level ${level} layout ${layout}: composition must be an array`);
        assert(comp.length > 0, `Level ${level} layout ${layout}: composition should not be empty`);

        let total = 0;
        for (const group of comp) {
          assert(typeof group.type === "string", `Level ${level}: group missing type`);
          assert(VALID_ENEMY_TYPES.includes(group.type), `Level ${level}: invalid enemy type "${group.type}"`);
          assert(typeof group.count === "number" && group.count > 0, `Level ${level}/${group.type}: count must be > 0`);
          total += group.count;
        }

        assert(total >= 3, `Level ${level} layout ${layout}: total enemies (${total}) too low`);
        assert(total <= 120, `Level ${level} layout ${layout}: total enemies (${total}) too high`);

        const types = comp.map((g) => g.type);
        const dupes = types.filter((t, i) => types.indexOf(t) !== i);
        assert(dupes.length === 0, `Level ${level}: duplicate types: ${[...new Set(dupes)].join(", ")}`);
      }
    }
  });

  await step(result, "LevelManager.composition — level gates respected", () => {
    const LEVEL_GATE = { melee: 1, ranged: 2, dasher: 3, linebreaker: 5, mage: 4 };
    for (const [type, gateLevel] of Object.entries(LEVEL_GATE)) {
      for (let level = 1; level < gateLevel; level++) {
        const world = { enemyManager: { onAllEnemiesDefeated: () => {}, aliveCount: 0 } };
        const lm = new LevelManager(world);
        const comp = lm.composition(level);
        const hasType = comp.some((g) => g.type === type);
        assert(!hasType, `Type "${type}" should not appear at level ${level} (gate: ${gateLevel})`);
      }
      const world = { enemyManager: { onAllEnemiesDefeated: () => {}, aliveCount: 0 } };
      const lm = new LevelManager(world);
      const comp = lm.composition(gateLevel);
      const hasType = comp.some((g) => g.type === type);
      assert(hasType, `Type "${type}" should appear at level ${gateLevel} (gate level)`);
    }
  });

  await step(result, "LevelManager.bossPattern — valid for all boss levels", () => {
    const bossLevels = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
    const seenIds = new Set();
    for (const level of bossLevels) {
      const world = { enemyManager: { onAllEnemiesDefeated: () => {} } };
      const lm = new LevelManager(world);
      const boss = lm.bossPattern(level);
      assert(!!boss, `Level ${level}: bossPattern returned null`);
      assert(Array.isArray(boss.comp), `Level ${level}: boss comp not an array`);
      assert(boss.comp.length > 0, `Level ${level}: boss comp empty`);
      for (const g of boss.comp) {
        assert(VALID_ENEMY_TYPES.includes(g.type), `Level ${level}: invalid boss type "${g.type}"`);
        assert(typeof g.count === "number" && g.count > 0, `Level ${level}: boss count must be > 0`);
      }
      assert(!!boss.meta, `Level ${level}: boss missing meta`);
      assert(typeof boss.meta.id === "string", `Level ${level}: meta.id must be string`);
      assert(typeof boss.meta.name === "string", `Level ${level}: meta.name must be string`);
      seenIds.add(boss.meta.id);
    }
    const expectedBosses = ["twin_wardens", "reaver", "sentinel"];
    for (const id of expectedBosses) {
      assert(seenIds.has(id), `Boss "${id}" was never generated across boss levels`);
    }
  });

  await step(result, "LevelManager.reset — resets state completely", () => {
    const world = {
      enemyManager: { onAllEnemiesDefeated: () => {}, aliveCount: 0 },
      currentBossPattern: { id: "test" },
      layoutEvents: { clear: () => {} },
      objectiveManager: { reset: () => {} },
    };
    const lm = new LevelManager(world);
    lm.level = 10;
    lm._enemiesComplete = true;
    lm._pendingGold = 500;
    lm.reset();
    assert(lm.level === 1, `Level should be 1 after reset, got ${lm.level}`);
    assert(lm._enemiesComplete === false, `_enemiesComplete should be false after reset`);
    assert(lm._pendingGold === 0, `_pendingGold should be 0 after reset`);
    assert(world.currentBossPattern === null, `currentBossPattern should be null after reset`);
  });

  await step(result, "WAVE_MODIFIERS — pickWaveModifier respects level gates", () => {
    for (let level = 1; level < 2; level++) {
      for (let i = 0; i < 20; i++) {
        const mod = pickWaveModifier(level);
        assert(mod === null, `Level ${level}: should not return modifier, got ${mod?.id}`);
      }
    }
    for (let level = 2; level <= 20; level++) {
      let sawNonElite = false;
      for (let i = 0; i < 100; i++) {
        const mod = pickWaveModifier(level);
        if (mod) {
          assert(mod.minLevel <= level, `Modifier "${mod.id}" minLevel ${mod.minLevel} > level ${level}`);
          if (mod.id !== "elite_vanguard") sawNonElite = true;
        }
      }
    }
  });

  await step(result, "WAVE_MODIFIERS — every modifier's applyEnemy works without error", () => {
    for (const mod of WAVE_MODIFIERS) {
      if (typeof mod.applyEnemy === "function") {
        const enemy = {
          speed: 5,
          health: { max: 100, current: 100, setMax: (v) => { enemy.health.max = v; enemy.health.current = v; } },
          _setEmissive: () => {},
        };
        try {
          mod.applyEnemy(enemy, 3);
        } catch (e) {
          assert(false, `${mod.id}.applyEnemy threw: ${e.message}`);
        }
        assert(typeof enemy.speed === "number", `${mod.id}.applyEnemy should leave speed as a number`);
      }
    }
  });
}
