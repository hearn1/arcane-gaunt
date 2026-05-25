// Health component. Damage is NEVER applied here directly — all mutation
// goes through core/Damage.applyDamage so there is exactly one damage path.
export class Health {
  constructor(max, faction, opts = {}) {
    this.max = max;
    this.current = max;
    this.faction = faction;        // 'player' | 'enemy'
    this.isDead = false;
    this.onDeath = opts.onDeath || null;     // (source) => void
    this.onDamage = opts.onDamage || null;   // (dealt, source) => void
    this.mitigation = opts.mitigation || null; // (amount, source) => amount
  }

  heal(n) {
    if (this.isDead) return;
    this.current = Math.min(this.max, this.current + n);
  }

  // Raise (or lower) max HP; raising also grants the delta as current HP.
  setMax(newMax) {
    const delta = newMax - this.max;
    this.max = newMax;
    if (delta > 0) this.current = Math.min(this.max, this.current + delta);
    else this.current = Math.min(this.current, this.max);
  }

  get ratio() { return this.max > 0 ? this.current / this.max : 0; }
}
