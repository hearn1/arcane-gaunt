import { applyDamage } from "./Damage.js";
import { rectContainsPoint } from "./ArenaCollision.js";

export function cloneSpellForCast(spell) {
  const clone = Object.assign(Object.create(Object.getPrototypeOf(spell)), spell);
  clone.stats = { ...spell.stats };
  return clone;
}

export function preparePlayerCast(world, spell) {
  let castSpell = spell;
  let cooldownMult = 1;
  let damageMult = 1;
  const combat = world.combat;

  if (combat?.nextCastDamageMult > 1) {
    damageMult *= combat.nextCastDamageMult;
    combat.nextCastDamageMult = 1;
    const label = combat.nextCastLabel || "Empowered cast";
    combat.nextCastLabel = "";
    world.onCombatProc?.(label);
  }

  if (world.relics?.has("blinkstrike_ember") && combat?.blinkStrikeTimer > 0) {
    damageMult *= 1.55;
    cooldownMult *= 0.65;
    combat.blinkStrikeTimer = 0;
    world.onCombatProc?.("Blinkstrike");
  }

  if (world.relics?.has("adrenal_lens") && world.player.health.ratio <= 0.45) {
    damageMult *= 1.35;
  }

  // Feature_6 relics — cast-time hooks

  if (world.relics?.has("embered_footing") && combat?.standingTimer >= 1.5) {
    damageMult *= 1.35;
    combat.standingTimer = 0;
    world.onCombatProc?.("Embered Footing — rooted power");
  }

  if (world.relics?.has("vermillion_catalyst")) {
    const counter = (combat.castCounter || 0) + 1;
    combat.castCounter = counter >= 5 ? 0 : counter;
    if (counter >= 5) {
      damageMult *= 1.5;
      combat.vermillionAoE = true;
      world.onCombatProc?.("Vermilion Catalyst — overload");
    }
  }

  const feet = world.player?.feet;
  const inHazard = world.arenaBounds?.hazards?.some((h) => rectContainsPoint(feet, h));
  if (world.relics?.has("riftborn_mantle") && inHazard) {
    cooldownMult *= 1.2;
  }

  if (damageMult !== 1 || combat?.vermillionAoE) {
    castSpell = cloneSpellForCast(spell);
    if (damageMult !== 1) {
      castSpell.stats.damage = Math.max(1, Math.round(castSpell.stats.damage * damageMult));
      if (castSpell.stats.dotDamage > 0) {
        castSpell.stats.dotDamage = Math.max(1, Math.round(castSpell.stats.dotDamage * damageMult));
      }
    }
    if (combat?.vermillionAoE) {
      castSpell.stats.areaRadius = Math.max(castSpell.stats.areaRadius || 0, 2.5);
      combat.vermillionAoE = false;
    }
  }

  return { spell: castSpell, cooldownMult };
}

export function applyPlayerDamage(world, target, amount, source) {
  let final = amount;
  if (world.relics?.has("duelist_sigil") && target?.position && world.player?.position) {
    const dist = target.position.distanceTo(world.player.position);
    if (dist <= 10) {
      final *= 1.35;
      if (world.blink && world.blink.timer > 0) {
        world.blink.timer = Math.max(0, world.blink.timer - 0.2);
      }
    }
  }

  // Feature_6 relics — per-hit hooks

  if (world.relics?.has("frostbitten_crown") && target?.slowTimer > 0) {
    final *= 1.2;
  }

  if (world.relics?.has("stormwitness") && source?.spellId === "chain_lightning") {
    const blink = world.blink;
    if (blink && blink.cooldownTimer > 0) {
      blink.cooldownTimer = Math.max(0, blink.cooldownTimer - 0.3);
    }
  }

  return applyDamage(target, final, source);
}

export function armParryDynamo(world) {
  if (!world.relics?.has("parry_dynamo")) return;
  world.combat.nextCastDamageMult = Math.max(world.combat.nextCastDamageMult || 1, 1.8);
  world.combat.nextCastLabel = "Parry Dynamo empowered";
  world.onCombatProc?.("Parry Dynamo armed");
}
