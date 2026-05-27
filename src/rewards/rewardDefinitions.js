import { SPELL_DEFINITIONS, UNLOCKABLE_SPELL_IDS } from "../spells/spellDefinitions.js";

// Reward catalog as pure builders. Each builder returns a reward instance:
//   { id, type, title, description, rarity?, spellName?, apply(world) }
// apply() mutates RUNTIME state only (SpellInstance.stats, player Health,
// Blink), never the frozen spell definitions.
//
// A run owns only the spell chosen on the main menu, so spell-specific reward
// choices are naturally scoped to that one runtime SpellInstance.

// stat: which SpellInstance.stats field, mult/add: how it changes.
export const RARITIES = Object.freeze({
  common: Object.freeze({ label: "Common", weight: 70 }),
  uncommon: Object.freeze({ label: "Uncommon", weight: 25 }),
  rare: Object.freeze({ label: "Rare", weight: 7 }),
});

function spellBuff(spellInst, key, label, mutate, desc, rarity = "common") {
  return {
    id: `buff_${spellInst.definitionId}_${key}`,
    type: "Spell Upgrade",
    rarity,
    title: `${spellInst.displayName}: ${label}`,
    description: desc,
    spellName: spellInst.displayName,
    apply: () => mutate(spellInst.stats),
  };
}

export function spellBuffsFor(inst) {
  const out = [];
  const s = inst.stats;

  out.push(spellBuff(inst, "dmg", "+22% Damage",
    (st) => { st.damage = Math.round(st.damage * 1.22); }, "Increase this spell's damage by 22%."));
  out.push(spellBuff(inst, "cd", "-15% Cooldown",
    (st) => { st.cooldown = Math.max(0.12, st.cooldown * 0.85); }, "Reduce this spell's cooldown by 15%."));

  if (inst.castType === "projectile" || inst.castType === "projectile_dot") {
    out.push(spellBuff(inst, "pierce", "+1 Pierce",
      (st) => { st.pierceCount += 1; }, "Projectile passes through one extra enemy."));
    out.push(spellBuff(inst, "split", "+1 Split",
      (st) => { st.splitCount += 1; }, "On impact, splits into an extra fragment."));
    out.push(spellBuff(inst, "close_pierce", "Point-Blank Lance",
      (st) => {
        st.pierceCount += 2;
        st.range = Math.max(35, st.range * 0.72);
      },
      "Gain +2 pierce, but shorten the projectile's range. Rewards fighting in the pocket.",
      "uncommon"));
    out.push(spellBuff(inst, "heavy_shot", "Heavy Shot",
      (st) => {
        st.projectileSpeed = Math.round(st.projectileSpeed * 1.35);
        st.range = Math.max(30, st.range * 0.78);
      },
      "Projectiles fly 35% faster but reach 22% less distance.",
      "uncommon"));
  }
  if (inst.castType === "projectile" || inst.castType === "projectile_dot" || inst.castType === "projectile_aoe") {
    out.push(spellBuff(inst, "far_reach", "Far Reach",
      (st) => {
        st.range *= 1.3;
        st.projectileSpeed = Math.max(8, st.projectileSpeed * 0.85);
      },
      "Range grows by 30%, but projectiles travel 15% slower.",
      "uncommon"));
  }
  if (inst.castType === "projectile_aoe" || inst.castType === "ground_aoe") {
    out.push(spellBuff(inst, "aoe", "+30% Area",
      (st) => { st.areaRadius *= 1.3; }, "Increase explosion radius by 30%."));
    out.push(spellBuff(inst, "compressed_blast", "Compressed Blast",
      (st) => {
        st.damage = Math.round(st.damage * 1.4);
        st.areaRadius *= 0.78;
      },
      "A smaller, harder-hitting blast for precise casts.",
      "uncommon"));
  }
  if (inst.castType === "hitscan_chain") {
    out.push(spellBuff(inst, "chain", "+1 Chain",
      (st) => { st.chainCount += 1; }, "Arc to one additional nearby enemy."));
    out.push(spellBuff(inst, "short_circuit", "Short Circuit",
      (st) => {
        st.chainCount = Math.max(1, st.chainCount - 1);
        st.cooldown = Math.max(0.12, st.cooldown * 0.72);
      },
      "Fewer jumps, much faster casts. Better when you can isolate priority targets.",
      "uncommon"));
  }
  if (s.dotDamage > 0) {
    out.push(spellBuff(inst, "dot", "+35% Poison",
      (st) => { st.dotDamage = Math.round(st.dotDamage * 1.35); st.dotDuration += 1; },
      "Stronger and longer damage-over-time."));
  }
  if (s.slowAmount > 0) {
    out.push(spellBuff(inst, "slow", "+1.5s Slow",
      (st) => { st.slowDuration += 1.5; st.slowAmount = Math.min(0.85, st.slowAmount + 0.08); },
      "Chill lasts longer and bites harder."));
  }
  return out;
}

export function playerRewards(world) {
  const out = [];
  out.push({
    id: "player_hp",
    type: "Vitality",
    rarity: "common",
    title: "+25 Max Health",
    description: "Raise maximum health by 25 and heal for the same amount.",
    apply: (w) => w.player.health.setMax(w.player.health.max + 25),
  });
  if (world.blink.cooldown > 1.6) {
    out.push({
      id: "player_blink",
      type: "Mobility",
      rarity: "common",
      title: "-0.7s Blink Cooldown",
      description: "Blink recharges faster.",
      apply: (w) => { w.blink.cooldown = Math.max(1.5, w.blink.cooldown - 0.7); },
    });
  }
  out.push({
    id: "player_heal",
    type: "Vitality",
    rarity: "common",
    title: "Full Heal",
    description: "Restore all health immediately.",
    apply: (w) => w.player.health.heal(w.player.health.max),
  });
  if (world.blink.cooldown < 6.5) {
    out.push({
      id: "player_long_step",
      type: "Mobility",
      rarity: "uncommon",
      title: "Long Step",
      description: "Blink covers 35% more ground, but its cooldown grows by 0.7s.",
      apply: (w) => {
        w.blink.distance *= 1.35;
        w.blink.cooldown += 0.7;
      },
    });
  }
  out.push({
    id: "player_aegis_battery",
    type: "Vitality",
    rarity: "uncommon",
    title: "Aegis Battery",
    description: "+40 max block stamina, but stamina regenerates 30% slower.",
    apply: (w) => {
      const b = w.player.block;
      b.maxStamina += 40;
      b.stamina = Math.min(b.maxStamina, b.stamina + 40);
      b.regenMul *= 0.7;
    },
  });
  if (world.caster.loadout.some((s) => s.autoFire) && world.combat?.autocastTargetMode !== "lowestHp") {
    out.push({
      id: "player_hunters_eye",
      type: "Targeting",
      rarity: "uncommon",
      title: "Hunter's Eye",
      description: "Auto-Cast aims at the lowest-HP enemy in range instead of straight ahead.",
      tip: "Manual casts still fire where you look.",
      apply: (w) => { w.combat.autocastTargetMode = "lowestHp"; },
    });
  }
  return out;
}

export function spellUnlockRewards(world) {
  const autoCount = world.caster.loadout.filter((s) => s.autoFire).length;
  const unlockedExtras = Math.max(0, world.caster.loadout.length - 1);
  if (autoCount <= unlockedExtras) return [];
  return UNLOCKABLE_SPELL_IDS
    .filter((id) => !world.caster.owns(id))
    .map((id) => {
      const def = SPELL_DEFINITIONS[id];
      return {
        id: `spell_unlock_${id}`,
        type: "Spell Unlock",
        rarity: "rare",
        title: `Attune ${def.displayName}`,
        description: "Add this as a new manual spell. Each Auto-Cast you own unlocks one extra manual spell slot.",
        tip: "Unlocked by reaching Auto-Cast on a previously owned spell.",
        spellName: def.displayName,
        apply: (w) => {
          w.caster.addSpell(id, true, w);
          w.onCombatProc?.(`${def.displayName} attuned`);
        },
      };
    });
}

function relic(world, id, title, description, apply, rarity = "rare") {
  if (world.relics?.has(id)) return null;
  return {
    id: `relic_${id}`,
    relicId: id,
    type: "Relic",
    rarity,
    title,
    description,
    apply: (w) => {
      w.relics.add(id);
      apply?.(w);
    },
  };
}

export function relicRewards(world) {
  return [
    relic(
      world,
      "duelist_sigil",
      "Duelist Sigil",
      "Your hits against enemies within 10m deal +35% damage and shave blink recharge. Strong if you can hold close range.",
      null,
    ),
    relic(
      world,
      "blinkstrike_ember",
      "Blinkstrike Ember",
      "Casting within 1.35s after blinking empowers that cast by +55% damage and shortens its cooldown by 35%.",
      null,
    ),
    relic(
      world,
      "parry_dynamo",
      "Parry Dynamo",
      "Perfect blocks arm your next cast for +80% damage.",
      null,
    ),
    relic(
      world,
      "adrenal_lens",
      "Adrenal Lens",
      "While below 45% health, your casts deal +35% damage. Greedy, dangerous, very real.",
      null,
      "uncommon",
    ),
    relic(
      world,
      "glass_focus",
      "Glass Focus",
      "Immediately empower your run spell by +45% damage, but lose 20 max health.",
      (w) => {
        const spell = w.caster.current;
        if (spell) {
          spell.stats.damage = Math.round(spell.stats.damage * 1.45);
          if (spell.stats.dotDamage > 0) spell.stats.dotDamage = Math.round(spell.stats.dotDamage * 1.45);
        }
        w.player.health.setMax(Math.max(35, w.player.health.max - 20));
      },
      "rare",
    ),

    // Feature_6 — New Relics

    relic(
      world,
      "embered_footing",
      "Embered Footing",
      "Standing still for 1.5s empowers your next cast by +35% damage. Rewards positional discipline.",
      (w) => { w.combat.emberedFootingReady = false; },
    ),
    relic(
      world,
      "stormwitness",
      "Stormwitness",
      "Each chain target hit reduces your blink cooldown by 0.3s. Synergy with Chain Lightning.",
      null,
    ),
    relic(
      world,
      "frostbitten_crown",
      "Frostbitten Crown",
      "Slowed enemies take +20% damage from all sources. Winter's embrace turns lethal.",
      null,
    ),
    relic(
      world,
      "vermillion_catalyst",
      "Vermilion Catalyst",
      "Every 5th cast deals +50% damage and erupts in a small AoE. Rewards consistent casting.",
      (w) => { w.combat.castCounter = 0; },
    ),
    relic(
      world,
      "hollow_sigil",
      "Hollow Sigil",
      "Skip buying upgrades for 2 consecutive reward cycles to gain permanent +15% damage. Rewards focus.",
      null,
    ),
    relic(
      world,
      "riftborn_mantle",
      "Riftborn Mantle",
      "Standing in a rift hazard heals 1 HP/s, but all casts cost +20% cooldown. High-risk identity choice.",
      null,
    ),
  ].filter(Boolean);
}
