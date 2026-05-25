import { step, assert, waitFor, nextFrame, killPlayer, activeEl, isShown } from "../testHelpers.js";

export default async function runDeathRestartSmoke(game, result) {
  await step(result, "boot and start run", async () => {
    assert(game.state === "menu", `Expected menu state, got ${game.state}`);
    game.startRun();
    await nextFrame();
  });

  await step(result, "begin playing", async () => {
    await game.beginPlaying(true);
    await waitFor("playing state", () => game.state === "playing");
    await nextFrame();
    assert(activeEl("hud"), "HUD should be active during play");
    assert(game.isPlayerAlive(), "Player should be alive");
  });

  await step(result, "kill player triggers game over", async () => {
    killPlayer(game.world);
    await nextFrame();
    await waitFor("game over state", () => game.state === "gameover");
    assert(game.state === "gameover", `Expected gameover, got ${game.state}`);
    assert(!activeEl("hud"), "HUD should be hidden after death");
    assert(isShown("#btn-summary"), "Summary button not visible on game over");
    assert(isShown("#btn-restart"), "Restart button not visible on game over");
    assert(isShown("#btn-menu"), "Menu button not visible on game over");
  });

  await step(result, "restart restores full health and returns to focus", async () => {
    document.getElementById("btn-restart").click();
    await nextFrame();
    await nextFrame();
    await waitFor("player alive after restart", () => game.isPlayerAlive());
    assert(game.player.health.current === game.player.health.max, `Health not full after restart: ${game.player.health.current}/${game.player.health.max}`);
    assert(game.state === "focus", `Expected focus state after restart, got ${game.state}`);
  });
}
