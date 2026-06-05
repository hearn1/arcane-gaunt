import * as THREE from "three";
import { applyDamage } from "../core/Damage.js";
import { applyPlayerDamage } from "../core/CombatBonuses.js";
import { Projectile } from "../projectile/Projectile.js";

// Per-cast-type behaviors. Consolidated here (rather than one file per type)
// to share spawn/aim helpers; selection is by spell.castType.

function castSource(spell, faction, extra = {}) {
  return {
    owner: faction,
    spellId: spell.definitionId,
    spellName: spell.displayName,
    isDot: false, isAoe: false, isChain: false,
    ...extra,
  };
}

function spawnProjectile(world, spell, origin, dir, faction) {
  const p = new Projectile(world, spell, origin, dir, faction);
  world.hitResolver.add(p);
}

// Ground point under the aim ray, clamped to arena + spell range.
// Respects walkable surfaces: AoE spells land on the elevated surface
// the player aimed at, not always on the floor.
function aimGroundPoint(world, origin, dir, range) {
  let t = 200;
  if (Math.abs(dir.y) > 1e-4) {
    const hit = -origin.y / dir.y;
    if (hit > 0) t = hit;
  }
  const pt = origin.clone().add(dir.clone().multiplyScalar(Math.min(t, range)));
  pt.y = 0;
  const half = world.arenaBounds.half - 1;
  pt.x = THREE.MathUtils.clamp(pt.x, -half, half);
  pt.z = THREE.MathUtils.clamp(pt.z, -half, half);
  const flat = origin.clone(); flat.y = 0;
  if (pt.distanceTo(flat) > range) {
    pt.sub(flat).setLength(range).add(flat); pt.y = 0;
  }
  // Snap to walkable surface elevation if the target point lands on a
  // platform or ramp.
  if (world.getElevationAt) {
    const elev = world.getElevationAt(pt.x, pt.z);
    if (elev > 0) pt.y = elev;
  }
  return pt;
}

function chainLightning(world, spell, origin, dir, faction) {
  const enemies = [
    ...world.getEnemies(),
    ...(world.getObjectiveTargets?.() || []),
  ].filter((e) => e.alive);
  if (!enemies.length) return;
  const range = spell.stats.range;

  // First target: closest enemy roughly along the aim direction within range.
  let first = null, bestScore = -Infinity;
  for (const e of enemies) {
    const to = e.position.clone().sub(origin);
    const dist = to.length();
    if (dist > range) continue;
    const align = to.normalize().dot(dir);
    if (align < 0.45) continue;
    const score = align * 2 - dist / range;
    if (score > bestScore) { bestScore = score; first = e; }
  }
  if (!first) {
    // fall back to nearest enemy in range
    let nd = Infinity;
    for (const e of enemies) {
      const d = e.position.distanceTo(origin);
      if (d < nd && d <= range) { nd = d; first = e; }
    }
  }
  if (!first) return;

  const chainRadius = spell.stormChain ? 14 * 1.3 : 14;
  const maxJumps = 1 + (spell.stats.chainCount || 0);
  const hit = new Set();
  let current = first;
  let from = origin.clone();
  for (let j = 0; j < maxJumps && current; j++) {
    const to = current.position.clone();
    if (world.vfx.lightning) world.vfx.lightning(from, to, spell.color, 0.24, j === 0 ? 3 : 2);
    else world.vfx.beam(from, to, spell.color, 0.22);
    world.vfx.flash(to, 0xffffff, 0.42, 0.12);
    world.vfx.burst(to, spell.color, 8, 6, 0.3, 0.12);
    const src = castSource(spell, faction, { isChain: j > 0 });
    if (faction === "player") applyPlayerDamage(world, current, spell.stats.damage, src);
    else applyDamage(current, spell.stats.damage, src);
    if (spell.stunOnHit) current.applyStun?.(0.4);
    hit.add(current);
    from = to;
    let next = null, nd = Infinity;
    for (const e of world.getEnemies()) {
      if (!e.alive || hit.has(e)) continue;
      const d = e.position.distanceTo(from);
      if (d < nd && d <= chainRadius) { nd = d; next = e; }
    }
    current = next;
  }
  world.audio.cast("chain");
}

function meteor(world, spell, origin, dir, faction) {
  const target = aimGroundPoint(world, origin, dir, spell.stats.range);
  world.audio.cast("meteor");
  world.vfx.ring(target, spell.stats.areaRadius, spell.color, 1.05);

  world.after(1.0, () => {
    // Falling rock animation, then ground explosion via the hit resolver.
    const rock = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.DodecahedronGeometry(1.15, 0),
      new THREE.MeshBasicMaterial({ color: 0x3a2a24 })
    );
    body.scale.set(1.15, 0.9, 1.0);
    rock.add(body);
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.82, 12, 12),
      new THREE.MeshBasicMaterial({ color: spell.color, transparent: true, opacity: 0.55, depthWrite: false })
    );
    rock.add(core);
    const tail = new THREE.Mesh(
      new THREE.ConeGeometry(0.95, 4.2, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xff8a3d,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    tail.position.y = 2.55;
    rock.add(tail);
    const startY = 42;
    rock.position.set(target.x, startY, target.z);
    let done = false;
    let trailT = 0;
    world.vfx.custom(rock, 0.42, (dt, e) => {
      rock.position.y = e * startY + 0.5;          // e: 1 -> 0
      rock.rotation.x += dt * 5.5;
      rock.rotation.z += dt * 3.5;
      core.material.opacity = 0.35 + Math.sin(performance.now() * 0.03) * 0.18;
      trailT -= dt;
      if (trailT <= 0) {
        trailT = 0.045;
        world.vfx.flash(rock.position, spell.color, 0.8, 0.12);
        world.vfx.mist?.(rock.position, 0x3b3340, 0.9, 0.45, 5);
      }
      if (e <= 0.02 && !done) {
        done = true;
        // Meteor impact shake (94b) — large amplitude, decays over 0.3s.
        // Routed through world so Effects.js needs no direct reference to Game.
        world.screenEffects?.meteorImpactShake();
        world.hitResolver.groundExplode(target.clone(), spell, faction);
        if (faction === "player" && spell.followups > 0) {
          const clone = Object.assign(Object.create(Object.getPrototypeOf(spell)), spell);
          clone.stats = {
            ...spell.stats,
            damage: Math.round(spell.stats.damage * 0.5),
            areaRadius: spell.stats.areaRadius * 0.6,
          };
          clone.followups = 0;
          clone.burnPatch = false;
          const half = world.arenaBounds.half - 1;
          for (let k = 1; k <= spell.followups; k++) {
            world.after(0.55 * k, () => {
              const ang = Math.random() * Math.PI * 2;
              const rad = spell.stats.areaRadius * (0.7 + Math.random() * 0.5);
              const pt = target.clone();
              pt.x = THREE.MathUtils.clamp(pt.x + Math.cos(ang) * rad, -half, half);
              pt.z = THREE.MathUtils.clamp(pt.z + Math.sin(ang) * rad, -half, half);
              pt.y = 0;
              world.vfx.flash(pt, spell.color, 1.4, 0.18);
              world.hitResolver.groundExplode(pt, clone, faction);
            });
          }
        }
      }
    });
  });
}

// Dispatch table.
export function castSpell(world, spell, origin, dir, faction) {
  switch (spell.castType) {
    case "hitscan_chain":
      chainLightning(world, spell, origin, dir, faction);
      return;
    case "ground_aoe":
      meteor(world, spell, origin, dir, faction);
      return;
    case "projectile":
    case "projectile_aoe":
    case "projectile_dot":
    default:
      spawnProjectile(world, spell, origin, dir, faction);
      if (faction === "player") world.audio.cast(spell.soundId);
      return;
  }
}
