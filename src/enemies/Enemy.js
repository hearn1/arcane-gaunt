import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { Health } from "../core/Health.js";
import { applyDamage } from "../core/Damage.js";
import { armParryDynamo } from "../core/CombatBonuses.js";
import { SpellInstance } from "../spells/SpellInstance.js";

// Enemy attack "spells" (their own data; routed through the same systems).
const ENEMY_ATTACKS = {
  ranged_bolt: {
    id: "enemy_ranged", displayName: "Enemy Bolt", castType: "projectile",
    damage: 7, cooldown: 1, projectileSpeed: 30, range: 70, color: 0x5cc8ff,
  },
  mage_orb: {
    id: "enemy_mage", displayName: "Enemy Orb", castType: "projectile_aoe",
    damage: 11, cooldown: 1, projectileSpeed: 19, range: 70, areaRadius: 4.2,
    color: 0xc06bff,
  },
};

// External CC0 models (Quaternius Ultimate Monsters). MODEL_CACHE entries:
//   undefined  -> not preloaded yet, fall back to capsule
//   Object3D   -> use as model template (clone per enemy)
//   null       -> load failed, fall back to capsule
const MODEL_PATHS = {
  melee:       "assets/models/enemy_melee.glb",
  ranged:      "assets/models/enemy_ranged.glb",
  dasher:      "assets/models/enemy_dasher.glb",
  mage:        "assets/models/enemy_mage.glb",
  elite:       "assets/models/enemy_elite.glb",
  twin_warden: "assets/models/enemy_elite.glb",
  reaver:      "assets/models/enemy_elite.glb",
  sentinel:    "assets/models/enemy_elite.glb",
};
const MODEL_CACHE = new Map();
let _preloadPromise = null;

export function preloadEnemyModels() {
  if (_preloadPromise) return _preloadPromise;
  const loader = new GLTFLoader();
  _preloadPromise = Promise.all(Object.entries(MODEL_PATHS).map(async ([type, url]) => {
    try {
      const gltf = await loader.loadAsync(url);
      MODEL_CACHE.set(type, gltf.scene);
    } catch (e) {
      console.warn(`[model] missing ${url} - falling back to capsule for "${type}":`, e?.message || e);
      MODEL_CACHE.set(type, null);
    }
  }));
  return _preloadPromise;
}

function scale(base, level, per) { return base * (1 + per * (level - 1)); }

function cloneMaterials(root, out) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const cloned = mats.map((m) => {
      const c = m?.clone?.() || m;
      if (c?.emissive) c.emissive.set(0x000000);
      out.push(c);
      return c;
    });
    o.material = Array.isArray(o.material) ? cloned : cloned[0];
  });
}

// Base enemy: health, faction, slow/DOT status, separation, death routing.
// Subclasses implement behavior(). Damage to the player goes through
// applyDamage; DOT damage from player spells also re-enters applyDamage.
export class Enemy {
  constructor(world, level, cfg) {
    this.world = world;
    this.alive = true;

    const tier = world?.difficultyTier;
    if (tier) {
      cfg = { ...cfg };
      cfg.hp = Math.round(cfg.hp * tier.hpMult);
      if (cfg.touchDamage) cfg.touchDamage = Math.round(cfg.touchDamage * tier.damageMult);
    }

    this.cfg = cfg;
    this.radius = cfg.radius;
    this.speed = cfg.speed;
    this.touchDamage = cfg.touchDamage || 0;
    this.gold = cfg.gold || 3;
    this.attackTimer = 0;

    this.slowFactor = 1;
    this.slowTimer = 0;
    this.stunTimer = 0;
    this.frozenTimer = 0;
    this.regenRate = 0;
    this.volatileExplosion = null;
    this.chillStacks = 0;
    this.chillDecayTimer = 0;
    this.chillMaxStacks = 3;
    this.chillSlowPerStack = 0.2;
    this.dots = []; // { perTick, tickRate, acc, timeLeft, source }
    this.fireCdMult = 1;
    this.shotDamageMult = 1;
    this._baseEmissive = 0x000000;

    // Unstuck nudge state: when _moveTo's actual displacement falls well short
    // of expected (i.e. enemy is grinding a blocker), accumulate stuck time and
    // briefly steer sideways. Wedge corners get a short backward step.
    this._stuckAcc = 0;
    this._nudgeTimer = 0;
    this._nudgeSide = Math.random() < 0.5 ? -1 : 1;
    this._backoutTimer = 0;

    this.health = new Health(cfg.hp, "enemy", {
      onDeath: (src) => this._die(src),
      onDamage: () => this._flash(),
    });

    this.baseColor = new THREE.Color(cfg.color);
    this._materials = [];
    this.mesh = new THREE.Group();
    this.eyeH = cfg.radius + cfg.height / 2;
    this._buildVisual(cfg);
    this.mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const sx = cfg.spawn;
    this.mesh.position.set(sx.x, this.eyeH, sx.z);
    world.scene.add(this.mesh);
  }

  get position() { return this.mesh.position; }

  _buildVisual(cfg) {
    const template = MODEL_CACHE.get(cfg.type);
    if (template) {
      const obj = cloneSkeleton(template);
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const targetHeight = cfg.height + 2 * cfg.radius;
      const footprint = Math.max(size.x, size.z);
      const scaleY = size.y > 1e-4 ? targetHeight / size.y : 1;
      const scaleXZ = footprint > 1e-4 ? (2 * cfg.radius) / footprint : scaleY;
      const modelScale = Math.min(scaleY, scaleXZ);
      obj.scale.setScalar(modelScale);
      obj.position.set(
        -center.x * modelScale,
        -this.eyeH - box.min.y * modelScale,
        -center.z * modelScale
      );
      cloneMaterials(obj, this._materials);
      this.mesh.add(obj);
      return;
    }

    const mat = new THREE.MeshLambertMaterial({ color: cfg.color });
    const capsule = new THREE.Mesh(
      new THREE.CapsuleGeometry(cfg.radius, cfg.height, 4, 10),
      mat
    );
    this._materials.push(mat);
    this.mesh.add(capsule);
  }

  _setEmissive(hex) {
    const c = new THREE.Color(hex);
    for (const m of this._materials) {
      if (m?.emissive) m.emissive.copy(c);
    }
  }

  applySlow(amount, duration) {
    if (this.isBoss) amount *= 0.4;
    this.slowFactor = Math.min(this.slowFactor, 1 - THREE.MathUtils.clamp(amount, 0, 0.85));
    this.slowTimer = Math.max(this.slowTimer, duration);
    this._setEmissive(this.isBoss ? 0x441122 : 0x123a55);
  }

  applyChill(amount, duration) {
    this.chillStacks = Math.min(this.chillStacks + amount, this.chillMaxStacks);
    this.chillDecayTimer = Math.max(this.chillDecayTimer, duration);
    const totalSlow = this.chillStacks * this.chillSlowPerStack;
    this.slowFactor = Math.min(this.slowFactor, 1 - totalSlow);
    this.slowTimer = Math.max(this.slowTimer, this.chillDecayTimer);
    this._setEmissive(0x1f7ad8);
  }

  applyDot(dmgPerTick, duration, tickRate, source) {
    this.dots.push({ perTick: dmgPerTick, tickRate: tickRate || 0.5, acc: 0, timeLeft: duration, source });
  }

  applyStun(duration) {
    if (this.isBoss) {
      this.world.vfx?.burst?.(this.mesh.position, 0xffffff, 4, 2, 0.15);
      return;
    }
    this.stunTimer = Math.max(this.stunTimer, duration);
    this._stuckAcc = 0;
    this._nudgeTimer = 0;
    this._backoutTimer = 0;
  }

  applyFreeze(duration) {
    if (this.isBoss) return;
    this.frozenTimer = Math.max(this.frozenTimer, duration);
    this.slowFactor = 0;
    this.slowTimer = Math.max(this.slowTimer, duration); // restores slowFactor on expiry
    this._setEmissive(0x1f7ad8);
    this._stuckAcc = 0;
    this._nudgeTimer = 0;
    this._backoutTimer = 0;
  }

  // t ∈ [0,1] — 0 = chip hit (dim, short), 1 = heavy hit (near-white, long).
  // Called with no argument by health.onDamage (legacy path) → defaults to 0.
  _flash(t = 0) {
    // Blend from dark-red (0x884444) toward near-white (0xffeedd) as t rises.
    const r = 0x88 + Math.round((0xff - 0x88) * t);
    const g = 0x44 + Math.round((0xee - 0x44) * t);
    const b = 0x44 + Math.round((0xdd - 0x44) * t);
    const hex = (r << 16) | (g << 8) | b;
    this._setEmissive(hex);
    clearTimeout(this._ft);
    const durationMs = Math.round(70 + t * 90); // 70ms (chip) → 160ms (heavy)
    this._ft = setTimeout(() => {
      if (this.alive && this.slowTimer <= 0) this._setEmissive(this._baseEmissive);
    }, durationMs);
  }

  /**
   * Returns the dominant status-effect id for display, or null if none.
   * Priority: frozen > stunned > burning > poisoned > chilled.
   * "burning" and "poisoned" are distinguished by the DOT source.element field.
   */
  statusSummary() {
    if (this.frozenTimer > 0)  return "frozen";
    if (this.stunTimer > 0)    return "stunned";
    if (this.dots.length > 0) {
      const hasFire = this.dots.some((d) => d.source && d.source.element === "fire");
      return hasFire ? "burning" : "poisoned";
    }
    if (this.chillStacks > 0)  return "chilled";
    return null;
  }

  _tickStatus(dt) {
    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0) {
        this.slowFactor = 1;
        this._setEmissive(this._baseEmissive);
      }
    }
    if (this.chillStacks > 0) {
      this.chillDecayTimer -= dt;
      if (this.chillDecayTimer <= 0) {
        this.chillStacks = 0;
      }
    }
    if (this.regenRate > 0) this.health.heal(this.regenRate * dt);
    for (let i = this.dots.length - 1; i >= 0; i--) {
      const d = this.dots[i];
      d.acc += dt;
      d.timeLeft -= dt;
      while (d.acc >= d.tickRate && this.alive) {
        d.acc -= d.tickRate;
        applyDamage(this, d.perTick, d.source); // DOT re-enters central path
      }
      if (d.timeLeft <= 0 || !this.alive) this.dots.splice(i, 1);
    }
  }

  _separate(dt) {
    const list = this.world.enemyManager.enemies;
    for (const o of list) {
      if (o === this || !o.alive) continue;
      const dx = this.mesh.position.x - o.mesh.position.x;
      const dz = this.mesh.position.z - o.mesh.position.z;
      const dsq = dx * dx + dz * dz;
      const min = this.radius + o.radius;
      if (dsq > 1e-4 && dsq < min * min) {
        const d = Math.sqrt(dsq);
        const push = (min - d) / min;
        this.mesh.position.x += (dx / d) * push * 6 * dt;
        this.mesh.position.z += (dz / d) * push * 6 * dt;
      }
    }
    this.world.resolveArenaCollision?.(this.mesh.position, this.radius);
  }

  _toPlayer() {
    const p = this.world.player.feet;
    const v = new THREE.Vector3(p.x - this.mesh.position.x, 0, p.z - this.mesh.position.z);
    const dist = v.length();
    return { dir: dist > 1e-4 ? v.multiplyScalar(1 / dist) : new THREE.Vector3(), dist };
  }

  _faceDir(dir) {
    const lenSq = dir.x * dir.x + dir.z * dir.z;
    if (lenSq < 1e-6) return;
    this.mesh.rotation.y = Math.atan2(dir.x, dir.z);
  }

  _moveTo(dir, speedMul, dt) {
    // Only run unstuck logic for normal-speed pursuit moves; dasher dash and
    // linebreaker surge (>1.5×) are committed and must not be deflected.
    const trackStuck = speedMul <= 1.5;

    let useDir = dir;
    if (trackStuck) {
      if (this._backoutTimer > 0) {
        this._backoutTimer -= dt;
        useDir = new THREE.Vector3(-dir.x, 0, -dir.z);
      } else if (this._nudgeTimer > 0) {
        this._nudgeTimer -= dt;
        const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(this._nudgeSide);
        useDir = new THREE.Vector3(
          dir.x * 0.55 + side.x * 0.85,
          0,
          dir.z * 0.55 + side.z * 0.85
        );
        const lenSq = useDir.x * useDir.x + useDir.z * useDir.z;
        if (lenSq > 1e-6) useDir.multiplyScalar(1 / Math.sqrt(lenSq));
        else useDir = dir;
      }
    }

    this._faceDir(useDir);
    const prevX = this.mesh.position.x;
    const prevZ = this.mesh.position.z;
    const s = this.speed * this.slowFactor * speedMul * dt;
    this.mesh.position.x += useDir.x * s;
    this.mesh.position.z += useDir.z * s;
    const lim = this.world.arenaBounds.half - this.radius;
    this.mesh.position.x = THREE.MathUtils.clamp(this.mesh.position.x, -lim, lim);
    this.mesh.position.z = THREE.MathUtils.clamp(this.mesh.position.z, -lim, lim);
    this.world.resolveArenaCollision?.(this.mesh.position, this.radius);
    const groundLevel = this.world.getElevationAt
      ? this.world.getElevationAt(this.mesh.position.x, this.mesh.position.z)
      : 0;
    this.mesh.position.y = this.eyeH + groundLevel;

    if (trackStuck && s > 1e-4) {
      const dx = this.mesh.position.x - prevX;
      const dz = this.mesh.position.z - prevZ;
      const actual = Math.sqrt(dx * dx + dz * dz);
      if (actual < s * 0.4) {
        this._stuckAcc += dt;
      } else {
        this._stuckAcc = Math.max(0, this._stuckAcc - dt * 2);
      }
      if (this._backoutTimer <= 0 && this._stuckAcc > 0.6) {
        // Wedge corner: enemy is still pinned even with a side nudge active.
        // Back out briefly along the player vector, flip side for the next try.
        this._backoutTimer = 0.15;
        this._nudgeSide = -this._nudgeSide;
        this._stuckAcc = 0;
        this._nudgeTimer = 0;
      } else if (this._nudgeTimer <= 0 && this._stuckAcc > 0.25) {
        this._nudgeTimer = 0.4 + Math.random() * 0.2;
        this._nudgeSide = -this._nudgeSide;
        this._stuckAcc = 0.1;
      }
    }
  }

  _predictedPlayerPoint(seconds = 0.45) {
    const pl = this.world.player;
    const p = pl.feet.clone();
    const v = pl.vel.clone();
    v.y = 0;
    if (v.lengthSq() > 0.25) p.add(v.multiplyScalar(seconds));
    p.y = 0;
    return p;
  }

  _canSeePlayer(extraRadius = 0.15) {
    const from = this.mesh.position.clone();
    from.y = this.eyeH;
    return this.world.hasLineOfSight?.(from, this.world.player.position, extraRadius) ?? true;
  }

  _moveAroundCover(info, dt, speedMul = 1) {
    const side = new THREE.Vector3(-info.dir.z, 0, info.dir.x).multiplyScalar(this.coverSide || 1);
    const dir = info.dir.clone().multiplyScalar(0.75).add(side.multiplyScalar(0.65)).normalize();
    this._moveTo(dir, speedMul, dt);
    if (Math.random() < 0.012) this.coverSide = -(this.coverSide || 1);
  }

  _touchPlayer(info) {
    if (this.touchDamage <= 0 || this.attackTimer > 0) return;
    if (info.dist <= this.radius + this.world.player.radius + 0.4) {
      const blk = this.world.player.block;
      if (blk && blk.perfectActive()) {
        blk.notePerfect();
        this.applyStun(0.6);
        armParryDynamo(this.world);
        this.world.vfx.burst(this.mesh.position, 0x9a6cff, 10, 6, 0.3);
        this.world.onCombatProc?.("Perfect block");
        this.attackTimer = 1.0;
        return;
      }
      applyDamage(this.world.player, this.touchDamage, { owner: "enemy", spellId: "enemy_melee" });
      this.world.onPlayerHurt?.();
      this.attackTimer = 1.0;
    }
  }

  _shoot(attackKey) {
    const def = ENEMY_ATTACKS[attackKey];
    const spell = new SpellInstance(def, true);
    if (this.shotDamageMult !== 1) spell.stats.damage = Math.max(1, Math.round(spell.stats.damage * this.shotDamageMult));
    const from = this.mesh.position.clone(); from.y = this.eyeH;
    const target = this.world.player.position.clone();
    const dir = target.sub(from).normalize();
    this._faceDir(dir);
    from.add(dir.clone().multiplyScalar(this.radius + 0.5));
    this.world.castEnemySpell(spell, from, dir);
  }

  _shootDir(attackKey, dir) {
    const def = ENEMY_ATTACKS[attackKey];
    const spell = new SpellInstance(def, true);
    const from = this.mesh.position.clone(); from.y = this.eyeH;
    this._faceDir(dir);
    from.add(dir.clone().multiplyScalar(this.radius + 0.5));
    this.world.castEnemySpell(spell, from, dir);
  }

  update(dt) {
    if (!this.alive) return;
    if (this.attackTimer > 0) this.attackTimer -= dt;
    this._tickStatus(dt);
    if (!this.alive) return;
    if (this.stunTimer > 0 || this.frozenTimer > 0) {
      this.stunTimer = Math.max(0, this.stunTimer - dt);
      this.frozenTimer = Math.max(0, this.frozenTimer - dt);
      return; // hard stop: no behavior/movement/shooting/contact while CC'd
    }
    const info = this._toPlayer();
    this.behavior(dt, info);
    this._separate(dt);
    this._touchPlayer(info);
  }

  behavior() { /* override */ }

  _die(source) {
    if (!this._dead) {
      this._dead = true;
      this.alive = false;
      this._volatileBurst();
      // Gameplay accounting fires immediately — wave-clear correctness preserved.
      this.world.enemyManager.onEnemyDead(this);

      const reducedMotion = this.world.settings?.display?.reducedMotion;
      if (reducedMotion) {
        // reducedMotion: dissolve is skipped → play death sound immediately.
        this.world.audio.enemyDeath();
        // reducedMotion: immediate removal, keep burst (spec: "skip dissolve, keep burst").
        this.world.vfx.burst(this.mesh.position, this.cfg.color, 22, 9, 0.55, 0.22);
        this.world.scene.remove(this.mesh);
        this._disposeVisual();
        return;
      }

      // Dissolve: keep mesh in scene for ~0.35s, scale→0 + emissive→white.
      // The burst fires immediately as the death punctuation, then the mesh lingers.
      // Death sound delayed 0.1s to match the dissolve peak (#98 A/V sync).
      this.world.after(0.1, () => { this.world.audio.enemyDeath(); });
      this.world.vfx.burst(this.mesh.position, this.cfg.color, 22, 9, 0.55, 0.22);

      // Prepare materials for dissolve: enable transparency so opacity fade works.
      const dissolveMats = [];
      this.mesh.traverse((o) => {
        if (!o.isMesh) return;
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) {
          if (m) { m.transparent = true; dissolveMats.push(m); }
        }
      });

      const startScale = this.mesh.scale.clone();
      const white = new THREE.Color(1, 1, 1);
      const meshRef = this.mesh;
      const scene   = this.world.scene;
      let disposed  = false;

      this.world.vfx.custom(meshRef, 0.35, (dt, e) => {
        // e: 1→0. Scale shrinks (ease-in), emissive ramps to white.
        const s = e * e;
        meshRef.scale.copy(startScale).multiplyScalar(s);
        for (const m of dissolveMats) {
          if (m?.emissive) m.emissive.copy(white).multiplyScalar(1 - e);
          if ("opacity" in m) m.opacity = Math.max(0, e);
        }
        if (e <= 0 && !disposed) {
          disposed = true;
          scene.remove(meshRef);
          this._disposeVisual();
        }
      });
    }
  }

  _volatileBurst() {
    if (!this.volatileExplosion) return;
    const pos = this.mesh.position.clone();
    const { radius, damage } = this.volatileExplosion;
    this.world.vfx.shock(pos, 0xff9b30, radius, 0.35);
    this.world.vfx.flash(pos, 0xffcf4d, radius * 0.45, 0.18);
    const pl = this.world.player;
    if (pl.position.distanceTo(pos) <= radius + pl.radius) {
      applyDamage(pl, damage, { owner: "enemy", spellId: "volatile_burst", spellName: "Volatile Burst" });
      this.world.onPlayerHurt?.();
    }
  }

  _disposeVisual() {
    this.mesh.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry?.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) m?.dispose?.();
    });
  }

  forceRemove() {
    this.alive = false;
    // Always remove from scene (handles dissolving corpses that are still rendering).
    this.world.scene.remove(this.mesh);
    if (!this._dead) {
      this._dead = true;
      this._disposeVisual();
    }
  }
}

// --- Concrete enemy types -------------------------------------------------

export class MeleeEnemy extends Enemy {
  constructor(world, level, spawn) {
    super(world, level, {
      type: "melee", color: 0xff4d4d, radius: 0.6, height: 1.3,
      hp: scale(42, level, 0.18), speed: 5.2 + level * 0.08,
      touchDamage: scale(8, level, 0.12), gold: 3, spawn,
    });
  }
  behavior(dt, info) { this._moveTo(info.dir, 1, dt); }
}

export class RangedEnemy extends Enemy {
  constructor(world, level, spawn) {
    super(world, level, {
      type: "ranged", color: 0x3d7bff, radius: 0.55, height: 1.25,
      hp: scale(28, level, 0.18), speed: 4.4, touchDamage: 0, gold: 4, spawn,
    });
    this.fireCd = 0;
    this.desired = 18;
    this.coverSide = Math.random() < 0.5 ? -1 : 1;
  }
  behavior(dt, info) {
    const los = this._canSeePlayer();
    if (!los) {
      this._moveAroundCover(info, dt, 1.08);
      this.fireCd = Math.max(this.fireCd - dt * 0.5, 0.35);
      return;
    }
    if (info.dist > this.desired + 3) this._moveTo(info.dir, 1, dt);
    else if (info.dist < this.desired - 3) this._moveTo(info.dir.clone().negate(), 0.8, dt);
    this.fireCd -= dt;
    if (this.fireCd <= 0 && info.dist < 60) { this._shoot("ranged_bolt"); this.fireCd = 2.2 * this.fireCdMult; }
  }
}

export class DasherEnemy extends Enemy {
  constructor(world, level, spawn) {
    super(world, level, {
      type: "dasher", color: 0xff9b30, radius: 0.55, height: 1.2,
      hp: scale(30, level, 0.18), speed: 4.5, touchDamage: scale(10, level, 0.12),
      gold: 4, spawn,
    });
    this.state = "approach";
    this.tele = 0;
    this.dashT = 0;
    this.dashDir = new THREE.Vector3();
    this._teleLock = 0;
    this._teleAnchor = new THREE.Vector3();
    this._teleFx = 0;
  }
  _beginTelegraph(info) {
    this.state = "telegraph";
    this.tele = 0.7;
    this.dashDir.copy(info.dir).setY(0);
    if (this.dashDir.lengthSq() < 1e-4) this.dashDir.set(0, 0, 1);
    this.dashDir.normalize();
    this._faceDir(this.dashDir);
    this._teleLock = 0.15;
    this._teleAnchor.copy(this.mesh.position);
    this._teleFx = 0;
    this._setEmissive(0xffd060);
    this.world.vfx.shock(this.mesh.position, 0xffaa33, 2.2, 0.32);
    this.world.audio?.telegraphDash?.();
    if (this.world.combat) {
      this.world.combat.dasherTelegraphCount = (this.world.combat.dasherTelegraphCount || 0) + 1;
    }
    this.world.captions?.show("The dasher telegraphs a powerful dash");
  }
  _drawDashTelegraph(dt) {
    this._teleFx -= dt;
    if (this._teleFx > 0) return;
    this._teleFx = 0.07;
    const from = this.mesh.position.clone();
    from.y = 0.28;
    const to = from.clone().add(this.dashDir.clone().multiplyScalar(9));
    this.world.vfx.beam(from, to, 0xffaa33, 0.12);
  }
  behavior(dt, info) {
    if (this.state === "approach") {
      this._moveTo(info.dir, 1, dt);
      if (info.dist < 14) this._beginTelegraph(info);
    } else if (this.state === "telegraph") {
      this.tele -= dt;
      if (this._teleLock > 0) {
        this._teleLock -= dt;
        this.mesh.position.x = this._teleAnchor.x;
        this.mesh.position.z = this._teleAnchor.z;
      }
      this._faceDir(this.dashDir);
      if (!this.world.settings?.display?.reducedMotion) {
        this.mesh.scale.y = 1 + Math.sin(performance.now() * 0.045) * 0.18;
      }
      this._drawDashTelegraph(dt);
      if (this.tele <= 0) {
        this.state = "dash";
        this.dashT = 0.45;
        this._setEmissive(0x000000);
        this.mesh.scale.y = 1;
      }
    } else if (this.state === "dash") {
      this.dashT -= dt;
      this._moveTo(this.dashDir, 4.2, dt);
      if (this.dashT <= 0) { this.state = "approach"; this.attackTimer = 0.4; }
    }
  }
}

export class LinebreakerEnemy extends Enemy {
  constructor(world, level, spawn) {
    super(world, level, {
      type: "dasher", color: 0x47ffd2, radius: 0.62, height: 1.25,
      hp: scale(48, level, 0.2), speed: 5.1, touchDamage: scale(12, level, 0.12),
      gold: 7, spawn,
    });
    this.state = "cutoff";
    this.tele = 0;
    this.surgeT = 0;
    this.cooldown = 1.3 + Math.random() * 1.0;
    this.side = Math.random() < 0.5 ? -1 : 1;
    this.chargeDir = new THREE.Vector3();
    this._teleFx = 0;
    this._teleAnchor = new THREE.Vector3();
  }

  _beginSurge(info) {
    const target = this._predictedPlayerPoint(0.55);
    this.chargeDir.copy(target.sub(this.position));
    this.chargeDir.y = 0;
    if (this.chargeDir.lengthSq() < 1e-4) this.chargeDir.copy(info.dir);
    this.chargeDir.normalize();
    this.state = "telegraph";
    this.tele = 0.52;
    this._teleFx = 0;
    this._teleAnchor.copy(this.position);
    this._setEmissive(0x39ffd6);
    this.world.vfx.shock(this.position, 0x7affe6, 2.4, 0.28);
    this.world.vfx.ring(this.position, 1.9, 0x39ffd6, 0.45);
    this.world.audio?.telegraphSurge?.();
    this.world.captions?.show("The boss telegraphs a powerful surge");
  }

  _drawTelegraph(dt) {
    this._teleFx -= dt;
    if (this._teleFx > 0) return;
    this._teleFx = 0.05;
    const from = this.position.clone();
    from.y = 0.28;
    const to = from.clone().add(this.chargeDir.clone().multiplyScalar(18));
    this.world.vfx.beam(from, to, 0x7affe6, 0.16);
  }

  behavior(dt, info) {
    this.cooldown -= dt;
    if (this.state === "cutoff") {
      const pl = this.world.player;
      const move = pl.vel.clone();
      move.y = 0;
      if (move.lengthSq() > 2.25) {
        move.normalize();
        const side = new THREE.Vector3(-move.z, 0, move.x).multiplyScalar(this.side * 6.5);
        const lead = move.multiplyScalar(5.5);
        const target = pl.feet.clone().add(lead).add(side);
        target.y = 0;
        const toCutoff = target.sub(this.position);
        toCutoff.y = 0;
        if (toCutoff.lengthSq() > 1.4) this._moveTo(toCutoff.normalize(), 1.12, dt);
      } else {
        this._moveTo(info.dir, 1, dt);
      }

      if (this.cooldown <= 0 && info.dist < 24) this._beginSurge(info);
      return;
    }

    if (this.state === "telegraph") {
      this.tele -= dt;
      this.mesh.position.x = this._teleAnchor.x;
      this.mesh.position.z = this._teleAnchor.z;
      if (!this.world.settings?.display?.reducedMotion) {
        this.mesh.scale.setScalar(1 + Math.sin(performance.now() * 0.05) * 0.11);
      }
      this._faceDir(this.chargeDir);
      this._drawTelegraph(dt);
      if (this.tele <= 0) {
        this.state = "surge";
        this.surgeT = 0.42;
        this.mesh.scale.setScalar(1);
        this._setEmissive(0x000000);
      }
      return;
    }

    if (this.state === "surge") {
      this.surgeT -= dt;
      this._moveTo(this.chargeDir, 5.1, dt);
      if (this.surgeT <= 0) {
        this.state = "cutoff";
        this.cooldown = 2.6 + Math.random() * 0.8;
        this.side *= -1;
        this.attackTimer = 0.25;
      }
    }
  }
}

export class MageEnemy extends Enemy {
  constructor(world, level, spawn) {
    super(world, level, {
      type: "mage", color: 0xb24dff, radius: 0.6, height: 1.4,
      hp: scale(34, level, 0.2), speed: 3.4, touchDamage: 0, gold: 6, spawn,
    });
    this.fireCd = 1.5; this.desired = 24; this.coverSide = Math.random() < 0.5 ? -1 : 1;
  }
  behavior(dt, info) {
    const los = this._canSeePlayer(0.2);
    if (!los) {
      this._moveAroundCover(info, dt, 0.95);
      this.fireCd = Math.max(this.fireCd - dt * 0.4, 0.6);
      return;
    }
    if (info.dist > this.desired + 4) this._moveTo(info.dir, 1, dt);
    else if (info.dist < this.desired - 4) this._moveTo(info.dir.clone().negate(), 0.7, dt);
    this.fireCd -= dt;
    if (this.fireCd <= 0 && info.dist < 60) { this._shoot("mage_orb"); this.fireCd = 3.6 * this.fireCdMult; }
  }
}

export class EliteEnemy extends Enemy {
  constructor(world, level, spawn) {
    super(world, level, {
      type: "elite", color: 0x2a2440, radius: 1.4, height: 3.0,
      hp: scale(190, level, 0.28), speed: 3.2, touchDamage: scale(15, level, 0.12),
      gold: 30, spawn,
    });
    this._setEmissive(0x40108a);
    this.fireCd = 2.5; this.coverSide = Math.random() < 0.5 ? -1 : 1;
  }
  behavior(dt, info) {
    if (!this._canSeePlayer(0.25)) {
      this._moveAroundCover(info, dt, 0.85);
      return;
    }
    this._moveTo(info.dir, 1, dt);
    this.fireCd -= dt;
    if (this.fireCd <= 0 && info.dist < 60) { this._shoot("mage_orb"); this.fireCd = 2.6 * this.fireCdMult; }
  }
}

// --- Boss mini-pattern elites (level % 5 === 0) ---------------------------

// Two paired elites that sync-cast mage orbs. When one dies, the survivor
// enters rage (faster movement + cast rate, red emissive).
export class TwinWardenElite extends EliteEnemy {
  constructor(world, level, spawn) {
    super(world, level, spawn);
    this.cfg.type = "twin_warden";
    this.isBoss = true;
    this.partner = null;
    this._raged = false;
    this.syncDelay = 0;
    this.health.setMax(Math.round(this.health.max * 1.1));
    this.speed *= 1.2;
    this.touchDamage = Math.round(this.touchDamage * 1.5);
    this._phase2Triggered = false;
    this._setEmissive(0xff5edb);
  }
  _enterRage() {
    if (this._raged) return;
    this._raged = true;
    this.speed *= 1.4;
    this._setEmissive(0xff2244);
    this.world.captions?.show("The boss becomes enraged!");
    this.world.audio?.bossEnrage?.();
  }
  _die(source) {
    const partner = this.partner;
    super._die(source);
    if (partner?.alive) partner._enterRage();
  }
  _phase2GroundSlam() {
    this.world.vfx.shock(this.position, 0xff5edb, 8, 0.6);
    this.world.vfx.flash(this.position, 0xff5edb, 4, 0.2);
    this._setEmissive(0xff22aa);
    const dmg = 20;
    const pl = this.world.player;
    if (pl.position.distanceTo(this.position) <= 8 + pl.radius) {
      applyDamage(pl, dmg, { owner: "enemy", spellId: "boss_ground_slam" });
      this.world.onPlayerHurt?.();
    }
    for (const e of this.world.enemyManager.enemies) {
      if (e === this || !e.alive) continue;
      if (e.position.distanceTo(this.position) <= 8 + e.radius) {
        applyDamage(e, dmg, { owner: "enemy", spellId: "boss_ground_slam" });
      }
    }
  }
  behavior(dt, info) {
    if (this.health.ratio < 0.5 && !this._phase2Triggered) {
      this._phase2Triggered = true;
      this._phase2GroundSlam();
    }
    if (this.syncDelay > 0) {
      this.syncDelay -= dt;
      if (this.syncDelay <= 0 && this._canSeePlayer(0.25) && info.dist < 60) {
        this._shoot("mage_orb");
        this.fireCd = this._raged ? 0.9 : 1.8;
      }
    }
    if (!this._canSeePlayer(0.25)) {
      this._moveAroundCover(info, dt, 0.85);
      return;
    }
    this._moveTo(info.dir, 1, dt);
    this.fireCd -= dt;
    if (this.fireCd <= 0 && info.dist < 60) {
      this._shoot("mage_orb");
      this.fireCd = this._raged ? 0.9 : 1.8;
      if (this.partner?.alive && this.partner.fireCd > 0.2 && this.partner.syncDelay <= 0) {
        this.partner.syncDelay = 0.18;
      }
    }
  }
}

// Tanky single boss with a wide linebreaker-style surge dash. Reuses the
// LinebreakerEnemy state machine inline with its own (orange) color cue.
export class ReaverElite extends EliteEnemy {
  constructor(world, level, spawn) {
    super(world, level, spawn);
    this.cfg.type = "reaver";
    this.isBoss = true;
    this.health.setMax(Math.round(this.health.max * 1.8));
    this.speed *= 1.2;
    this.touchDamage = Math.round(this.touchDamage * 1.5);
    this._phase2Triggered = false;
    this._setEmissive(0xff8a3a);
    this.state = "cutoff";
    this.tele = 0;
    this.surgeT = 0;
    this.cooldown = 3.5 + Math.random() * 1.0; // first surge a bit sooner
    this.chargeDir = new THREE.Vector3();
    this._teleFx = 0;
    this._teleAnchor = new THREE.Vector3();
  }

  _beginReaverSurge(info) {
    const target = this._predictedPlayerPoint(0.55);
    this.chargeDir.copy(target.sub(this.position));
    this.chargeDir.y = 0;
    if (this.chargeDir.lengthSq() < 1e-4) this.chargeDir.copy(info.dir);
    this.chargeDir.normalize();
    this.state = "telegraph";
    this.tele = 0.7;
    this._teleFx = 0;
    this._teleAnchor.copy(this.position);
    this._setEmissive(0xff8a3a);
    this.world.vfx.shock(this.position, 0xff8a3a, 3.0, 0.32);
    this.world.vfx.ring(this.position, 2.4, 0xff8a3a, 0.5);
    this.world.audio?.telegraphSurge?.();
    this.world.captions?.show("The boss telegraphs a powerful surge");
  }

  _drawReaverTelegraph(dt) {
    this._teleFx -= dt;
    if (this._teleFx > 0) return;
    this._teleFx = 0.05;
    const from = this.position.clone();
    from.y = 0.28;
    const to = from.clone().add(this.chargeDir.clone().multiplyScalar(20));
    this.world.vfx.beam(from, to, 0xff8a3a, 0.16);
  }

  behavior(dt, info) {
    if (this.health.ratio < 0.5 && !this._phase2Triggered) {
      this._phase2Triggered = true;
      this._setEmissive(0xff4400);
      this.world.vfx.shock(this.position, 0xff8a3a, 4, 0.4);
      this.world.captions?.show("The boss becomes enraged!");
      this.world.audio?.bossEnrage?.();
      const baseDir = info.dir.clone();
      const axis = new THREE.Vector3(0, 1, 0);
      this._shootDir("mage_orb", baseDir.clone().applyAxisAngle(axis, -0.3));
      this._shoot("mage_orb");
      this._shootDir("mage_orb", baseDir.clone().applyAxisAngle(axis, 0.3));
    }
    this.cooldown -= dt;
    if (this.state === "cutoff") {
      if (!this._canSeePlayer(0.25)) {
        this._moveAroundCover(info, dt, 0.9);
      } else {
        this._moveTo(info.dir, 1, dt);
        this.fireCd -= dt;
        if (this.fireCd <= 0 && info.dist < 60) { this._shoot("mage_orb"); this.fireCd = 2.1; }
      }
      if (this.cooldown <= 0 && info.dist < 28) this._beginReaverSurge(info);
      return;
    }

    if (this.state === "telegraph") {
      this.tele -= dt;
      this.mesh.position.x = this._teleAnchor.x;
      this.mesh.position.z = this._teleAnchor.z;
      if (!this.world.settings?.display?.reducedMotion) {
        this.mesh.scale.setScalar(1 + Math.sin(performance.now() * 0.05) * 0.11);
      }
      this._faceDir(this.chargeDir);
      this._drawReaverTelegraph(dt);
      if (this.tele <= 0) {
        this.state = "surge";
        this.surgeT = 0.55;
        this.mesh.scale.setScalar(1);
        this._setEmissive(0xff8a3a);
      }
      return;
    }

    if (this.state === "surge") {
      this.surgeT -= dt;
      this._moveTo(this.chargeDir, 5.1, dt);
      if (this.surgeT <= 0) {
        this.state = "cutoff";
        this.cooldown = 3.4 + Math.random() * 0.8;
        this.attackTimer = 0.25;
      }
    }
  }
}

// Stationary kiter elite that periodically respawns weak melee minions (cap 3)
// until the elite itself dies. Forces target-priority decisions.
export class SentinelElite extends EliteEnemy {
  constructor(world, level, spawn) {
    super(world, level, spawn);
    this.cfg.type = "sentinel";
    this.isBoss = true;
    this.health.setMax(Math.round(this.health.max * 1.7));
    this.speed *= 1.2;
    this.touchDamage = Math.round(this.touchDamage * 1.5);
    this._phase2Triggered = false;
    this._setEmissive(0xffcf4d);
    this.respawnCd = 4.0;
    this.minions = [];
  }
  behavior(dt, info) {
    if (this.health.ratio < 0.5 && !this._phase2Triggered) {
      this._phase2Triggered = true;
      this._setEmissive(0xff6600);
      this.world.vfx.shock(this.position, 0xffcf4d, 4, 0.4);
      this.world.captions?.show("The boss becomes enraged!");
      this.world.audio?.bossEnrage?.();
      this._shoot("mage_orb");
      this.world.after(0.15, () => { if (this.alive) this._shoot("mage_orb"); });
      this.world.after(0.3, () => { if (this.alive) this._shoot("mage_orb"); });
    }
    this.minions = this.minions.filter((m) => m && m.alive);
    this.respawnCd -= dt;
    if (this.respawnCd <= 0 && this.minions.length < 4) {
      const lvl = this.world.levelManager?.level ?? 1;
      const m = this.world.enemyManager.spawnExtra(MeleeEnemy, lvl, this.position);
      if (m) this.minions.push(m);
      this.respawnCd = 4.5;
      this.world.vfx.shock(this.position, 0xffcf4d, 2.0, 0.28);
    }
    if (!this._canSeePlayer(0.25)) {
      this._moveAroundCover(info, dt, 0.6);
      return;
    }
    if (info.dist > 26) this._moveTo(info.dir, 0.55, dt);
    else if (info.dist < 18) this._moveTo(info.dir.clone().negate(), 0.55, dt);
    this.fireCd -= dt;
    if (this.fireCd <= 0 && info.dist < 60) { this._shoot("mage_orb"); this.fireCd = 1.7; }
  }
}

export const ENEMY_CLASSES = {
  melee: MeleeEnemy, ranged: RangedEnemy, dasher: DasherEnemy,
  linebreaker: LinebreakerEnemy, mage: MageEnemy, elite: EliteEnemy,
  twin_warden: TwinWardenElite, reaver: ReaverElite, sentinel: SentinelElite,
};
