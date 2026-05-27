import * as THREE from "three";
import { Health } from "../core/Health.js";
import { applyDamage } from "../core/Damage.js";
import { MeleeEnemy } from "../enemies/Enemy.js";

const OBJECTIVE_CHANCE = 0.32;
const OBJECTIVE_LEVEL_GATE = 3;

const OBJECTIVES = {
  hold_sigil: {
    id: "hold_sigil",
    name: "Hold the Sigil",
    description: "Stand in the marked circle to charge it while clearing enemies.",
  },
  cleanse_rift: {
    id: "cleanse_rift",
    name: "Cleanse the Rift",
    description: "Destroy or stand near each rift anchor, then finish the wave.",
  },
  interrupt_ritual: {
    id: "interrupt_ritual",
    name: "Interrupt the Ritual",
    description: "Break the ritual anchor before its timer keeps calling pressure.",
  },
};

const VARIANTS = ["hold_sigil", "cleanse_rift", "interrupt_ritual"];

function flatDist(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function disposeObject(obj) {
  obj.traverse?.((o) => {
    o.geometry?.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) m?.dispose?.();
  });
}

function makeRing(radius, color, opacity = 0.55) {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.92, radius, 48),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

class ObjectiveAnchor {
  constructor(manager, opts) {
    this.manager = manager;
    this.world = manager.world;
    this.kind = opts.kind;
    this.label = opts.label;
    this.radius = opts.radius || 0.85;
    this.cleanseRadius = opts.cleanseRadius || 3.1;
    this.cleanseRequired = opts.cleanseRequired || 1.6;
    this.cleanseProgress = 0;
    this.immovable = true;
    this.alive = true;
    this.isObjective = true;
    this._pulseT = 1.5 + Math.random() * 1.6;
    this._nearFxT = 0;

    this.health = new Health(opts.hp, "enemy", {
      onDamage: () => this._flash(),
      onDeath: (source) => this._destroy(source),
    });

    this.mesh = new THREE.Group();
    this.mesh.position.set(opts.pos.x, 0, opts.pos.z);
    this._buildVisual(opts.color);
    this.world.scene.add(this.mesh);
  }

  get position() { return this.mesh.position; }

  _buildVisual(color) {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.72, 0.92, 0.38, 24),
      new THREE.MeshBasicMaterial({ color: 0x171225 })
    );
    base.position.y = 0.19;
    this.mesh.add(base);

    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.58, 0),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92 })
    );
    core.position.y = 1.15;
    this.core = core;
    this.mesh.add(core);

    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 16, 16),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false })
    );
    glow.position.y = 1.15;
    this.glow = glow;
    this.mesh.add(glow);

    this.ring = makeRing(this.cleanseRadius, color, 0.42);
    this.ring.position.y = 0.05;
    this.mesh.add(this.ring);
  }

  _flash() {
    this.manager.world.vfx.flash(this.position.clone().setY(1.0), 0xffffff, 0.5, 0.12);
  }

  _destroy(source) {
    if (!this.alive) return;
    this.alive = false;
    this.world.vfx.shock(this.position, this.kind === "ritual" ? 0xffcf4d : 0x7fffe6, 3.5, 0.36);
    this.world.vfx.burst(this.position.clone().setY(1.0), this.kind === "ritual" ? 0xffcf4d : 0x7fffe6, 24, 8, 0.5);
    this.world.audio?.enemyHit?.();
    this.forceRemove();
    this.manager._onAnchorDestroyed(this, source);
  }

  forceRemove() {
    if (this._removed) return;
    this._removed = true;
    if (this.mesh.parent) this.world.scene.remove(this.mesh);
    disposeObject(this.mesh);
  }

  applySlow() {}
  applyFreeze() {}
  applyStun() {}
  applyDot() {}

  update(dt, time) {
    if (!this.alive) return;
    this.mesh.rotation.y += dt * 0.9;
    this.core.position.y = 1.15 + Math.sin(time * 3.0) * 0.12;
    this.glow.material.opacity = 0.15 + Math.sin(time * 4.0) * 0.06;
    this.ring.material.opacity = 0.3 + Math.sin(time * 4.8) * 0.12;

    const playerFeet = this.world.player.feet;
    if (this.kind === "cleanse") this._updateCleanse(dt, playerFeet);
    this._pulseT -= dt;
    if (this._pulseT <= 0) {
      this._pulseT = this.kind === "cleanse" ? 6.4 : 3.2;
      this.world.vfx.ring(this.position, this.cleanseRadius, this.kind === "ritual" ? 0xffcf4d : 0x7fffe6, 0.7);
    }
  }

  _updateCleanse(dt, playerFeet) {
    if (flatDist(this.position, playerFeet) > this.cleanseRadius) return;
    this.cleanseProgress += dt;
    this._nearFxT -= dt;
    if (this._nearFxT <= 0) {
      this._nearFxT = 0.28;
      this.world.vfx.flash(this.position.clone().setY(0.15), 0x7fffe6, 0.22, 0.12);
    }
    if (this.cleanseProgress >= this.cleanseRequired) {
      applyDamage(this, this.health.current, {
        owner: "player",
        spellId: "objective_cleanse",
        spellName: "Rift Cleanse",
      });
    }
  }
}

export class ObjectiveManager {
  constructor(world) {
    this.world = world;
    this.active = null;
    this.anchors = [];
    this.group = null;
  }

  reset() {
    this.clear();
  }

  clear() {
    for (const a of this.anchors) a.forceRemove();
    this.anchors = [];
    if (this.group) {
      this.world.scene.remove(this.group);
      disposeObject(this.group);
    }
    this.group = null;
    this.hold = null;
    this.ritual = null;
    this._cleansePulseT = 0;
    this.active = null;
  }

  startForWave(level, layoutName, forcedId = null) {
    this.clear();
    const id = forcedId || this._roll(level);
    if (!id) return null;
    const meta = OBJECTIVES[id];
    this.active = {
      ...meta,
      level,
      layoutName,
      complete: false,
      notified: false,
      status: "",
    };
    if (id === "hold_sigil") this._startHold(level);
    else if (id === "cleanse_rift") this._startCleanse(level);
    else if (id === "interrupt_ritual") this._startRitual(level);
    this.world.onboarding?.note(this.world, "objectives");
    return this.bannerMeta();
  }

  _roll(level) {
    if (level < OBJECTIVE_LEVEL_GATE || level % 5 === 0) return null;
    if (Math.random() > OBJECTIVE_CHANCE) return null;
    return VARIANTS[Math.floor(Math.random() * VARIANTS.length)];
  }

  _point(minFromPlayer = 8, preferCenter = false) {
    const half = this.world.arenaBounds.half - 8;
    const player = this.world.player.feet;
    for (let i = 0; i < 80; i++) {
      const r = preferCenter ? Math.random() * 18 : Math.random() * half;
      const a = Math.random() * Math.PI * 2;
      const p = { x: Math.cos(a) * r, z: Math.sin(a) * r };
      if (flatDist(p, player) < minFromPlayer) continue;
      if (this.anchors.some((anchor) => flatDist(p, anchor.position) < 9)) continue;
      if (this.world.isArenaPointClear?.(p, 2.0) ?? true) return p;
    }
    return { x: 0, z: 0 };
  }

  _startHold(level) {
    const pos = this._point(7, true);
    const radius = 5.0;
    const required = Math.min(12, 8.0 + level * 0.4);
    this.group = new THREE.Group();
    this.group.position.set(pos.x, 0, pos.z);
    this.world.scene.add(this.group);

    this.hold = {
      pos: new THREE.Vector3(pos.x, 0, pos.z),
      radius,
      charge: 0,
      required,
      fxT: 0,
    };

    const outer = makeRing(radius, 0xb6ff76, 0.52);
    outer.position.y = 0.06;
    this.group.add(outer);
    const inner = makeRing(radius * 0.62, 0x7fe0ff, 0.28);
    inner.position.y = 0.07;
    this.group.add(inner);
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.44, 1.7, 18),
      new THREE.MeshBasicMaterial({ color: 0xb6ff76, transparent: true, opacity: 0.58 })
    );
    pillar.position.y = 0.85;
    this.group.add(pillar);
    this.hold.outer = outer;
    this.hold.inner = inner;
    this.hold.pillar = pillar;
    this._setStatus(`Charge 0%`);
  }

  _startCleanse(level) {
    const count = level >= 7 ? 3 : 2;
    for (let i = 0; i < count; i++) {
      const anchor = new ObjectiveAnchor(this, {
        kind: "cleanse",
        label: "Rift Anchor",
        pos: this._point(7),
        hp: Math.round(45 + level * 4.5),
        radius: 0.95,
        cleanseRadius: 3.2,
        cleanseRequired: 1.35,
        color: 0x47ffd2,
      });
      this.anchors.push(anchor);
    }
    this._cleansePulseT = 7.5;
    this._setStatus(`${this._destroyedCount()} / ${this.anchors.length} anchors cleansed`);
  }

  _startRitual(level) {
    const anchor = new ObjectiveAnchor(this, {
      kind: "ritual",
      label: "Ritual Anchor",
      pos: this._point(8, true),
      hp: Math.round(78 + level * 7.5),
      radius: 1.05,
      cleanseRadius: 4.0,
      color: 0xffcf4d,
    });
    this.anchors.push(anchor);
    this.ritual = {
      timer: 12.0,
      maxTimer: 12.0,
      spawnCount: 0,
    };
    this._setStatus(`Ritual pulse in ${this.ritual.timer.toFixed(0)}s`);
  }

  update(dt) {
    if (!this.active) return;
    const id = this.active.id;
    const time = performance.now() * 0.001;
    for (const a of this.anchors) a.update(dt, time);
    if (!this.active) return;
    if (id === "hold_sigil") this._updateHold(dt, time);
    if (!this.active) return;
    if (id === "cleanse_rift") this._updateCleanse(dt);
    if (!this.active) return;
    if (id === "interrupt_ritual") this._updateRitual(dt);
  }

  _updateHold(dt, time) {
    const hold = this.hold;
    if (!hold || this.active.complete) return;
    const inside = flatDist(hold.pos, this.world.player.feet) <= hold.radius;
    if (inside) {
      hold.charge = Math.min(hold.required, hold.charge + dt);
      hold.fxT -= dt;
      if (hold.fxT <= 0) {
        hold.fxT = 0.42;
        this.world.vfx.ring(hold.pos, hold.radius * (0.85 + hold.charge / hold.required * 0.15), 0xb6ff76, 0.55);
      }
    }
    const pct = Math.round((hold.charge / hold.required) * 100);
    hold.outer.scale.setScalar(1 + Math.sin(time * 4.0) * 0.025);
    hold.inner.scale.setScalar(0.92 + (hold.charge / hold.required) * 0.22);
    hold.pillar.material.opacity = inside ? 0.78 : 0.46;
    this._setStatus(`Charge ${pct}%${inside ? " - holding" : ""}`);
    if (hold.charge >= hold.required) this._complete("Sigil charged");
  }

  _updateCleanse(dt) {
    if (this.active.complete) return;
    const total = this.anchors.length;
    const destroyed = this._destroyedCount();
    this._setStatus(`${destroyed} / ${total} anchors cleansed`);
    this._cleansePulseT -= dt;
    if (this._cleansePulseT <= 0) {
      this._cleansePulseT = 7.5;
      let playerInPulse = false;
      for (const a of this.anchors) {
        if (!a.alive) continue;
        this.world.vfx.shock(a.position, 0x47ffd2, 5.0, 0.34);
        if (flatDist(a.position, this.world.player.feet) <= 12) {
          playerInPulse = true;
        }
      }
      if (playerInPulse) {
        applyDamage(this.world.player, 6 + this.active.level * 0.4, {
          owner: "enemy",
          spellId: "rift_anchor_pulse",
          spellName: "Rift Anchor Pulse",
        });
        this.world.onPlayerHurt?.();
      }
    }
    if (destroyed >= total) this._complete("Rifts cleansed");
  }

  _updateRitual(dt) {
    if (this.active.complete || !this.ritual) return;
    const anchor = this.anchors.find((a) => a.alive);
    if (!anchor) return;
    this.ritual.timer -= dt;
    this._setStatus(`Ritual pulse in ${Math.max(0, this.ritual.timer).toFixed(1)}s`);
    if (this.ritual.timer > 0) return;
    this.ritual.timer = this.ritual.maxTimer;
    this.ritual.spawnCount += 1;
    this.world.vfx.shock(anchor.position, 0xffcf4d, 8.0, 0.42);
    this.world.vfx.flash(anchor.position.clone().setY(1.0), 0xffcf4d, 1.0, 0.2);
    if (flatDist(anchor.position, this.world.player.feet) <= 18) {
      applyDamage(this.world.player, 8 + this.active.level * 0.5, {
        owner: "enemy",
        spellId: "ritual_pulse",
        spellName: "Ritual Pulse",
      });
      this.world.onPlayerHurt?.();
    }
    const extras = this.ritual.spawnCount <= 3 ? 2 : 1;
    for (let i = 0; i < extras; i++) {
      this.world.enemyManager.spawnExtra(MeleeEnemy, this.active.level, anchor.position);
    }
    this.world.onCombatProc?.("Ritual pulse");
  }

  _destroyedCount() {
    return this.anchors.filter((a) => !a.alive).length;
  }

  _onAnchorDestroyed(anchor, source) {
    if (!this.active) return;
    if (this.active.id === "interrupt_ritual") this._complete("Ritual broken");
    if (this.active.id === "cleanse_rift") {
      this._setStatus(`${this._destroyedCount()} / ${this.anchors.length} anchors cleansed`);
    }
  }

  _setStatus(status) {
    if (this.active) this.active.status = status;
  }

  _complete(message) {
    if (!this.active || this.active.complete) return;
    this.active.complete = true;
    this._setStatus(message);
    this.world.onCombatProc?.(message);
    this.world.onObjectiveComplete?.();
  }

  isComplete() {
    return !this.active || this.active.complete;
  }

  targets() {
    return this.anchors.filter((a) => a.alive);
  }

  hudText() {
    if (!this.active) return null;
    return {
      name: this.active.name,
      status: this.active.status || this.active.description,
      complete: this.active.complete,
    };
  }

  bannerMeta() {
    if (!this.active) return null;
    return {
      id: this.active.id,
      name: this.active.name,
      description: this.active.description,
    };
  }
}
