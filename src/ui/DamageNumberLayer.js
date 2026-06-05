/**
 * DamageNumberLayer — floating damage numbers via WorldProjector DOM pool.
 *
 * Consumes world.projector (shared pool — MAX_POOLED_NODES=64).
 * Self-cap: ≤40 concurrent nodes so issue #96 (status icons, cap=24) can coexist.
 * Over-budget policy: DROP NEW — spawn()/acquire() return null; we skip gracefully.
 *
 * Event-driven: subscribes to world.events.onDamageDealt.
 * DOT throttling: isDot ticks aggregate per-target into one number updated at
 * most once per DOT_FLUSH_INTERVAL seconds.
 *
 * Public API:
 *   new DamageNumberLayer(world)  — subscribe and start
 *   layer.update(dt)              — advance float animations each frame
 *   layer.destroy()               — unsubscribe and release all nodes
 */

import * as THREE from "three";

// ── Config ────────────────────────────────────────────────────────────────────

/** Soft cap: max concurrent nodes this module holds. */
const SELF_CAP = 40;

/** Float animation duration (seconds) for a normal hit. */
const FLOAT_DURATION = 1.0;

/** Float animation duration for a DOT flush number. */
const DOT_FLOAT_DURATION = 0.8;

/** Vertical rise distance in CSS pixels over the full animation. */
const RISE_PX = 48;

/** DOT flush interval: accumulate ticks, then surface one number per target. */
const DOT_FLUSH_INTERVAL = 0.35; // seconds

// ── CSS class names applied to pool nodes ────────────────────────────────────
// Styled in index.html <style> block.
const CLS_BASE = "dmg-num";
const CLS_CRIT = "dmg-num-crit";  // final-blow
const CLS_DOT  = "dmg-num-dot";   // DOT-accumulated flush

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Return a CSS color string for the given damage type/flags.
 *   normal  → white (#ffffff)
 *   killed  → gold  (#ffd700)
 *   dot     → green (#7fff7f)
 */
function damageColor(killed, isDot) {
  if (killed) return "#ffd700";
  if (isDot)  return "#7fff7f";
  return "#ffffff";
}

// ── DamageNumberLayer ─────────────────────────────────────────────────────────

export class DamageNumberLayer {
  /**
   * @param {object} world  — game world context (world.projector, world.events, world.settings)
   */
  constructor(world) {
    this._world = world;

    /**
     * Active float entries: each entry tracks one visible DOM node.
     * @type {Array<{
     *   node: HTMLElement,
     *   worldPos: THREE.Vector3,
     *   age: number,
     *   duration: number,
     *   isDot: boolean,
     *   reducedMotion: boolean,
     * }>}
     */
    this._active = [];

    /**
     * DOT accumulator per target.
     * key  — target object reference
     * value — { total: number, timer: number, pos: THREE.Vector3 }
     */
    this._dotAccum = new Map();

    // Bind listener so we can unsubscribe cleanly.
    this._onDamageDealt = this._handleDamageDealt.bind(this);
    world.events.on("onDamageDealt", this._onDamageDealt);
  }

  // ── Event handler ──────────────────────────────────────────────────────────

  _handleDamageDealt({ target, pos, dealt, killed, source, isDot }) {
    // Only show numbers for player-sourced damage.
    if (!source || source.owner !== "player") return;
    // Check setting: show damage numbers (default true, i.e. only skip if explicitly false).
    if (this._world.settings?.display?.showDamageNumbers === false) return;
    // No world position — skip.
    if (!pos) return;

    if (isDot) {
      // Accumulate DOT damage per target; flush periodically in update().
      this._accumulateDot(target, pos, dealt);
    } else {
      // Direct / AoE / Chain: spawn immediately.
      this._spawnNumber(pos, dealt, killed, false);
    }
  }

  _accumulateDot(target, pos, amount) {
    const entry = this._dotAccum.get(target);
    if (entry) {
      entry.total += amount;
      // Update position to latest tick location.
      entry.pos.copy(pos);
    } else {
      // New target accumulator — clone pos so we don't hold a live reference.
      this._dotAccum.set(target, {
        total: amount,
        timer: DOT_FLUSH_INTERVAL,
        pos: pos.clone(),
      });
    }
  }

  // ── Spawn ──────────────────────────────────────────────────────────────────

  _spawnNumber(pos, amount, killed, isDot) {
    // Enforce soft self-cap before attempting pool acquire.
    if (this._active.length >= SELF_CAP) return;

    const projector = this._world.projector;
    if (!projector) return;

    const cls = killed
      ? `${CLS_BASE} ${CLS_CRIT}`
      : isDot
        ? `${CLS_BASE} ${CLS_DOT}`
        : CLS_BASE;

    // acquire() returns null when pool is exhausted — DROP NEW, never crash.
    const node = projector.acquire(cls);
    if (!node) return;

    const label = Math.round(amount).toString();
    node.textContent = label;
    node.style.color = damageColor(killed, isDot);
    node.style.opacity = "1";
    node.style.transform = "translate(-50%, -50%)";

    const reducedMotion = !!this._world.settings?.display?.reducedMotion;
    const duration = isDot ? DOT_FLOAT_DURATION : FLOAT_DURATION;

    this._active.push({
      node,
      worldPos: pos.clone(),
      age: 0,
      duration,
      isDot,
      reducedMotion,
    });

    // Initial position so it doesn't flicker at (0, 0) before first update().
    this._applyPosition(node, pos, 0, reducedMotion);
  }

  // ── Per-frame ──────────────────────────────────────────────────────────────

  /**
   * Advance DOT timers and float animations.
   * Call once per frame while STATE.PLAYING.
   * @param {number} dt  delta-time in seconds
   */
  update(dt) {
    const projector = this._world.projector;
    if (!projector) return;

    // ── DOT flush pass ──────────────────────────────────────────────────────
    for (const [target, entry] of this._dotAccum) {
      entry.timer -= dt;
      if (entry.timer <= 0) {
        this._spawnNumber(entry.pos, entry.total, false, true);
        this._dotAccum.delete(target);
      }
    }

    // ── Float animation + position pass ────────────────────────────────────
    for (let i = this._active.length - 1; i >= 0; i--) {
      const e = this._active[i];
      e.age += dt;

      if (e.age >= e.duration) {
        // Expired — return node to pool.
        projector.release(e.node);
        this._active.splice(i, 1);
        continue;
      }

      const t = e.age / e.duration; // 0..1
      const screen = projector.project(e.worldPos);

      if (!screen.visible) {
        e.node.style.display = "none";
        continue;
      }

      e.node.style.display = "";
      this._applyPosition(e.node, e.worldPos, t, e.reducedMotion, screen);
    }
  }

  /**
   * Position and style a node for the given animation progress t ∈ [0, 1].
   * @param {HTMLElement}       node
   * @param {THREE.Vector3}     worldPos
   * @param {number}            t          — animation progress 0..1
   * @param {boolean}           reducedMotion
   * @param {{ x, y, visible }} [screen]   — pre-projected, or computed if omitted
   */
  _applyPosition(node, worldPos, t, reducedMotion, screen) {
    const projector = this._world.projector;
    const s = screen || projector.project(worldPos);

    if (!s.visible) {
      node.style.display = "none";
      return;
    }

    // Rise upward (screen y decreases → upward).
    const riseOffset = reducedMotion ? 0 : RISE_PX * t;
    node.style.left      = `${s.x}px`;
    node.style.top       = `${s.y - riseOffset}px`;
    node.style.transform = "translate(-50%, -50%)";

    // Fade: opaque for first 40% of lifetime, then fade to 0.
    // reducedMotion: no fade — show until 60% then hide.
    if (!reducedMotion) {
      const FADE_START = 0.4;
      const alpha = t < FADE_START ? 1 : 1 - (t - FADE_START) / (1 - FADE_START);
      node.style.opacity = alpha.toFixed(3);
    } else {
      node.style.opacity = t < 0.6 ? "1" : "0";
    }
  }

  // ── Teardown ───────────────────────────────────────────────────────────────

  /**
   * Unsubscribe from the event bus and release all active nodes back to the pool.
   */
  destroy() {
    this._world.events.off("onDamageDealt", this._onDamageDealt);

    const projector = this._world.projector;
    if (projector) {
      for (const e of this._active) {
        projector.release(e.node);
      }
    }
    this._active.length = 0;
    this._dotAccum.clear();
  }
}
