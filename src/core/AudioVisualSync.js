/**
 * AudioVisualSync — bus-driven audio-visual pairing layer (issue #98).
 *
 * Subscribes to the central EventBus (world.events) and adds the missing
 * visual half of each audio cue so both land in the same ~50ms window:
 *
 *   onPlayerCast  → brief warm-white VFX flash at the staff tip (muzzle flash)
 *   onWaveClear   → gold light burst at player position + shockwave ring
 *                   (ring gated by reducedMotion; gold tint CSS overlay always shown)
 *
 * DOT-tick flood throttling:
 *   onDamageDealt fires on every DOT tick. Audio throttling is handled here
 *   with a per-target WeakMap cooldown (DOT_AUDIO_THROTTLE_MS). enemyHit audio
 *   for non-DOT hits is played in HitResolver where it already fires.
 *   This module only handles the ADDITIONAL audio cues required by #98
 *   (cast, wave-clear, reward) via the bus — NOT enemy hit audio
 *   (which remains at the HitResolver call site per existing design).
 *
 * Reward gold tint:
 *   A semi-transparent gold CSS overlay element is shown briefly (~100ms)
 *   when openReward() is called. Managed entirely in this module so the
 *   overlay doesn't compete with #94's vignette compositor.
 *
 * Death-sound delay:
 *   Implemented directly in Enemy._die() — see enemies/Enemy.js.
 *   Under reducedMotion the dissolve is skipped → immediate death sound.
 *   Under normal mode the sound is delayed 0.1s via world.after() to match
 *   the dissolve peak timing.
 */

// Minimum interval between DOT-tick audio plays per target.
const DOT_AUDIO_THROTTLE_MS = 350;

// Gold tint overlay duration (seconds).
const GOLD_TINT_DURATION = 0.1;

// Wave-clear burst parameters.
const WAVE_CLEAR_BURST_COUNT  = 24;
const WAVE_CLEAR_BURST_SPREAD = 12;
const WAVE_CLEAR_BURST_LIFE   = 0.65;
const WAVE_CLEAR_BURST_SIZE   = 0.24;
const WAVE_CLEAR_SHOCK_R      = 5.5;
const WAVE_CLEAR_SHOCK_LIFE   = 0.5;

export class AudioVisualSync {
  /**
   * @param {object} world  — game world context (world.events, world.vfx, etc.)
   */
  constructor(world) {
    this.world = world;

    // Per-target DOT audio throttle (WeakMap so entries GC with their enemies).
    this._dotAudioCooldowns = new WeakMap();

    // Gold tint overlay element (created lazily on first reward).
    this._goldTintEl = null;
    this._goldTintTimer = 0;

    // Bound handler references for clean unsubscription.
    this._onPlayerCast   = this._onPlayerCast.bind(this);
    this._onWaveClear    = this._onWaveClear.bind(this);

    world.events.on("onPlayerCast", this._onPlayerCast);
    world.events.on("onWaveClear",  this._onWaveClear);
  }

  dispose() {
    this.world.events.off("onPlayerCast", this._onPlayerCast);
    this.world.events.off("onWaveClear",  this._onWaveClear);
    if (this._goldTintEl && this._goldTintEl.parentNode) {
      this._goldTintEl.parentNode.removeChild(this._goldTintEl);
      this._goldTintEl = null;
    }
  }

  // ── onPlayerCast ─────────────────────────────────────────────────────────────
  // Small warm-white muzzle flash at the staff tip every cast.
  // Arcane fires every 0.45s — flash is kept tiny so it doesn't smear.
  _onPlayerCast({ spell, origin }) {
    const vfx = this.world.vfx;
    if (!vfx || !origin) return;

    // Small warm-white flash — not spell-colored (the projectile already carries
    // element color). Tiny radius keeps the effect a muzzle flash, not a bloom.
    const flashRadius = 0.22;
    const flashLife   = 0.10;
    vfx.flash(origin, 0xfff8e0, flashRadius, flashLife);
  }

  // ── onWaveClear ──────────────────────────────────────────────────────────────
  // Gold light burst at player position + expanding shockwave ring.
  // Ring is gated by reducedMotion (expansion = vestibular); gold tint is safe.
  _onWaveClear({ level, gold }) {
    const world = this.world;
    const vfx   = world.vfx;
    if (!vfx) return;

    const pos = world.player?.position;
    if (!pos) return;

    const reducedMotion = vfx._reducedMotion;

    // Gold particle burst — safe under reducedMotion (static gravity-affected
    // particles, not a scale/expansion motion).
    vfx.burst(
      pos,
      0xffd700,
      WAVE_CLEAR_BURST_COUNT,
      WAVE_CLEAR_BURST_SPREAD,
      WAVE_CLEAR_BURST_LIFE,
      WAVE_CLEAR_BURST_SIZE,
    );

    // Expanding shockwave ring — gated by reducedMotion (expansion motion).
    if (!reducedMotion) {
      vfx.shock(pos, 0xffd700, WAVE_CLEAR_SHOCK_R, WAVE_CLEAR_SHOCK_LIFE);
    }

    // Gold CSS overlay tint (static fade — safe under reducedMotion).
    this._showGoldTint();
  }

  // ── Reward gold tint ─────────────────────────────────────────────────────────
  // Call from Game.openReward() to show the brief gold screen tint.
  showRewardTint() {
    this._showGoldTint();
  }

  // ── Per-frame update ─────────────────────────────────────────────────────────
  update(dt) {
    if (this._goldTintTimer > 0) {
      this._goldTintTimer = Math.max(0, this._goldTintTimer - dt);
      if (this._goldTintEl) {
        // Fade alpha linearly over the duration.
        const alpha = (this._goldTintTimer / GOLD_TINT_DURATION) * 0.35;
        this._goldTintEl.style.opacity = alpha.toFixed(3);
        if (this._goldTintTimer <= 0) {
          this._goldTintEl.style.opacity = "0";
        }
      }
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  _showGoldTint() {
    if (!this._goldTintEl) {
      this._goldTintEl = this._createGoldTintEl();
    }
    this._goldTintTimer = GOLD_TINT_DURATION;
    this._goldTintEl.style.opacity = "0.35";
  }

  _createGoldTintEl() {
    const el = document.createElement("div");
    el.id = "gold-tint-overlay";
    el.style.cssText = [
      "position:fixed",
      "inset:0",
      "pointer-events:none",
      "background:rgba(255,200,30,1)",
      "opacity:0",
      "z-index:9997",
      "transition:opacity 0.05s linear",
    ].join(";");
    // Insert inside #hud if available, otherwise body.
    const hud = document.getElementById("hud");
    (hud || document.body).appendChild(el);
    return el;
  }
}
