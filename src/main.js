import { installGlobalErrorHandlers, reportFatal } from "./core/ErrorReporting.js";

// Boot. Keep static imports tiny so module/startup failures can reach the
// readable fatal panel instead of leaving a blank canvas.
installGlobalErrorHandlers();

try {
  const [{ Game }, { loadSettings }, { loadProfile }] = await Promise.all([
    import("./core/Game.js"),
    import("./core/Settings.js"),
    import("./core/Profile.js"),
  ]);
  const [settings, profile] = await Promise.all([loadSettings(), loadProfile()]);
  window.__arcaneGame = new Game(settings, profile);

  const smokeScenario = new URLSearchParams(window.location.search).get("smoke");
  if (smokeScenario) {
    const { runSmoke } = await import("./smoke/SmokeRunner.js");
    await runSmoke(window.__arcaneGame, smokeScenario);
  }
} catch (err) {
  reportFatal(err, "boot");
}
