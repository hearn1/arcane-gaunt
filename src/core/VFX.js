import * as THREE from "three";

// Lightweight self-updating visual effects (procedural, no textures).
export class VFX {
  constructor(scene) {
    this.scene = scene;
    this.items = []; // { obj, life, max, update(dt, e) }
    this.density = 1;
  }

  setDensity(mode = "full") {
    this.density = mode === "reduced" ? 0.55 : 1;
  }

  _scaledCount(count, min = 1) {
    return Math.max(min, Math.round(count * this.density));
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

  _add(obj, life, update) {
    obj.userData._fx = { life, max: life, update };
    this.scene.add(obj);
    this.items.push(obj);
    return obj;
  }

  // Attach a caller-controlled animated object (used by the meteor fall).
  custom(obj, life, update) { return this._add(obj, life, update); }

  burst(pos, color = 0xffffff, count = 16, spread = 9, life = 0.5, size = 0.18) {
    count = this._scaledCount(count, 4);
    const g = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const vel = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
      vel.push(new THREE.Vector3(
        (Math.random() - 0.5) * spread,
        Math.random() * spread * 0.7,
        (Math.random() - 0.5) * spread
      ));
    }
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const m = new THREE.PointsMaterial({ color, size, transparent: true, depthWrite: false });
    const pts = new THREE.Points(g, m);
    this._add(pts, life, (dt, e) => {
      const arr = g.attributes.position.array;
      for (let i = 0; i < count; i++) {
        vel[i].y -= 14 * dt;
        arr[i * 3] += vel[i].x * dt;
        arr[i * 3 + 1] += vel[i].y * dt;
        arr[i * 3 + 2] += vel[i].z * dt;
      }
      g.attributes.position.needsUpdate = true;
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
      const s = (1 - e) * maxR + 0.4;
      r.scale.set(s, s, s);
      m.opacity = e;
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
        Math.cos(a) * (0.35 + Math.random() * 0.9),
        0.25 + Math.random() * 0.8,
        Math.sin(a) * (0.35 + Math.random() * 0.9)
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
      const arr = g.attributes.position.array;
      for (let i = 0; i < count; i++) {
        arr[i * 3] += vel[i].x * dt;
        arr[i * 3 + 1] += vel[i].y * dt;
        arr[i * 3 + 2] += vel[i].z * dt;
      }
      g.attributes.position.needsUpdate = true;
      m.opacity = 0.55 * e;
      m.size = radius * (0.25 + (1 - e) * 0.45);
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
