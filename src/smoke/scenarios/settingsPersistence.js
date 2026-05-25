import { step, assert, cloneJson } from "../testHelpers.js";
import { loadSettings, saveSettings } from "../../core/Settings.js";
import { DEFAULT_SETTINGS } from "../../core/Settings.js";

export default async function runSettingsPersistenceSmoke(game, result) {
  const originalSettings = cloneJson(game.settings);

  await step(result, "write custom settings via game.updateSettings", async () => {
    game.updateSettings({
      audio: { muted: true, volume: 0.55 },
      controls: { mouseSensitivity: 1.4 },
      performance: { renderScale: 0.85, vfxDensity: "reduced" },
    });
    game.flushSettings();
    await new Promise((r) => setTimeout(r, 50));
    assert(game.settings.audio.muted === true, "muted not applied");
    assert(Math.abs(game.settings.audio.volume - 0.55) < 0.01, "volume not applied");
    assert(Math.abs(game.settings.controls.mouseSensitivity - 1.4) < 0.01, "sensitivity not applied");
    assert(game.settings.performance.renderScale === 0.85, "render scale not applied");
    assert(game.settings.performance.vfxDensity === "reduced", "vfx density not applied");
  });

  await step(result, "loadSettings round-trips custom values", async () => {
    const loaded = await loadSettings();
    assert(loaded.audio.muted === true, "loaded muted mismatch");
    assert(Math.abs(loaded.audio.volume - 0.55) < 0.01, "loaded volume mismatch");
    assert(Math.abs(loaded.controls.mouseSensitivity - 1.4) < 0.01, "loaded sensitivity mismatch");
    assert(loaded.performance.renderScale === 0.85, "loaded render scale mismatch");
    assert(loaded.performance.vfxDensity === "reduced", "loaded vfx density mismatch");
  });

  await step(result, "restore original settings", async () => {
    game.updateSettings(originalSettings);
    game.flushSettings();
    await new Promise((r) => setTimeout(r, 50));
    const restored = await loadSettings();
    assert(restored.audio.muted === originalSettings.audio.muted, "muted not restored");
    assert(Math.abs(restored.audio.volume - originalSettings.audio.volume) < 0.01, "volume not restored");
  });
}
