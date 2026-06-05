// Runtime copy of a static SpellDefinition. `stats` is mutable; rewards/buffs
// modify the instance, never the frozen definition.
export class SpellInstance {
  constructor(def, ownerIsEnemy = false) {
    this.definitionId = def.id;
    this.displayName = def.displayName;
    this.castType = def.castType;
    this.color = def.color;
    this.colorblindColor = def.colorblindColor ?? null;
    this.soundId = def.soundId || "arcane";
    this.ownerIsEnemy = ownerIsEnemy;

    // VFX dispatch ids — drive VfxLibrary trail/impact resolver.
    // Optional: chain_lightning and meteor omit these (no projectile trail).
    this.trailVfxId = def.trailVfxId ?? null;
    this.impactVfxId = def.impactVfxId ?? null;
    this.trailInterval = def.trailInterval ?? null;

    // Mutable runtime stats (SpellRuntimeStats shape from the architecture doc).
    this.stats = {
      damage: def.damage || 0,
      cooldown: def.cooldown || 1,
      projectileSpeed: def.projectileSpeed || 0,
      range: def.range || 60,
      areaRadius: def.areaRadius || 0,
      chainCount: def.chainCount || 0,
      pierceCount: def.pierceCount || 0,
      splitCount: def.splitCount || 0,
      ricochetCount: def.ricochetCount || 0,
      dotDamage: def.dotDamage || 0,
      dotDuration: def.dotDuration || 0,
      dotTickRate: def.dotTickRate || 0.5,
      slowAmount: def.slowAmount || 0,
      slowDuration: def.slowDuration || 0,
      gravity: def.gravity || 0,
      cadenceStacks: def.cadenceStacks || false,
      cadenceMaxStacks: def.cadenceMaxStacks || 0,
      cadenceDamagePerStack: def.cadenceDamagePerStack || 0,
      cadenceDecayTime: def.cadenceDecayTime || 0,
    };

    // Upgrade-tree instance flags (mutated by UPGRADE_TREES node.apply,
    // never by the frozen definition). Reset implicitly on caster.reset()
    // because that rebuilds fresh SpellInstances.
    this.autoFire = false;
    this.homing = false;
    this.burnPatch = false;
    this.freeze = false;
    this.contagion = false;
    this.chillStacks = def.chillStacks || false;
    this.chillMaxStacks = def.chillMaxStacks || 0;
    this.chillDecayTime = def.chillDecayTime || 0;
    this.chillSlowPerStack = def.chillSlowPerStack || 0;
    this.shatterDamage = def.shatterDamage || 0;
    this.shatterRadius = def.shatterRadius || 0;
    this.cinderPotency = false;
    this.stunOnHit = false;
    this.followups = 0;
    this.knockbackOnHit = false;
    this.frostNovaOnHit = false;

    // Capstone flags (Feature 14). Each is set by exactly one capstone
    // upgrade node and reshapes the spell's behavior in place.
    this.cascadeOnKill = false;
    this.conflagrationPool = false;
    this.glacialLance = false;
    this.pandemicSpread = false;
    this.stormChain = false;
    this.cataclysm = false;

    this.contagionRadius = def.contagionRadius || 3.5;
    this.contagionPotency = def.contagionPotency || 0.6;
    if (def.burnPatch) this.burnPatch = true;
    if (def.contagion) this.contagion = true;

    // Feature_6 upgrade-tree flags — Frost Bolt
    this.frostChillStack = false;
    this.icicleSplinter = false;
    this.coldSnap = false;
    this.cryoSlow = false;
    this.hardShatter = false;
    this.cryoConduit = false;
    this.shatterStorm = false;

    // Feature_6 upgrade-tree flags — Poison Bolt
    this.plagueSpread = false;
    this.wideSpread = false;
    this.deepStack = false;
    this.corrosiveVeins = false;
    this.necroticBloom = false;

    // Feature_6 upgrade-tree flags — Chain Lightning
    this.jumpRangeBoost = false;
    this.overchargeFirst = false;
    this.chainLowHp = false;
    this.chainElites = false;
    this.voltaicOverflow = false;
    this.breakerShock = false;

    // Feature_6 upgrade-tree flags — Meteor
    this.secondaryImpactsUpgrade = false;
    this.scorchedGround = false;
    this.blastRadiusUpgrade = false;
    this.travelSpeedUpgrade = false;
    this.magmaCore = false;
    this.cometTrail = false;
  }
}
