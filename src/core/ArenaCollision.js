import * as THREE from "three";

export function pointInRect(pos, rect, radius = 0) {
  const minX = rect.x - rect.w / 2 - radius;
  const maxX = rect.x + rect.w / 2 + radius;
  const minZ = rect.z - rect.d / 2 - radius;
  const maxZ = rect.z + rect.d / 2 + radius;
  return pos.x >= minX && pos.x <= maxX && pos.z >= minZ && pos.z <= maxZ;
}

export function isCircleClear(pos, radius, obstacles = []) {
  return !obstacles.some((o) => o.solid !== false && pointInRect(pos, o, radius));
}

export function resolveCircleAgainstObstacles(pos, radius, obstacles = []) {
  let moved = false;
  for (let pass = 0; pass < 3; pass++) {
    let passMoved = false;
    for (const o of obstacles) {
      if (o.solid === false || !pointInRect(pos, o, radius)) continue;
      const minX = o.x - o.w / 2 - radius;
      const maxX = o.x + o.w / 2 + radius;
      const minZ = o.z - o.d / 2 - radius;
      const maxZ = o.z + o.d / 2 + radius;
      const pushLeft = Math.abs(pos.x - minX);
      const pushRight = Math.abs(maxX - pos.x);
      const pushDown = Math.abs(pos.z - minZ);
      const pushUp = Math.abs(maxZ - pos.z);
      const pushX = pushLeft < pushRight ? -pushLeft : pushRight;
      const pushZ = pushDown < pushUp ? -pushDown : pushUp;
      if (Math.abs(pushX) < Math.abs(pushZ)) pos.x += pushX;
      else pos.z += pushZ;
      passMoved = true;
      moved = true;
    }
    if (!passMoved) break;
  }
  return moved;
}

export function segmentHitsObstacles(from, to, radius, obstacles = []) {
  let best = null;
  for (const o of obstacles) {
    if (o.solid === false) continue;
    const hit = segmentHitsRect(from, to, o, radius);
    if (hit && (!best || hit.t < best.t)) best = { ...hit, obstacle: o };
  }
  return best;
}

function segmentHitsRect(from, to, rect, radius = 0) {
  const minX = rect.x - rect.w / 2 - radius;
  const maxX = rect.x + rect.w / 2 + radius;
  const minZ = rect.z - rect.d / 2 - radius;
  const maxZ = rect.z + rect.d / 2 + radius;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  let t0 = 0;
  let t1 = 1;

  const axis = (p, d, min, max) => {
    if (Math.abs(d) < 1e-6) return p >= min && p <= max;
    const inv = 1 / d;
    let a = (min - p) * inv;
    let b = (max - p) * inv;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    return t0 <= t1;
  };

  if (!axis(from.x, dx, minX, maxX)) return null;
  if (!axis(from.z, dz, minZ, maxZ)) return null;
  if (t1 < 0 || t0 > 1) return null;
  const t = THREE.MathUtils.clamp(t0, 0, 1);
  return { t, point: from.clone().lerp(to, t) };
}

export function findSafeDestination(from, to, radius, obstacles = []) {
  const hit = segmentHitsObstacles(from, to, radius, obstacles);
  if (!hit) return to.clone();
  const dir = to.clone().sub(from);
  const len = dir.length();
  if (len < 1e-4) return from.clone();
  const safeDist = Math.max(0, hit.t * len - radius - 0.2);
  return from.clone().add(dir.normalize().multiplyScalar(safeDist));
}

export function rectContainsPoint(pos, rect) {
  return pointInRect(pos, rect, 0);
}
