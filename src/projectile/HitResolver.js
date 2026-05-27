import * as THREE from "three";
import { applyDamage } from "../core/Damage.js";
import { applyPlayerDamage, armParryDynamo } from "../core/CombatBonuses.js";
import { Projectile } from "./Projectile.js";
import { makeRedirectSpell } from "../player/Block.js";

// Owns ALL collision + effect resolution for projectiles. Every damage branch
// (direct, AoE, DOT seed, split) is routed through core/Damage.applyDamage.
export class HitResolver {
  constructor(world) {
    this.world = world;
    this.projectiles = [];
    this._poolSeq = 0;
  }

  add(p) { this.projectiles.push(p); }
  clear() {
    for (const p of this.projectiles) p.expire(false);
    this.projectiles.length = 0;
  }

  _source(spell, faction, extra = {}) {
    return {
      owner: faction,
      spellId: spell.definitionId,
      spellName: spell.displayName,
      isDot: false, isAoe: false, isChain: false,
      ...extra,
    };
  }

  update(dt) {
    const world = this.world;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const before = p.position.clone();
      p.update(dt);
      if (p.alive) {
        if (p.cadenceStacks !== undefined && p.cadenceStacks > 0) {
          p.cadenceTimer -= dt;
          if (p.cadenceTimer <= 0) p.cadenceStacks = 0;
        }
        const wallHit = world.segmentHitsArenaObstacle?.(before, p.position, p.radius * 0.55);
        if (wallHit) this._vsArena(p, wallHit.point);
        if (p.alive) {
          if (p.faction === "player") this._vsEnemies(p);
          else this._vsPlayer(p);
        }
      }
      if (!p.alive) {
        this._onProjectileExpired(p);
        this.projectiles.splice(i, 1);
      }
    }
  }

  _vsArena(p, point) {
    p.mesh.position.copy(point);
    const s = p.spell;
    if (s.castType === "projectile_aoe") {
      this._explode(point.clone(), s, p.faction);
      this.world.audio.explosion();
    } else {
      this._impact(point, s, p);
    }
    p.expire(true);
  }

  _vsEnemies(p) {
    const targets = [
      ...this.world.getEnemies(),
      ...(this.world.getObjectiveTargets?.() || []),
    ];
    for (const e of targets) {
      if (!e.alive || p.hitSet.has(e)) continue;
      const d = p.position.distanceTo(e.position);
      if (d <= p.radius + e.radius) {
        this._onEnemyHit(p, e);
        if (!p.alive) return;
      }
    }
  }

  _onProjectileExpired(p) {
    if (p._capstoneExpired) return;
    p._capstoneExpired = true;
    if (p.faction === "player" && p.spell.glacialLance) {
      this._glacialSlowZone((p.expiredAt || p.position).clone(), p.spell);
    }
  }

  _onEnemyHit(p, enemy) {
    const s = p.spell;
    const ct = s.castType;
    p.hitSet.add(enemy);

    if (ct === "projectile_aoe") {
      this._explode(p.position.clone(), s, "player");
      this.world.audio.explosion();
      p.expire(true);
      return;
    }

    // Direct hit damage (with cadence bonus for arcane bolt).
    let damage = s.stats.damage;
    if (s.stats.cadenceStacks && p.cadenceStacks !== undefined) {
      p.cadenceStacks = Math.min(p.cadenceStacks + 1, s.stats.cadenceMaxStacks);
      p.cadenceTimer = s.stats.cadenceDecayTime;
      damage += p.cadenceStacks * s.stats.cadenceDamagePerStack;
    }
    applyPlayerDamage(this.world, enemy, damage, this._source(s, "player"));
    this.world.audio.enemyHit();
    this._impact(p.position, s, p);

    if (s.chillStacks) {
      const wasMax = enemy.chillStacks >= enemy.chillMaxStacks;
      enemy.applyChill(1, 2.5);
      if (wasMax && s.shatterDamage > 0) {
        const pos = enemy.position.clone();
        applyPlayerDamage(this.world, enemy, s.shatterDamage, this._source(s, "player"));
        this.world.vfx.shock(pos, 0x5cc8ff, s.shatterRadius, 0.35);
        this.world.vfx.burst(pos, 0xdff8ff, 18, 7, 0.48, 0.14);
        enemy.chillStacks = 0;
      }
    } else if (s.freeze) {
      enemy.applyFreeze(1.0);
    } else if (s.stats.slowAmount > 0) {
      enemy.applySlow(s.stats.slowAmount, s.stats.slowDuration);
    }
    if (s.knockbackOnHit) this._knockback(enemy, p.dir, 3);
    if (s.frostNovaOnHit) this._frostNova(p.position.clone(), enemy);
    if (s.stats.dotDamage > 0) {
      const dotSrc = this._source(s, "player", { isDot: true });
      enemy.applyDot(s.stats.dotDamage, s.stats.dotDuration, s.stats.dotTickRate, dotSrc);
      // Pandemic (capstone) supersedes Contagion: seed the DOT on every
      // alive enemy within 4m of the primary target, not just one jump.
      if (s.pandemicSpread) {
        for (const other of this.world.getEnemies()) {
          if (other === enemy || !other.alive) continue;
          if (other.position.distanceTo(enemy.position) <= 4) {
            other.applyDot(s.stats.dotDamage, s.stats.dotDuration, s.stats.dotTickRate, dotSrc);
          }
        }
      } else if (s.contagion) {
        // Contagion: spread the DOT once to the nearest other enemy. Only the
        // directly-hit enemy spreads (no spread-from-spread) -> naturally capped.
        const near = this._nearestOther(enemy, 6);
        if (near) {
          near.applyDot(s.stats.dotDamage, s.stats.dotDuration, s.stats.dotTickRate, dotSrc);
          this.world.vfx.mist(near.position.clone(), 0x66dd55, 1.5, 0.7, 12);
        }
      }
    }

    // Arcane Cascade (capstone): one extra bolt on kill. _cascaded guard on
    // the cascade projectile prevents infinite chains.
    if (!enemy.alive && s.cascadeOnKill && !p._cascaded) {
      this._spawnCascade(p, enemy.position.clone());
    }

    // Split: spawn fragments on first impact.
    if (s.stats.splitCount > 0 && !p._didSplit) {
      p._didSplit = true;
      this._spawnSplits(p);
    }

    if (p.pierceLeft > 0) { p.pierceLeft -= 1; return; }
    p.expire(true);
  }

  _spawnCascade(p, fromPos) {
    let target = null, bd = 18;
    for (const e of this.world.getEnemies()) {
      if (!e.alive) continue;
      const d = e.position.distanceTo(fromPos);
      if (d < bd) { bd = d; target = e; }
    }
    if (!target) return;
    const dir = target.position.clone().sub(fromPos);
    dir.y = 0;
    if (dir.lengthSq() < 1e-4) return;
    dir.normalize();
    const cascade = new Projectile(this.world, p.spell, fromPos, dir, "player");
    cascade._cascaded = true;
    this.add(cascade);
    this.world.vfx.flash?.(fromPos, p.spell.color, 0.9, 0.18);
  }

  _spawnSplits(p) {
    const n = p.spell.stats.splitCount;
    const base = p.dir.clone();
    for (let k = 0; k < n; k++) {
      const ang = (k - (n - 1) / 2) * 0.32;
      const dir = base.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), ang);
      const frag = new (p.constructor)(this.world, p.spell, p.position.clone(), dir, "player");
      frag.maxRange = p.spell.stats.range * 0.5;
      frag._didSplit = true;
      frag.spell = Object.assign(Object.create(Object.getPrototypeOf(p.spell)), p.spell);
      frag.spell.stats = { ...p.spell.stats, splitCount: 0, damage: p.spell.stats.damage * 0.5 };
      this.add(frag);
    }
  }

  _nearestOther(enemy, radius) {
    let best = null, bd = radius;
    for (const e of this.world.getEnemies()) {
      if (e === enemy || !e.alive) continue;
      const d = e.position.distanceTo(enemy.position);
      if (d <= bd) { bd = d; best = e; }
    }
    return best;
  }

  _burnPatch(pos, spell) {
    const r = spell.stats.areaRadius || 5;
    const burnMult = spell.cinderPotency ? 1.25 : 1;
    const per = Math.max(2, Math.round(spell.stats.damage * 0.22 * burnMult));
    const src = this._source(spell, "player", { isDot: true, isAoe: true });
    this.world.vfx.ring(pos, r * 0.8, spell.color, 1.9);
    for (let k = 1; k <= 3; k++) {
      this.world.after(0.6 * k, () => {
        this.world.vfx.flash(pos, spell.color, r * 0.6, 0.2);
        for (const e of this.world.getEnemies()) {
          if (!e.alive) continue;
          if (e.position.distanceTo(pos) <= r + e.radius) applyPlayerDamage(this.world, e, per, src);
        }
      });
    }
  }

  _dotPool(pos, spell, opts) {
    const r = opts.radius;
    const per = opts.perTick;
    const duration = opts.duration;
    const tickEvery = opts.tickEvery || 0.5;
    const color = opts.color || spell.color;
    const pulseCount = Math.ceil(duration / tickEvery);
    const poolId = `${spell.definitionId}_pool_${++this._poolSeq}`;
    const src = this._source(spell, "player", { isDot: true, isAoe: true, poolId });

    pos.y = 0;
    this.world.vfx.ring(pos, r, color, duration);
    for (let k = 0; k <= pulseCount; k++) {
      this.world.after(tickEvery * k, () => {
        this.world.vfx.flash(pos, color, r * 0.18, 0.16);
        this.world.vfx.mist?.(pos, color, r * 0.38, 0.45, 8);
        for (const e of this.world.getEnemies()) {
          if (!e.alive) continue;
          if (e.position.distanceTo(pos) > r + e.radius) continue;
          const alreadyTicking = e.dots?.some((d) => d.source?.poolId === poolId);
          if (!alreadyTicking) e.applyDot(per, tickEvery + 0.06, tickEvery, src);
        }
      });
    }
  }

  _conflagrationPool(pos, spell) {
    const r = Math.max(4.5, (spell.stats.areaRadius || 5) * 0.78);
    const per = Math.max(2, Math.round(spell.stats.damage * 0.12));
    this._dotPool(pos, spell, {
      radius: r,
      perTick: per,
      duration: 3.0,
      tickEvery: 0.5,
      color: 0xff8a30,
    });
  }

  _cataclysmPool(pos, spell) {
    const r = spell.stats.areaRadius || 8;
    const per = Math.max(3, Math.round(spell.stats.damage * 0.08));
    this._dotPool(pos, spell, {
      radius: r,
      perTick: per,
      duration: 3.0,
      tickEvery: 0.5,
      color: 0xff5530,
    });
  }

  _glacialSlowZone(pos, spell) {
    const r = 4;
    const duration = 2.0;
    const tickEvery = 0.35;
    const pulseCount = Math.ceil(duration / tickEvery);
    pos.y = 0;
    this.world.vfx.ring(pos, r, 0xbdefff, duration);
    this.world.vfx.shock(pos, 0x5cc8ff, r, 0.35);
    for (let k = 0; k <= pulseCount; k++) {
      this.world.after(tickEvery * k, () => {
        this.world.vfx.flash(pos, 0xdff8ff, r * 0.16, 0.12);
        for (const e of this.world.getEnemies()) {
          if (!e.alive) continue;
          if (e.position.distanceTo(pos) <= r + e.radius) {
            e.applySlow(Math.max(0.6, spell.stats.slowAmount || 0), 0.75);
          }
        }
      });
    }
  }

  _knockback(enemy, dir, dist) {
    if (enemy.immovable) return;
    const v = dir.clone();
    v.y = 0;
    if (v.lengthSq() < 1e-4) return;
    v.normalize().multiplyScalar(dist);
    const lim = this.world.arenaBounds.half - enemy.radius;
    enemy.mesh.position.x = THREE.MathUtils.clamp(enemy.mesh.position.x + v.x, -lim, lim);
    enemy.mesh.position.z = THREE.MathUtils.clamp(enemy.mesh.position.z + v.z, -lim, lim);
  }

  _frostNova(pos, source) {
    const r = 5;
    this.world.vfx.shock(pos, 0x5cc8ff, r, 0.4);
    for (const e of this.world.getEnemies()) {
      if (!e.alive || e === source) continue;
      if (e.position.distanceTo(pos) <= r + e.radius) {
        e.applySlow(0.4, 1.5);
      }
    }
  }

  _impact(pos, spell, projectile = null) {
    const id = spell.definitionId;
    if (id === "arcane_bolt") {
      this.world.vfx.shock(pos, spell.color, 1.8, 0.24);
      this.world.vfx.burst(pos, spell.color, 14, 8, 0.34, 0.16);
      if (projectile && projectile.cadenceStacks >= 3) {
        this.world.vfx.burst(pos, 0xf2eaff, 20, 10, 0.5, 0.12);
      }
    } else if (id === "frost_bolt") {
      this.world.vfx.shock(pos, 0xbdefff, 2.2, 0.34);
      this.world.vfx.burst(pos, 0xdff8ff, 18, 7, 0.48, 0.14);
      this.world.vfx.flash(pos, spell.color, 0.55, 0.18);
    } else if (id === "poison_bolt") {
      this.world.vfx.mist(pos, spell.color, 1.9, 0.95, 18);
      this.world.vfx.burst(pos, 0xb6ff76, 12, 4.5, 0.45, 0.16);
    } else {
      this.world.vfx.burst(pos, spell.color, 12, 7, 0.35);
    }
  }

  _explodeVisual(pos, spell, radius) {
    const id = spell.definitionId;
    if (id === "fireball") {
      this.world.vfx.shock(pos, 0xff7a33, radius, 0.42);
      this.world.vfx.flash(pos, 0xffd36a, radius * 0.34, 0.18);
      this.world.vfx.burst(pos, 0xff7a33, 30, 13, 0.62, 0.24);
      this.world.vfx.burst(pos, 0xffd36a, 14, 9, 0.42, 0.18);
    } else if (id === "meteor") {
      this.world.vfx.shock(pos, 0xff5530, radius * 1.08, 0.58);
      this.world.vfx.flash(pos, 0xffc45a, radius * 0.48, 0.2);
      this.world.vfx.burst(pos, 0xff6a2a, 38, 16, 0.72, 0.26);
      this.world.vfx.mist(pos, 0x3b3340, radius * 0.42, 1.1, 20);
    } else {
      this.world.vfx.shock(pos, spell.color, radius, 0.45);
      this.world.vfx.burst(pos, spell.color, 26, 12, 0.6, 0.24);
    }
  }

  _explode(pos, spell, faction) {
    const r = spell.stats.areaRadius || 5;
    this._explodeVisual(pos, spell, r);
    const src = this._source(spell, faction, { isAoe: true });
    if (faction === "player") {
      const targets = [
        ...this.world.getEnemies(),
        ...(this.world.getObjectiveTargets?.() || []),
      ];
      for (const e of targets) {
        if (!e.alive) continue;
        const d = e.position.distanceTo(pos);
        if (d <= r + e.radius) {
          const falloff = 1 - Math.min(1, d / (r + e.radius)) * 0.5;
          applyPlayerDamage(this.world, e, spell.stats.damage * falloff, src);
          if (spell.stats.slowAmount > 0) e.applySlow(spell.stats.slowAmount, spell.stats.slowDuration);
          if (spell.knockbackOnHit) {
            const out = e.position.clone().sub(pos);
            out.y = 0;
            if (out.lengthSq() < 1e-4) out.set(1, 0, 0);
            this._knockback(e, out, 3);
          }
          // Cataclysm (meteor capstone): hard-stun every enemy in the
          // primary crater for 1s.
          if (spell.cataclysm) e.applyStun?.(1.0);
        }
      }
      if (spell.burnPatch) this._burnPatch(pos.clone(), spell);
      if (spell.conflagrationPool) this._conflagrationPool(pos.clone(), spell);
      if (spell.cataclysm) this._cataclysmPool(pos.clone(), spell);
    } else {
      const pl = this.world.player;
      if (pl.position.distanceTo(pos) <= r + pl.radius) {
        applyDamage(pl, spell.stats.damage, src);
        this.world.onPlayerHurt?.();
      }
    }
  }

  // Perfect block: negate the hit and fling a player-owned bolt back at the
  // nearest enemy (or mirror the incoming path). Routed through applyDamage
  // with a stable "redirect" source so it shows up in RunStats.
  _redirect(p) {
    const pl = this.world.player;
    let target = null, bd = Infinity;
    for (const e of this.world.getEnemies()) {
      if (!e.alive) continue;
      const d = e.position.distanceTo(pl.position);
      if (d < bd) { bd = d; target = e; }
    }
    const origin = p.position.clone();
    const dir = target
      ? target.position.clone().sub(origin).normalize()
      : p.dir.clone().negate();
    const rs = makeRedirectSpell(Math.max(20, Math.round(p.spell.stats.damage * 2.0)));
    this.add(new Projectile(this.world, rs, origin, dir, "player"));
    armParryDynamo(this.world);
    this.world.onCombatProc?.("Perfect block");
    this.world.vfx.shock(origin, 0x9a6cff, 3, 0.35);
    this.world.audio.enemyHit?.();
  }

  _vsPlayer(p) {
    const pl = this.world.player;
    if (pl.health.isDead) { p.expire(false); return; }
    if (p.position.distanceTo(pl.position) <= p.radius + pl.radius) {
      const blk = pl.block;
      if (blk && blk.perfectActive()) {
        blk.notePerfect();
        this._redirect(p);
        p.expire(true);
        return;
      }
      if (p.spell.castType === "projectile_aoe") {
        this._explode(p.position.clone(), p.spell, "enemy");
        this.world.audio.explosion();
      } else {
        applyDamage(pl, p.spell.stats.damage, this._source(p.spell, "enemy"));
        this.world.onPlayerHurt?.();
      }
      p.expire(true);
    }
  }

  // Public: meteor delayed AoE (called by Effects).
  groundExplode(pos, spell, faction) {
    this._explode(pos, spell, faction);
    this.world.audio.explosion();
  }
}
