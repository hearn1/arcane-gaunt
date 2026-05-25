import { step, assert, cloneJson, nextFrame } from "../testHelpers.js";
import { recordRunCompleted, createRunRecord, cloneDefaultProfile, loadProfile, saveProfile } from "../../core/Profile.js";

export default async function runResetRecordsSmoke(game, result) {
  const originalProfile = cloneJson(game.profile);
  const settingsSnapshot = cloneJson(game.settings);

  await step(result, "persist a synthetic best-run", async () => {
    const runRecord = createRunRecord(
      { levelsCleared: 5, enemiesKilled: 42, goldEarned: 180, totalDamage: 3200, damageRows: () => [] },
      "arcane_bolt",
      6,
    );
    const updated = recordRunCompleted(cloneDefaultProfile(), runRecord);
    await saveProfile(updated);
    const reloaded = await loadProfile();
    assert(reloaded.bestRun.levelsCleared === 5, "Best run levels not saved");
    assert(reloaded.bestRun.enemiesKilled === 42, "Best run kills not saved");
    assert(reloaded.bestRun.goldEarned === 180, "Best run gold not saved");
    assert(reloaded.bestRun.totalDamage === 3200, "Best run damage not saved");
  });

  await step(result, "confirmResetProfile clears records", async () => {
    game.confirmResetProfile();
    await nextFrame();
    assert(isShown("#btn-reset-confirm"), "Reset confirm button not visible");
    document.getElementById("btn-reset-confirm").click();
    await nextFrame();
    await new Promise((r) => setTimeout(r, 50));
    const afterReset = await loadProfile();
    const defaults = cloneDefaultProfile();
    assert(afterReset.bestRun.levelsCleared === defaults.bestRun.levelsCleared, "Best run levels not cleared");
    assert(afterReset.totals.runsStarted === defaults.totals.runsStarted, "Totals not cleared");
    assert(afterReset.totals.runsCompleted === defaults.totals.runsCompleted, "Runs completed not cleared");
  });

  await step(result, "settings unchanged after reset", async () => {
    const settingsAfterReset = cloneJson(game.settings);
    assert(settingsAfterReset.audio.muted === settingsSnapshot.audio.muted, "Settings muted changed after reset");
    assert(Math.abs(settingsAfterReset.audio.volume - settingsSnapshot.audio.volume) < 0.01, "Settings volume changed after reset");
  });
}

function isShown(selector) {
  const el = document.querySelector(selector);
  return !!el && !el.closest(".hidden");
}
