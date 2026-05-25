import { getSaveStorageMeta, loadSaveJson, saveSaveJson, SAVE_DEFINITIONS } from "./SaveStorage.js";

export const SETTINGS_VERSION = 1;
export const LOCAL_STORAGE_KEY = SAVE_DEFINITIONS.settings.localStorageKey;
export const STEAM_CLOUD_RELATIVE_PATH = SAVE_DEFINITIONS.settings.cloudRelativePath;

export const DEFAULT_SETTINGS = Object.freeze({
  version: SETTINGS_VERSION,
  audio: Object.freeze({
    muted: false,
    volume: 0.35,
  }),
  controls: Object.freeze({
    mouseSensitivity: 1,
  }),
  display: Object.freeze({
    fullscreen: false,
  }),
  performance: Object.freeze({
    renderScale: 1,
    vfxDensity: "full",
  }),
});

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function option(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

export function sanitizeSettings(input = {}) {
  return {
    version: SETTINGS_VERSION,
    audio: {
      muted: !!input.audio?.muted,
      volume: clampNumber(input.audio?.volume, 0, 1, DEFAULT_SETTINGS.audio.volume),
    },
    controls: {
      mouseSensitivity: clampNumber(
        input.controls?.mouseSensitivity,
        0.3,
        2,
        DEFAULT_SETTINGS.controls.mouseSensitivity,
      ),
    },
    display: {
      fullscreen: !!input.display?.fullscreen,
    },
    performance: {
      renderScale: clampNumber(
        input.performance?.renderScale,
        0.6,
        1,
        DEFAULT_SETTINGS.performance.renderScale,
      ),
      vfxDensity: option(
        input.performance?.vfxDensity,
        ["full", "reduced"],
        DEFAULT_SETTINGS.performance.vfxDensity,
      ),
    },
  };
}

function cloneDefaultSettings() {
  return sanitizeSettings(DEFAULT_SETTINGS);
}

export async function loadSettings() {
  const stored = await loadSaveJson("settings");
  return stored ? sanitizeSettings(stored) : cloneDefaultSettings();
}

export async function saveSettings(settings) {
  const safe = sanitizeSettings(settings);
  return saveSaveJson("settings", safe);
}

export async function getStorageMeta() {
  return getSaveStorageMeta();
}
