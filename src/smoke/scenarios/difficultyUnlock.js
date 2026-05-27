import { step, assert, nextFrame, killAllEnemies } from "../testHelpers.js";
import { recordRunProgress } from "../../core/Profile.js";
import { cloneDefaultProfile } from "../../core/Profile.js";

export default async function runDifficultyUnlockSmoke(game, result) {
  await step(result, "default profile only has arcane_bolt unlocked", async () => {
    const profile = cloneDefaultProfile();
    assert(Array.isArray(profile.unlockedSpells), "unlockedSpells is not an array");
    assert(profile.unlockedSpells.length === 1, `Expected 1 spell, got ${profile.unlockedSpells.length}`);
    assert(profile.unlockedSpells[0] === "arcane_bolt", "Expected only arcane_bolt");
    assert(profile.highestDifficultyCleared === 0, "Expected highestDifficultyCleared to be 0");
  });

  await step(result, "tier 1 run does not unlock anything new", async () => {
    const profile = cloneDefaultProfile();
    const result_ = recordRunProgress(profile, 5, 1);
    assert(result_.newlyUnlocked.length === 0, "Tier 1 should not unlock spells");
    assert(result_.profile.highestDifficultyCleared === 1, "Expected highestDifficultyCleared to be 1");
    assert(result_.profile.unlockedSpells.length === 1, "Should still only have 1 spell");
  });

  await step(result, "tier 3 unlocks chain_lightning", async () => {
    const profile = cloneDefaultProfile();
    const result_ = recordRunProgress(profile, 3, 3);
    assert(result_.newlyUnlocked.length === 1, `Expected 1 unlock, got ${result_.newlyUnlocked.length}`);
    assert(result_.newlyUnlocked[0] === "chain_lightning", `Expected chain_lightning, got ${result_.newlyUnlocked[0]}`);
    assert(result_.profile.unlockedSpells.includes("chain_lightning"), "chain_lightning not in unlockedSpells");
    assert(result_.profile.highestDifficultyCleared === 3, "Expected highestDifficultyCleared to be 3");
  });

  await step(result, "tier 5 unlocks chain_lightning and frost_bolt", async () => {
    const profile = cloneDefaultProfile();
    const result_ = recordRunProgress(profile, 1, 5);
    assert(result_.newlyUnlocked.length === 2, `Expected 2 unlocks, got ${result_.newlyUnlocked.length}`);
    assert(result_.newlyUnlocked.includes("chain_lightning"), "chain_lightning not unlocked");
    assert(result_.newlyUnlocked.includes("frost_bolt"), "frost_bolt not unlocked");
    assert(result_.profile.unlockedSpells.includes("chain_lightning"), "chain_lightning not in profile");
    assert(result_.profile.unlockedSpells.includes("frost_bolt"), "frost_bolt not in profile");
  });

  await step(result, "tier 7 unlocks fireball in addition to previous spells", async () => {
    const profile = cloneDefaultProfile();
    const result_ = recordRunProgress(profile, 7, 7);
    assert(result_.newlyUnlocked.includes("fireball"), "fireball not unlocked at tier 7");
    assert(result_.profile.unlockedSpells.includes("chain_lightning"), "chain_lightning missing");
    assert(result_.profile.unlockedSpells.includes("frost_bolt"), "frost_bolt missing");
    assert(result_.profile.highestDifficultyCleared === 7, "Expected highestDifficultyCleared 7");
  });

  await step(result, "tier 10 unlocks everything", async () => {
    const profile = cloneDefaultProfile();
    const result_ = recordRunProgress(profile, 10, 10);
    assert(result_.newlyUnlocked.length === 5, `Expected 5 unlocks, got ${result_.newlyUnlocked.length}`);
    assert(result_.profile.unlockedSpells.includes("chain_lightning"), "chain_lightning missing");
    assert(result_.profile.unlockedSpells.includes("frost_bolt"), "frost_bolt missing");
    assert(result_.profile.unlockedSpells.includes("fireball"), "fireball missing");
    assert(result_.profile.unlockedSpells.includes("poison_bolt"), "poison_bolt missing");
    assert(result_.profile.unlockedSpells.includes("meteor"), "meteor missing");
    assert(result_.profile.highestDifficultyCleared === 10, "Expected highestDifficultyCleared 10");
  });

  await step(result, "running at a lower tier after unlocking higher spells keeps unlocks", async () => {
    const profile = cloneDefaultProfile();
    recordRunProgress(profile, 5, 5); // unlocks chain_lightning, frost_bolt
    const result_ = recordRunProgress(profile, 2, 2); // run at tier 2
    assert(result_.profile.unlockedSpells.includes("chain_lightning"), "chain_lightning should persist");
    assert(result_.profile.unlockedSpells.includes("frost_bolt"), "frost_bolt should persist");
    assert(result_.profile.highestDifficultyCleared === 5, "highestDifficultyCleared should stay 5");
    assert(result_.newlyUnlocked.length === 0, "No new unlocks from lower tier");
  });

  await step(result, "game startRun with tier respects unlocked spells", async () => {
    game.difficultyLevel = 1;
    game.startRun("meteor");
    await nextFrame();
    assert(game.caster.loadout.length === 1, "Should have 1 spell");
    assert(game.caster.loadout[0].definitionId === "arcane_bolt",
      `Expected arcane_bolt fallback, got ${game.caster.loadout[0].definitionId}`);
  });
}
