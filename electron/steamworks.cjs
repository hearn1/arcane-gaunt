const path = require("node:path");
const { app } = require("electron");

let _api = null;
let _initialized = false;

const APP_ID = 480;

function log(level, msg) {
  try {
    const entry = {
      version: 1,
      timestamp: new Date().toISOString(),
      level,
      source: "steam",
      name: "Steamworks",
      message: msg,
    };
    const fs = require("node:fs");
    const logDir = path.join(app.getPath("userData"), "logs");
    const logFile = path.join(logDir, "main.log");
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, `${JSON.stringify(entry)}\n`, "utf8");
  } catch (err) {
    console.error("[steam] log write failed", err);
  }
}

function init() {
  if (_initialized) return _api;
  _initialized = true;

  try {
    const steamworks = require("steamworks.js");
    const { restartAppIfNecessary, electronEnableSteamOverlay } = steamworks;

    if (restartAppIfNecessary(APP_ID)) {
      app.quit();
      return null;
    }

    _api = steamworks.init(APP_ID);
    electronEnableSteamOverlay();

    log("info", `init ok — app ${APP_ID}`);
    return _api;
  } catch (err) {
    log("info", `init failed — running without Steam (${err?.message || err})`);
    _api = null;
    return null;
  }
}

function readStat(name) {
  if (!_api) return null;
  try {
    return _api.stats.getInt(name);
  } catch (err) {
    log("error", `stat "${name}" read failed — ${err?.message || err}`);
    return null;
  }
}

function triggerAchievement(apiName) {
  if (!_api) return false;
  try {
    return _api.achievement.activate(apiName);
  } catch (err) {
    log("error", `achievement "${apiName}" failed — ${err?.message || err}`);
    return false;
  }
}

function setStat(name, value) {
  if (!_api) return false;
  try {
    return _api.stats.setInt(name, Math.round(value));
  } catch (err) {
    log("error", `stat "${name}" set failed — ${err?.message || err}`);
    return false;
  }
}

function storeStats() {
  if (!_api) return false;
  try {
    return _api.stats.store();
  } catch (err) {
    log("error", `storeStats failed — ${err?.message || err}`);
    return false;
  }
}

function shutdown() {
  if (!_api) return;
  try {
    storeStats();
  } catch (err) {
    log("error", `shutdown storeStats failed — ${err?.message || err}`);
  }
  _api = null;
  _initialized = false;
}

module.exports = { init, APP_ID, triggerAchievement, setStat, storeStats, readStat, shutdown };
