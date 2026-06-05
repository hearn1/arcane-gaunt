/**
 * WorldProjector — 3D→screen projection + recycled DOM-node pool.
 *
 * FOUNDATION consumed by two parallel consumer issues:
 *   #96 — Floating status-effect icons
 *   #99 — Floating damage numbers
 *
 * ═══════════════════════════════════════════════════════════════════
 * PUBLIC API
 * ═══════════════════════════════════════════════════════════════════
 *
 *   Construction
 *   ────────────
 *   const proj = new WorldProjector(containerEl, camera);
 *   proj.resize();          // call on window resize (mirrors Game._resize)
 *
 *   Projection
 *   ──────────
 *   const pos = proj.project(vec3);
 *   // Returns { x, y, visible } where x/y are CSS-pixel coordinates.
 *   // visible===false when the point is behind the camera or outside the
 *   // viewport (with CULL_MARGIN px of bleed). Callers should hide their
 *   // node when visible===false.
 *
 *   Node pool — acquire / release
 *   ─────────────────────────────
 *   const node = proj.acquire(className?);
 *   // Returns an absolutely-positioned <div> from the pool.
 *   // Returns null when the pool is exhausted (over-budget policy: DROP NEW).
 *   // The caller MUST call release(node) when it no longer needs the node.
 *   // className is set on the element when provided (cleared on release).
 *
 *   proj.release(node);
 *   // Returns a node to the pool.  Safe to call with null/undefined.
 *
 *   Node pool — spawn with TTL (convenience wrapper)
 *   ──────────────────────────────────────────────────
 *   const node = proj.spawn(className?, ttlSeconds?);
 *   // Acquires a node and auto-releases it after ttlSeconds (default: Infinity,
 *   // meaning the caller must release it manually).  Returns null if exhausted.
 *   // Non-infinite TTL is driven from updatePool(); call that every frame.
 *
 *   Per-frame
 *   ─────────
 *   proj.updatePool(dt);
 *   // Advance TTL timers.  Call once per frame from updateHud or the game loop.
 *   // Safe to call every frame regardless of game state; the HUD already gates
 *   // updateHud to STATE.PLAYING so per-frame calls are naturally no-op outside
 *   // that state.  For safety, callers that invoke updatePool directly should
 *   // guard with their own state check.
 *
 *   Teardown
 *   ────────
 *   proj.destroy();
 *   // Removes all nodes and clears the pool.
 *
 * ═══════════════════════════════════════════════════════════════════
 * SHARED NODE-BUDGET CONTRACT (binding for #96 and #99)
 * ═══════════════════════════════════════════════════════════════════
 *
 *   MAX_POOLED_NODES = 64
 *
 *   This is the TOTAL on-screen DOM node count across ALL consumers.
 *   #96 (status icons) and #99 (damage numbers) share the same pool
 *   instance via world.projector and must both acquire/release through
 *   this API.  Neither consumer should maintain its own separate pool.
 *
 *   Over-budget policy: DROP NEW
 *   When acquire() is called and all MAX_POOLED_NODES nodes are in use,
 *   acquire() returns null.  The caller must handle null gracefully
 *   (skip spawning the icon/number rather than crashing).  This ensures
 *   a hard cap on DOM node count regardless of how many icons + damage
 *   numbers are simultaneously active.
 *
 * ═══════════════════════════════════════════════════════════════════
 * PIXEL-RATIO / RESIZE CORRECTNESS
 * ═══════════════════════════════════════════════════════════════════
 *
 *   resize() stores innerWidth / innerHeight and the container's bounding
 *   rect.  project() uses these cached values so projection stays correct
 *   after window resize.  Mirror Game._resize by calling resize() from
 *   the same 'resize' event listener.
 *
 *   The pool nodes are positioned via CSS `left`/`top` in CSS pixels
 *   (not physical pixels), matching the DOM coordinate system.
 */

import * as THREE from "three";

// ── Budget knob ──────────────────────────────────────────────────────────────
// TOTAL on-screen node cap shared by ALL consumers (#96 + #99).
// Changing this value affects both consumers simultaneously — coordinate
// before adjusting.
export const MAX_POOLED_NODES = 64;

// ── Projection config ────────────────────────────────────────────────────────
// Nodes whose projected CSS position is outside the viewport by more than
// CULL_MARGIN pixels are marked visible=false.
const CULL_MARGIN = 32; // px

export class WorldProjector {
  /**
   * @param {HTMLElement} containerEl
   *   Absolutely-positioned overlay element that fills the viewport.
   *   Pool nodes are appended here.  Typically the #hud or a dedicated
   *   overlay div that overlays the canvas.
   * @param {THREE.Camera} camera
   *   The scene camera used for projection.  WorldProjector reads the
   *   camera's matrixWorldInverse and projectionMatrix each frame via
   *   THREE.Vector3.project(), so no extra update call is needed.
   */
  constructor(containerEl, camera) {
    this._container = containerEl;
    this._camera    = camera;

    /** @type {HTMLElement[]} Nodes currently in the free list. */
    this._free = [];

    /** @type {Map<HTMLElement, { ttl: number }>} Nodes in active use. */
    this._active = new Map();

    /** Cached viewport size updated by resize(). */
    this._vw = innerWidth;
    this._vh = innerHeight;

    // Eagerly allocate the full pool so acquire() never allocates mid-frame.
    for (let i = 0; i < MAX_POOLED_NODES; i++) {
      const el = document.createElement("div");
      el.style.cssText = "position:absolute;pointer-events:none;will-change:transform;display:none;";
      this._container.appendChild(el);
      this._free.push(el);
    }
  }

  // ── Resize ─────────────────────────────────────────────────────────────────

  /**
   * Update cached viewport dimensions.
   * Call from the same window 'resize' handler that calls Game._resize()
   * so projection math stays in sync with the camera aspect ratio update.
   */
  resize() {
    this._vw = innerWidth;
    this._vh = innerHeight;
  }

  // ── Projection ─────────────────────────────────────────────────────────────

  /**
   * Project a 3D world-space position to CSS-pixel screen coordinates.
   *
   * @param {THREE.Vector3} worldPos — world-space position to project
   * @returns {{ x: number, y: number, visible: boolean }}
   *   x, y — CSS pixel coordinates (suitable for left/top or transform).
   *   visible — false when the point is behind the camera or outside the
   *             viewport padded by CULL_MARGIN.  Callers must hide their
   *             node when visible===false.
   */
  project(worldPos) {
    // THREE.Vector3.project() transforms world → NDC in-place on a copy.
    const ndc = _tmpVec.copy(worldPos).project(this._camera);

    // z > 1 means the point is behind the camera's near/far plane boundary;
    // z in NDC space: -1 (near) to +1 (far), values outside [-1,1] are clipped.
    // Behind-camera culling: z > 1 reliably indicates "behind the camera".
    if (ndc.z > 1) {
      return { x: 0, y: 0, visible: false };
    }

    // NDC [-1,1] → CSS pixels [0, vw] / [0, vh].
    // NDC y is up-positive; CSS y is down-positive, so we flip.
    const x = ( ndc.x * 0.5 + 0.5) * this._vw;
    const y = (-ndc.y * 0.5 + 0.5) * this._vh;

    // Off-screen cull with bleed margin.
    const visible =
      x >= -CULL_MARGIN &&
      x <= this._vw + CULL_MARGIN &&
      y >= -CULL_MARGIN &&
      y <= this._vh + CULL_MARGIN;

    return { x, y, visible };
  }

  // ── Pool: acquire / release ─────────────────────────────────────────────────

  /**
   * Acquire a pooled DOM node.
   *
   * Over-budget policy: DROP NEW — returns null when all MAX_POOLED_NODES
   * nodes are in use.  The caller must handle null gracefully.
   *
   * @param {string} [className]  Optional CSS class(es) added to the node.
   * @returns {HTMLElement|null}
   */
  acquire(className) {
    if (this._free.length === 0) {
      // Pool exhausted — DROP NEW.  Caller must handle null.
      return null;
    }
    const el = this._free.pop();
    el.className = className || "";
    el.style.display = "";
    this._active.set(el, { ttl: Infinity });
    return el;
  }

  /**
   * Return a node to the pool.
   * Safe to call with null or undefined (no-op).
   *
   * @param {HTMLElement|null|undefined} node
   */
  release(node) {
    if (!node) return;
    if (!this._active.has(node)) return; // already released or foreign node

    this._active.delete(node);

    // Reset visual state so the next acquire() starts clean.
    node.className = "";
    node.style.cssText = "position:absolute;pointer-events:none;will-change:transform;display:none;";
    this._free.push(node);
  }

  // ── Pool: spawn with TTL ────────────────────────────────────────────────────

  /**
   * Acquire a node with an optional auto-release timer.
   *
   * @param {string}  [className]    CSS class(es) to assign.
   * @param {number}  [ttlSeconds]   Seconds until auto-release (default: Infinity).
   * @returns {HTMLElement|null}  null when pool is exhausted (DROP NEW policy).
   */
  spawn(className, ttlSeconds = Infinity) {
    const el = this.acquire(className);
    if (!el) return null;
    if (isFinite(ttlSeconds)) {
      this._active.get(el).ttl = ttlSeconds;
    }
    return el;
  }

  // ── Per-frame update ────────────────────────────────────────────────────────

  /**
   * Advance TTL timers for nodes spawned with a finite TTL.
   * Call once per frame from updateHud (or equivalent).
   * Safe to call every frame; no-op when there are no active TTL timers.
   *
   * @param {number} dt  Delta time in seconds.
   */
  updatePool(dt) {
    if (this._active.size === 0) return;

    // Collect expired nodes first to avoid mutating while iterating.
    _expiredBuf.length = 0;
    for (const [el, state] of this._active) {
      if (!isFinite(state.ttl)) continue;
      state.ttl -= dt;
      if (state.ttl <= 0) _expiredBuf.push(el);
    }
    for (let i = 0; i < _expiredBuf.length; i++) {
      this.release(_expiredBuf[i]);
    }
  }

  // ── Teardown ────────────────────────────────────────────────────────────────

  /**
   * Remove all pooled nodes from the DOM and clear internal state.
   * Call when the game session ends or the projector is no longer needed.
   */
  destroy() {
    for (const el of this._active.keys()) {
      el.remove();
    }
    for (const el of this._free) {
      el.remove();
    }
    this._active.clear();
    this._free.length = 0;
  }
}

// ── Module-level scratch objects (avoids per-frame allocation) ────────────────
const _tmpVec    = new THREE.Vector3();
const _expiredBuf = [];
