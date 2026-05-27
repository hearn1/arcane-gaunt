import { step, assert, waitFor, nextFrame } from "../testHelpers.js";
import { TwinWardenElite } from "../../enemies/Enemy.js";

export default async function runBossCcImmune(game, result) {
  let boss;

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

  await step(result, "spawn boss via enemy manager", async () => {
    const spawnPos = game.world.player.feet.clone().add({ x: 3, y: 0, z: 0 });
    boss = game.world.enemyManager.spawnExtra(TwinWardenElite, 1, spawnPos);
    assert(boss, "Boss was not spawned");
    assert(boss.isBoss, "Spawned enemy should be marked as boss");
  });

  await step(result, "verify stun immunity", async () => {
    boss.stunTimer = 0;
    boss.applyStun(2.0);
    assert(boss.stunTimer === 0, "Boss stunTimer should be 0 (immune)");
  });

  await step(result, "verify freeze immunity", async () => {
    boss.frozenTimer = 0;
    boss.applyFreeze(2.0);
    assert(boss.frozenTimer === 0, "Boss frozenTimer should be 0 (immune)");
  });

  await step(result, "verify slow reduction", async () => {
    boss.slowFactor = 1;
    boss.slowTimer = 0;
    boss.applySlow(1.0, 3.0);
    assert(boss.slowFactor > 0.5, "Boss slow should be reduced (60% reduction)");
    assert(boss.slowTimer > 0, "Boss slowTimer should be set");
  });
}
