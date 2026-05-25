import { reportError } from "./ErrorReporting.js";

export const SAVE_DEFINITIONS = Object.freeze({
  settings: Object.freeze({
    localStorageKey: "arcaneGaunt.settings.v1",
    cloudRelativePath: "saves/settings.v1.json",
  }),
  profile: Object.freeze({
    localStorageKey: "arcaneGaunt.profile.v1",
    cloudRelativePath: "saves/profile.v1.json",
  }),
});

const reportedStorageFailures = new Set();

function definitionFor(key) {
  return SAVE_DEFINITIONS[key] || null;
}

function reportStorageFailure(op, key, backend, err) {
  const id = `${op}:${key}:${backend}`;
  if (reportedStorageFailures.has(id)) return;
  reportedStorageFailures.add(id);
  reportError(err, `storage-${op}`, { key, backend });
}

function readLocalStorage(localStorageKey) {
  try {
    const raw = localStorage.getItem(localStorageKey);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    reportStorageFailure("local-read", localStorageKey, "localStorage", err);
    return null;
  }
}

function writeLocalStorage(localStorageKey, data) {
  try {
    localStorage.setItem(localStorageKey, JSON.stringify(data));
  } catch (err) {
    reportStorageFailure("local-write", localStorageKey, "localStorage", err);
    // Some browser privacy modes can reject localStorage. The game can still run.
  }
}

function removeLocalStorage(localStorageKey) {
  try {
    localStorage.removeItem(localStorageKey);
  } catch (err) {
    reportStorageFailure("local-delete", localStorageKey, "localStorage", err);
    // Some browser privacy modes can reject localStorage. The game can still run.
  }
}

export async function loadSaveJson(key) {
  const def = definitionFor(key);
  if (!def) return null;

  let stored = null;
  const bridge = window.arcaneStorage;

  if (bridge?.loadJson) {
    try {
      stored = await bridge.loadJson(key);
    } catch (err) {
      reportStorageFailure("bridge-load", key, "electron-file", err);
      stored = null;
    }
  }

  return stored || readLocalStorage(def.localStorageKey);
}

export async function saveSaveJson(key, data) {
  const def = definitionFor(key);
  if (!def) return data;

  writeLocalStorage(def.localStorageKey, data);

  const bridge = window.arcaneStorage;
  if (bridge?.saveJson) {
    try {
      await bridge.saveJson(key, data);
    } catch (err) {
      reportStorageFailure("bridge-save", key, "electron-file", err);
      // Fall through to localStorage so saves still persist in browser/dev.
    }
  }

  return data;
}

export async function deleteSaveJson(key) {
  const def = definitionFor(key);
  if (!def) return false;

  removeLocalStorage(def.localStorageKey);

  const bridge = window.arcaneStorage;
  if (bridge?.deleteJson) {
    try {
      await bridge.deleteJson(key);
    } catch (err) {
      reportStorageFailure("bridge-delete", key, "electron-file", err);
      // localStorage was already cleared; ignore bridge failures.
    }
  }

  return true;
}

export async function getSaveStorageMeta() {
  const bridge = window.arcaneStorage;
  if (bridge?.meta) {
    try {
      return await bridge.meta();
    } catch (err) {
      reportStorageFailure("bridge-meta", "meta", "electron-file", err);
      // Browser fallback below.
    }
  }
  return {
    backend: "localStorage",
    key: SAVE_DEFINITIONS.settings.localStorageKey,
    settingsKey: SAVE_DEFINITIONS.settings.localStorageKey,
    profileKey: SAVE_DEFINITIONS.profile.localStorageKey,
    cloudRelativePath: SAVE_DEFINITIONS.settings.cloudRelativePath,
    cloudRelativePaths: {
      settings: SAVE_DEFINITIONS.settings.cloudRelativePath,
      profile: SAVE_DEFINITIONS.profile.cloudRelativePath,
    },
  };
}
