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
    // The service panel computes each button's enabled/disabled state at render
    // time, so re-open the panel after changing health/gold (the same refresh the
    // game performs after every purchase) before reading the heal button.
    game.openUpgradePanel();
    await nextFrame();
    const healSvc = document.querySelector(".svc-buy");
    assert(!!healSvc, "No service buy button");
    assert(!healSvc.disabled, "Heal button should be enabled after damage");
    healSvc.click();
    await nextFrame();
    assert(game.player.health.current > healthBeforeHeal, "Health did not increase after heal");
  });

  await step(result, "resume from upgrade continues the run", async () => {
    document.getElementById("btn-up-continue").click();
    // Continue re-acquires pointer lock; once the lock request settles
    // (granted or rejected) the run resumes directly into the next wave —
    // the focus prompt is only a momentary fallback. Either way the upgrade
    // panel is dismissed.
    await waitFor("run resumes", () => game.state === "playing" || isShown("#btn-focus"));
    assert(game.state === "playing" || game.state === "focus",
      `Expected playing or focus state after resume, got ${game.state}`);
    assert(!isShown("#service-panel"), "Upgrade panel should be dismissed after resume");
  });
}
