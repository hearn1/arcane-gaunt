// STATIC per-spell upgrade trees. Frozen: never mutated. Each node's
// apply(inst, world) mutates the runtime SpellInstance (stats + flags) or
// runtime world state, never the frozen SPELL_DEFINITIONS.
//
// Node shape: { id, title, description, cost, requires: [nodeId,...],
//               excludes?: [nodeId,...], apply(inst, world) }
//
// The current data model is intentionally branch-ready: order is only for
// authoring readability, while requires/excludes define the tree. Trees can
// grow toward 10-20 nodes per spell without changing UpgradeManager or UI.

function node(id, cost, title, description, requires, apply, excludes = []) {
  return Object.freeze({ id, cost, title, description, requires, excludes, apply });
}

function dmg(id, pct, cost) {
  const mult = 1 + pct / 100;
  return node(
    `${id}_dmg`,
    cost,
    `+${pct}% Damage`,
    `Permanently increase this spell's damage by ${pct}%.`,
    [],
    (inst) => { inst.stats.damage = Math.round(inst.stats.damage * mult); },
  );
}

function cd(id, pct, cost) {
  const mult = 1 - pct / 100;
  return node(
    `${id}_cd`,
    cost,
    `-${pct}% Cooldown`,
    `Cast this spell ${pct}% more often.`,
    [`${id}_dmg`],
    (inst) => { inst.stats.cooldown = Math.max(0.12, inst.stats.cooldown * mult); },
  );
}

function auto(id, cost) {
  return node(
    `${id}_auto`,
    cost,
    "Auto-Cast",
    "Hands-free: this spell auto-fires whenever ready (suppressed while blocking). Owning an Auto-Cast spell unlocks a new manual spell on a future reward.",
    [`${id}_cd`],
    (inst) => { inst.autoFire = true; },
  );
}

// Capstone: a single per-spell apex node that reshapes the spell's behavior
// (not just stats). Gated by `requiresOwnedCount` -- owning N of the spell's
// existing tree -- rather than a specific branch, so any committed build
// reaches it. Carries `capstone: true` purely for UI tiering.
function capstone(id, cost, title, description, requiresOwnedCount, apply) {
  return Object.freeze({
    id: `${id}_capstone`,
    cost,
    title,
    description,
    requires: [`${id}_cd`],
    excludes: [],
    requiresOwnedCount,
    capstone: true,
    apply,
  });
}

export const UPGRADE_TREES = Object.freeze({
  arcane_bolt: Object.freeze([
    dmg("arcane_bolt", 30, 25),
    cd("arcane_bolt", 25, 45),
    node(
      "arcane_bolt_rapid_conduit", 70,
      "Rapid Conduit",
      "A rapid-fire posture: -25% cooldown, but -10% damage.",
      ["arcane_bolt_cd"],
      (inst) => {
        inst.stats.cooldown = Math.max(0.12, inst.stats.cooldown * 0.75);
        inst.stats.damage = Math.max(1, Math.round(inst.stats.damage * 0.9));
      },
      ["arcane_bolt_focused_charge"],
    ),
    node(
      "arcane_bolt_focused_charge", 70,
      "Focused Charge",
      "A heavy-cast posture: +45% damage, but +18% cooldown.",
      ["arcane_bolt_cd"],
      (inst) => {
        inst.stats.damage = Math.round(inst.stats.damage * 1.45);
        inst.stats.cooldown *= 1.18;
      },
      ["arcane_bolt_rapid_conduit"],
    ),
    node(
      "arcane_bolt_seeking", 80,
      "Seeking Bolt",
      "The bolt gently steers toward the nearest enemy after firing.",
      ["arcane_bolt_cd"],
      (inst) => { inst.homing = true; },
      ["arcane_bolt_pierce_lance"],
    ),
    node(
      "arcane_bolt_pierce_lance", 80,
      "Piercing Lance",
      "The bolt punches through up to 2 extra enemies before fizzling.",
      ["arcane_bolt_cd"],
      (inst) => { inst.stats.pierceCount += 2; },
      ["arcane_bolt_seeking"],
    ),
    node(
      "arcane_bolt_runic_accelerator", 115,
      "Runic Accelerator",
      "Rapid Conduit goes sharper: +15 projectile speed and another -15% cooldown.",
      ["arcane_bolt_rapid_conduit"],
      (inst) => {
        inst.stats.projectileSpeed += 15;
        inst.stats.cooldown = Math.max(0.12, inst.stats.cooldown * 0.85);
      },
    ),
    node(
      "arcane_bolt_unstable_charge", 115,
      "Unstable Charge",
      "Focused Charge hits even harder: +35% damage and +1 split fragment.",
      ["arcane_bolt_focused_charge"],
      (inst) => {
        inst.stats.damage = Math.round(inst.stats.damage * 1.35);
        inst.stats.splitCount += 1;
      },
    ),
    node(
      "arcane_bolt_homing_salvo", 120,
      "Homing Salvo",
      "Seeking bolts split into two lighter fragments on first impact.",
      ["arcane_bolt_seeking"],
      (inst) => { inst.stats.splitCount += 2; },
    ),
    node(
      "arcane_bolt_phase_lance", 120,
      "Phase Lance",
      "Piercing Lance gains +2 pierce and +15% damage.",
      ["arcane_bolt_pierce_lance"],
      (inst) => {
        inst.stats.pierceCount += 2;
        inst.stats.damage = Math.round(inst.stats.damage * 1.15);
      },
    ),
    auto("arcane_bolt", 135),
    capstone(
      "arcane_bolt", 160,
      "Arcane Cascade",
      "Killing an enemy with the bolt fires a single follow-up bolt at the nearest other enemy within 18m. One cascade per cast, so the spell doesn't auto-loop. Tradeoff: +20% cooldown.",
      6,
      (inst) => {
        inst.cascadeOnKill = true;
        inst.stats.cooldown *= 1.2;
      },
    ),
  ]),

  fireball: Object.freeze([
    dmg("fireball", 30, 25),
    cd("fireball", 25, 45),
    node(
      "fireball_cinder_patch", 75,
      "Cinder Patch",
      "The blast leaves a burning patch that scorches enemies for a few seconds.",
      ["fireball_cd"],
      (inst) => { inst.burnPatch = true; },
      ["fireball_bigger_blast"],
    ),
    node(
      "fireball_bigger_blast", 75,
      "Bigger Blast",
      "+40% explosion radius and +15% damage. No lingering fire, just a fat boom.",
      ["fireball_cd"],
      (inst) => {
        inst.stats.areaRadius *= 1.4;
        inst.stats.damage = Math.round(inst.stats.damage * 1.15);
      },
      ["fireball_cinder_patch"],
    ),
    node(
      "fireball_knockback_shove", 70,
      "Knockback Shove",
      "The explosion physically shoves enemies away from the blast.",
      ["fireball_cd"],
      (inst) => { inst.knockbackOnHit = true; },
    ),
    node(
      "fireball_wildfire", 105,
      "Cinder Bloom",
      "Cinder patches spread wider and burn hotter: +20% radius and +15% damage.",
      ["fireball_cinder_patch"],
      (inst) => {
        inst.stats.areaRadius *= 1.2;
        inst.stats.damage = Math.round(inst.stats.damage * 1.15);
      },
    ),
    node(
      "fireball_scorched_earth", 145,
      "Scorched Earth",
      "Commit to zones: +30% blast radius, but +10% cooldown.",
      ["fireball_wildfire"],
      (inst) => {
        inst.stats.areaRadius *= 1.3;
        inst.stats.cooldown *= 1.1;
      },
    ),
    node(
      "fireball_impact_core", 110,
      "Impact Core",
      "Bigger Blast becomes denser: +45% damage, but -15% radius.",
      ["fireball_bigger_blast"],
      (inst) => {
        inst.stats.damage = Math.round(inst.stats.damage * 1.45);
        inst.stats.areaRadius *= 0.85;
      },
    ),
    node(
      "fireball_rolling_blast", 110,
      "Rolling Blast",
      "Bigger Blast travels faster and carries +20% more radius.",
      ["fireball_bigger_blast"],
      (inst) => {
        inst.stats.projectileSpeed += 12;
        inst.stats.areaRadius *= 1.2;
      },
    ),
    node(
      "fireball_concussive_ring", 105,
      "Concussive Ring",
      "Knockback Shove gets +25% radius and +10% damage.",
      ["fireball_knockback_shove"],
      (inst) => {
        inst.stats.areaRadius *= 1.25;
        inst.stats.damage = Math.round(inst.stats.damage * 1.1);
      },
    ),
    node(
      "fireball_backdraft", 125,
      "Backdraft",
      "The shove build casts faster: -20% cooldown.",
      ["fireball_knockback_shove"],
      (inst) => { inst.stats.cooldown = Math.max(0.12, inst.stats.cooldown * 0.8); },
    ),
    auto("fireball", 135),
    capstone(
      "fireball", 175,
      "Wildfire",
      "Every explosion drops a molten pool that lingers ~3s, ticking damage to anything standing in it -- twice as long as a cinder patch, and it does not need the Cinder Patch line. Tradeoff: -30% direct blast damage; the pool is where the damage lives now.",
      7,
      (inst) => {
        inst.conflagrationPool = true;
        inst.stats.damage = Math.max(1, Math.round(inst.stats.damage * 0.7));
      },
    ),
  ]),

  frost_bolt: Object.freeze([
    dmg("frost_bolt", 30, 25),
    cd("frost_bolt", 25, 45),
    node(
      "frost_bolt_deep_freeze", 75,
      "Deep Freeze",
      "Hits now freeze enemies solid for a brief hard stop instead of only slowing them.",
      ["frost_bolt_cd"],
      (inst) => { inst.freeze = true; },
      ["frost_bolt_frost_nova"],
    ),
    node(
      "frost_bolt_frost_nova", 75,
      "Frost Nova on Hit",
      "Impact releases a small icy nova, chilling nearby enemies too.",
      ["frost_bolt_cd"],
      (inst) => { inst.frostNovaOnHit = true; },
      ["frost_bolt_deep_freeze"],
    ),
    node(
      "frost_bolt_brittle", 105,
      "Brittle Ice",
      "Frozen targets are easier to crack: +30% damage.",
      ["frost_bolt_deep_freeze"],
      (inst) => { inst.stats.damage = Math.round(inst.stats.damage * 1.3); },
    ),
    node(
      "frost_bolt_glacial_wave", 105,
      "Glacial Wave",
      "Nova builds chill harder and longer.",
      ["frost_bolt_frost_nova"],
      (inst) => {
        inst.stats.slowAmount = Math.min(0.9, inst.stats.slowAmount + 0.15);
        inst.stats.slowDuration += 1.5;
      },
    ),
    auto("frost_bolt", 125),
    capstone(
      "frost_bolt", 150,
      "Glacial Lance",
      "The bolt becomes a lance: it pierces every enemy in its path and leaves a 2-second slow zone (radius 4) where it expires. Crowds become lanes. Tradeoff: +50% cooldown -- this is a battlefield-shaping cast, not a panic button.",
      4,
      (inst) => {
        inst.glacialLance = true;
        inst.stats.pierceCount += 99;
        inst.stats.cooldown *= 1.5;
      },
    ),
  ]),

  poison_bolt: Object.freeze([
    dmg("poison_bolt", 30, 25),
    cd("poison_bolt", 25, 45),
    node(
      "poison_bolt_contagion", 75,
      "Contagion",
      "The poison spreads once to the nearest other enemy on impact.",
      ["poison_bolt_cd"],
      (inst) => { inst.contagion = true; },
      ["poison_bolt_virulent"],
    ),
    node(
      "poison_bolt_virulent", 85,
      "Virulent Strain",
      "+60% poison damage and +2s duration. The DOT stops spreading, but bites much harder.",
      ["poison_bolt_cd"],
      (inst) => {
        inst.stats.dotDamage = Math.round(inst.stats.dotDamage * 1.6);
        inst.stats.dotDuration += 2;
      },
      ["poison_bolt_contagion"],
    ),
    node(
      "poison_bolt_epidemic", 115,
      "Epidemic",
      "Contagion spreads stronger poison and gains +1 split fragment.",
      ["poison_bolt_contagion"],
      (inst) => {
        inst.stats.dotDamage = Math.round(inst.stats.dotDamage * 1.2);
        inst.stats.splitCount += 1;
      },
    ),
    node(
      "poison_bolt_corrosion", 115,
      "Corrosion",
      "Virulent poison corrodes armor: +25% impact damage and +25% DOT damage.",
      ["poison_bolt_virulent"],
      (inst) => {
        inst.stats.damage = Math.round(inst.stats.damage * 1.25);
        inst.stats.dotDamage = Math.round(inst.stats.dotDamage * 1.25);
      },
    ),
    auto("poison_bolt", 125),
    capstone(
      "poison_bolt", 155,
      "Pandemic",
      "On direct hit, the poison seeds on every enemy within 4m of the primary target -- a true outbreak, not a single jump. Replaces Contagion's behavior when both are owned. Tradeoff: -20% direct impact damage and +15% cooldown.",
      4,
      (inst) => {
        inst.pandemicSpread = true;
        inst.stats.damage = Math.max(1, Math.round(inst.stats.damage * 0.8));
        inst.stats.cooldown *= 1.15;
      },
    ),
  ]),

  chain_lightning: Object.freeze([
    dmg("chain_lightning", 30, 25),
    cd("chain_lightning", 25, 45),
    node(
      "chain_lightning_overcharge", 75,
      "Overcharge",
      "Arc to one extra enemy and briefly stun every target struck.",
      ["chain_lightning_cd"],
      (inst) => { inst.stats.chainCount += 1; inst.stunOnHit = true; },
      ["chain_lightning_tesla_bounce"],
    ),
    node(
      "chain_lightning_tesla_bounce", 85,
      "Tesla Bounce",
      "+3 additional chain jumps, but no stun. Pure spread damage.",
      ["chain_lightning_cd"],
      (inst) => { inst.stats.chainCount += 3; },
      ["chain_lightning_overcharge"],
    ),
    node(
      "chain_lightning_storm_pulse", 115,
      "Storm Pulse",
      "The stun build gets +20% damage and +1 extra chain.",
      ["chain_lightning_overcharge"],
      (inst) => {
        inst.stats.damage = Math.round(inst.stats.damage * 1.2);
        inst.stats.chainCount += 1;
      },
    ),
    node(
      "chain_lightning_forked_sky", 115,
      "Forked Sky",
      "The bounce build casts faster and jumps farther: -15% cooldown, +1 chain.",
      ["chain_lightning_tesla_bounce"],
      (inst) => {
        inst.stats.cooldown = Math.max(0.12, inst.stats.cooldown * 0.85);
        inst.stats.chainCount += 1;
      },
    ),
    auto("chain_lightning", 125),
    capstone(
      "chain_lightning", 165,
      "Chain Storm",
      "+2 chain jumps and the arc reaches 30% farther between targets, threading enemies the cast normally couldn't reach. Tradeoff: +40% cooldown.",
      4,
      (inst) => {
        inst.stormChain = true;
        inst.stats.chainCount += 2;
        inst.stats.cooldown *= 1.4;
      },
    ),
  ]),

  meteor: Object.freeze([
    dmg("meteor", 30, 25),
    cd("meteor", 25, 45),
    node(
      "meteor_aftershocks", 75,
      "Aftershocks",
      "Two smaller follow-up meteors crash down near the impact site.",
      ["meteor_cd"],
      (inst) => { inst.followups = 2; },
      ["meteor_wider_crater"],
    ),
    node(
      "meteor_wider_crater", 75,
      "Wider Crater",
      "+50% blast radius and +10% damage. One huge crater instead of follow-ups.",
      ["meteor_cd"],
      (inst) => {
        inst.stats.areaRadius *= 1.5;
        inst.stats.damage = Math.round(inst.stats.damage * 1.1);
      },
      ["meteor_aftershocks"],
    ),
    node(
      "meteor_meteor_shower", 115,
      "Meteor Shower",
      "Aftershocks calls down one more follow-up meteor.",
      ["meteor_aftershocks"],
      (inst) => { inst.followups += 1; },
    ),
    node(
      "meteor_extinction_core", 115,
      "Extinction Core",
      "The single crater build hits much harder: +35% damage.",
      ["meteor_wider_crater"],
      (inst) => { inst.stats.damage = Math.round(inst.stats.damage * 1.35); },
    ),
    auto("meteor", 135),
    capstone(
      "meteor", 180,
      "Cataclysm",
      "The primary impact stuns every enemy in its blast radius for 1 second, and the crater stays molten -- a damaging pool ticks for ~3 seconds at the full crater radius. Tradeoff: +25% cooldown.",
      4,
      (inst) => {
        inst.cataclysm = true;
        inst.stats.cooldown *= 1.25;
      },
    ),
  ]),
});
