import { step, assert } from "../testHelpers.js";
import { UPGRADE_TREES } from "../../spells/upgradeTrees.js";
import { spellBuffsFor, playerRewards, relicRewards, spellUnlockRewards } from "../../rewards/rewardDefinitions.js";
import { SpellInstance } from "../../spells/SpellInstance.js";
import { SPELL_DEFINITIONS, STARTER_SPELL_ID } from "../../spells/spellDefinitions.js";

export default async function runCatalogValidate(game, result) {
  await step(result, "upgradeTrees — every node has required shape", () => {
    const allIds = [];
    for (const [spellId, tree] of Object.entries(UPGRADE_TREES)) {
      assert(Array.isArray(tree), `${spellId} tree must be an array`);
      for (const node of tree) {
        assert(typeof node.id === "string", `${spellId} node missing string id`);
        assert(typeof node.cost === "number" && node.cost > 0, `${spellId}/${node.id} must have cost > 0`);
        assert(typeof node.title === "string", `${spellId}/${node.id} missing title`);
        assert(typeof node.description === "string", `${spellId}/${node.id} missing description`);
        assert(Array.isArray(node.requires), `${spellId}/${node.id} requires must be an array`);
        assert(typeof node.apply === "function", `${spellId}/${node.id} missing apply`);
        assert(Array.isArray(node.excludes || []), `${spellId}/${node.id} excludes must be an array`);
        allIds.push({ spellId, id: node.id });
      }
    }
  });

  await step(result, "upgradeTrees — no duplicate node ids within a tree", () => {
    for (const [spellId, tree] of Object.entries(UPGRADE_TREES)) {
      const ids = tree.map((n) => n.id);
      const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
      assert(dupes.length === 0, `${spellId} duplicate node ids: ${dupes.join(", ")}`);
    }
  });

  await step(result, "upgradeTrees — no duplicate node ids across trees", () => {
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

  await step(result, "upgradeTrees — every requires reference resolves", () => {
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

  await step(result, "upgradeTrees — every apply runs without error on a test instance", () => {
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

  await step(result, "relicRewards — every relic has required shape", () => {
    const w = {
      relics: { has: () => false, add: () => {} },
      caster: { current: null },
      player: { health: { setMax: () => {} } },
      combat: {},
    };
    const relics = relicRewards(w);
    const ids = [];
    for (const r of relics) {
      assert(typeof r.id === "string", `Relic missing string id`);
      assert(r.id.startsWith("relic_"), `Relic id "${r.id}" should start with "relic_"`);
      assert(typeof r.title === "string" && r.title.length > 0, `Relic ${r.id} missing title`);
      assert(typeof r.description === "string" && r.description.length > 0, `Relic ${r.id} missing description`);
      assert(r.type === "Relic", `Relic ${r.id} type must be "Relic"`);
      assert(r.rarity === "rare" || r.rarity === "uncommon", `Relic ${r.id} rarity must be rare or uncommon`);
      assert(typeof r.apply === "function", `Relic ${r.id} missing apply`);
      ids.push(r.id);
    }
  });

  await step(result, "relicRewards — no duplicate relic ids", () => {
    const w = {
      relics: { has: () => false, add: () => {} },
      caster: { current: null },
      player: { health: { setMax: () => {} } },
      combat: {},
    };
    const relics = relicRewards(w);
    const ids = relics.map((r) => r.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    assert(dupes.length === 0, `Duplicate relic ids: ${dupes.join(", ")}`);
  });
}
