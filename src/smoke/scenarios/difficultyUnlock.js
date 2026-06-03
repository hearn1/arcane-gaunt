import { step, assert, nextFrame, killAllEnemies } from "../testHelpers.js";
import { recordRunProgress } from "../../core/Profile.js";
import { cloneDefaultProfile } from "../../core/Profile.js";

export default async function runDifficultyUnlockSmoke(game, result) {
  await step(result, "default profile only has arcane_bolt and tier 1 unlocked", async () => {
    const profile = cloneDefaultProfile();
    assert(Array.isArray(profile.unlockedSpells), "unlockedSpells is not an array");
    assert(profile.unlockedSpells.length === 1, `Expected 1 spell, got ${profile.unlockedSpells.length}`);
    assert(profile.unlockedSpells[0] === "arcane_bolt", "Expected only arcane_bolt");
    assert(profile.unlocks.unlockedTiers.length === 1, "Expected only 1 unlocked tier");
    assert(profile.unlocks.unlockedTiers[0] === 1, "Expected tier 1 unlocked");
  });

  await step(result, "tier 1 run to level 5 unlocks fireball but no new tiers", async () => {
    const profile = cloneDefaultProfile();
    const r = recordRunProgress(profile, 5, 1);
    assert(r.newlyUnlocked.includes("fireball"), "fireball should unlock at level 5");
    assert(r.newlyUnlocked.length === 1, `Expected 1 spell unlock, got ${r.newlyUnlocked.length}`);
    assert(r.newlyUnlockedTiers.length === 0, "No tier unlock at level 5 on tier 1");
    assert(r.profile.unlockedSpells.includes("fireball"), "fireball in unlockedSpells");
    assert(r.profile.unlocks.unlockedTiers.length === 1, "Still only 1 unlocked tier");
  });

  await step(result, "tier 1 run to level 10 unlocks initiate and frost_bolt", async () => {
    const profile = cloneDefaultProfile();
    const r = recordRunProgress(profile, 10, 1);
    assert(r.newlyUnlocked.includes("fireball"), "fireball at level 5");
    assert(r.newlyUnlocked.includes("frost_bolt"), "frost_bolt at level 10");
    assert(r.newlyUnlocked.length === 2, `Expected 2 spell unlocks, got ${r.newlyUnlocked.length}`);
    assert(r.newlyUnlockedTiers.length === 1, "Expected 1 tier unlock");
    assert(r.newlyUnlockedTiers[0] === 2, "Expected tier 2 (Initiate) to unlock");
    assert(r.profile.unlocks.unlockedTiers.includes(2), "Initiate in unlockedTiers");
  });

  await step(result, "tier 2 run to level 15 unlocks adept and poison_bolt", async () => {
    const profile = cloneDefaultProfile();
    profile.unlocks.unlockedTiers = [1, 2];
    const r = recordRunProgress(profile, 15, 2);
    assert(r.newlyUnlocked.includes("poison_bolt"), "poison_bolt at level 15");
    assert(r.newlyUnlocked.includes("fireball"), "fireball from earlier level");
    assert(r.newlyUnlocked.includes("frost_bolt"), "frost_bolt from earlier level");
    assert(r.newlyUnlocked.length === 3, `Expected 3 spell unlocks, got ${r.newlyUnlocked.length}`);
    assert(r.newlyUnlockedTiers.length === 1, "Expected 1 tier unlock");
    assert(r.newlyUnlockedTiers[0] === 3, "Expected tier 3 (Adept) to unlock");
  });

  await step(result, "tier 1 run to level 30 unlocks all spells and tier 2 only", async () => {
    const profile = cloneDefaultProfile();
    const r = recordRunProgress(profile, 30, 1);
    assert(r.newlyUnlocked.includes("fireball"), "fireball");
    assert(r.newlyUnlocked.includes("frost_bolt"), "frost_bolt");
    assert(r.newlyUnlocked.includes("poison_bolt"), "poison_bolt");
    assert(r.newlyUnlocked.includes("chain_lightning"), "chain_lightning");
    assert(r.newlyUnlocked.includes("meteor"), "meteor");
    assert(r.newlyUnlocked.length === 5, `Expected 5 spell unlocks, got ${r.newlyUnlocked.length}`);
    assert(r.newlyUnlockedTiers.length === 1, "Expected only 1 tier unlock (cannot skip tiers)");
    assert(r.newlyUnlockedTiers[0] === 2, "Expected tier 2 (Initiate) only");
    assert(r.profile.unlocks.unlockedTiers.includes(2), "Initiate unlocked");
    assert(!r.profile.unlocks.unlockedTiers.includes(3), "Adept should NOT unlock (never played Initiate)");
  });

  await step(result, "sequential tier unlocks: tier 1 -> tier 2 -> tier 3", async () => {
    const profile = cloneDefaultProfile();
    let r = recordRunProgress(profile, 15, 1);
    assert(r.newlyUnlockedTiers.length === 1, "First run unlocks Initiate");
    r = recordRunProgress(r.profile, 20, 2);
    assert(r.newlyUnlockedTiers.length === 1, "Second run unlocks Adept");
    assert(r.newlyUnlockedTiers[0] === 3, "Adept unlocked after playing Initiate");
    assert(r.profile.unlocks.unlockedTiers.includes(1), "Apprentice still unlocked");
    assert(r.profile.unlocks.unlockedTiers.includes(2), "Initiate still unlocked");
    assert(r.profile.unlocks.unlockedTiers.includes(3), "Adept unlocked");
    assert(r.profile.unlockedSpells.includes("fireball"), "fireball from level 5+");
    assert(r.profile.unlockedSpells.includes("frost_bolt"), "frost_bolt from level 10+");
    assert(r.profile.unlockedSpells.includes("poison_bolt"), "poison_bolt from level 15+");
  });

  await step(result, "spells remain unlocked across profile saves", async () => {
    const profile = cloneDefaultProfile();
    const r1 = recordRunProgress(profile, 10, 1);
    assert(r1.newlyUnlocked.includes("fireball"), "fireball unlocked");
    const r2 = recordRunProgress(r1.profile, 5, 2);
    assert(r2.profile.unlockedSpells.includes("fireball"), "fireball persists");
    assert(r2.profile.unlockedSpells.includes("frost_bolt"), "frost_bolt persists");
    assert(r2.newlyUnlockedTiers.length === 0, "No new tier from lower-level tier 2 run");
  });

  await step(result, "game startRun with locked spell falls back to arcane_bolt", async () => {
    game.difficultyLevel = 1;
    game.startRun("meteor");
    await nextFrame();
    assert(game.caster.loadout.length === 1, "Should have 1 spell");
    assert(game.caster.loadout[0].definitionId === "arcane_bolt",
      `Expected arcane_bolt fallback, got ${game.caster.loadout[0].definitionId}`);
  });

  await step(result, "clicking an unlocked non-default tier updates game.difficultyLevel", async () => {
    const profile = cloneDefaultProfile();
    profile.unlocks.unlockedTiers = [1, 2, 3];
    game.profile = profile;
    game.difficultyLevel = 1;
    game.showMainMenu();
    await nextFrame();
    const tier3Btn = document.querySelector(".diff-pill[data-diff='3']");
    assert(!!tier3Btn, "Tier 3 pill not found in DOM");
    assert(!tier3Btn.disabled, "Tier 3 pill should be enabled for unlocked tier");
    tier3Btn.click();
    assert(game.difficultyLevel === 3, `Expected difficultyLevel 3, got ${game.difficultyLevel}`);
    const label = document.getElementById("current-diff-label");
    assert(!!label, "current-diff-label element not found");
    assert(label.textContent.includes("Adept"), `Expected label to include 'Adept', got: ${label.textContent}`);
    const selectedPills = document.querySelectorAll(".diff-pill.selected");
    assert(selectedPills.length === 1, `Expected 1 selected pill, got ${selectedPills.length}`);
    assert(selectedPills[0].dataset.diff === "3", "Wrong pill is marked selected");
  });

  await step(result, "startRun after tier selection uses selected difficultyLevel", async () => {
    game.difficultyLevel = 2;
    game.startRun("arcane_bolt");
    await nextFrame();
    assert(game.state === "focus" || game.state === "playing",
      `Expected focus or playing state, got ${game.state}`);
    assert(game.difficultyLevel === 2, `difficultyLevel changed unexpectedly, got ${game.difficultyLevel}`);
    game.toMenu();
    await nextFrame();
  });

  await step(result, "locked tier pill is marked locked and cannot be clicked", async () => {
    const profile = cloneDefaultProfile();
    game.profile = profile;
    game.difficultyLevel = 1;
    game.showMainMenu();
    await nextFrame();
    const tier2Btn = document.querySelector(".diff-pill[data-diff='2']");
    assert(!!tier2Btn, "Tier 2 pill not found");
    // Locked pills stay focusable (no `disabled`) so keyboard/gamepad nav can land
    // on them to read the unlock card; they carry `locked`/`aria-disabled` instead.
    assert(tier2Btn.classList.contains("locked"), "Tier 2 pill should have locked class");
    assert(tier2Btn.getAttribute("aria-disabled") === "true", "Tier 2 pill should be aria-disabled");
    tier2Btn.click();
    assert(game.difficultyLevel === 1, `Locked tier click should not change difficultyLevel, got ${game.difficultyLevel}`);
  });
}
