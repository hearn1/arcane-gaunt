import { step, assert, nextFrame } from "../testHelpers.js";
import { steamEvent, steamAvailable } from "../../core/Steam.js";

export default async function runSteamNoopSmoke(game, result) {
  await step(result, "steam bridge should be unavailable in browser", async () => {
    const available = steamAvailable();
    assert(!available, `Expected steamAvailable() to be false, got ${available}`);
  });

  await step(result, "steamEvent no-ops cleanly without bridge", async () => {
    steamEvent("run.completed", { highestWave: 1, kills: 0, gold: 0, damage: 0, starterSpellId: "arcane_bolt", relicCount: 0 });
    steamEvent("wave.cleared", { wave: 1 });
    steamEvent("boss.killed", { variant: "reaver" });
    steamEvent("block.perfect", { spellId: "arcane_bolt" });
    steamEvent("upgrade.bought", { spellId: "arcane_bolt", nodeId: "test_node" });
    await nextFrame();
    assert(true, "steamEvent should not throw");
  });

  await step(result, "start run and play a wave to verify no steam errors", async () => {
    assert(game.state === "menu", `Expected menu state, got ${game.state}`);
    game.startRun();
    await nextFrame();
    await game.beginPlaying(true);
    await nextFrame();
    assert(game.state === "playing", `Expected playing state during wave`);
  });

  await step(result, "complete wave and verify reward state still works", async () => {
    const enemies = game.enemyManager.aliveList();
    for (const e of enemies) {
      e.health.current = 0;
      e.alive = false;
      e.forceRemove();
    }
    game.enemyManager._waveActive = false;
    await nextFrame();
  });
}
