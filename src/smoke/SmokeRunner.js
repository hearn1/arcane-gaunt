import { cloneJson, renderResultPanel, nextFrame } from "./testHelpers.js";
import runBootStartMenu from "./scenarios/bootStartMenu.js";
import runWaveClear from "./scenarios/waveClear.js";
import runRewardAndUpgrade from "./scenarios/rewardAndUpgrade.js";
import runDeathRestart from "./scenarios/deathRestart.js";
import runSettingsPersistence from "./scenarios/settingsPersistence.js";
import runResetRecords from "./scenarios/resetRecords.js";

const SCENARIOS = {
  "boot-start-menu": runBootStartMenu,
  "wave-clear": runWaveClear,
  "reward-and-upgrade": runRewardAndUpgrade,
  "death-restart": runDeathRestart,
  "settings-persistence": runSettingsPersistence,
  "reset-records": runResetRecords,
};

async function runSingleScenario(game, scenario) {
  const result = {
    scenario,
    status: "running",
    startedAt: new Date().toISOString(),
    steps: [],
  };

  game.audio.ensure = () => {};
  game.persistProfile = (profile) => {
    game.profile = profile;
  };

  try {
    const runner = SCENARIOS[scenario];
    if (!runner) throw new Error(`Unknown smoke scenario: ${scenario}`);

    await runner(game, result);
    result.status = "passed";
    console.info(`[smoke] scenario passed: ${scenario}`, result);
  } catch (err) {
    result.status = "failed";
    result.error = err?.stack || err?.message || String(err);
    console.error(`[smoke] scenario failed: ${scenario}`, err);
  }

  return result;
}

function unpatchGame(game, originalAudioEnsure, originalPersistProfile, initialProfile) {
  game.audio.ensure = originalAudioEnsure;
  game.persistProfile = originalPersistProfile;
  game.profile = initialProfile;
}

export async function runSmoke(game, scenario = "boot-start-menu") {
  const originalAudioEnsure = game.audio.ensure;
  const originalPersistProfile = game.persistProfile;
  const initialProfile = cloneJson(game.profile);

  if (scenario === "all") {
    const allResult = {
      scenario: "all",
      status: "passed",
      startedAt: new Date().toISOString(),
      scenarios: [],
      steps: [],
    };

    try {
      for (const key of Object.keys(SCENARIOS)) {
        const single = await runSingleScenario(game, key);
        allResult.scenarios.push(single);

        if (single.status === "failed") {
          allResult.status = "failed";
        }

        // Restore to menu for next scenario
          game.toMenu();
          await nextFrame();

        // Re-patch for next run (runSingleScenario overwrites these)
        game.audio.ensure = () => {};
        game.persistProfile = (profile) => {
          game.profile = profile;
        };
      }

      allResult.steps.push({
        name: `all scenarios (${allResult.scenarios.length} total)`,
        status: allResult.status,
      });

      console.info(`[smoke] all scenarios ${allResult.status}`, allResult);
    } catch (err) {
      allResult.status = "failed";
      allResult.error = err?.stack || err?.message || String(err);
      console.error("[smoke] all scenarios failed", err);
    } finally {
      unpatchGame(game, originalAudioEnsure, originalPersistProfile, initialProfile);
      if (allResult.status === "passed") {
        game.showMainMenu();
      }
      allResult.finishedAt = new Date().toISOString();
      window.__arcaneSmokeResult = allResult;
      renderResultPanel(allResult);
    }

    return allResult;
  }

  // Single scenario path (original behavior preserved)
  const result = {
    scenario,
    status: "running",
    startedAt: new Date().toISOString(),
    steps: [],
  };
  window.__arcaneSmokeResult = result;

  game.audio.ensure = () => {};
  game.persistProfile = (profile) => { game.profile = profile; };

  try {
    if (!SCENARIOS[scenario]) {
      throw new Error(`Unknown smoke scenario: ${scenario}`);
    }

    await SCENARIOS[scenario](game, result);
    result.status = "passed";
    console.info("[smoke] passed", result);
  } catch (err) {
    result.status = "failed";
    result.error = err?.stack || err?.message || String(err);
    console.error("[smoke] failed", err);
  } finally {
    unpatchGame(game, originalAudioEnsure, originalPersistProfile, initialProfile);
    if (result.status === "passed") {
      game.showMainMenu();
    }
    result.finishedAt = new Date().toISOString();
    renderResultPanel(result);
  }

  return result;
}
