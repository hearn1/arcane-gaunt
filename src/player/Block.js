import { SpellInstance } from "../spells/SpellInstance.js";
import { steamEvent } from "../core/Steam.js";

const MAX_STAM = 100;
const DRAIN = 38;        // stamina/sec while blocking
const REGEN = 24;        // stamina/sec while recovered
const REGEN_DELAY = 0.8; // sec after releasing block before regen starts
const BLOCK_MULT = 0.55; // non-perfect incoming damage multiplier
const PERFECT_WINDOW = 0.22; // sec from block start that counts as a perfect block
const PERFECT_REFUND = 18;   // stamina restored on perfect block

// Stable spell identity for reflected damage so it shows in RunStats.
const REDIRECT_DEF = {
  id: "redirect",
  displayName: "Redirect",
  castType: "projectile",
  color: 0x9a6cff,
  soundId: "arcane",
  damage: 0,
  cooldown: 0.1,
  projectileSpeed: 95,
  range: 70,
};

export function makeRedirectSpell(damage) {
  const inst = new SpellInstance(REDIRECT_DEF);
  inst.stats.damage = damage;
  return inst;
}

// Pure logic: stamina pool + block/perfect-block state. No input listeners,
// no rendering. Wired to the player's Health.mitigation hook by Game.
export class Block {
  constructor(playerHealth) {
    this.health = playerHealth;
    this.maxStamina = MAX_STAM;
    this.reset();
  }

  reset() {
    this.maxStamina = MAX_STAM;
    this.stamina = this.maxStamina;
    this.regenMul = 1;
    this.blocking = false;
    this.blockElapsed = 0;
    this.perfectPulse = 0;
    this.blockPulse = 0;
    this._regenWait = 0;
  }

  update(dt, input) {
    this.perfectPulse = Math.max(0, this.perfectPulse - dt);
    this.blockPulse = Math.max(0, this.blockPulse - dt);
    const wants = !!input.rightDown && this.stamina > 0;
    this.blocking = wants;
    if (wants) {
      this.stamina = Math.max(0, this.stamina - DRAIN * dt);
      this.blockElapsed += dt;
      this._regenWait = REGEN_DELAY;
      if (this.stamina <= 0) this.blocking = false;
    } else {
      this.blockElapsed = 0;
      if (this._regenWait > 0) this._regenWait -= dt;
      else this.stamina = Math.min(this.maxStamina, this.stamina + REGEN * this.regenMul * dt);
    }
  }

  // True only during the brief window right after a block begins.
  perfectActive() {
    return this.blocking && this.blockElapsed <= PERFECT_WINDOW;
  }

  perfectRatio() {
    if (!this.blocking) return 0;
    return Math.max(0, 1 - this.blockElapsed / PERFECT_WINDOW);
  }

  notePerfect() {
    this.perfectPulse = 0.42;
    this.world?.runStats?.registerPerfectBlock();
    steamEvent("block.perfect", { spellId: this.world?.caster?.current?.id || "" });
    // Refund stamina so a chain of well-timed parries doesn't drain the pool,
    // and resume regen immediately rather than waiting out REGEN_DELAY.
    this.stamina = Math.min(this.maxStamina, this.stamina + PERFECT_REFUND);
    this._regenWait = 0;
    // One-wave "Stance Drill" service hook: heal a flat amount on perfect block.
    const heal = this.world?.combat?.perfectHealNext;
    if (heal > 0) this.health.heal(heal);
  }

  noteBlock() {
    this.blockPulse = 0.25;
  }

  // Health.mitigation hook. Perfect blocks are negated+reflected explicitly
  // in HitResolver (which never calls applyDamage on those), so a plain
  // multiplier here is correct for ordinary blocked hits.
  mitigate(amount) {
    if (!this.blocking) return amount;
    this.noteBlock();
    return amount * BLOCK_MULT;
  }

  get staminaRatio() { return this.maxStamina > 0 ? this.stamina / this.maxStamina : 0; }
  get staminaLow() { return this.staminaRatio <= 0.25; }
}
