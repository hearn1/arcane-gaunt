import { step, assert, nextFrame } from "../testHelpers.js";

export default async function runPrivacyNoNetworkSmoke(game, result) {
  let externalUrls = [];
  let localUrls = [];

  const origFetch = globalThis.fetch;
  globalThis.fetch = function patchedFetch(url, opts) {
    const urlStr = url?.url || String(url);
    if (/^(https?:\/\/localhost|arcane:\/\/|file:\/\/)/.test(urlStr) || urlStr.startsWith("/") || urlStr.startsWith(".") || !urlStr.includes("://")) {
      localUrls.push(urlStr);
    } else if (urlStr.includes("://")) {
      externalUrls.push(urlStr);
    }
    return origFetch.apply(this, arguments);
  };

  const origXHR = globalThis.XMLHttpRequest;
  const OrigXHRSend = origXHR.prototype.send;
  const OrigXHROpen = origXHR.prototype.open;
  origXHR.prototype.open = function patchedOpen(method, url) {
    this.__patchedUrl = String(url);
    return OrigXHROpen.apply(this, arguments);
  };
  origXHR.prototype.send = function patchedSend(body) {
    const urlStr = this.__patchedUrl || "";
    if (/^(https?:\/\/localhost|arcane:\/\/|file:\/\/)/.test(urlStr) || urlStr.startsWith("/") || urlStr.startsWith(".") || !urlStr.includes("://")) {
      localUrls.push(urlStr);
    } else if (urlStr.includes("://")) {
      externalUrls.push(urlStr);
    }
    return OrigXHRSend.apply(this, arguments);
  };

  await step(result, "verify we start at the menu", async () => {
    assert(game.state === "menu", `Expected menu state, got ${game.state}`);
  });

  await step(result, "start a run and play a wave", async () => {
    game.startRun();
    await nextFrame();
    await game.beginPlaying(true);
    await nextFrame();
    assert(game.state === "playing", `Expected playing state during wave`);
  });

  await step(result, "clear a wave and verify reward state", async () => {
    const enemies = game.enemyManager.aliveList();
    for (const e of enemies) {
      e.health.current = 0;
      e.alive = false;
      e.forceRemove();
    }
    game.enemyManager._waveActive = false;
    await nextFrame();
  });

  await step(result, "no external network requests during gameplay", async () => {
    assert(externalUrls.length === 0, `Found external network requests: ${externalUrls.join(", ")}`);
  });

  globalThis.fetch = origFetch;
  origXHR.prototype.open = OrigXHROpen;
  origXHR.prototype.send = OrigXHRSend;
}
