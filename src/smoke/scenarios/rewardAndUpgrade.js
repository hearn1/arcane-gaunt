import { step, assert, waitFor, nextFrame, killAllEnemies, setGold, activeEl, isShown } from "../testHelpers.js";
import { applyDamage } from "../../core/Damage.js";

export default async function runRewardAndUpgradeSmoke(game, result) {
  await step(result, "boot and start run", async () => {
    assert(game.state === "menu", `Expected menu state, got ${game.state}`);
    game.startRun();
    await nextFrame();
  });

  await step(result, "begin playing and clear wave", async () => {
    await game.beginPlaying(true);
    await waitFor("playing state", () => game.state === "playing");
    killAllEnemies(game.world);
    await nextFrame();
    await waitFor("reward state", () => game.state === "reward");
    assert(game.state === "reward", `Expected reward, got ${game.state}`);
  });

  await step(result, "pick first reward transitions to upgrade panel", async () => {
    const cards = document.querySelectorAll(".reward-card");
    assert(cards.length > 0, "No reward cards");
    cards[0].click();
    await nextFrame();
    assert(game.state === "reward", `Expected reward (upgrade panel) state, got ${game.state}`);
    assert(isShown("#btn-up-continue"), "Continue button not visible on upgrade panel");
    assert(isShown("#service-panel"), "Service panel not visible on upgrade panel");
  });

  await step(result, "damage player then buy heal service", async () => {
    const maxHp = game.player.health.max;
    // Damage player so heal is not disabled
    applyDamage(game.player, maxHp * 0.4, { owner: "enemy", spellId: "smoke_test" });
    await nextFrame();
    assert(game.player.health.current < maxHp, "Player should be damaged");
    const healthBeforeHeal = game.player.health.current;
    game.currency.add(999);
    await nextFrame();
    const healSvc = document.querySelector(".svc-buy");
    assert(!!healSvc, "No service buy button");
    assert(!healSvc.disabled, "Heal button should be enabled after damage");
    healSvc.click();
    await nextFrame();
    assert(game.player.health.current > healthBeforeHeal, "Health did not increase after heal");
  });

  await step(result, "resume from upgrade shows focus prompt", async () => {
    document.getElementById("btn-up-continue").click();
    await nextFrame();
    await waitFor("focus prompt visible", () => isShown("#btn-focus"));
    assert(game.state === "focus", `Expected focus state after resume, got ${game.state}`);
    assert(isShown("#btn-focus"), "Focus prompt not shown after resume");
  });
}
