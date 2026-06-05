// THE single central damage path. All damage in the game — direct, AoE, chain,
// DOT, split, enemy attacks — flows through applyDamage(). Nothing else mutates
// Health.current.

let _runStats = null;
export function setRunStats(rs) { _runStats = rs; }

let _eventBus = null;
export function setEventBus(bus) { _eventBus = bus; }

// Faction rules: player damages enemy, enemy damages player, no friendly fire.
export function canDamage(source, targetFaction) {
  if (!source) return false;
  if (source.owner === "player") return targetFaction === "enemy";
  if (source.owner === "enemy") return targetFaction === "player";
  return false;
}

/**
 * @param {object} target  entity exposing `.health` (a Health) or a Health itself
 * @param {number} amount  raw incoming damage
 * @param {object} source  { owner:'player'|'enemy', spellId?, spellName?,
 *                            isDot?, isAoe?, isChain? }
 * @returns {{dealt:number, killed:boolean}}
 */
export function applyDamage(target, amount, source) {
  const h = target && target.health ? target.health : target;
  if (!h || h.isDead || amount <= 0) return { dealt: 0, killed: false };
  if (!canDamage(source, h.faction)) return { dealt: 0, killed: false };

  let final = amount;
  if (h.mitigation) final = h.mitigation(final, source);
  if (final <= 0) return { dealt: 0, killed: false };

  const before = h.current;
  h.current = Math.max(0, h.current - final); // clamp: no overkill stat inflation
  const dealt = before - h.current;

  if (dealt > 0) {
    if (h.onDamage) h.onDamage(dealt, source);
    // Only player-sourced damage feeds run stats, with final dealt amount.
    if (source.owner === "player" && _runStats && source.spellId) {
      _runStats.registerDamage(source.spellId, source.spellName, dealt);
    }
  }

  let killed = false;
  if (h.current <= 0 && !h.isDead) {
    h.isDead = true;
    killed = true;
    if (h.onDeath) h.onDeath(source);
  }

  if (dealt > 0 && _eventBus) {
    const pos = target && target.position ? target.position : (h.position || null);
    _eventBus.emit("onDamageDealt", {
      target,
      pos,
      dealt,
      killed,
      source,
      isDot: !!source.isDot,
      isAoe: !!source.isAoe,
      isChain: !!source.isChain,
    });
    if (killed) {
      _eventBus.emit("onEnemyDeath", {
        target,
        pos,
        dealt,
        killed,
        source,
        isDot: !!source.isDot,
        isAoe: !!source.isAoe,
        isChain: !!source.isChain,
      });
    }
  }

  return { dealt, killed };
}
