import { applyDamage } from "../core/Damage.js";

const DEFAULT_TIMEOUT_MS = 6000;

export function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export async function waitFor(label, predicate, timeoutMs = DEFAULT_TIMEOUT_MS) {
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

export function renderResultPanel(result) {
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

export function inputIsClear(input) {
  return (
    Object.keys(input.keys || {}).length === 0 &&
    input.mouseDX === 0 &&
    input.mouseDY === 0 &&
    input.firing === false &&
    input.rightDown === false &&
    input._selectSpell === -1 &&
    input._wheel === 0 &&
    input._lookAxes.x === 0 &&
    input._lookAxes.y === 0 &&
    input.leftStickX === 0 &&
    input.leftStickY === 0 &&
    input._gpFiring === false &&
    input._gpRightDown === false
  );
}

export async function step(result, name, fn) {
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

export function activeEl(id) {
  return document.getElementById(id)?.classList.contains("active") || false;
}

export function isShown(selector) {
  const el = document.querySelector(selector);
  return !!el && !el.closest(".hidden");
}

export function killAllEnemies(world) {
  while (world.enemyManager.aliveCount > 0) {
    const enemies = world.enemyManager.aliveList();
    for (const e of enemies) {
      if (e.alive) {
        applyDamage(e, 99999, { owner: "player", spellId: "smoke_test" });
      }
    }
  }
}

export function killPlayer(world) {
  applyDamage(world.player, 99999, { owner: "enemy", spellId: "smoke_test" });
}

export function setGold(world, n) {
  world.currency.gold = n;
}
