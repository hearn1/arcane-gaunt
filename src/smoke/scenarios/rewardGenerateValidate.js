import { step, assert } from "../testHelpers.js";
import { SPELL_DEFINITIONS, STARTER_SPELL_ID } from "../../spells/spellDefinitions.js";
import { SpellInstance } from "../../spells/SpellInstance.js";
import { RewardGenerator } from "../../rewards/RewardGenerator.js";
import { relicRewards, spellUnlockRewards } from "../../rewards/rewardDefinitions.js";

function mockWorld(config = {}) {
  const ownedRelics = new Set();
  const autoFire = config.autoFire ?? false;
  const extraSpells = config.extraSpells ?? [];
  const hasBlink = config.hasBlink ?? true;
  const level = config.level ?? 1;
  const unlockedSpells = config.unlockedSpells ?? null;

  const mainSpellId = config.spellId || STARTER_SPELL_ID;
  const mainDef = SPELL_DEFINITIONS[mainSpellId];
  const loadout = [
    {
      autoFire,
      definitionId: mainSpellId,
      displayName: mainDef.displayName,
      castType: mainDef.castType,
      stats: { ...new SpellInstance(mainDef).stats },
      homing: false,
      burnPatch: false,
    },
    ...extraSpells,
  ];

  return {
    player: {
      health: {
        max: 100,
        current: 80,
        heal: function (v) { this.current = Math.min(this.max, this.current + v); },
        setMax: function (v) { this.max = v; },
      },
      block: { maxStamina: 100, stamina: 80, regenMul: 1 },
    },
    blink: {
      cooldown: hasBlink ? 3.0 : 999,
      distance: 8,
    },
    caster: {
      current: loadout[0],
      loadout,
      unlockedSpells,
      owns: (id) => loadout.some((s) => s.definitionId === id),
      addSpell: (id) => {
        if (unlockedSpells && !unlockedSpells.includes(id)) return null;
        const inst = { definitionId: id, autoFire: false };
        loadout.push(inst);
        return inst;
      },
    },
    combat: {
      autocastTargetMode: null,
      emberedFootingReady: false,
      castCounter: 0,
    },
    relics: {
      has: (id) => ownedRelics.has(id),
      add: (id) => ownedRelics.add(id),
    },
    levelManager: { level },
    arenaBounds: { half: 50 },
    onCombatProc: () => {},
    getEnemies: () => [],
    getObjectiveTargets: () => [],
    hitResolver: { add: () => {}, projectiles: [] },
    vfx: { flash: () => {}, burst: () => {}, ring: () => {}, custom: () => {}, beam: () => {}, lightning: () => {}, mist: () => {} },
    audio: { cast: () => {} },
    after: () => {},
  };
}

export default async function runRewardGenerateValidate(game, result) {
  await step(result, "RewardGenerator.generate — returns exactly 3 cards when pool is sufficient", () => {
    for (const spellId of Object.keys(SPELL_DEFINITIONS)) {
      const world = mockWorld({ spellId });
      const gen = new RewardGenerator(world);
      const cards = gen.generate(3);
      assert(cards.length === 3, `${spellId}: expected 3 cards, got ${cards.length}`);
    }
  });

  await step(result, "RewardGenerator.generate — every card has a valid reward shape", () => {
    const world = mockWorld({});
    const gen = new RewardGenerator(world);
    for (let i = 0; i < 10; i++) {
      const cards = gen.generate(3);
      for (const c of cards) {
        assert(typeof c.id === "string" && c.id.length > 0, `Card missing string id`);
        assert(typeof c.title === "string" && c.title.length > 0, `${c.id} missing title`);
        assert(typeof c.type === "string", `${c.id} missing type`);
        assert(typeof c.apply === "function", `${c.id} missing apply`);
      }
    }
  });

  await step(result, "RewardGenerator.generate — no duplicate ids in a single draw", () => {
    for (let i = 0; i < 20; i++) {
      const world = mockWorld({ spellId: Object.keys(SPELL_DEFINITIONS)[i % 6] });
      const gen = new RewardGenerator(world);
      const cards = gen.generate(3);
      const ids = cards.map((c) => c.id);
      const dupes = ids.filter((id, idx) => ids.indexOf(id) !== idx);
      assert(dupes.length === 0, `Draw had duplicate ids: ${[...new Set(dupes)].join(", ")}`);
    }
  });

  await step(result, "RewardGenerator.generate — Spell Unlock appears when auto-fire is owned", () => {
    for (const spellId of Object.keys(SPELL_DEFINITIONS)) {
      const world = mockWorld({ spellId, autoFire: true });
      const gen = new RewardGenerator(world);
      let foundUnlock = false;
      for (let i = 0; i < 30; i++) {
        const cards = gen.generate(3);
        if (cards.some((c) => c.type === "Spell Unlock")) {
          foundUnlock = true;
          break;
        }
      }
      assert(foundUnlock, `${spellId}: Spell Unlock never appeared despite owning auto-fire`);
    }
  });

  await step(result, "RewardGenerator.generate — every card's apply works without error", () => {
    for (let i = 0; i < 10; i++) {
      const world = mockWorld({ spellId: Object.keys(SPELL_DEFINITIONS)[i % 6] });
      const gen = new RewardGenerator(world);
      const cards = gen.generate(3);
      for (const c of cards) {
        try {
          c.apply(world);
        } catch (e) {
          assert(false, `${c.id}: apply threw: ${e.message}`);
        }
      }
    }
  });

  await step(result, "spellUnlockRewards — profile-locked spells are excluded from the attunement pool", () => {
    // Only arcane_bolt (already owned) and fireball are profile-unlocked
    const world = mockWorld({ autoFire: true, unlockedSpells: ["arcane_bolt", "fireball"] });
    const rewards = spellUnlockRewards(world);
    assert(rewards.length === 1, `Expected 1 attunement option (fireball only), got ${rewards.length}`);
    assert(rewards[0].id === "spell_unlock_fireball", `Expected fireball unlock, got ${rewards[0].id}`);
  });

  await step(result, "spellUnlockRewards — apply toast fires only when addSpell returns an instance", () => {
    let toastCount = 0;
    const world = mockWorld({ autoFire: true, unlockedSpells: ["arcane_bolt", "fireball"] });
    world.onCombatProc = () => { toastCount++; };
    const rewards = spellUnlockRewards(world);
    assert(rewards.length === 1, "Expected fireball unlock card");
    // Successful apply: addSpell returns instance → toast fires
    rewards[0].apply(world);
    assert(toastCount === 1, `Toast should fire on success, fired ${toastCount} times`);
    // Simulate addSpell returning null (e.g. race condition / defensive path)
    world.caster.addSpell = () => null;
    toastCount = 0;
    rewards[0].apply(world);
    assert(toastCount === 0, `Toast must not fire when addSpell returns null, fired ${toastCount} times`);
  });

  await step(result, "relicRewards — exhausts all relics after sequential ownership", () => {
    const owned = new Set();
    const world = mockWorld({});
    world.relics.has = (id) => owned.has(id);
    world.relics.add = (id) => { owned.add(id); };
    while (true) {
      const relics = relicRewards(world);
      if (relics.length === 0) break;
      for (const r of relics) owned.add(r.relicId);
    }
    const finalRelics = relicRewards(world);
    assert(finalRelics.length === 0, `Expected 0 relics after exhausting, got ${finalRelics.length}`);
  });

  await step(result, "RewardGenerator.generate — no relics appear when all already owned", () => {
    const owned = new Set(["duelist_sigil", "blinkstrike_ember", "parry_dynamo", "adrenal_lens", "glass_focus", "embered_footing", "stormwitness", "frostbitten_crown", "vermillion_catalyst", "hollow_sigil", "riftborn_mantle"]);
    const world = mockWorld({});
    world.relics.has = (id) => owned.has(id);
    world.relics.add = (id) => { owned.add(id); };
    const gen = new RewardGenerator(world);
    for (let i = 0; i < 20; i++) {
      const cards = gen.generate(3);
      for (const c of cards) {
        assert(c.type !== "Relic", `Relic appeared when all already owned: ${c.id}`);
      }
    }
  });

  await step(result, "RewardGenerator.generate — pooled rewards have valid types", () => {
    const validTypes = new Set(["Spell Upgrade", "Vitality", "Mobility", "Targeting", "Relic", "Spell Unlock"]);
    for (let i = 0; i < 20; i++) {
      const world = mockWorld({ spellId: Object.keys(SPELL_DEFINITIONS)[i % 6] });
      const gen = new RewardGenerator(world);
      const cards = gen.generate(3);
      for (const c of cards) {
        assert(validTypes.has(c.type), `${c.id}: invalid type "${c.type}"`);
      }
    }
  });

  await step(result, "RewardGenerator._pool — always returns at least 3 items", () => {
    for (const spellId of Object.keys(SPELL_DEFINITIONS)) {
      const world = mockWorld({ spellId });
      const gen = new RewardGenerator(world);
      const pool = gen._pool();
      assert(pool.length >= 3, `${spellId}: pool has only ${pool.length} items`);
    }
  });
}
