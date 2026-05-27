export const PERF_PRESETS = Object.freeze({
  low: Object.freeze({
    renderScale: 0.7,
    vfxDensity: "reduced",
    screenShake: false,
    viewmodel: true,
  }),
  medium: Object.freeze({
    renderScale: 0.85,
    vfxDensity: "reduced",
    screenShake: true,
    viewmodel: true,
  }),
  high: Object.freeze({
    renderScale: 1.0,
    vfxDensity: "full",
    screenShake: true,
    viewmodel: true,
  }),
});

export function applyPreset(settings, presetId) {
  const preset = PERF_PRESETS[presetId];
  if (!preset) return settings;
  return {
    ...settings,
    performance: {
      ...settings.performance,
      renderScale: preset.renderScale,
      vfxDensity: preset.vfxDensity,
      preset: presetId,
    },
    display: {
      ...settings.display,
      screenShake: preset.screenShake,
      viewmodel: preset.viewmodel,
    },
  };
}

export function inferPreset(settings) {
  const p = settings.performance || {};
  const d = settings.display || {};
  for (const [id, preset] of Object.entries(PERF_PRESETS)) {
    if (
      p.renderScale === preset.renderScale &&
      p.vfxDensity === preset.vfxDensity &&
      d.screenShake === preset.screenShake &&
      d.viewmodel === preset.viewmodel
    ) {
      return id;
    }
  }
  return "custom";
}
