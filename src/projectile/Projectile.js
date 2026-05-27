import * as THREE from "three";

const FORWARD = new THREE.Vector3(0, 0, 1);

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

    this.mesh = buildProjectileVisual(spell, world);
    this.mesh.position.copy(origin);
    this.mesh.quaternion.setFromUnitVectors(FORWARD, this.dir);
    world.scene.add(this.mesh);

    if (spell.stats.cadenceStacks) {
      this.cadenceStacks = 0;
      this.cadenceTimer = 0;
    }

    this._trailT = 0;
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
    disposeObject(this.mesh);
  }

  _emitTrail() {
    const id = this.spell.definitionId;
    const colorblind = this.world?.settings?.colorblindMode;
    const color = colorblind ? (this.spell.colorblindColor || this.spell.color) : this.spell.color;
    const pos = this.mesh.position;
    if (id === "arcane_bolt") {
      this._trailT = 0.025;
      this.world.vfx.beam(this._lastTrailPos, pos, color, 0.13);
      this.world.vfx.flash(pos, color, 0.08, 0.12);
    } else if (id === "fireball") {
      this._trailT = 0.045;
      this.world.vfx.flash(pos, 0xff7a33, 0.24, 0.2);
      this.world.vfx.burst(pos, 0xffc45a, 3, 2.4, 0.28, 0.08);
    } else if (id === "frost_bolt") {
      this._trailT = 0.035;
      this.world.vfx.beam(this._lastTrailPos, pos, 0xbdefff, 0.16);
      this.world.vfx.flash(pos, color, 0.12, 0.14);
    } else if (id === "poison_bolt") {
      this._trailT = 0.085;
      this.world.vfx.mist(pos, color, 0.55, 0.45, 5);
    } else {
      this._trailT = 0.03;
      this.world.vfx.flash(pos, color, 0.14, 0.16);
    }
    this._lastTrailPos.copy(pos);
  }
}
