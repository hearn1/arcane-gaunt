export const PERF_PRESETS = Object.freeze({
  low: Object.freeze({
    renderScale: 0.7,
    vfxDensity: "reduced",
    screenShake: false,
    viewmodel: true,
    bloom: false,
    shadows: false,
  }),
  medium: Object.freeze({
    renderScale: 0.85,
    vfxDensity: "reduced",
    screenShake: true,
    viewmodel: true,
    bloom: true,
    shadows: true,
  }),
  high: Object.freeze({
    renderScale: 1.0,
    vfxDensity: "full",
    screenShake: true,
    viewmodel: true,
    bloom: true,
    shadows: true,
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
      bloom: preset.bloom,
      shadows: preset.shadows,
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
      d.viewmodel === preset.viewmodel &&
      d.bloom === preset.bloom &&
      d.shadows === preset.shadows
    ) {
      return id;
    }
  }
  return "custom";
}
