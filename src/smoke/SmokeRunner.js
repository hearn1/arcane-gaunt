const DEFAULT_TIMEOUT_MS = 6000;

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitFor(label, predicate, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    if (predicate()) return;
    await nextFrame();
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function active(id) {
  return document.getElementById(id)?.classList.contains("active") || false;
}

function shown(selector) {
  const el = document.querySelector(selector);
  return !!el && !el.closest(".hidden");
}

function renderResultPanel(result) {
  document.getElementById("smoke-result-panel")?.remove();

  const panel = document.createElement("pre");
  panel.id = "smoke-result-panel";
  panel.textContent = JSON.stringify(result, null, 2);
  panel.style.cssText = [
    "position:fixed",
    "left:12px",
    "bottom:12px",
    "z-index:999",
    "max-width:min(520px,calc(100vw - 24px))",
    "max-height:42vh",
    "overflow:auto",
    "padding:12px 14px",
    "border-radius:8px",
    "border:1px solid rgba(255,255,255,0.22)",
    "background:rgba(8,8,14,0.94)",
    "color:#e8e6f5",
    "font:12px/1.45 Consolas,monospace",
    "text-align:left",
    "white-space:pre-wrap",
    result.status === "passed"
      ? "box-shadow:0 0 0 1px rgba(127,224,160,0.55),0 10px 28px rgba(0,0,0,0.35)"
      : "box-shadow:0 0 0 1px rgba(255,85,102,0.65),0 10px 28px rgba(0,0,0,0.35)",
  ].join(";");
  document.body.appendChild(panel);
}

function inputIsClear(input) {
  return (
    Object.keys(input.keys || {}).length === 0 &&
    input.mouseDX === 0 &&
    input.mouseDY === 0 &&
    input.firing === false &&
    input.rightDown === false &&
    input._selectSpell === -1 &&
    input._wheel === 0
  );
}

async function step(result, name, fn) {
  const entry = { name, status: "running" };
  result.steps.push(entry);
  try {
    await fn();
    entry.status = "passed";
    console.info(`[smoke] passed: ${name}`);
  } catch (err) {
    entry.status = "failed";
    entry.error = err?.stack || err?.message || String(err);
    console.error(`[smoke] failed: ${name}`, err);
    throw err;
  }
}

async function runBootStartMenuSmoke(game, result) {
  await step(result, "boot main menu", async () => {
    assert(game.state === "menu", `Expected menu state, got ${game.state}`);
    assert(shown("#btn-start"), "Start Run button is not visible");
    assert(!active("hud"), "HUD should be hidden on main menu");
    assert(!active("crosshair"), "Crosshair should be hidden on main menu");
    assert(!document.querySelector(".fatal-panel"), "Fatal panel is visible");
  });

  await step(result, "start run reaches focus prompt", async () => {
    game.startRun();
    await nextFrame();
    assert(game.state === "focus", `Expected focus state, got ${game.state}`);
    assert(shown("#btn-focus"), "Enter Arena prompt is not visible");
    assert(!active("hud"), "HUD should stay hidden before pointer focus");
    assert(game.enemyManager.aliveCount === 0, "Enemies spawned before arena entry");
  });

  await step(result, "begin playing spawns first wave", async () => {
    await game.beginPlaying(true);
    await waitFor("playing state", () => game.state === "playing");
    await nextFrame();
    assert(active("hud"), "HUD is not active during play");
    assert(active("crosshair"), "Crosshair is not active during play");
    assert(game.enemyManager.aliveCount > 0, "First wave did not spawn enemies");
    assert(document.getElementById("ui-root")?.classList.contains("hidden"), "Overlay is still visible during play");
  });

  await step(result, "pause menu hides combat UI", async () => {
    game.pauseGame(false);
    await nextFrame();
    assert(game.state === "focus", `Expected focus state after pause, got ${game.state}`);
    assert(shown("#btn-pause-resume"), "Pause menu resume button is not visible");
    assert(!active("hud"), "HUD should be hidden while paused");
    assert(!active("crosshair"), "Crosshair should be hidden while paused");
    assert(!document.getElementById("wave-banner")?.classList.contains("show"), "Wave banner should be hidden while paused");
  });

  await step(result, "main menu cleanup clears active run surfaces", async () => {
    game.toMenu();
    await nextFrame();
    assert(game.state === "menu", `Expected menu state after return, got ${game.state}`);
    assert(shown("#btn-start"), "Main menu did not render after cleanup");
    assert(game.enemyManager.aliveCount === 0, "Enemies remain after returning to main menu");
    assert((game.hitResolver?.projectiles?.length || 0) === 0, "Projectiles remain after returning to main menu");
    assert((game.timers?.length || 0) === 0, "Timers remain after returning to main menu");
    assert(!active("hud"), "HUD should be hidden after returning to main menu");
    assert(!active("crosshair"), "Crosshair should be hidden after returning to main menu");
    assert(!document.getElementById("wave-banner")?.classList.contains("show"), "Wave banner remains after returning to main menu");
    assert(inputIsClear(game.input), "Input state was not fully cleared");
  });
}

export async function runSmoke(game, scenario = "boot-start-menu") {
  const result = {
    scenario,
    status: "running",
    startedAt: new Date().toISOString(),
    steps: [],
  };
  window.__arcaneSmokeResult = result;

  const originalAudioEnsure = game.audio.ensure;
  const originalPersistProfile = game.persistProfile;
  const initialProfile = cloneJson(game.profile);

  game.audio.ensure = () => {};
  game.persistProfile = (profile) => {
    game.profile = profile;
  };

  try {
    if (scenario !== "boot-start-menu") {
      throw new Error(`Unknown smoke scenario: ${scenario}`);
    }

    await runBootStartMenuSmoke(game, result);
    result.status = "passed";
    console.info("[smoke] passed", result);
  } catch (err) {
    result.status = "failed";
    result.error = err?.stack || err?.message || String(err);
    console.error("[smoke] failed", err);
  } finally {
    game.audio.ensure = originalAudioEnsure;
    game.persistProfile = originalPersistProfile;
    game.profile = initialProfile;
    if (result.status === "passed") {
      game.showMainMenu();
    }
    result.finishedAt = new Date().toISOString();
    renderResultPanel(result);
  }

  return result;
}
