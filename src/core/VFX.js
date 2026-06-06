import * as THREE from "three";

// Hard cap on concurrent VFX items. Trail effects (embers, spiral) are
// low-priority and dropped first when the budget is reached; impact/
// explosion/death effects are high-priority and evict trails if needed.
const VFX_BUDGET = 200;

// Lightweight self-updating visual effects (procedural, no textures).
export class VFX {
  constructor(scene) {
    this.scene = scene;
    this.items = []; // { obj, life, max, update(dt, e), isTrail }
    this.density = 1;
    this._screenShake = 1;
    this._reducedMotion = false;
  }

  setDensity(mode = "full") {
    this.density = mode === "reduced" ? 0.55 : 1;
  }

  setScreenShake(enabled) {
    this._screenShake = enabled ? 1 : 0;
  }

  setReducedMotion(enabled) {
    this._reducedMotion = enabled;
  }

  _motionScale() {
    return this._reducedMotion ? 0 : 1;
  }

  _scaledCount(count, min = 1) {
    return Math.max(min, Math.round(count * this.density));
  }

  // Lower-floor variant for trail emitters — trails are continuous per-frame
  // emitters, so the reduced preset must actually reduce them (floor=1 not 3+).
  _scaledTrailCount(count) {
    return Math.max(1, Math.round(count * this.density));
  }

  _disposeObject(obj) {
    obj.traverse?.((o) => {
      o.geometry?.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) m?.dispose?.();
    });
    if (!obj.traverse) {
      obj.geometry?.dispose?.();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) m?.dispose?.();
    }
  }

  _add(obj, life, update, isTrail = false) {
    if (this.items.length >= VFX_BUDGET) {
      if (isTrail) {
        // Budget full — drop this low-priority trail rather than evicting others.
        this._disposeObject(obj);
        return obj;
      }
      // High-priority effect: evict the oldest trail to make room, or if none
      // exist evict the oldest item overall so the effect still appears.
      const trailIdx = this.items.findIndex((o) => o.userData._fx?.isTrail);
      const evictIdx = trailIdx !== -1 ? trailIdx : 0;
      const evicted = this.items[evictIdx];
      this.scene.remove(evicted);
      this._disposeObject(evicted);
      this.items.splice(evictIdx, 1);
    }
    obj.userData._fx = { life, max: life, update, isTrail };
    this.scene.add(obj);
    this.items.push(obj);
    return obj;
  }

  // Attach a caller-controlled animated object (used by the meteor fall).
  custom(obj, life, update) { return this._add(obj, life, update); }

  burst(pos, color = 0xffffff, count = 16, spread = 9, life = 0.5, size = 0.18) {
    count = this._scaledCount(count, 4);
    const ms = this._motionScale();
    const g = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const vel = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
      vel.push(new THREE.Vector3(
        (Math.random() - 0.5) * spread * ms,
        Math.random() * spread * 0.7 * ms,
        (Math.random() - 0.5) * spread * ms
      ));
    }
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const m = new THREE.PointsMaterial({ color, size, transparent: true, depthWrite: false });
    const pts = new THREE.Points(g, m);
    this._add(pts, life, (dt, e) => {
      if (ms > 0) {
        const arr = g.attributes.position.array;
        for (let i = 0; i < count; i++) {
          vel[i].y -= 14 * dt;
          arr[i * 3] += vel[i].x * dt;
          arr[i * 3 + 1] += vel[i].y * dt;
          arr[i * 3 + 2] += vel[i].z * dt;
        }
        g.attributes.position.needsUpdate = true;
      }
      m.opacity = e;
    });
  }

  beam(from, to, color = 0xa9e7ff, life = 0.22) {
    const g = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const m = new THREE.LineBasicMaterial({ color, transparent: true, linewidth: 2 });
    const ln = new THREE.Line(g, m);
    this._add(ln, life, (dt, e) => { m.opacity = e; });
  }

  lightning(from, to, color = 0xa9e7ff, life = 0.18, forks = 2) {
    forks = this._scaledCount(forks, 0);
    const group = new THREE.Group();
    const delta = to.clone().sub(from);
    const len = delta.length();
    if (len < 1e-4) return group;
    const dir = delta.clone().multiplyScalar(1 / len);
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
    side.normalize();
    const up = new THREE.Vector3().crossVectors(dir, side).normalize();

    const points = [];
    const segments = 7;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const jitter = i === 0 || i === segments ? 0 : (Math.random() - 0.5) * Math.min(1.4, len * 0.08);
      const rise = i === 0 || i === segments ? 0 : (Math.random() - 0.5) * Math.min(0.9, len * 0.05);
      points.push(from.clone()
        .lerp(to, t)
        .add(side.clone().multiplyScalar(jitter))
        .add(up.clone().multiplyScalar(rise)));
    }

    const makeLine = (pts, opacity, widthColor = color) => {
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      const m = new THREE.LineBasicMaterial({ color: widthColor, transparent: true, opacity });
      const ln = new THREE.Line(g, m);
      group.add(ln);
      return m;
    };

    const mats = [makeLine(points, 1), makeLine([from.clone(), to.clone()], 0.35, 0xffffff)];
    for (let i = 0; i < forks; i++) {
      const idx = 1 + Math.floor(Math.random() * (segments - 1));
      const start = points[idx];
      const forkLen = Math.min(4, len * 0.22) * (0.45 + Math.random() * 0.55);
      const forkDir = dir.clone()
        .add(side.clone().multiplyScalar((Math.random() - 0.5) * 1.7))
        .add(up.clone().multiplyScalar((Math.random() - 0.2) * 0.9))
        .normalize();
      mats.push(makeLine([start.clone(), start.clone().add(forkDir.multiplyScalar(forkLen))], 0.55));
    }

    this._add(group, life, (dt, e) => {
      for (const m of mats) m.opacity = e * (m.color.getHex() === 0xffffff ? 0.45 : 1);
    });
    return group;
  }

  ring(pos, radius, color = 0xff5530, life = 1.2) {
    const g = new THREE.RingGeometry(radius * 0.92, radius, 36);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, opacity: 0.8 });
    const r = new THREE.Mesh(g, m);
    r.rotation.x = -Math.PI / 2;
    r.position.set(pos.x, 0.06, pos.z);
    this._add(r, life, (dt, e) => { m.opacity = 0.8 * e; });
    return r;
  }

  shock(pos, color = 0xff7a33, maxR = 6, life = 0.4) {
    const g = new THREE.RingGeometry(0.1, 0.4, 32);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide });
    const r = new THREE.Mesh(g, m);
    r.rotation.x = -Math.PI / 2;
    r.position.set(pos.x, 0.1, pos.z);
    this._add(r, life, (dt, e) => {
      const scaledMaxR = maxR * this._screenShake * this._motionScale();
      const s = (1 - e) * scaledMaxR + 0.4;
      r.scale.set(s, s, s);
      m.opacity = e * this._motionScale();
    });
  }

  flash(pos, color = 0xffffff, radius = 0.6, life = 0.18) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true });
    const s = new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 10), m);
    s.position.copy(pos);
    this._add(s, life, (dt, e) => { m.opacity = e; s.scale.setScalar(1 + (1 - e) * 1.6); });
  }

  mist(pos, color = 0x66dd55, radius = 1.4, life = 0.8, count = 10) {
    count = this._scaledCount(count, 3);
    const ms = this._motionScale();
    const g = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const vel = [];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.3;
      positions[i * 3] = pos.x + Math.cos(a) * r;
      positions[i * 3 + 1] = pos.y + (Math.random() - 0.5) * radius * 0.25;
      positions[i * 3 + 2] = pos.z + Math.sin(a) * r;
      vel.push(new THREE.Vector3(
        Math.cos(a) * (0.35 + Math.random() * 0.9) * ms,
        (0.25 + Math.random() * 0.8) * ms,
        Math.sin(a) * (0.35 + Math.random() * 0.9) * ms
      ));
    }
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const m = new THREE.PointsMaterial({
      color,
      size: radius * 0.36,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const pts = new THREE.Points(g, m);
    this._add(pts, life, (dt, e) => {
      if (ms > 0) {
        const arr = g.attributes.position.array;
        for (let i = 0; i < count; i++) {
          arr[i * 3] += vel[i].x * dt;
          arr[i * 3 + 1] += vel[i].y * dt;
          arr[i * 3 + 2] += vel[i].z * dt;
        }
        g.attributes.position.needsUpdate = true;
      }
      m.opacity = 0.55 * e;
      m.size = radius * (0.25 + (1 - e) * 0.45);
    });
  }

  // ---------------------------------------------------------------------------
  // New trail primitives (92b)
  // ---------------------------------------------------------------------------

  // Gravity-affected falling ember particles — used for Fireball trail.
  // Low initial spread, downward bias so they trail and fall behind the lob.
  embers(pos, color = 0xff7a33, count = 5, life = 0.55) {
    if (this._reducedMotion) {
      // Under reduced motion: brief static flash instead of moving embers.
      this.flash(pos, color, 0.1, life * 0.5);
      return;
    }
    count = this._scaledTrailCount(count);
    const g = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const vel = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
      // Low lateral spread, slight upward kick then gravity pulls down.
      vel.push(new THREE.Vector3(
        (Math.random() - 0.5) * 1.8,
        0.4 + Math.random() * 1.0,
        (Math.random() - 0.5) * 1.8
      ));
    }
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const m = new THREE.PointsMaterial({ color, size: 0.12, transparent: true, depthWrite: false });
    const pts = new THREE.Points(g, m);
    this._add(pts, life, (dt, e) => {
      const arr = g.attributes.position.array;
      for (let i = 0; i < count; i++) {
        vel[i].y -= 18 * dt; // stronger gravity than burst so embers fall fast
        arr[i * 3] += vel[i].x * dt;
        arr[i * 3 + 1] += vel[i].y * dt;
        arr[i * 3 + 2] += vel[i].z * dt;
      }
      g.attributes.position.needsUpdate = true;
      m.opacity = e * 0.85;
    }, true);
  }

  // Shrinking corkscrew of tiny flash spheres — used for Arcane Bolt trail.
  // Places N small Points on a helix around the travel axis, radius decays
  // toward tail. Under reducedMotion emits a brief static low-opacity marker.
  spiral(lastPos, pos, color = 0x9a6cff, count = 5) {
    if (this._reducedMotion) {
      this.flash(pos, color, 0.06, 0.08);
      return;
    }
    count = this._scaledTrailCount(count);
    const delta = pos.clone().sub(lastPos);
    const len = delta.length();
    if (len < 1e-5) return;
    const axisDir = delta.clone().normalize();

    // Build a perpendicular frame.
    const perp = Math.abs(axisDir.y) < 0.9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
    const side = new THREE.Vector3().crossVectors(axisDir, perp).normalize();
    const up2  = new THREE.Vector3().crossVectors(axisDir, side).normalize();

    const g = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Helix angle spread across the segment, radius shrinks tail → head.
      const t = i / Math.max(1, count - 1);
      const angle = t * Math.PI * 2.5 + (Math.random() - 0.5) * 0.4;
      const radius = 0.18 * (1 - t * 0.55);
      const p = lastPos.clone()
        .lerp(pos, t)
        .addScaledVector(side, Math.cos(angle) * radius)
        .addScaledVector(up2,  Math.sin(angle) * radius);
      positions[i * 3]     = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
    }
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const m = new THREE.PointsMaterial({ color, size: 0.09, transparent: true, depthWrite: false });
    const pts = new THREE.Points(g, m);
    this._add(pts, 0.12, (dt, e) => { m.opacity = e * 0.7; }, true);
  }

  // Short, rigid, radiating spark lines for Frost shatter impact.
  // Straight lightning segments (no jitter/forks) — shatter silhouette.
  shards(pos, color = 0xbdefff, count = 6, length = 1.8) {
    count = this._scaledCount(count, 2);
    const ms = this._motionScale();
    const group = new THREE.Group();
    const mats = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const tilt  = (Math.random() - 0.3) * 0.5;
      const dir = new THREE.Vector3(
        Math.cos(angle),
        tilt,
        Math.sin(angle)
      ).normalize();
      const end = pos.clone().addScaledVector(dir, length * (0.5 + Math.random() * 0.5));
      const g = new THREE.BufferGeometry().setFromPoints([pos.clone(), end]);
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
      group.add(new THREE.Line(g, mat));
      mats.push({ mat, start: pos.clone(), end, dir, len: pos.distanceTo(end) });
    }
    const life = 0.22;
    this._add(group, life, (dt, e) => {
      for (const s of mats) {
        s.mat.opacity = e * 0.9;
        if (ms > 0) {
          // Extend shards slightly outward as they fade (small motion, sells shatter).
          const ext = s.end.clone().addScaledVector(s.dir, 0.6 * dt * ms);
          s.end.copy(ext);
          const child = group.children[mats.indexOf(s)];
          if (child) {
            const arr = child.geometry.attributes.position.array;
            arr[3] = s.end.x; arr[4] = s.end.y; arr[5] = s.end.z;
            child.geometry.attributes.position.needsUpdate = true;
          }
        }
      }
    });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const o = this.items[i];
      const fx = o.userData._fx;
      fx.life -= dt;
      const e = Math.max(0, fx.life / fx.max);
      fx.update(dt, e);
      if (fx.life <= 0) {
        this.scene.remove(o);
        this._disposeObject(o);
        this.items.splice(i, 1);
      }
    }
  }

  clear() {
    for (const o of this.items) {
      this.scene.remove(o);
      this._disposeObject(o);
    }
    this.items.length = 0;
  }
}
