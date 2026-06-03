import { step, assert, waitFor, nextFrame, inputIsClear, activeEl, isShown } from "../testHelpers.js";

export default async function runBootStartMenuSmoke(game, result) {
  await step(result, "boot main menu", async () => {
    assert(game.state === "menu", `Expected menu state, got ${game.state}`);
    // On a fresh profile the first-run privacy/telemetry consent gate is shown
    // ahead of the menu. Decline it to reach the main menu (the state is already
    // "menu"; the prompt is just an overlay over it).
    const privacyDecline = document.getElementById("btn-privacy-no");
    if (privacyDecline) {
      privacyDecline.click();
      await nextFrame();
    }
    assert(isShown("#btn-start"), "Start Run button is not visible");
    assert(!activeEl("hud"), "HUD should be hidden on main menu");
    assert(!activeEl("crosshair"), "Crosshair should be hidden on main menu");
    assert(!document.querySelector(".fatal-panel"), "Fatal panel is visible");
  });

  await step(result, "start run reaches focus prompt", async () => {
    game.startRun();
    await nextFrame();
    assert(game.state === "focus", `Expected focus state, got ${game.state}`);
    assert(isShown("#btn-focus"), "Enter Arena prompt is not visible");
    assert(!activeEl("hud"), "HUD should stay hidden before pointer focus");
    assert(game.enemyManager.aliveCount === 0, "Enemies spawned before arena entry");
  });

  await step(result, "begin playing spawns first wave", async () => {
    await game.beginPlaying(true);
    await waitFor("playing state", () => game.state === "playing");
    await nextFrame();
    assert(activeEl("hud"), "HUD is not active during play");
    assert(activeEl("crosshair"), "Crosshair is not active during play");
    assert(game.enemyManager.aliveCount > 0, "First wave did not spawn enemies");
    assert(document.getElementById("ui-root")?.classList.contains("hidden"), "Overlay is still visible during play");
  });

  await step(result, "pause menu hides combat UI", async () => {
    game.pauseGame(false);
    await nextFrame();
    assert(game.state === "focus", `Expected focus state after pause, got ${game.state}`);
    assert(isShown("#btn-pause-resume"), "Pause menu resume button is not visible");
    assert(!activeEl("hud"), "HUD should be hidden while paused");
    assert(!activeEl("crosshair"), "Crosshair should be hidden while paused");
    assert(!document.getElementById("wave-banner")?.classList.contains("show"), "Wave banner should be hidden while paused");
  });

  await step(result, "main menu cleanup clears active run surfaces", async () => {
    game.toMenu();
    await nextFrame();
    assert(game.state === "menu", `Expected menu state after return, got ${game.state}`);
    assert(isShown("#btn-start"), "Main menu did not render after cleanup");
    assert(game.enemyManager.aliveCount === 0, "Enemies remain after returning to main menu");
    assert((game.hitResolver?.projectiles?.length || 0) === 0, "Projectiles remain after returning to main menu");
    assert((game.timers?.length || 0) === 0, "Timers remain after returning to main menu");
    assert(!activeEl("hud"), "HUD should be hidden after returning to main menu");
    assert(!activeEl("crosshair"), "Crosshair should be hidden after returning to main menu");
    assert(!document.getElementById("wave-banner")?.classList.contains("show"), "Wave banner remains after returning to main menu");
    assert(inputIsClear(game.input), "Input state was not fully cleared");
  });
}
