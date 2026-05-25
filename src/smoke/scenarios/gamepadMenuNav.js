import { step, assert, nextFrame, isShown } from "../testHelpers.js";
import { attach } from "../../ui/uiNav.js";

export default async function runGamepadMenuNavSmoke(game, result) {
  await step(result, "main menu spell choice focusable with data-nav", async () => {
    game.showMainMenu();
    await nextFrame();
    assert(game.state === "menu", `Expected menu state, got ${game.state}`);
    const navItems = document.querySelectorAll("#ui-root [data-nav]");
    assert(navItems.length > 0, "No data-nav elements found on main menu");
    const startBtn = document.getElementById("btn-start");
    assert(!!startBtn, "Start Run button missing");
    // Simulate programmatic focus and click through uiNav
    startBtn.focus();
    startBtn.click();
    // After click, should be in focus state (not playing yet without pointer lock)
    await nextFrame();
    assert(game.state === "focus", `Expected focus state after start click, got ${game.state}`);
  });

  await step(result, "pause menu data-nav elements exist", async () => {
    game.startRun();
    await nextFrame();
    // Manually switch to pause screen (simulating Start press while PLAYING)
    game.state = "playing";
    game.pauseGame(false);
    await nextFrame();
    assert(isShown("#btn-pause-resume"), "Pause resume button not visible");
    const navItems = document.querySelectorAll("#ui-root [data-nav]");
    assert(navItems.length >= 3, `Expected at least 3 nav items on pause, got ${navItems.length}`);
  });

  await step(result, "settings menu data-nav and back button", async () => {
    game.toMenu();
    await nextFrame();
    game.openSettings(() => { game.showMainMenu(); });
    await nextFrame();
    const stickSens = document.getElementById("set-stick-sensitivity");
    assert(!!stickSens, "Stick look sensitivity slider missing");
    const invertY = document.getElementById("set-invert-y");
    assert(!!invertY, "Invert Y checkbox missing");
    const backBtn = document.getElementById("btn-settings-back");
    assert(!!backBtn, "Settings back button missing");
  });

  await step(result, "gamepad-menu-nav scenario complete", async () => {
    game.toMenu();
    await nextFrame();
    assert(game.state === "menu", "Main menu restored after scenario");
  });
}
