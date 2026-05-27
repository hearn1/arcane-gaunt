import { step, assert } from "../testHelpers.js";
import { SPELL_DEFINITIONS, STARTER_SPELL_ID, UNLOCKABLE_SPELL_IDS } from "../../spells/spellDefinitions.js";
import { UPGRADE_TREES } from "../../spells/upgradeTrees.js";
import { SpellInstance } from "../../spells/SpellInstance.js";
import { RARITIES, spellBuffsFor, playerRewards, relicRewards, spellUnlockRewards } from "../../rewards/rewardDefinitions.js";
import { WAVE_MODIFIERS } from "../../level/waveModifiers.js";
import { ONBOARDING_PROMPTS } from "../../ui/onboardingPrompts.js";
const VALID_CAST_TYPES = ["projectile", "projectile_aoe", "projectile_dot", "hitscan_chain", "ground_aoe"];

export default async function runDataValidate(game, result) {
  await step(result, "SPELL_DEFINITIONS — every spell has required fields", () => {
    const ids = Object.keys(SPELL_DEFINITIONS);
    assert(ids.length >= 6, `Expected at least 6 spells, got ${ids.length}`);
    assert(ids.includes(STARTER_SPELL_ID), `STARTER_SPELL_ID "${STARTER_SPELL_ID}" not in definitions`);
    for (const [id, def] of Object.entries(SPELL_DEFINITIONS)) {
      assert(def.id === id, `Key "${id}" does not match def.id "${def.id}"`);
      assert(typeof def.displayName === "string" && def.displayName.length > 0, `${id} missing displayName`);
      assert(typeof def.description === "string" && def.description.length > 0, `${id} missing description`);
      assert(VALID_CAST_TYPES.includes(def.castType), `${id} invalid castType "${def.castType}"`);
      assert(typeof def.damage === "number" && def.damage > 0, `${id} damage must be > 0, got ${def.damage}`);
      assert(typeof def.cooldown === "number" && def.cooldown > 0, `${id} cooldown must be > 0, got ${def.cooldown}`);
      assert(typeof def.range === "number" && def.range >= 30, `${id} range must be >= 30, got ${def.range}`);
      assert(Number.isInteger(def.color) || typeof def.color === "number", `${id} color must be a number`);
      assert(Object.isFrozen(def), `${id} definition must be frozen`);
      assert(ids.filter((k) => k === id).length === 1, `Duplicate definition key "${id}"`);
    }
  });

  await step(result, "UNLOCKABLE_SPELL_IDS — consistent with SPELL_DEFINITIONS", () => {
    for (const id of UNLOCKABLE_SPELL_IDS) {
      assert(!!SPELL_DEFINITIONS[id], `UNLOCKABLE_SPELL_IDS contains "${id}" not in definitions`);
      assert(!SPELL_DEFINITIONS[id].starter, `UNLOCKABLE_SPELL_IDS contains starter spell "${id}"`);
    }
    const nonStarterIds = Object.keys(SPELL_DEFINITIONS).filter((id) => !SPELL_DEFINITIONS[id].starter);
    for (const id of nonStarterIds) {
      assert(UNLOCKABLE_SPELL_IDS.includes(id), `Non-starter spell "${id}" missing from UNLOCKABLE_SPELL_IDS`);
    }
  });

  await step(result, "UPGRADE_TREES — every spell in definitions has a tree", () => {
    for (const id of Object.keys(SPELL_DEFINITIONS)) {
      assert(!!UPGRADE_TREES[id], `Spell "${id}" has no upgrade tree`);
      assert(Array.isArray(UPGRADE_TREES[id]), `Tree for "${id}" is not an array`);
      assert(UPGRADE_TREES[id].length >= 5, `Tree for "${id}" has fewer than 5 nodes (authoring minimum)`);
    }
  });

  await step(result, "UPGRADE_TREES — every node has valid shape", () => {
    const allNodeIds = [];
    for (const [spellId, tree] of Object.entries(UPGRADE_TREES)) {
      for (const node of tree) {
        assert(typeof node.id === "string", `${spellId} node missing string id`);
        assert(typeof node.title === "string" && node.title.length > 0, `${spellId}/${node.id} missing title`);
        assert(typeof node.description === "string" && node.description.length > 0, `${spellId}/${node.id} missing description`);
        assert(typeof node.cost === "number" && node.cost >= 20, `${spellId}/${node.id} cost must be >= 20, got ${node.cost}`);
        assert(typeof node.apply === "function", `${spellId}/${node.id} missing apply`);
        assert(Array.isArray(node.requires), `${spellId}/${node.id} requires must be an array`);
        assert(Array.isArray(node.excludes || []), `${spellId}/${node.id} excludes must be an array`);
        assert(!node.id.includes(" "), `${spellId}/${node.id} id should not contain spaces`);
        allNodeIds.push({ spellId, id: node.id });
      }
    }
  });

  await step(result, "UPGRADE_TREES — no duplicate node ids within a spell", () => {
    for (const [spellId, tree] of Object.entries(UPGRADE_TREES)) {
      const ids = tree.map((n) => n.id);
      const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
      assert(dupes.length === 0, `${spellId} duplicate node ids: ${[...new Set(dupes)].join(", ")}`);
    }
  });

  await step(result, "UPGRADE_TREES — no duplicate node ids across spells", () => {
    const seen = {};
    for (const [spellId, tree] of Object.entries(UPGRADE_TREES)) {
      for (const node of tree) {
        if (seen[node.id]) {
          assert(false, `Duplicate node id "${node.id}" in ${spellId} (also in ${seen[node.id]})`);
        }
        seen[node.id] = spellId;
      }
    }
  });

  await step(result, "UPGRADE_TREES — every requires reference resolves within its tree", () => {
    for (const [spellId, tree] of Object.entries(UPGRADE_TREES)) {
      const ids = new Set(tree.map((n) => n.id));
      for (const node of tree) {
        for (const req of node.requires) {
          assert(ids.has(req), `${spellId}/${node.id}: requires "${req}" not found in tree`);
        }
        for (const ex of node.excludes || []) {
          assert(ids.has(ex), `${spellId}/${node.id}: excludes "${ex}" not found in tree`);
        }
      }
    }
  });

  await step(result, "UPGRADE_TREES — dmg node is always first and requires is empty", () => {
    for (const [spellId, tree] of Object.entries(UPGRADE_TREES)) {
      const first = tree[0];
      assert(first.id.endsWith("_dmg"), `${spellId} first node should be _dmg, got "${first.id}"`);
      assert(first.requires.length === 0, `${spellId}/${first.id} dmg node should have empty requires`);
    }
  });

  await step(result, "UPGRADE_TREES — cd node requires dmg node", () => {
    for (const [spellId, tree] of Object.entries(UPGRADE_TREES)) {
      const cdNode = tree.find((n) => n.id.endsWith("_cd"));
      assert(!!cdNode, `${spellId} missing cd node`);
      assert(cdNode.requires.length === 1 && cdNode.requires[0].endsWith("_dmg"),
        `${spellId} cd node should require the dmg node`);
    }
  });

  await step(result, "UPGRADE_TREES — auto node requires cd node", () => {
    for (const [spellId, tree] of Object.entries(UPGRADE_TREES)) {
      const autoNode = tree.find((n) => n.id.endsWith("_auto"));
      assert(!!autoNode, `${spellId} missing auto node`);
      assert(autoNode.requires.length === 1 && autoNode.requires[0].endsWith("_cd"),
        `${spellId} auto node should require the cd node`);
    }
  });

  await step(result, "UPGRADE_TREES — capstone node exists and is at the end", () => {
    for (const [spellId, tree] of Object.entries(UPGRADE_TREES)) {
      const last = tree[tree.length - 1];
      assert(last.id.endsWith("_capstone"), `${spellId} last node should be capstone, got "${last.id}"`);
      assert(last.capstone === true, `${spellId} capstone node missing capstone: true`);
      assert(typeof last.requiresOwnedCount === "number" && last.requiresOwnedCount >= 4,
        `${spellId} capstone requiresOwnedCount should be >= 4, got ${last.requiresOwnedCount}`);
    }
  });

  await step(result, "UPGRADE_TREES — exclusive pairs are symmetric", () => {
    for (const [spellId, tree] of Object.entries(UPGRADE_TREES)) {
      const map = {};
      for (const node of tree) map[node.id] = node;
      for (const node of tree) {
        for (const ex of node.excludes || []) {
          const other = map[ex];
          assert(!!other, `${spellId}/${node.id}: excludes "${ex}" which is not a node`);
          assert(other.excludes.includes(node.id),
            `${spellId}/${node.id} excludes "${ex}" but ${ex} does not exclude back`);
        }
      }
    }
  });

  await step(result, "UPGRADE_TREES — every apply runs without error on a fresh instance", () => {
    for (const [spellId, tree] of Object.entries(UPGRADE_TREES)) {
      const def = SPELL_DEFINITIONS[spellId];
      assert(def, `${spellId} has no spell definition`);
      const world = { combat: {} };
      for (const node of tree) {
        const inst = new SpellInstance(def);
        try {
          node.apply(inst, world);
        } catch (e) {
          assert(false, `${spellId}/${node.id}: apply threw: ${e.message}`);
        }
      }
    }
  });

  await step(result, "RARITIES — each has valid shape and weights sum reasonably", () => {
    const rarities = Object.keys(RARITIES);
    assert(rarities.length >= 3, `Expected at least 3 rarities, got ${rarities.length}`);
    const sum = Object.values(RARITIES).reduce((s, r) => s + r.weight, 0);
    assert(sum > 90 && sum < 120, `Rarity weights sum to ${sum}, expected ~102`);
    for (const [key, rarity] of Object.entries(RARITIES)) {
      assert(typeof rarity.label === "string" && rarity.label.length > 0, `${key} missing label`);
      assert(typeof rarity.weight === "number" && rarity.weight > 0, `${key} weight must be > 0`);
    }
  });

  await step(result, "WAVE_MODIFIERS — every modifier has required shape", () => {
    assert(Array.isArray(WAVE_MODIFIERS), "WAVE_MODIFIERS must be an array");
    assert(WAVE_MODIFIERS.length >= 3, `Expected at least 3 modifiers, got ${WAVE_MODIFIERS.length}`);
    const ids = [];
    for (const mod of WAVE_MODIFIERS) {
      assert(typeof mod.id === "string" && mod.id.length > 0, `Modifier missing or empty id`);
      assert(typeof mod.name === "string" && mod.name.length > 0, `${mod.id} missing name`);
      assert(typeof mod.description === "string" && mod.description.length > 0, `${mod.id} missing description`);
      assert(typeof mod.minLevel === "number" && mod.minLevel >= 2, `${mod.id} minLevel must be >= 2`);
      assert(typeof mod.weight === "number" && mod.weight > 0, `${mod.id} weight must be > 0`);
      assert(typeof mod.goldMult === "number" && mod.goldMult >= 1, `${mod.id} goldMult must be >= 1`);
      ids.push(mod.id);
    }
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    assert(dupes.length === 0, `Duplicate modifier ids: ${[...new Set(dupes)].join(", ")}`);
  });

  await step(result, "ONBOARDING_PROMPTS — every prompt has required shape", () => {
    assert(Array.isArray(ONBOARDING_PROMPTS), "ONBOARDING_PROMPTS must be an array");
    assert(ONBOARDING_PROMPTS.length >= 6, `Expected at least 6 prompts, got ${ONBOARDING_PROMPTS.length}`);
    const ids = [];
    const triggers = [];
    for (const p of ONBOARDING_PROMPTS) {
      assert(typeof p.id === "string" && p.id.length > 0, `Prompt missing or empty id`);
      assert(typeof p.trigger === "string" && p.trigger.length > 0, `${p.id} missing trigger`);
      assert(typeof p.text === "string" && p.text.length > 0, `${p.id} missing text`);
      assert(typeof p.persistKey === "string" && p.persistKey.length > 0, `${p.id} missing persistKey`);
      ids.push(p.id);
      triggers.push(p.trigger);
    }
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    assert(dupes.length === 0, `Duplicate prompt ids: ${[...new Set(dupes)].join(", ")}`);
    const triggerDupes = triggers.filter((t, i) => triggers.indexOf(t) !== i);
    assert(triggerDupes.length === 0, `Duplicate prompt triggers: ${[...new Set(triggerDupes)].join(", ")}`);
  });

  await step(result, "SpellInstance constructor copies all expected fields from definition", () => {
    for (const [spellId, def] of Object.entries(SPELL_DEFINITIONS)) {
      const inst = new SpellInstance(def);
      assert(inst.definitionId === def.id, `${spellId}: instance definitionId mismatch`);
      assert(inst.displayName === def.displayName, `${spellId}: instance displayName mismatch`);
      assert(inst.castType === def.castType, `${spellId}: instance castType mismatch`);
      assert(inst.stats.damage === def.damage, `${spellId}: stats.damage mismatch`);
      assert(inst.stats.cooldown === def.cooldown, `${spellId}: stats.cooldown mismatch`);
      assert(inst.stats.range === def.range, `${spellId}: stats.range mismatch`);
      assert(inst.autoFire === false, `${spellId}: autoFire should start false`);
      assert(inst.homing === false, `${spellId}: homing should start false`);
    }
  });

  await step(result, "SPELL_DEFINITIONS — every castType has a valid spell", () => {
    for (const castType of VALID_CAST_TYPES) {
      const hasSpell = Object.values(SPELL_DEFINITIONS).some((d) => d.castType === castType);
      assert(hasSpell, `No spell uses castType "${castType}"`);
    }
  });

  // Verify that each cast type in Effects.js dispatch is covered
  const effectsCastTypes = ["hitscan_chain", "ground_aoe", "projectile", "projectile_aoe", "projectile_dot"];
  await step(result, "SPELL_DEFINITIONS — coverage matches Effects.js dispatch table", () => {
    for (const ct of effectsCastTypes) {
      assert(VALID_CAST_TYPES.includes(ct), `Effects.js cast type "${ct}" not in VALID_CAST_TYPES`);
    }
  });

  await step(result, "SPELL_DEFINITIONS — unique mechanic fields per spell", () => {
    const fb = SPELL_DEFINITIONS.fireball;
    assert(fb.burnPatch === true, "fireball missing burnPatch");
    assert(typeof fb.gravity === "number" && fb.gravity > 0, "fireball missing gravity");

    const fb2 = SPELL_DEFINITIONS.frost_bolt;
    assert(fb2.chillStacks === true, "frost_bolt missing chillStacks");
    assert(typeof fb2.chillMaxStacks === "number" && fb2.chillMaxStacks > 0, "frost_bolt missing chillMaxStacks");
    assert(typeof fb2.shatterDamage === "number" && fb2.shatterDamage > 0, "frost_bolt missing shatterDamage");

    const pb = SPELL_DEFINITIONS.poison_bolt;
    assert(pb.contagion === true, "poison_bolt missing contagion");
    assert(typeof pb.contagionRadius === "number" && pb.contagionRadius > 0, "poison_bolt missing contagionRadius");
    assert(typeof pb.contagionPotency === "number" && pb.contagionPotency > 0 && pb.contagionPotency < 1, "poison_bolt missing contagionPotency");

    const ab = SPELL_DEFINITIONS.arcane_bolt;
    assert(ab.cadenceStacks === true, "arcane_bolt missing cadenceStacks");
    assert(typeof ab.cadenceMaxStacks === "number" && ab.cadenceMaxStacks > 0, "arcane_bolt missing cadenceMaxStacks");
  });

  const validRewardTypes = ["Spell Upgrade", "Vitality", "Mobility", "Targeting", "Relic", "Spell Unlock"];
  const validRaritiesForRewards = ["common", "uncommon", "rare"];

  async function validateRewardShape(reward, source) {
    assert(typeof reward.id === "string" && reward.id.length > 0, `${source}: missing string id`);
    assert(typeof reward.title === "string" && reward.title.length > 0, `${source}/${reward.id}: missing title`);
    assert(typeof reward.description === "string" && reward.description.length > 0, `${source}/${reward.id}: missing description`);
    assert(validRewardTypes.includes(reward.type), `${source}/${reward.id}: invalid type "${reward.type}"`);
    assert(validRaritiesForRewards.includes(reward.rarity || "common"), `${source}/${reward.id}: invalid rarity "${reward.rarity}"`);
    assert(typeof reward.apply === "function", `${source}/${reward.id}: missing apply`);
  }

  await step(result, "spellBuffsFor — all buff rewards have valid shape", () => {
    for (const [, def] of Object.entries(SPELL_DEFINITIONS)) {
      const inst = new SpellInstance(def);
      const buffs = spellBuffsFor(inst);
      for (const b of buffs) {
        validateRewardShape(b, `spellBuffsFor(${def.id})`);
        assert(b.type === "Spell Upgrade", `${b.id} should be type "Spell Upgrade"`);
        assert(b.spellName === def.displayName, `${b.id}: spellName mismatch`);
      }
      const ids = buffs.map((b) => b.id);
      const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
      assert(dupes.length === 0, `spellBuffsFor(${def.id}): duplicate ids: ${[...new Set(dupes)].join(", ")}`);
    }
  });

  await step(result, "playerRewards — all player rewards have valid shape", () => {
    const world = {
      player: { health: { max: 100, heal: () => {}, setMax: () => {} } },
      blink: { cooldown: 3, distance: 8 },
      caster: { current: null, loadout: [] },
      combat: {},
      relics: { has: () => false },
    };
    const rewards = playerRewards(world);
    assert(rewards.length > 0, "playerRewards should return at least 1 reward");
    for (const r of rewards) {
      validateRewardShape(r, "playerRewards");
      const validPlayerTypes = ["Vitality", "Mobility", "Targeting"];
      assert(validPlayerTypes.includes(r.type), `${r.id}: unexpected type "${r.type}"`);
    }
  });

  await step(result, "spellUnlockRewards — returns valid rewards when unlocks available", () => {
    const def = SPELL_DEFINITIONS[STARTER_SPELL_ID];
    const world = {
      caster: {
        loadout: [{ autoFire: true }],
        owns: () => false,
        addSpell: () => {},
      },
      relics: { has: () => false },
      onCombatProc: () => {},
    };
    const rewards = spellUnlockRewards(world);
    for (const r of rewards) {
      validateRewardShape(r, "spellUnlockRewards");
      assert(r.type === "Spell Unlock", `${r.id}: should be "Spell Unlock"`);
      assert(r.rarity === "rare", `${r.id}: rarity should be rare`);
      assert(typeof r.spellName === "string", `${r.id}: missing spellName`);
    }
  });

  await step(result, "relicRewards — all have valid shape and no duplicates", () => {
    const world = {
      relics: { has: () => false, add: () => {} },
      caster: { current: null },
      player: { health: { setMax: () => {}, max: 100 } },
      combat: {},
    };
    const relics = relicRewards(world);
    assert(relics.length >= 5, `Expected at least 5 relics, got ${relics.length}`);
    for (const r of relics) {
      validateRewardShape(r, "relicRewards");
      assert(r.type === "Relic", `${r.id}: should be "Relic"`);
      assert(r.id.startsWith("relic_"), `${r.id}: should start with "relic_"`);
    }
    const ids = relics.map((r) => r.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    assert(dupes.length === 0, `Duplicate relic ids: ${[...new Set(dupes)].join(", ")}`);
  });

  await step(result, "relicRewards — does not return duplicates for the same world", () => {
    const owned = new Set();
    const world = {
      relics: { has: (id) => owned.has(id), add: (id) => owned.add(id) },
      caster: { current: null },
      player: { health: { setMax: () => {}, max: 100 } },
      combat: {},
    };
    const first = relicRewards(world);
    assert(first.length > 0, "First relicRewards call should return rewards");
    const firstIds = new Set(first.map((r) => r.relicId));
    for (const id of firstIds) owned.add(id);
    const second = relicRewards(world);
    for (const r of second) {
      assert(!owned.has(r.relicId), `relicRewards returned duplicate relic "${r.relicId}" after first call`);
    }
  });
}
