// Gold: spendable current balance + lifetime earned (never reduced by spending).
export class Currency {
  constructor(runStats) {
    this.runStats = runStats;
    this.gold = 0;
  }

  reset() { this.gold = 0; }

  add(amount) {
    if (amount <= 0) return;
    this.gold += amount;
    this.runStats.registerGold(amount); // goldEarned tracked separately
  }

  spend(amount) {
    if (this.gold >= amount) { this.gold -= amount; return true; }
    return false;
  }
}
