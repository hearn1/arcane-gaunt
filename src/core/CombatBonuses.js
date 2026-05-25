import { applyDamage } from "./Damage.js";

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

  if (damageMult !== 1) {
    castSpell = cloneSpellForCast(spell);
    castSpell.stats.damage = Math.max(1, Math.round(castSpell.stats.damage * damageMult));
    if (castSpell.stats.dotDamage > 0) {
      castSpell.stats.dotDamage = Math.max(1, Math.round(castSpell.stats.dotDamage * damageMult));
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
  return applyDamage(target, final, source);
}

export function armParryDynamo(world) {
  if (!world.relics?.has("parry_dynamo")) return;
  world.combat.nextCastDamageMult = Math.max(world.combat.nextCastDamageMult || 1, 1.8);
  world.combat.nextCastLabel = "Parry Dynamo empowered";
  world.onCombatProc?.("Parry Dynamo armed");
}
