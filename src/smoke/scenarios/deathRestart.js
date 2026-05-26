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

  await step(result, "summary screen shows wave reached, highlights, and details toggle", async () => {
    document.getElementById("btn-summary").click();
    await nextFrame();
    await waitFor("summary state", () => game.state === "summary");
    assert(isShown(".summary-wave"), "Summary should show wave reached");
    assert(isShown(".summary-best"), "Summary should show best comparison");
    const hlSection = game.ui.root.querySelector(".summary-highlights");
    assert(hlSection === null, "No highlights expected on zero-stat summary");
    assert(isShown("#btn-toggle-details"), "Show Details toggle should exist");
    assert(isShown(".lifetime-totals"), "Lifetime totals should exist");
    // Toggle details on
    document.getElementById("btn-toggle-details").click();
    const dmgEl = document.getElementById("dmg-breakdown");
    assert(dmgEl && dmgEl.style.display !== "none", "Damage breakdown should be visible after toggle");
  });

  await step(result, "back from summary returns to game over", async () => {
    document.getElementById("btn-back").click();
    await nextFrame();
    await waitFor("gameover after back from summary", () => game.state === "gameover");
    assert(isShown("#btn-restart"), "Restart button should be visible after back from summary");
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
