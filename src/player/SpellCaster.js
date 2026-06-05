import * as THREE from "three";
import { SpellInstance } from "../spells/SpellInstance.js";
import { SPELL_DEFINITIONS, STARTER_SPELL_ID } from "../spells/spellDefinitions.js";
import { castSpell } from "../spells/Effects.js";
import { preparePlayerCast } from "../core/CombatBonuses.js";

// Player loadout + cooldowns + cast dispatch. Only spawns effects; collision /
// damage live in HitResolver / Damage.
export class SpellCaster {
  constructor(player) {
    this.player = player;
    this.loadout = [];          // SpellInstance[] (owned)
    this.equipped = 0;
    this.cooldowns = {};        // definitionId -> remaining seconds
    this.unlockedSpells = null; // set by game from profile
    this.reset();
  }

  reset(spellId = STARTER_SPELL_ID) {
    this._onboardingAutocastTriggered = false;
    if (this.unlockedSpells && Array.isArray(this.unlockedSpells) &&
        !this.unlockedSpells.includes(spellId) && spellId !== STARTER_SPELL_ID) {
      spellId = STARTER_SPELL_ID;
    }
    const def = SPELL_DEFINITIONS[spellId] || SPELL_DEFINITIONS[STARTER_SPELL_ID];
    this.loadout = [new SpellInstance(def)];
    this.equipped = 0;
    this.cooldowns = {};
  }

  owns(id) { return this.loadout.some((s) => s.definitionId === id); }
  get current() { return this.loadout[this.equipped]; }
  instanceOf(id) { return this.loadout.find((s) => s.definitionId === id); }

  addSpell(id, equip = true, world = null) {
    if (this.owns(id)) return this.instanceOf(id);
    if (this.unlockedSpells && Array.isArray(this.unlockedSpells) &&
        !this.unlockedSpells.includes(id)) return null;
    const def = SPELL_DEFINITIONS[id];
    if (!def) return null;
    const inst = new SpellInstance(def);
    this.loadout.push(inst);
    if (equip) this.equipped = this.loadout.length - 1;
    if (this.loadout.length >= 2 && world?.onboarding) {
      world.onboarding.note(world, "spell_switching");
    }
    return inst;
  }

  select(n) {
    const idx = n - 1;
    if (idx >= 0 && idx < this.loadout.length) this.equipped = idx;
  }

  cdRemaining(id) { return this.cooldowns[id] || 0; }
  cdRatio(spell) {
    const cd = spell.stats.cooldown || 1;
    return 1 - Math.min(1, (this.cooldowns[spell.definitionId] || 0) / cd);
  }

  update(dt, input, world) {
    for (const k of Object.keys(this.cooldowns)) {
      this.cooldowns[k] -= dt;
      if (this.cooldowns[k] <= 0) delete this.cooldowns[k];
    }

    const sel = input.consumeSpellSelect();
    if (sel > 0 && this.loadout.length > 1) this.select(sel);

    const wheel = input.consumeWheel();
    if (wheel !== 0 && this.loadout.length > 1) {
      const n = this.loadout.length;
      this.equipped = (this.equipped + (wheel > 0 ? 1 : -1) + n) % n;
    }

    const blocked = !!(world.player.block && world.player.block.blocking);
    if (input.firing) {
      this.tryCast(world);
      if (!this._onboardingAutocastTriggered && this.loadout.some((s) => s.autoFire)) {
        this._onboardingAutocastTriggered = true;
        world.onboarding?.note(world, "autocast_hold");
      }
    }
    if (!blocked) {
      for (const spell of this.loadout) {
        if (spell.autoFire) this.tryCastSpell(world, spell);
      }
    }
  }

  tryCast(world) {
    const spell = this.current;
    this.tryCastSpell(world, spell);
  }

  tryCastSpell(world, spell) {
    if (!spell) return;
    if ((this.cooldowns[spell.definitionId] || 0) > 0) return;

    const dir = spell.autoFire ? this._autoCastDirection(world, spell) : this.player.forward();
    const origin = world.staffView
      ? world.staffView.tipWorldPos()
      : this.player.position.clone().add(dir.clone().multiplyScalar(0.9));
    const prepared = preparePlayerCast(world, spell);
    if (world.staffView) world.staffView.playCast(spell.color);
    castSpell(world, prepared.spell, origin, dir, "player");
    this.cooldowns[spell.definitionId] = spell.stats.cooldown * prepared.cooldownMult;
    world.events?.emit("onPlayerCast", { spell: prepared.spell, origin, dir });
  }

  _autoCastDirection(world, spell) {
    const mode = world.combat?.autocastTargetMode || "forward";
    if (mode === "lowestHp") {
      const range = spell.stats.range || 60;
      const origin = this.player.position;
      let pick = null;
      let bestHp = Infinity;
      for (const e of world.getEnemies()) {
        if (!e.alive) continue;
        const d = e.position.distanceTo(origin);
        if (d > range) continue;
        const hp = e.health?.current ?? Infinity;
        if (hp < bestHp) { bestHp = hp; pick = e; }
      }
      if (pick) {
        const dir = new THREE.Vector3().subVectors(pick.position, origin);
        dir.y = 0;
        if (dir.lengthSq() > 1e-6) return dir.normalize();
      }
    }
    return this.player.forward();
  }
}
