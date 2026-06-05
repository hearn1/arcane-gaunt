import { getSaveStorageMeta, loadSaveJson, saveSaveJson, SAVE_DEFINITIONS } from "./SaveStorage.js";
import { inferPreset } from "./perfPresets.js";

export const SETTINGS_VERSION = 1;
export const LOCAL_STORAGE_KEY = SAVE_DEFINITIONS.settings.localStorageKey;
export const STEAM_CLOUD_RELATIVE_PATH = SAVE_DEFINITIONS.settings.cloudRelativePath;

export const DEFAULT_SETTINGS = Object.freeze({
  version: SETTINGS_VERSION,
  audio: Object.freeze({
    muted: false,
    volume: 0.35,
    musicVolume: 0.25,
  }),
  controls: Object.freeze({
    mouseSensitivity: 1,
    stickLookSensitivity: 1,
    invertY: false,
    keyBindings: Object.freeze({
      cast: "Mouse0",
      block: "Mouse2",
      blink: "ShiftLeft",
      pause: "Escape",
    }),
  }),
  display: Object.freeze({
    fullscreen: false,
    viewmodel: true,
    fov: 78,
    colorblindMode: false,
    screenShake: true,
    captions: false,
    reducedMotion: false,
    bloom: true,
    shadows: true,
    showDamageNumbers: true,
  }),
  performance: Object.freeze({
    renderScale: 1,
    vfxDensity: "full",
    preset: "high",
  }),
  privacy: Object.freeze({
    telemetryEnabled: false,
    telemetryUuid: null,
    telemetryPrompted: false,
  }),
});

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function sanitizeKeyBindings(input) {
  const defaults = DEFAULT_SETTINGS.controls.keyBindings;
  if (!input || typeof input !== "object") return { ...defaults };
  const merged = { ...defaults, ...input.keyBindings };
  // Migrate old profiles that set blink to Space — Space is reserved for jump.
  if (merged.blink === "Space") merged.blink = "ShiftLeft";
  return merged;
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
      musicVolume: clampNumber(input.audio?.musicVolume, 0, 1, DEFAULT_SETTINGS.audio.musicVolume),
    },
    controls: {
      mouseSensitivity: clampNumber(
        input.controls?.mouseSensitivity,
        0.3,
        2,
        DEFAULT_SETTINGS.controls.mouseSensitivity,
      ),
      stickLookSensitivity: clampNumber(
        input.controls?.stickLookSensitivity,
        0.3,
        2,
        DEFAULT_SETTINGS.controls.stickLookSensitivity,
      ),
      invertY: !!input.controls?.invertY,
      keyBindings: sanitizeKeyBindings(input.controls),
    },
    display: {
      fullscreen: !!input.display?.fullscreen,
      viewmodel: input.display?.viewmodel !== false,
      fov: clampNumber(input.display?.fov, 60, 110, DEFAULT_SETTINGS.display.fov),
      colorblindMode: !!input.display?.colorblindMode,
      screenShake: input.display?.screenShake !== false,
      captions: !!input.display?.captions,
      reducedMotion: !!input.display?.reducedMotion,
      bloom: input.display?.bloom !== false,
      shadows: input.display?.shadows !== false,
      showDamageNumbers: input.display?.showDamageNumbers !== false,
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
      preset: option(
        input.performance?.preset,
        ["low", "medium", "high", "custom"],
        DEFAULT_SETTINGS.performance.preset,
      ),
    },
    privacy: {
      telemetryEnabled: !!input.privacy?.telemetryEnabled,
      telemetryUuid: input.privacy?.telemetryUuid || null,
      telemetryPrompted: !!input.privacy?.telemetryPrompted,
    },
  };
}

function cloneDefaultSettings() {
  return sanitizeSettings(DEFAULT_SETTINGS);
}

export async function loadSettings() {
  const stored = await loadSaveJson("settings");
  const settings = stored ? sanitizeSettings(stored) : cloneDefaultSettings();
  if (!stored || !stored.performance || !stored.performance.preset) {
    const inferred = inferPreset(settings);
    settings.performance.preset = inferred;
  }
  return settings;
}

export async function saveSettings(settings) {
  const safe = sanitizeSettings(settings);
  return saveSaveJson("settings", safe);
}

export async function getStorageMeta() {
  return getSaveStorageMeta();
}
