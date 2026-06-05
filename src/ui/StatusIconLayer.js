/**
 * StatusIconLayer — floating DOM status-effect icons above enemies.
 *
 * Consumes world.projector (WorldProjector, issue #103) for all DOM nodes
 * and 3D→screen projection.  Never maintains its own pool.
 *
 * SHARED NODE BUDGET CONTRACT (see WorldProjector.js):
 *   MAX_POOLED_NODES = 64 total across ALL consumers (#96 + #99).
 *   This layer caps itself at MAX_OWN_NODES = 24 concurrent nodes.
 *   acquire()/spawn() can return null (pool exhausted) — always handled
 *   gracefully by skipping the icon rather than crashing.
 *
 * Usage:
 *   const layer = new StatusIconLayer();
 *   // Each frame (state === PLAYING, after enemy positions updated):
 *   layer.update(world, camera);
 */

import * as THREE from "three";

// ── Self-cap ─────────────────────────────────────────────────────────────────
// Max concurrent pool nodes this layer may hold simultaneously.
// Together with #99's cap of 40, the pair stays within the 64-node pool.
const MAX_OWN_NODES = 24;

// ── Distance cull ─────────────────────────────────────────────────────────────
// Skip enemies beyond this many world-units from the player.
const MAX_DIST_SQ = 30 * 30; // 30m², matches spec

// ── Icon definitions ─────────────────────────────────────────────────────────
// Each entry maps a statusSummary() id to its display properties.
// Icons use Unicode symbols (monochrome, no full-color emoji) so they
// stay tonally consistent with the game's procedural aesthetic.
const STATUS_DEFS = {
  chilled:  { glyph: "❄", color: "#5cc8ff", size: "15px", pulse: false },   // ❄
  frozen:   { glyph: "✶", color: "#a0eeff", size: "19px", pulse: true  },   // ✶ (larger, pulses)
  stunned:  { glyph: "★", color: "#ffcf4d", size: "16px", pulse: false },   // ★
  poisoned: { glyph: "☠", color: "#7fe060", size: "15px", pulse: false },   // ☠
  burning:  { glyph: "♥", color: "#ff8a30", size: "15px", pulse: false },   // ♥ (flame substitute)
};

// ── Scratch vector (avoids per-frame allocation) ──────────────────────────────
const _tmpVec = new THREE.Vector3();

export class StatusIconLayer {
  constructor() {
    /** @type {Map<HTMLElement, object>} node → { enemy, status } */
    this._nodeMap = new Map();
  }

  /**
   * Call once per frame when state === PLAYING, after enemy positions update.
   *
   * @param {object} world  — game world context (world.projector, world.player, world.getEnemies())
   * @param {THREE.Camera} _camera — (unused; projection goes through world.projector)
   */
  update(world, _camera) {
    const projector = world.projector;
    if (!projector) return;

    const reducedMotion = !!world.settings?.display?.reducedMotion;
    const playerPos = world.player?.position;

    // ── 1. Release all currently held nodes (full recycle each frame) ─────────
    // This is the simplest correct approach: release every node, then re-acquire
    // for the visible affected set. Nodes returned to the free list this frame
    // are immediately available for re-acquire below.
    for (const node of this._nodeMap.keys()) {
      projector.release(node);
    }
    this._nodeMap.clear();

    // ── 2. Gather candidates: alive enemies with an active status effect ──────
    const enemies = world.getEnemies?.() ?? [];
    const candidates = [];

    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const status = enemy.statusSummary?.();
      if (!status) continue;

      // Distance cull (before projection — fast XZ check, no sqrt).
      if (playerPos) {
        const dx = enemy.position.x - playerPos.x;
        const dz = enemy.position.z - playerPos.z;
        if (dx * dx + dz * dz > MAX_DIST_SQ) continue;
      }

      candidates.push({ enemy, status });
    }

    // ── 3. Nearest-first ordering under the self-cap ─────────────────────────
    // Sort by XZ distance ascending so close enemies always get icons.
    if (playerPos && candidates.length > MAX_OWN_NODES) {
      candidates.sort((a, b) => {
        const da = _distSq(a.enemy.position, playerPos);
        const db = _distSq(b.enemy.position, playerPos);
        return da - db;
      });
      candidates.length = MAX_OWN_NODES;
    }

    // ── 4. Project + assign pool nodes ───────────────────────────────────────
    for (const { enemy, status } of candidates) {
      // Self-cap check (belt-and-suspenders; sorting above should keep it ≤24).
      if (this._nodeMap.size >= MAX_OWN_NODES) break;

      // Build anchor world-position: enemy head + 0.5 above eye height.
      const anchorY = (enemy.position.y - (enemy.eyeH ?? 0)) + (enemy.eyeH ?? 1) + 0.5;
      _tmpVec.set(enemy.position.x, anchorY, enemy.position.z);

      const pos = projector.project(_tmpVec);
      if (!pos.visible) continue; // behind camera or off-screen — skip

      // Acquire a node from the shared pool (may return null if exhausted).
      const node = projector.acquire("status-icon");
      if (!node) break; // pool exhausted — DROP NEW, stop trying

      const def = STATUS_DEFS[status];

      // Style the node. Write position via transform3d (compositor, no layout).
      node.textContent = def.glyph;
      node.style.cssText = [
        "position:absolute",
        "pointer-events:none",
        "will-change:transform",
        "user-select:none",
        "font-size:" + def.size,
        "color:" + def.color,
        "line-height:1",
        // Centre the glyph on the anchor point.
        "transform:translate3d(" +
          Math.round(pos.x - parseInt(def.size) / 2) + "px," +
          Math.round(pos.y - parseInt(def.size) / 2) + "px,0)",
        // Text-shadow for legibility against dark/light backgrounds.
        "text-shadow:0 0 4px rgba(0,0,0,0.9),0 0 8px " + def.color,
      ].join(";");

      // CSS animation class for frozen pulse (skipped when reducedMotion).
      if (def.pulse && !reducedMotion) {
        node.classList.add("status-icon-pulse");
      }

      this._nodeMap.set(node, { enemy, status });
    }
  }

  /**
   * Release all held nodes back to the pool.
   * Call when leaving PLAYING state (e.g. death, wave clear) to avoid leaks.
   *
   * @param {object} world
   */
  clear(world) {
    const projector = world?.projector;
    if (projector) {
      for (const node of this._nodeMap.keys()) {
        projector.release(node);
      }
    }
    this._nodeMap.clear();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _distSq(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}
