import * as THREE from "three";
import { ENEMY_CLASSES } from "./Enemy.js";

// Owns wave-level enemy tracking. Individual AI lives in the enemy classes.
// Fires onAllEnemiesDefeated exactly once per wave.
export class EnemyManager {
  constructor(world) {
    this.world = world;
    this.enemies = [];
    this.onAllEnemiesDefeated = null;
    this._waveActive = false;
    this._waveGold = 0;
    this._activeModifier = null;
  }

  aliveList() { return this.enemies.filter((e) => e.alive); }
  get aliveCount() { return this.aliveList().length; }

  _spawnPoint() {
    const half = this.world.arenaBounds.half - 3;
    for (let tries = 0; tries < 30; tries++) {
      const edge = Math.floor(Math.random() * 4);
      const t = (Math.random() * 2 - 1) * half;
      const p =
        edge === 0 ? { x: t, z: -half } :
        edge === 1 ? { x: t, z: half } :
        edge === 2 ? { x: -half, z: t } :
        { x: half, z: t };
      if (this.world.isArenaPointClear?.(p, 1.1) ?? true) return p;
    }
    return { x: 0, z: -half };
  }

  spawnWave(composition, level, modifier = null) {
    this.clearAll();
    this._waveActive = true;
    this._waveGold = 0;
    this._activeModifier = modifier;
    for (const grp of composition) {
      const Cls = ENEMY_CLASSES[grp.type];
      if (!Cls) continue;
      for (let i = 0; i < grp.count; i++) {
        const e = new Cls(this.world, level, this._spawnPoint());
        modifier?.applyEnemy?.(e, level, this.world);
        if (modifier?.goldMult) e.gold = Math.max(1, Math.round(e.gold * modifier.goldMult));
        this._waveGold += e.gold;
        this.enemies.push(e);
      }
    }
  }

  _nearbyPoint(anchor, dist = 2.5) {
    for (let tries = 0; tries < 6; tries++) {
      const ang = Math.random() * Math.PI * 2;
      const r = dist + Math.random() * 1.5;
      const p = { x: anchor.x + Math.cos(ang) * r, z: anchor.z + Math.sin(ang) * r };
      if (this.world.isArenaPointClear?.(p, 0.9) ?? true) return p;
    }
    return { x: anchor.x, z: anchor.z };
  }

  // Mid-wave spawn (e.g. Sentinel minion respawn). Replays the active wave
  // modifier so the spawned enemy is consistent with its peers, and bumps
  // _waveGold so the eventual payout reflects the extra kill.
  spawnExtra(Cls, level, anchor) {
    if (!this._waveActive) return null;
    const spawn = this._nearbyPoint(anchor, 2.5);
    const e = new Cls(this.world, level, spawn);
    this._activeModifier?.applyEnemy?.(e, level, this.world);
    if (this._activeModifier?.goldMult) e.gold = Math.max(1, Math.round(e.gold * this._activeModifier.goldMult));
    this._waveGold += e.gold;
    this.enemies.push(e);
    return e;
  }

  onEnemyDead(enemy) {
    this.world.runStats.registerKill();
    if (this._waveActive && this.aliveCount === 0) {
      this._waveActive = false;
      const gold = this._waveGold;
      this._waveGold = 0;
      this.onAllEnemiesDefeated?.(gold);
    }
  }

  update(dt) {
    for (const e of this.enemies) e.update(dt);
    // Cull removed.
    if (this.enemies.length > 60) this.enemies = this.enemies.filter((e) => e.alive);
  }

  clearAll() {
    for (const e of this.enemies) e.forceRemove();
    this.enemies = [];
    this._waveActive = false;
    this._waveGold = 0;
    this._activeModifier = null;
  }
}
