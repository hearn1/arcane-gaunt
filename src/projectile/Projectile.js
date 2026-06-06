import * as THREE from "three";
import { emitTrail, resolveColor } from "../core/VfxLibrary.js";

const FORWARD = new THREE.Vector3(0, 0, 1);

// --- Visual pool -----------------------------------------------------------
// Pre-built Groups are reused across projectile lifetimes so geometry and
// material allocation happens once per slot, not once per cast.  On expire()
// the Group is returned to the pool rather than disposed; geometry and
// materials survive until the pool itself is cleared.
//
// Pool is keyed by definitionId so spell-specific shapes are never mixed.
// clearProjectileVisualPool() is called at run-start (Game.startRun) so
// colorblind / settings changes always take effect on the next run.

const _visualPool = new Map(); // definitionId → Group[]
const _POOL_CAP = 8;           // max idle visuals stored per spell type

export function clearProjectileVisualPool() {
  for (const groups of _visualPool.values()) {
    for (const g of groups) disposeObject(g);
  }
  _visualPool.clear();
}

function _acquireVisual(spell, world) {
  const id = spell.definitionId ?? "default";
  const pool = _visualPool.get(id);
  if (pool && pool.length > 0) return pool.pop();
  return buildProjectileVisual(spell, world);
}

function _releaseVisual(group, definitionId) {
  const id = definitionId ?? "default";
  if (!_visualPool.has(id)) _visualPool.set(id, []);
  const pool = _visualPool.get(id);
  if (pool.length < _POOL_CAP) {
    pool.push(group);
  } else {
    disposeObject(group);
  }
}

// Default trail interval for spells without a definition-level trailInterval.
// 0.06 s gives ~16 emits/s instead of the original 33 — still visually dense
// but halves the per-projectile VFX pressure. Reduced-density mode doubles this.
const DEFAULT_TRAIL_INTERVAL = 0.06;

function mat(color, options = {}) {
  return new THREE.MeshBasicMaterial({ color, ...options });
}

function addGlow(group, color, radius = 0.55, opacity = 0.28) {
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 12, 12),
    mat(color, { transparent: true, opacity, depthWrite: false })
  );
  group.add(glow);
  return glow;
}

function buildArcaneBolt(color) {
  const group = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 1.25, 5),
    mat(color)
  );
  core.rotation.x = Math.PI / 2;
  core.position.z = 0.18;
  group.add(core);

  const inner = new THREE.Mesh(
    new THREE.ConeGeometry(0.07, 1.45, 5),
    mat(0xf2eaff, { transparent: true, opacity: 0.75, depthWrite: false })
  );
  inner.rotation.x = Math.PI / 2;
  inner.position.z = 0.25;
  group.add(inner);

  const tail = new THREE.Mesh(
    new THREE.ConeGeometry(0.28, 0.85, 8, 1, true),
    mat(color, { transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide })
  );
  tail.rotation.x = -Math.PI / 2;
  tail.position.z = -0.45;
  group.add(tail);

  addGlow(group, color, 0.42, 0.18);
  return group;
}

function buildFireball(color) {
  const group = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 14), mat(0xfff0a6));
  group.add(core);
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 14, 14),
    mat(color, { transparent: true, opacity: 0.68, depthWrite: false })
  );
  group.add(shell);
  const tail = new THREE.Mesh(
    new THREE.ConeGeometry(0.42, 1.25, 10, 1, true),
    mat(0xff3b1f, { transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide })
  );
  tail.rotation.x = -Math.PI / 2;
  tail.position.z = -0.7;
  group.add(tail);
  addGlow(group, color, 0.78, 0.24);
  return group;
}

function buildFrostLance(color) {
  const group = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, 1.25, 6), mat(0xdff8ff));
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = -0.05;
  group.add(shaft);

  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.62, 6), mat(color));
  tip.rotation.x = Math.PI / 2;
  tip.position.z = 0.62;
  group.add(tip);

  for (let i = 0; i < 3; i++) {
    const shard = new THREE.Mesh(
      new THREE.ConeGeometry(0.05, 0.42, 4),
      mat(0xbdefff, { transparent: true, opacity: 0.74, depthWrite: false })
    );
    shard.rotation.x = Math.PI / 2;
    shard.rotation.z = i * (Math.PI * 2 / 3);
    shard.position.set(Math.cos(shard.rotation.z) * 0.16, Math.sin(shard.rotation.z) * 0.16, -0.18);
    group.add(shard);
  }

  addGlow(group, color, 0.48, 0.2);
  return group;
}

function buildPoisonBolt(color) {
  const group = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), mat(0xb6ff76));
  group.add(core);
  const offsets = [
    [-0.18, 0.06, -0.05, 0.28],
    [0.18, -0.03, -0.14, 0.22],
    [0.02, 0.18, -0.23, 0.2],
    [-0.06, -0.16, 0.12, 0.18],
  ];
  for (const [x, y, z, r] of offsets) {
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(r, 8, 8),
      mat(color, { transparent: true, opacity: 0.48, depthWrite: false })
    );
    puff.position.set(x, y, z);
    group.add(puff);
  }
  addGlow(group, color, 0.72, 0.18);
  return group;
}

function buildDefaultOrb(color) {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12), mat(color)));
  addGlow(group, color, 0.55, 0.28);
  return group;
}

function buildProjectileVisual(spell, world) {
  const colorblind = world?.settings?.colorblindMode;
  const color = colorblind ? (spell.colorblindColor || spell.color) : (spell.color ?? 0xffffff);
  switch (spell.definitionId) {
    case "arcane_bolt": return buildArcaneBolt(color);
    case "fireball": return buildFireball(color);
    case "frost_bolt": return buildFrostLance(color);
    case "poison_bolt": return buildPoisonBolt(color);
    default: return buildDefaultOrb(color);
  }
}

function disposeObject(obj) {
  obj.traverse((o) => {
    o.geometry?.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) m?.dispose?.();
  });
}

// Pure projectile: owns its motion + lifetime only. It knows its source spell
// instance and owner faction. Collision + damage routing live in HitResolver,
// so projectile logic stays decoupled from player input and from damage rules.
export class Projectile {
  constructor(world, spell, origin, dir, faction) {
    this.world = world;
    this.spell = spell;          // SpellInstance
    this.faction = faction;      // 'player' | 'enemy'
    this.alive = true;
    this.radius = 0.45;
    this.travelled = 0;
    this.maxRange = spell.stats.range || 60;
    this.pierceLeft = spell.stats.pierceCount || 0;
    this.hitSet = new Set();     // enemies already hit (pierce)

    this.dir = dir.clone().normalize();
    this.vel = this.dir.clone().multiplyScalar(spell.stats.projectileSpeed || 40);

    this.mesh = _acquireVisual(spell, world);
    this.mesh.position.copy(origin);
    this.mesh.quaternion.setFromUnitVectors(FORWARD, this.dir);
    world.scene.add(this.mesh);

    if (spell.stats.cadenceStacks) {
      this.cadenceStacks = 0;
      this.cadenceTimer = 0;
    }

    // Trail interval: definition data wins; reduced-density mode doubles the
    // base interval so continuous trail emitters fire half as often.
    const _baseInterval = spell.trailInterval ?? DEFAULT_TRAIL_INTERVAL;
    const _densityReduced = world?.settings?.performance?.vfxDensity === "reduced";
    this._trailInterval = _densityReduced ? _baseInterval * 2.0 : _baseInterval;
    // Start at _trailInterval (not 0) so the first emit is deferred one full
    // interval — avoids a BufferGeometry allocation on the cast frame itself.
    this._trailT = this._trailInterval;
    this._lastTrailPos = origin.clone();
  }

  get position() { return this.mesh.position; }

  _home(dt) {
    let best = null, bd = 35;
    for (const e of this.world.getEnemies()) {
      if (!e.alive) continue;
      const d = e.position.distanceTo(this.mesh.position);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return;
    const speed = this.vel.length();
    const desired = best.position.clone().sub(this.mesh.position).normalize();
    const cur = this.vel.clone().normalize();
    const angle = cur.angleTo(desired);
    const maxTurn = 5.0 * dt; // radians this frame
    const t = angle > 1e-4 ? Math.min(1, maxTurn / angle) : 1;
    const next = cur.lerp(desired, t).normalize();
    this.dir.copy(next);
    this.vel.copy(next.multiplyScalar(speed));
  }

  update(dt) {
    if (!this.alive) return;
    if (this.spell.stats.gravity) {
      this.vel.y -= this.spell.stats.gravity * dt;
    }
    if (this.faction === "player" && this.spell.homing) this._home(dt);
    this.mesh.quaternion.setFromUnitVectors(FORWARD, this.dir);
    const step = this.vel.clone().multiplyScalar(dt);
    this.mesh.position.add(step);
    this.travelled += step.length();

    this._trailT -= dt;
    if (this._trailT <= 0) {
      this._emitTrail();
    }

    const b = this.world.arenaBounds;
    const p = this.mesh.position;
    if (
      this.travelled >= this.maxRange ||
      p.y < 0 || p.y > b.h + 4 ||
      Math.abs(p.x) > b.half + 2 || Math.abs(p.z) > b.half + 2
    ) {
      this.expire(false);
    }
  }

  expire(impacted) {
    if (!this.alive) return;
    this.expiredAt = this.mesh.position.clone();
    this.impacted = impacted;
    this.alive = false;
    this.world.scene.remove(this.mesh);
    _releaseVisual(this.mesh, this.spell.definitionId ?? "default");
  }

  _emitTrail() {
    // Reset timer — interval is driven by definition data (trailInterval).
    this._trailT = this._trailInterval;

    // Resolve colorblind-corrected color (same as HitResolver does for impacts).
    const color = resolveColor(this.spell, this.world?.settings);

    // Dispatch through VfxLibrary — no per-spell id branches here.
    emitTrail(this.world.vfx, this.spell, this._lastTrailPos, this.mesh.position, color);

    this._lastTrailPos.copy(this.mesh.position);
  }
}
