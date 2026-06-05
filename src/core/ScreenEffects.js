/**
 * ScreenEffects — vignette compositor + camera shake accumulator.
 *
 * 94a: Vignette compositor
 *   Replaces the old dual-write pattern (hurtFlash writes boxShadow directly,
 *   then resets it — stomping any persistent low-HP layer) with a single
 *   per-frame compositor that merges:
 *     baseLowHealth  — persistent dark-red gradient driven by health ratio
 *     transientHurt  — brief bright pulse from hurtFlash()
 *   The compositor re-evaluates both layers on every requestAnimationFrame
 *   tick (called from Game._frame via update()) and writes boxShadow once.
 *
 * ESCALATION-LADDER SEAM (consumed by issue #101 — HUD polish)
 * ─────────────────────────────────────────────────────────────
 * setHealthRatio(ratio) is the named entry point #101 must call.
 * It accepts the player's health.ratio (0–1) and drives:
 *   • the persistent vignette base layer (below)
 *   • the HP-bar pulse at ≤30% bar / ≤25% vignette (implemented by #101)
 * Call it every frame from Game._frame / updateHud. The intensity curve
 * is intentionally exposed so #101 can read _lowHealthIntensity directly
 * for the bar-pulse threshold (it pulses when _lowHealthIntensity > 0).
 *
 * 94b: Camera shake accumulator
 *   Each event adds "trauma" (0–1) to a shared accumulator. _frame() derives
 *   a random per-frame offset (trauma²  * amplitude), applies it additively to
 *   the camera before _render(), and removes it after. This means the
 *   authoritative camera.position is never corrupted by accumulated drift.
 *   The wave-start forward/back pulse is a deterministic smooth ease layered
 *   on the same per-frame offset mechanism.
 *
 *   All camera motion is multiplied by VFX._screenShake (0 or 1) and
 *   reducedMotion (0 or 1, wave pulse only). The vignette is NOT gated by
 *   either toggle — motion-sensitive players still need the low-HP warning.
 */

import * as THREE from "three";

// ── Shake config ──────────────────────────────────────────────────────────────
// All amplitudes are camera-world units. Sub-pixel at 60fps ≈ 0.02 units/px.
// "decay" is the fraction of remaining trauma lost per second (exponential).
export const SHAKE_CONFIG = {
  // NOTE: cast amplitudes are now the authoritative values in
  // SPELL_DEFINITIONS[id].castShake (spellDefinitions.js). The table below is
  // kept as a reference / fallback for non-spell cast sources.
  cast: {
    arcane_bolt:    0,     // fires every 0.45s — constant shake would be miserable
    fireball:       0.04,
    frost_bolt:     0.02,
    poison_bolt:    0.015,
    chain_lightning: 0.025,
    meteor:         0.06,  // cast shake; separate larger impact shake on landing
  },
  meteorImpact: { amp: 0.12, decay: 0.30 },
  perfectBlock:  { amp: 0.10, decay: 0.05 },
  wavePulse:     { dist: 0.3, dur: 0.4 },
  // Trauma decays exponentially: trauma *= (1 - traumaDecay * dt)
  traumaDecay:  8,
};

// ── Vignette config ───────────────────────────────────────────────────────────
// Low-HP vignette visible below WARN threshold; clears above CLEAR threshold
// (hysteresis matches _checkCriticalHealth: warn<0.25, clear>=0.5).
const VIG_WARN  = 0.25;
const VIG_CLEAR = 0.50;
// Maximum base intensity of the low-HP vignette (at 0% HP).
// boxShadow inset: `inset 0 0 ${spread}px ${size}px rgba(r,g,b,alpha)`
const VIG_MAX_SPREAD = 260;
const VIG_MAX_SIZE   = 90;
const VIG_MAX_ALPHA  = 0.60;

export class ScreenEffects {
  /**
   * @param {HTMLElement} vignetteEl  — the #vignette DOM element
   * @param {THREE.Camera} camera     — scene camera (position mutated per-frame)
   * @param {VFX} vfx                 — for _screenShake + _reducedMotion flags
   */
  constructor(vignetteEl, camera, vfx) {
    this._vig = vignetteEl;
    this._camera = camera;
    this._vfx = vfx;

    // ── 94a vignette state ──
    /** 0–1 intensity of the persistent low-HP base layer (readable by #101). */
    this._lowHealthIntensity = 0;
    /** 0–1 intensity of the transient hurt-pulse layer (decays to 0). */
    this._hurtPulse = 0;
    /** True while low-HP vignette is active (hysteresis gate). */
    this._lowHealthActive = false;

    // ── 94b shake state ──
    /** Accumulated trauma (0–1). Decays exponentially each frame. */
    this._trauma = 0;
    /** Deterministic wave-pulse state. */
    this._wavePulse = { active: false, t: 0, dur: 0, dist: 0 };
    /** Temporary camera offset applied this frame (removed after render). */
    this._shakeOffset = new THREE.Vector3();
    /** Seeded random state for repeatable-ish per-frame shake direction. */
    this._rngSeed = Math.random() * 9999;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * ESCALATION-LADDER ENTRY POINT — consumed by #101 (HUD polish).
   *
   * Drive the persistent low-HP vignette from the player's current health
   * ratio. Call every frame (from updateHud or _frame). No-op when ratio is
   * above the clear threshold.
   *
   * @param {number} ratio  — health.ratio, 0 (dead) to 1 (full HP)
   */
  setHealthRatio(ratio) {
    // Hysteresis: activate below WARN, deactivate above CLEAR.
    if (!this._lowHealthActive && ratio < VIG_WARN) {
      this._lowHealthActive = true;
    } else if (this._lowHealthActive && ratio >= VIG_CLEAR) {
      this._lowHealthActive = false;
    }

    if (this._lowHealthActive) {
      // intensity 0 at VIG_WARN, 1 at 0 HP — intensifies as HP drops.
      this._lowHealthIntensity = Math.max(0, Math.min(1, 1 - ratio / VIG_WARN));
    } else {
      this._lowHealthIntensity = 0;
    }
  }

  /**
   * Trigger the transient hurt-flash pulse on the vignette.
   * Replaces the old ui.hurtFlash() direct boxShadow write.
   * The pulse starts at full intensity and decays over ~160ms via update().
   */
  hurtFlash() {
    this._hurtPulse = 1;
  }

  /**
   * Add cast-shake trauma for a spell.
   * Amplitude comes from SPELL_DEFINITIONS[id].castShake (data-driven source of truth).
   * Game.js passes the amp directly so ScreenEffects needs no spellDefinitions import.
   * No-op for arcane_bolt (castShake = 0).
   * @param {string} spellId   — definition id (for future logging / tuning)
   * @param {number} amp       — shake amplitude from spell definition
   */
  castShake(spellId, amp) {
    if (!amp || amp <= 0) return;
    this._addTrauma(amp);
  }

  /**
   * Add meteor-impact shake (larger amplitude, longer decay).
   * Called from Effects.js when the rock lands.
   */
  meteorImpactShake() {
    this._addTrauma(SHAKE_CONFIG.meteorImpact.amp);
  }

  /**
   * Add a sharp, snappy perfect-block shake.
   * Called from Block.notePerfect via Game.js wiring.
   */
  perfectBlockShake() {
    this._addTrauma(SHAKE_CONFIG.perfectBlock.amp);
  }

  /**
   * Start the wave-start forward/back camera ease.
   * Called from onWaveStarted. Gated by reducedMotion inside update().
   */
  startWavePulse() {
    this._wavePulse = {
      active: true,
      t: 0,
      dur: SHAKE_CONFIG.wavePulse.dur,
      dist: SHAKE_CONFIG.wavePulse.dist,
    };
  }

  /**
   * Per-frame update. Call BEFORE _render(); the shakeOffset is applied here
   * and must be removed after render via removeShakeOffset().
   *
   * @param {number} dt  — delta time in seconds
   */
  update(dt) {
    this._updateVignette(dt);
    this._updateShake(dt);
  }

  /**
   * Remove the per-frame shake offset from the camera after rendering.
   * Must be called once per frame AFTER _render(). Prevents drift accumulation.
   */
  removeShakeOffset() {
    this._camera.position.sub(this._shakeOffset);
    this._shakeOffset.set(0, 0, 0);
  }

  // ── Private: vignette ─────────────────────────────────────────────────────

  _updateVignette(dt) {
    // Decay hurt pulse (~160ms half-life)
    this._hurtPulse = Math.max(0, this._hurtPulse - dt * 6.25);

    // Composite: max of base and transient layers (additive would over-saturate)
    const base = this._lowHealthIntensity;
    // Hurt pulse starts at 0.55 peak alpha and fades — styled slightly brighter
    // than the base layer to read as an event on top of a persistent state.
    const pulse = this._hurtPulse;

    if (base <= 0 && pulse <= 0) {
      if (this._vig.style.boxShadow !== "") this._vig.style.boxShadow = "";
      return;
    }

    if (pulse > 0) {
      // Transient hurt flash layer: fixed spread, fades alpha.
      const alpha = pulse * 0.55;
      this._vig.style.boxShadow = `inset 0 0 220px 70px rgba(180,20,40,${alpha.toFixed(3)})`;
    } else {
      // Persistent low-HP layer: spread and size grow as HP drops.
      const spread = Math.round(base * VIG_MAX_SPREAD);
      const size   = Math.round(base * VIG_MAX_SIZE);
      const alpha  = (base * VIG_MAX_ALPHA).toFixed(3);
      this._vig.style.boxShadow = `inset 0 0 ${spread}px ${size}px rgba(140,10,30,${alpha})`;
    }
  }

  // ── Private: shake ────────────────────────────────────────────────────────

  _addTrauma(amp) {
    // Trauma² curve: clamp so adding multiple small traumas saturates gracefully.
    this._trauma = Math.min(1, this._trauma + amp);
  }

  _updateShake(dt) {
    const screenShake = this._vfx._screenShake; // 0 or 1
    const reducedMotion = this._vfx._reducedMotion; // bool

    // Decay trauma exponentially.
    this._trauma = Math.max(0, this._trauma - SHAKE_CONFIG.traumaDecay * dt * this._trauma);

    let ox = 0, oy = 0, oz = 0;

    if (screenShake > 0 && this._trauma > 0) {
      // trauma² feels punchier (Squirrel Eiserloh style).
      const t2 = this._trauma * this._trauma;
      // Deterministic per-frame random direction using a simple LCG.
      this._rngSeed = (this._rngSeed * 16807 + 0) % 2147483647;
      const r1 = (this._rngSeed / 2147483647) * 2 - 1;
      this._rngSeed = (this._rngSeed * 16807 + 0) % 2147483647;
      const r2 = (this._rngSeed / 2147483647) * 2 - 1;
      this._rngSeed = (this._rngSeed * 16807 + 0) % 2147483647;
      const r3 = (this._rngSeed / 2147483647) * 2 - 1;
      ox = r1 * t2;
      oy = r2 * t2 * 0.5; // vertical shake is subtler
      oz = r3 * t2 * 0.3;
    }

    // Wave pulse: deterministic forward/back ease, gated by reducedMotion.
    if (screenShake > 0 && !reducedMotion && this._wavePulse.active) {
      this._wavePulse.t += dt;
      const progress = Math.min(1, this._wavePulse.t / this._wavePulse.dur);
      // sin(t*PI): starts at 0, peaks at 0.5, returns to 0 — a smooth "brace" motion.
      const zOffset = Math.sin(progress * Math.PI) * this._wavePulse.dist;
      oz += zOffset;
      if (progress >= 1) this._wavePulse.active = false;
    }

    // Apply as additive offset (camera.position is the authoritative look position;
    // we temporarily move it for this frame's render and restore it after via
    // removeShakeOffset(). This never bleeds into player movement or aim math.)
    this._shakeOffset.set(ox, oy, oz);
    this._camera.position.add(this._shakeOffset);
  }
}
