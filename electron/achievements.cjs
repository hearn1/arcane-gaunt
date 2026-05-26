const steamworks = require("./steamworks.cjs");

// --- Achievement Definitions ------------------------------------------------

const ACH_FIRST_RUN       = "ACH_FIRST_RUN";
const ACH_WAVE_5          = "ACH_WAVE_5";
const ACH_WAVE_10         = "ACH_WAVE_10";
const ACH_WAVE_15         = "ACH_WAVE_15";
const ACH_PERFECT_BLOCK_10 = "ACH_PERFECT_BLOCK_10";
const ACH_BOSS_TRIPLE     = "ACH_BOSS_TRIPLE";
const ACH_RELIC_COLLECTOR = "ACH_RELIC_COLLECTOR";

// --- Stat Definitions -------------------------------------------------------

const STAT_RUNS_COMPLETED   = "STAT_RUNS_COMPLETED";
const STAT_HIGHEST_WAVE     = "STAT_HIGHEST_WAVE";
const STAT_LIFETIME_KILLS   = "STAT_LIFETIME_KILLS";
const STAT_LIFETIME_DAMAGE  = "STAT_LIFETIME_DAMAGE";
const STAT_PERFECT_BLOCKS   = "STAT_PERFECT_BLOCKS";
const STAT_RELICS_OWNED_PEAK = "STAT_RELICS_OWNED_PEAK";

// --- Cross-session State (lifetime) -----------------------------------------

let _state = {
  runsCompleted: 0,
  highestWave: 0,
  lifetimeKills: 0,
  lifetimeDamage: 0,
  perfectBlocks: 0,
  relicsOwnedPeak: 0,
  bossesDefeated: new Set(),
};

function seedFromSteam() {
  const read = (name) => {
    const v = steamworks.readStat(name);
    return v !== null && v !== undefined ? v : 0;
  };
  _state.runsCompleted = read("STAT_RUNS_COMPLETED");
  _state.highestWave = read("STAT_HIGHEST_WAVE");
  _state.lifetimeKills = read("STAT_LIFETIME_KILLS");
  _state.lifetimeDamage = read("STAT_LIFETIME_DAMAGE");
  _state.perfectBlocks = read("STAT_PERFECT_BLOCKS");
  _state.relicsOwnedPeak = read("STAT_RELICS_OWNED_PEAK");
}

// --- Event Reducer ----------------------------------------------------------
// Called from the main process IPC handler. Accepts renderer-supplied events
// and updates achievement / stat state accordingly.

function reduceEvent(event, payload) {
  switch (event) {
    case "run.completed":
      _state.runsCompleted += 1;
      if (payload.highestWave > _state.highestWave) {
        _state.highestWave = payload.highestWave;
      }
      _state.lifetimeKills += payload.kills || 0;
      _state.lifetimeDamage += payload.damage || 0;
      if ((payload.relicCount || 0) > _state.relicsOwnedPeak) {
        _state.relicsOwnedPeak = payload.relicCount;
      }
      _checkFirstRun();
      _checkWaveAchievements(payload.highestWave);
      _checkPerfectBlock10();
      _checkRelicCollector(payload.relicCount || 0);
      break;

    case "wave.cleared":
      _checkWaveAchievements(payload.wave);
      break;

    case "boss.killed":
      _state.bossesDefeated.add(payload.variant);
      _checkBossTriple();
      break;

    case "block.perfect":
      _state.perfectBlocks += 1;
      _checkPerfectBlock10();
      break;

    case "upgrade.bought":
      // No achievements depend on this event directly yet.
      break;
  }

  _pushStats();
}

// --- Condition Evaluators ---------------------------------------------------

function _checkFirstRun() {
  if (_state.runsCompleted >= 1) {
    steamworks.triggerAchievement(ACH_FIRST_RUN);
  }
}

function _checkWaveAchievements(wave) {
  if (wave >= 5) steamworks.triggerAchievement(ACH_WAVE_5);
  if (wave >= 10) steamworks.triggerAchievement(ACH_WAVE_10);
  if (wave >= 15) steamworks.triggerAchievement(ACH_WAVE_15);
}

function _checkPerfectBlock10() {
  if (_state.perfectBlocks >= 10) {
    steamworks.triggerAchievement(ACH_PERFECT_BLOCK_10);
  }
}

function _checkBossTriple() {
  if (_state.bossesDefeated.size >= 3) {
    steamworks.triggerAchievement(ACH_BOSS_TRIPLE);
  }
}

function _checkRelicCollector(count) {
  if (count >= 3) {
    steamworks.triggerAchievement(ACH_RELIC_COLLECTOR);
  }
}

// --- Stat Push --------------------------------------------------------------

function _pushStats() {
  steamworks.setStat(STAT_RUNS_COMPLETED, _state.runsCompleted);
  steamworks.setStat(STAT_HIGHEST_WAVE, _state.highestWave);
  steamworks.setStat(STAT_LIFETIME_KILLS, _state.lifetimeKills);
  steamworks.setStat(STAT_LIFETIME_DAMAGE, _state.lifetimeDamage);
  steamworks.setStat(STAT_PERFECT_BLOCKS, _state.perfectBlocks);
  steamworks.setStat(STAT_RELICS_OWNED_PEAK, _state.relicsOwnedPeak);
  steamworks.storeStats();
}

// --- Reset (for testing) ----------------------------------------------------

function _resetForTest() {
  _state = {
    runsCompleted: 0,
    highestWave: 0,
    lifetimeKills: 0,
    lifetimeDamage: 0,
    perfectBlocks: 0,
    relicsOwnedPeak: 0,
    bossesDefeated: new Set(),
  };
}

// --- Schema Metadata (for CSV export) ---------------------------------------

function achievementSchema() {
  return [
    { apiName: ACH_FIRST_RUN,       displayName: "First Blood",       description: "Complete your first run." },
    { apiName: ACH_WAVE_5,          displayName: "Wave Warrior",       description: "Reach wave 5." },
    { apiName: ACH_WAVE_10,         displayName: "Double Digits",      description: "Reach wave 10." },
    { apiName: ACH_WAVE_15,         displayName: "Fifteen Deep",       description: "Reach wave 15." },
    { apiName: ACH_PERFECT_BLOCK_10, displayName: "Bulletproof",       description: "Perform 10 perfect blocks." },
    { apiName: ACH_BOSS_TRIPLE,     displayName: "Boss Collector",     description: "Defeat all three boss variants." },
    { apiName: ACH_RELIC_COLLECTOR, displayName: "Relic Collector",    description: "Own 3 relics in a single run." },
  ];
}

function statSchema() {
  return [
    { apiName: STAT_RUNS_COMPLETED,   displayName: "Runs Completed",  type: "int" },
    { apiName: STAT_HIGHEST_WAVE,     displayName: "Highest Wave",    type: "int" },
    { apiName: STAT_LIFETIME_KILLS,   displayName: "Lifetime Kills",  type: "int" },
    { apiName: STAT_LIFETIME_DAMAGE,  displayName: "Lifetime Damage", type: "int" },
    { apiName: STAT_PERFECT_BLOCKS,   displayName: "Perfect Blocks",  type: "int" },
    { apiName: STAT_RELICS_OWNED_PEAK, displayName: "Peak Relics",    type: "int" },
  ];
}

module.exports = { reduceEvent, achievementSchema, statSchema, seedFromSteam, _resetForTest };
