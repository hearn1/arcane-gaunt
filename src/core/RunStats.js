// Passive run-stat collector. Never drives gameplay decisions.
export class RunStats {
  constructor() { this.reset(); }

  reset() {
    this.levelsCleared = 0;
    this.enemiesKilled = 0;
    this.goldEarned = 0;
    this.totalDamage = 0;
    this.perfectBlocks = 0;
    this.damageBySpell = {};   // spellId -> damage
    this.spellNames = {};      // spellId -> display name
  }

  registerPerfectBlock() { this.perfectBlocks += 1; }

  registerDamage(spellId, spellName, amount) {
    if (!spellId || amount <= 0) return;
    this.totalDamage += amount;
    this.damageBySpell[spellId] = (this.damageBySpell[spellId] || 0) + amount;
    if (spellName) this.spellNames[spellId] = spellName;
  }

  registerKill() { this.enemiesKilled += 1; }
  registerGold(n) { this.goldEarned += n; }
  registerLevelCleared() { this.levelsCleared += 1; }

  // Returns [{ id, name, damage }] sorted descending, only damage > 0.
  damageRows() {
    return Object.keys(this.damageBySpell)
      .filter((id) => this.damageBySpell[id] > 0)
      .map((id) => ({
        id,
        name: this.spellNames[id] || id,
        damage: Math.round(this.damageBySpell[id]),
      }))
      .sort((a, b) => b.damage - a.damage);
  }
}
