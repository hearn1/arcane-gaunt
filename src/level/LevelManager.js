import { pickWaveModifier } from "./waveModifiers.js";

// Per-layout archetype shifts. Each pair is applied to the base composition
// (negatives clamped at 0, positives only added to archetypes whose level gate
// is already met). Net deltas stay within ±2 enemies per wave.
const LAYOUT_BIAS = {
  lanes: { dasher: +1, linebreaker: +1, ranged: -1, mage: -1 },
  cover: { ranged: +1, mage: +1, melee: -2 },
  gates: { melee: +2, dasher: +1, ranged: -2, linebreaker: -1 },
  rift:  { dasher: +1, linebreaker: +1, melee: -2, ranged: -1 },
  cross: {},
};

// Level gates must match composition() below so we don't add an archetype that
// the level wouldn't normally include.
const LEVEL_GATE = { melee: 1, ranged: 2, dasher: 3, linebreaker: 5, mage: 4 };

function applyLayoutBias(comp, layoutName, level) {
  // Early waves don't expose all archetypes yet (linebreaker/mage unlock at 4),
  // so a layout shift that adds those types would just disappear while the
  // negatives applied — drifting total counts beyond the 10% budget. Keep the
  // first few waves layout-neutral and let mix vary once archetypes are live.
  if (level < 4) return comp;
  const shift = LAYOUT_BIAS[layoutName];
  if (!shift) return comp;
  const out = comp.map((g) => ({ ...g }));
  const byType = new Map(out.map((g) => [g.type, g]));

  for (const [type, delta] of Object.entries(shift)) {
    if (delta >= 0) continue;
    const g = byType.get(type);
    if (!g) continue;
    g.count = Math.max(0, g.count + delta);
  }
  for (const [type, delta] of Object.entries(shift)) {
    if (delta <= 0) continue;
    if ((LEVEL_GATE[type] || 99) > level) continue;
    let g = byType.get(type);
    if (!g) {
      g = { type, count: 0 };
      out.push(g);
      byType.set(type, g);
    }
    g.count += delta;
  }
  return out.filter((g) => g.count > 0);
}

// Tracks the current level, builds wave composition, and drives the
// clear -> gold -> reward -> next-wave flow. Level 1 is NOT counted cleared on
// spawn; a level only counts as cleared once its wave is defeated.
export class LevelManager {
  constructor(world) {
    this.world = world;
    this.level = 1;
    this._enemiesComplete = false;
    this._pendingGold = 0;
    this.world.enemyManager.onAllEnemiesDefeated = (gold) => this._onEnemiesDefeated(gold);
  }

  reset() {
    this.level = 1;
    this.world.currentBossPattern = null;
    this._enemiesComplete = false;
    this._pendingGold = 0;
    this.world.layoutEvents?.clear();
    this.world.objectiveManager?.reset();
  }

  startRun() {
    this.level = 1;
    this._spawn();
  }

  composition(level, layoutName = null) {
    const comp = [];
    const melee = 4 + Math.floor(level * 0.8);
    comp.push({ type: "melee", count: melee });
    if (level >= 2) {
      const ranged = 1 + Math.floor((level - 1) * 0.4);
      comp.push({ type: "ranged", count: ranged });
    }
    if (level >= 3) {
      const dasher = 1 + Math.floor((level - 3) * 0.4);
      comp.push({ type: "dasher", count: dasher });
    }
    if (level >= 5) comp.push({ type: "linebreaker", count: 1 + Math.floor((level - 5) / 5) });
    if (level >= 4) comp.push({ type: "mage", count: 1 + Math.floor((level - 4) * 0.3) });
    return applyLayoutBias(comp, layoutName, level);
  }

  // Boss mini-patterns rotate every fifth level. idx 1 = Twin Wardens (lvl 5, 20...),
  // idx 2 = Reaver (lvl 10, 25...), idx 0 = Sentinel (lvl 15, 30...).
  bossPattern(level) {
    const idx = Math.floor(level / 5) % 3;
    if (idx === 1) return {
      comp: [{ type: "twin_warden", count: 2 }],
      meta: { id: "twin_wardens", name: "TWIN WARDENS", subtitle: "Sync casters — kill one, the other rages" },
    };
    if (idx === 2) return {
      comp: [{ type: "reaver", count: 1 }],
      meta: { id: "reaver", name: "THE REAVER", subtitle: "Wide surge dash on a long fuse" },
    };
    return {
      comp: [{ type: "sentinel", count: 1 }],
      meta: { id: "sentinel", name: "SENTINEL", subtitle: "Kill the elite to stop the spawns" },
    };
  }

  _spawn() {
    this._enemiesComplete = false;
    this._pendingGold = 0;
    this.world.layoutEvents?.clear();
    this.world.objectiveManager?.clear();
    this.world.hitResolver.clear(); // drop stale projectiles from prior wave
    const modifier = pickWaveModifier(this.level);
    this.world.currentWaveModifier = modifier;
    let comp;
    let objective = null;
    if (this.level % 5 === 0) {
      const boss = this.bossPattern(this.level);
      this.world.currentBossPattern = boss.meta;
      comp = boss.comp; // skip layout bias + modifier composition tweaks for boss waves
    } else {
      this.world.currentBossPattern = null;
      const baseComp = this.composition(this.level, this.world.arenaLayoutName);
      comp = modifier?.modifyComposition ? modifier.modifyComposition(baseComp, this.level) : baseComp;
    }
    this.world.enemyManager.spawnWave(comp, this.level, modifier);
    if (!this.world.currentBossPattern) {
      objective = this.world.objectiveManager?.startForWave(this.level, this.world.arenaLayoutName) || null;
    }
    if (this.world.currentBossPattern?.id === "twin_wardens") this._linkTwinWardens();
    this.world.onWaveStarted?.(this.level, modifier, this.world.currentBossPattern, objective);
  }

  _linkTwinWardens() {
    const twins = this.world.enemyManager.enemies.filter((e) => e.constructor.name === "TwinWardenElite");
    if (twins.length === 2) {
      twins[0].partner = twins[1];
      twins[1].partner = twins[0];
    }
  }

  _onEnemiesDefeated(gold) {
    this._enemiesComplete = true;
    this._pendingGold = gold;
    this._tryCompleteWave();
  }

  _onObjectiveComplete() {
    this._tryCompleteWave();
  }

  _tryCompleteWave() {
    if (this.world.isPlayerAlive && !this.world.isPlayerAlive()) return;
    if (!this._enemiesComplete) return;
    if (this.world.objectiveManager && !this.world.objectiveManager.isComplete()) return;
    const gold = this._pendingGold;
    this._pendingGold = 0;
    this._enemiesComplete = false;
    this._onCleared(gold);
  }

  _onCleared(gold) {
    if (this.world.isPlayerAlive && !this.world.isPlayerAlive()) return;
    this.world.objectiveManager?.clear();
    this.world.layoutEvents?.clear();
    this.world.currency.add(gold);
    this.world.runStats.registerLevelCleared();
    this.world.audio.waveClear();
    // "This wave only" service flags expire at the wave-end boundary.
    if (this.world.combat) this.world.combat.perfectHealNext = 0;
    this.world.openReward(this.level, gold); // pauses combat; resumes via continueAfterReward
  }

  continueAfterReward() {
    if (this.world.isPlayerAlive && !this.world.isPlayerAlive()) return;
    this.level += 1;
    this._spawn();
  }
}
