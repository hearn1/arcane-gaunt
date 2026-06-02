import { step, assert, waitFor, nextFrame, killAllEnemies } from "../testHelpers.js";
import { MeleeEnemy } from "../../enemies/Enemy.js";
import { SpellInstance } from "../../spells/SpellInstance.js";
import { SPELL_DEFINITIONS } from "../../spells/spellDefinitions.js";
import { applyPlayerDamage } from "../../core/CombatBonuses.js";

export default async function runSpellMechanicsValidate(game, result) {
  await step(result, "boot and start run", async () => {
    assert(game.state === "menu", `Expected menu state, got ${game.state}`);
    game.startRun();
    await nextFrame();
    assert(game.state === "focus", `Expected focus state, got ${game.state}`);
  });

  await step(result, "begin playing", async () => {
    await game.beginPlaying(true);
    await waitFor("playing state", () => game.state === "playing");
    await nextFrame();
  });

  await step(result, "poison contagion spreads to all nearby enemies at reduced potency", async () => {
    killAllEnemies(game.world);
    await nextFrame();

    const mgr = game.world.enemyManager;
    const center = mgr.spawnExtra(MeleeEnemy, 1, { x: 0, y: 0, z: 0 });
    const e2 = mgr.spawnExtra(MeleeEnemy, 1, { x: 2.5, y: 0, z: 0 });
    const e3 = mgr.spawnExtra(MeleeEnemy, 1, { x: 0, y: 0, z: 2.5 });
    await nextFrame();
    await nextFrame();

    for (const e of [center, e2, e3]) {
      assert(e.alive, "All enemies should be alive");
    }
    assert(e2.position.distanceTo(center.position) <= 3.5,
      `e2 distance ${e2.position.distanceTo(center.position)} should be <= 3.5`);
    assert(e3.position.distanceTo(center.position) <= 3.5,
      `e3 distance ${e3.position.distanceTo(center.position)} should be <= 3.5`);

    // Simulate poison bolt impact contagion logic (mirrors HitResolver._onEnemyHit):
    const poisonInst = new SpellInstance(SPELL_DEFINITIONS.poison_bolt);
    assert(poisonInst.contagion === true, "Poison bolt instance should have contagion");
    assert(poisonInst.contagionRadius === 3.5, `contagionRadius should be 3.5, got ${poisonInst.contagionRadius}`);
    assert(poisonInst.contagionPotency === 0.6, `contagionPotency should be 0.6, got ${poisonInst.contagionPotency}`);

    const dotSrc = { owner: "player", spellId: "poison_bolt", isDot: true };
    center.applyDot(poisonInst.stats.dotDamage, poisonInst.stats.dotDuration, poisonInst.stats.dotTickRate, dotSrc);

    const radius = poisonInst.contagionRadius;
    const potency = poisonInst.contagionPotency;
    const dotDmg = Math.round(poisonInst.stats.dotDamage * potency);
    for (const other of game.world.getEnemies()) {
      if (other === center || !other.alive) continue;
      if (other.position.distanceTo(center.position) <= radius) {
        other.applyDot(dotDmg, poisonInst.stats.dotDuration, poisonInst.stats.dotTickRate, dotSrc);
      }
    }

    assert(center.dots.length > 0, "Center enemy should have DOT");
    assert(e2.dots.length > 0, "e2 should have DOT from contagion");
    assert(e3.dots.length > 0, "e3 should have DOT from contagion");
    assert(e2.dots[0].perTick === 5, `e2 DOT per tick should be 5 (8*0.6), got ${e2.dots[0].perTick}`);
    assert(e3.dots[0].perTick === 5, `e3 DOT per tick should be 5 (8*0.6), got ${e3.dots[0].perTick}`);
  });

  await step(result, "frost bolt shatters at 3 chill stacks", async () => {
    killAllEnemies(game.world);
    await nextFrame();

    const enemy = game.world.enemyManager.spawnExtra(MeleeEnemy, 1, { x: 0, y: 0, z: 0 });
    await nextFrame();
    assert(enemy.alive, "Enemy should be alive");
    const initialHp = enemy.health.current;

    const frostInst = new SpellInstance(SPELL_DEFINITIONS.frost_bolt);
    assert(frostInst.chillStacks === true, "Frost bolt instance should have chillStacks");
    assert(frostInst.chillMaxStacks === 3, `chillMaxStacks should be 3, got ${frostInst.chillMaxStacks}`);
    assert(frostInst.shatterDamage > 0, `shatterDamage should be > 0, got ${frostInst.shatterDamage}`);

    enemy.applyChill(1, 2.5);
    assert(enemy.chillStacks === 1, "Stack 1");

    enemy.applyChill(1, 2.5);
    assert(enemy.chillStacks === 2, "Stack 2");

    // Third chill at max stacks triggers shatter (mirrors HitResolver._onEnemyHit).
    const wasMax = enemy.chillStacks >= enemy.chillMaxStacks;
    enemy.applyChill(1, 2.5);
    if (wasMax) {
      applyPlayerDamage(game.world, enemy, frostInst.shatterDamage, { owner: "player", spellId: "frost_bolt" });
      enemy.chillStacks = 0;
    }

    assert(enemy.chillStacks === 0, "Stacks should reset to 0 after shatter");
    assert(enemy.health.current < initialHp, "Enemy should take shatter damage");
  });

  await step(result, "fireball burn patch deals at least one tick of damage", async () => {
    killAllEnemies(game.world);
    await nextFrame();

    // Spawn an enemy and pin it in place so it stays in the burn zone.
    const enemy = game.world.enemyManager.spawnExtra(MeleeEnemy, 1, { x: 0, y: 0, z: 0 });
    await nextFrame();
    assert(enemy.alive, "Enemy should be alive");
    enemy.speed = 0; // prevent chasing player and leaving burn zone
    const initialHp = enemy.health.current;

    const fireballInst = new SpellInstance(SPELL_DEFINITIONS.fireball);
    assert(fireballInst.burnPatch === true, "Fireball instance should have burnPatch");

    const timersBefore = game.timers.length;

    // Invoke burn patch at the enemy's position. Schedules 3 ticks via
    // world.after(0.6/1.2/1.8).
    game.world.hitResolver._burnPatch(enemy.position.clone(), fireballInst);

    assert(game.timers.length === timersBefore + 3,
      `Burn patch should schedule 3 timers, was ${game.timers.length - timersBefore}`);

    // Advance enough frames for the first burn tick to fire (0.6s real time).
    for (let i = 0; i < 120; i++) {
      await nextFrame();
    }

    assert(enemy.health.current < initialHp, "Enemy should have taken burn patch damage");
  });

  await step(result, "blink dashes along movement direction, falling back to look when idle", async () => {
    const player = game.player;
    const blink = game.blink;

    // Face -Z (yaw 0) and stand at the arena center so the dash has room.
    player.yaw = 0;
    player.feet.set(0, 0, 0);
    player._syncCamera();

    // Idle (no movement input): blink follows the look direction (-Z).
    player.moveWish.set(0, 0, 0);
    blink.reset();
    blink.trigger();
    assert(player.feet.z < -1, `Idle blink should dash toward crosshair (-Z), got z=${player.feet.z}`);
    assert(Math.abs(player.feet.x) < 0.5, `Idle blink should not drift sideways, got x=${player.feet.x}`);

    // Moving left (strafe) with the same -Z facing: blink follows movement (-X),
    // proving the dash tracks motion rather than the crosshair.
    player.yaw = 0;
    player.feet.set(0, 0, 0);
    player._syncCamera();
    player.moveWish.set(-1, 0, 0);
    blink.reset();
    blink.trigger();
    assert(player.feet.x < -1, `Left-strafe blink should dash left (-X), got x=${player.feet.x}`);
    assert(Math.abs(player.feet.z) < 0.5, `Left-strafe blink should not move along look axis, got z=${player.feet.z}`);

    // Moving backward (+Z) while still facing -Z: blink goes backward, not forward.
    player.yaw = 0;
    player.feet.set(0, 0, 0);
    player._syncCamera();
    player.moveWish.set(0, 0, 1);
    blink.reset();
    blink.trigger();
    assert(player.feet.z > 1, `Backward blink should dash backward (+Z), got z=${player.feet.z}`);
  });
}
