// EnemyVfxHandler — bus-driven hit reactions and death element finishers.
//
// Subscribes to:
//   onDamageDealt  → scaled hit flash + non-boss 100ms stutter
//   onEnemyDeath   → element-flavored finisher VFX at the death position
//
// The dissolve animation itself lives in Enemy._die() via vfx.custom so that
// "dead for gameplay" (onEnemyDead → wave-clear) is immediate while the visual
// finishes independently. This handler only adds the element finisher on top.
//
// CONTRACTS:
//   - DOT tick floods throttled per-target: only one hit flash per DOT_THROTTLE_MS.
//   - Stutter reuses Enemy.stunTimer — never touches AI dash/surge state directly.
//   - Boss hit: flash only (no stutter); boss death: bigger multi-ring finisher.

// DOT tick floods: min interval between hit flashes per-target for isDot events.
const DOT_THROTTLE_MS = 120;

// Damage soft cap for flash intensity mapping (global soft cap ~40).
const DAMAGE_SOFT_CAP = 40;

// Spell-ID sets for element finisher routing.
const FIRE_SPELL_IDS   = new Set(["fireball", "meteor"]);
const FROST_SPELL_IDS  = new Set(["frost_bolt", "frost_shatter"]);
const POISON_SPELL_IDS = new Set(["poison_bolt"]);

export class EnemyVfxHandler {
  constructor(world) {
    this.world = world;

    // Per-target (enemy object) last-flash timestamp for DOT throttle.
    this._hitCooldowns = new WeakMap();

    this._onDamageDealt = this._onDamageDealt.bind(this);
    this._onEnemyDeath  = this._onEnemyDeath.bind(this);

    world.events.on("onDamageDealt", this._onDamageDealt);
    world.events.on("onEnemyDeath",  this._onEnemyDeath);
  }

  dispose() {
    this.world.events.off("onDamageDealt", this._onDamageDealt);
    this.world.events.off("onEnemyDeath",  this._onEnemyDeath);
  }

  // -------------------------------------------------------------------------
  // onDamageDealt — scaled hit flash + non-boss stutter
  // -------------------------------------------------------------------------

  _onDamageDealt({ target, dealt, killed, source, isDot }) {
    // Only react to enemy targets hit by the player. Skip kills (handled by death handler).
    if (!target || !target.mesh || !target.alive) return;
    if (source?.owner !== "player") return;

    // DOT throttle: skip if we recently flashed this target from a DOT tick.
    if (isDot) {
      const last = this._hitCooldowns.get(target) || 0;
      const now  = performance.now();
      if (now - last < DOT_THROTTLE_MS) return;
      this._hitCooldowns.set(target, now);
    }

    // Compute intensity t ∈ [0,1] normalized against soft cap.
    const t = Math.min(1, dealt / DAMAGE_SOFT_CAP);

    // Flash with scaled intensity (Enemy._flash now accepts t).
    target._flash(t);

    // Non-boss 100ms stutter: set stunTimer briefly so the enemy hitches in place.
    // Skip bosses (mirrors applyStun early-return). Skip dashers/surgers mid-action
    // to avoid stun-locking a committed dash.
    if (!target.isBoss && !killed) {
      const state = target.state;
      const midAction = state === "dash" || state === "surge";
      if (!midAction) {
        target.stunTimer = Math.max(target.stunTimer, 0.1);
      }
    }
  }

  // -------------------------------------------------------------------------
  // onEnemyDeath — element-flavored finisher at the death position
  // -------------------------------------------------------------------------

  _onEnemyDeath({ target, pos, source }) {
    if (!pos) return;
    const vfx = this.world.vfx;
    const isBoss = !!(target && target.isBoss);
    const spellId = source?.spellId || "";
    const deathPos = pos.clone ? pos.clone() : pos;

    if (isBoss) {
      // Boss death: bigger unique shockwave + multiple expanding rings + layered bursts.
      vfx.shock(deathPos, 0xffffff, 7.0, 0.55);
      vfx.shock(deathPos, 0xd4aaff, 4.5, 0.45);
      vfx.burst(deathPos, 0xffffff, 28, 14, 0.70, 0.22);
      vfx.burst(deathPos, 0xd4aaff, 18, 10, 0.55, 0.18);
      vfx.ring(deathPos, 3.0, 0xffffff, 0.8);
      vfx.ring(deathPos, 5.5, 0xd4aaff, 0.6);
      return;
    }

    // Non-boss element finishers.
    if (FIRE_SPELL_IDS.has(spellId)) {
      // Fire kill: small fire burst (orange/red) + tiny shock.
      vfx.burst(deathPos, 0xff7a33, 18, 10, 0.5, 0.2);
      vfx.shock(deathPos, 0xff5500, 2.5, 0.3);
    } else if (FROST_SPELL_IDS.has(spellId)) {
      // Frost shatter kill: shatter shockwave + ice burst (reuses frost-shatter VFX).
      vfx.shards?.(deathPos, 0xbdefff, 7, 2.0);
      vfx.shock(deathPos, 0x5cc8ff, 3.0, 0.35);
      vfx.burst(deathPos, 0xdff8ff, 18, 7, 0.48, 0.14);
    } else if (POISON_SPELL_IDS.has(spellId)) {
      // Poison kill: lingering green mist cloud at death location.
      vfx.mist(deathPos, 0x66dd55, 2.2, 1.0, 16);
      vfx.burst(deathPos, 0xb6ff76, 8, 4.0, 0.35, 0.14);
    }
    // Default (no spellId match): no extra particles beyond the generic burst
    // already fired by Enemy._die(). Keeps default deaths visually clean.
  }
}
