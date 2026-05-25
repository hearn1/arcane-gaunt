import { step, assert, waitFor, nextFrame, killAllEnemies, activeEl, isShown } from "../testHelpers.js";

export default async function runWaveClearSmoke(game, result) {
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
    assert(activeEl("hud"), "HUD is not active during play");
    assert(game.enemyManager.aliveCount > 0, "First wave did not spawn enemies");
  });

  await step(result, "kill all enemies triggers wave clear", async () => {
    killAllEnemies(game.world);
    await nextFrame();
    await nextFrame();
    assert(game.enemyManager.aliveCount === 0, "Not all enemies were killed");
  });

  await step(result, "reward state and cards rendered", async () => {
    await waitFor("reward state", () => game.state === "reward");
    assert(game.state === "reward", `Expected reward state, got ${game.state}`);
    const cards = document.querySelectorAll(".reward-card");
    assert(cards.length > 0, "No reward cards rendered");
    assert(isShown("#reward-cards"), "Reward cards container not visible");
  });
}
