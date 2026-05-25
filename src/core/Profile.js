import { deleteSaveJson, loadSaveJson, saveSaveJson, SAVE_DEFINITIONS } from "./SaveStorage.js";
import { SPELL_DEFINITIONS } from "../spells/spellDefinitions.js";

export const PROFILE_VERSION = 1;
export const PROFILE_LOCAL_STORAGE_KEY = SAVE_DEFINITIONS.profile.localStorageKey;
export const PROFILE_STEAM_CLOUD_RELATIVE_PATH = SAVE_DEFINITIONS.profile.cloudRelativePath;

const EMPTY_BEST_RUN = Object.freeze({
  levelsCleared: 0,
  highestWave: 0,
  starterSpellId: "",
  starterSpellName: "",
  enemiesKilled: 0,
  goldEarned: 0,
  totalDamage: 0,
  timestamp: "",
});

const EMPTY_TOTALS = Object.freeze({
  runsStarted: 0,
  runsCompleted: 0,
  levelsCleared: 0,
  enemiesKilled: 0,
  goldEarned: 0,
  totalDamage: 0,
});

export const DEFAULT_PROFILE = Object.freeze({
  version: PROFILE_VERSION,
  bestRun: EMPTY_BEST_RUN,
  totals: EMPTY_TOTALS,
  meta: Object.freeze({}),
  unlocks: Object.freeze({}),
});

function wholeNumber(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.round(n));
}

function text(value) {
  return typeof value === "string" ? value : "";
}

function sanitizeBestRun(input = {}) {
  return {
    levelsCleared: wholeNumber(input.levelsCleared),
    highestWave: wholeNumber(input.highestWave),
    starterSpellId: text(input.starterSpellId),
    starterSpellName: text(input.starterSpellName),
    enemiesKilled: wholeNumber(input.enemiesKilled),
    goldEarned: wholeNumber(input.goldEarned),
    totalDamage: wholeNumber(input.totalDamage),
    timestamp: text(input.timestamp),
  };
}

function sanitizeTotals(input = {}) {
  return {
    runsStarted: wholeNumber(input.runsStarted),
    runsCompleted: wholeNumber(input.runsCompleted),
    levelsCleared: wholeNumber(input.levelsCleared),
    enemiesKilled: wholeNumber(input.enemiesKilled),
    goldEarned: wholeNumber(input.goldEarned),
    totalDamage: wholeNumber(input.totalDamage),
  };
}

function plainObject(input) {
  return input && typeof input === "object" && !Array.isArray(input) ? { ...input } : {};
}

export function sanitizeProfile(input = {}) {
  return {
    version: PROFILE_VERSION,
    bestRun: sanitizeBestRun(input.bestRun),
    totals: sanitizeTotals(input.totals),
    meta: plainObject(input.meta),
    unlocks: plainObject(input.unlocks),
  };
}

export function cloneDefaultProfile() {
  return sanitizeProfile(DEFAULT_PROFILE);
}

export async function loadProfile() {
  const stored = await loadSaveJson("profile");
  return stored ? sanitizeProfile(stored) : cloneDefaultProfile();
}

export async function saveProfile(profile) {
  return saveSaveJson("profile", sanitizeProfile(profile));
}

export async function resetProfile() {
  await deleteSaveJson("profile");
  return cloneDefaultProfile();
}

export function recordRunStarted(profile) {
  const next = sanitizeProfile(profile);
  next.totals.runsStarted += 1;
  return next;
}

export function createRunRecord(stats, starterSpellId, highestWave = 1, timestamp = new Date().toISOString()) {
  const def = SPELL_DEFINITIONS[starterSpellId];
  return sanitizeBestRun({
    levelsCleared: stats?.levelsCleared,
    highestWave,
    starterSpellId: def?.id || starterSpellId || "",
    starterSpellName: def?.displayName || starterSpellId || "",
    enemiesKilled: stats?.enemiesKilled,
    goldEarned: stats?.goldEarned,
    totalDamage: stats?.totalDamage,
    timestamp,
  });
}

function isBetterRun(candidate, current) {
  if (candidate.levelsCleared !== current.levelsCleared) {
    return candidate.levelsCleared > current.levelsCleared;
  }
  if (candidate.highestWave !== current.highestWave) {
    return candidate.highestWave > current.highestWave;
  }
  if (candidate.enemiesKilled !== current.enemiesKilled) {
    return candidate.enemiesKilled > current.enemiesKilled;
  }
  if (candidate.goldEarned !== current.goldEarned) {
    return candidate.goldEarned > current.goldEarned;
  }
  return candidate.totalDamage > current.totalDamage;
}

export function recordRunCompleted(profile, runRecord) {
  const next = sanitizeProfile(profile);
  const record = sanitizeBestRun(runRecord);

  next.totals.runsCompleted += 1;
  next.totals.levelsCleared += record.levelsCleared;
  next.totals.enemiesKilled += record.enemiesKilled;
  next.totals.goldEarned += record.goldEarned;
  next.totals.totalDamage += record.totalDamage;

  if (isBetterRun(record, next.bestRun)) {
    next.bestRun = record;
  }

  return next;
}
