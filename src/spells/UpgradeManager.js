import { UPGRADE_TREES } from "./upgradeTrees.js";

// Pure logic: tracks purchased upgrade nodes per spell for the current run,
// validates gold + requires + excludes constraints, applies the node to the
// owned SpellInstance, and deducts gold via Currency. No UI here.
//
// Each tree is a DAG of nodes with { requires, excludes? }. A node is
// "available" when every requires is owned and no exclude is owned.
export class UpgradeManager {
  constructor(world) {
    this.world = world;
    this.purchased = {}; // spellId -> [nodeId, ...] in purchase order
  }

  reset() { this.purchased = {}; }

  treeFor(spellId) { return UPGRADE_TREES[spellId] || []; }

  ownedCount(spellId) {
    return (this.purchased[spellId] || []).length;
  }

  isPurchased(spellId, nodeId) {
    return (this.purchased[spellId] || []).includes(nodeId);
  }

  _isAvailable(spellId, node) {
    if (this.isPurchased(spellId, node.id)) return false;
    const owned = this.purchased[spellId] || [];
    for (const req of node.requires || []) {
      if (!owned.includes(req)) return false;
    }
    for (const ex of node.excludes || []) {
      if (owned.includes(ex)) return false;
    }
    // Capstones gate by total purchases on the spell (Feature 14):
    // they unlock after the player has committed to a build.
    if (node.requiresOwnedCount && owned.length < node.requiresOwnedCount) return false;
    return true;
  }

  availableNodes(spellId) {
    return this.treeFor(spellId).filter((n) => this._isAvailable(spellId, n));
  }

  state(spellId, node) {
    if (this.isPurchased(spellId, node.id)) return "owned";
    return this._isAvailable(spellId, node) ? "available" : "locked";
  }

  canBuy(spellId, node) {
    return this._isAvailable(spellId, node) && this.world.currency.gold >= node.cost;
  }

  // Returns map of nodeId -> depth (longest requires chain to a root).
  depths(spellId) {
    const tree = this.treeFor(spellId);
    const byId = Object.create(null);
    for (const n of tree) byId[n.id] = n;
    const memo = Object.create(null);
    const visit = (n) => {
      if (n.id in memo) return memo[n.id];
      memo[n.id] = 0; // cycle guard
      let d = 0;
      for (const req of n.requires || []) {
        const r = byId[req];
        if (r) d = Math.max(d, visit(r) + 1);
      }
      memo[n.id] = d;
      return d;
    };
    for (const n of tree) visit(n);
    return memo;
  }

  buy(spellId, nodeId) {
    const tree = this.treeFor(spellId);
    const node = tree.find((n) => n.id === nodeId);
    if (!node) return false;
    if (!this._isAvailable(spellId, node)) return false;
    const inst = this.world.caster.instanceOf(spellId);
    if (!inst) return false;
    if (this.world.currency.gold < node.cost) return false;
    if (!this.world.currency.spend(node.cost)) return false;
    node.apply(inst, this.world);
    (this.purchased[spellId] || (this.purchased[spellId] = [])).push(node.id);
    return true;
  }
}
