const { app, BrowserWindow, session } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");

const SERVER_PORT = process.env.ARCANE_SMOKE_PORT || 8000;
const SCENARIO = process.env.ARCANE_SMOKE_SCENARIO || "all";
const SERVER_URL = `http://localhost:${SERVER_PORT}`;
const SMOKE_URL = `${SERVER_URL}/?smoke=${SCENARIO}`;
const TIMEOUT_MS = parseInt(process.env.ARCANE_SMOKE_TIMEOUT || "60000", 10);
const RESULT_FILE = process.env.ARCANE_SMOKE_RESULT_FILE
  || path.join(app.getPath("temp"), "arcane-smoke-result.json");

let resultWritten = false;
let timedOut = false;

function ensureServerReady() {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const maxAttempts = 60;
    const check = () => {
      attempts++;
      const req = http.get(`${SERVER_URL}/index.html`, (res) => {
        if (res.statusCode === 200) resolve();
        else if (attempts < maxAttempts) setTimeout(check, 500);
        else reject(new Error(`Server returned ${res.statusCode} after ${maxAttempts} attempts`));
      });
      req.on("error", () => {
        if (attempts < maxAttempts) setTimeout(check, 500);
        else reject(new Error(`Server not reachable after ${maxAttempts} attempts`));
      });
      req.end();
    };
    check();
  });
}

function writeResult(result) {
  if (resultWritten) return;
  resultWritten = true;
  try {
    fs.mkdirSync(path.dirname(RESULT_FILE), { recursive: true });
    fs.writeFileSync(RESULT_FILE, JSON.stringify(result, null, 2), "utf8");
  } catch (err) {
    console.error("[smoke-runner] Failed to write result file:", err.message);
  }
  console.log(`[smoke-runner] Result written to ${RESULT_FILE}`);
}

app.whenReady().then(async () => {
  try {
    await ensureServerReady();
    console.log(`[smoke-runner] Server ready at ${SERVER_URL}`);
  } catch (err) {
    console.error(`[smoke-runner] ${err.message}`);
    writeResult({ status: "error", error: err.message, scenario: SCENARIO });
    app.quit();
    return;
  }

  const win = new BrowserWindow({
    width: 960,
    height: 540,
    // Render off-screen rather than fully hidden: a hidden window throttles
    // requestAnimationFrame to ~1fps, which stalls scenarios that await many
    // frames (e.g. burn-patch tick timing) and makes other render-dependent
    // assertions flaky. Showing it (inactive, off-screen) keeps the game's
    // setAnimationLoop running at full rate without stealing focus or being
    // visible on screen.
    x: -2400,
    y: -2400,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.showInactive();

  const timeout = setTimeout(() => {
    timedOut = true;
    console.error(`[smoke-runner] TIMEOUT after ${TIMEOUT_MS}ms`);
    writeResult({ status: "timeout", scenario: SCENARIO, error: `Tests did not complete within ${TIMEOUT_MS}ms` });
    app.quit();
  }, TIMEOUT_MS);

  win.webContents.on("console-message", (_event, level, message) => {
    if (message.startsWith("[smoke]")) {
      console.log(`  ${message}`);
    }
  });

  win.webContents.on("did-finish-load", () => {
    pollResult(win, timeout);
  });

  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    if (timedOut) return;
    console.error(`[smoke-runner] Load failed: ${errorCode} ${errorDescription}`);
    writeResult({ status: "error", error: `Load failed: ${errorCode} ${errorDescription}`, scenario: SCENARIO });
    clearTimeout(timeout);
    app.quit();
  });

  win.loadURL(SMOKE_URL);
});

function pollResult(win, timeout) {
  let polls = 0;
  const maxPolls = Math.ceil(TIMEOUT_MS / 500);

  const poll = setInterval(async () => {
    if (timedOut || resultWritten) {
      clearInterval(poll);
      return;
    }

    polls++;
    let result;
    try {
      result = await win.webContents.executeJavaScript("window.__arcaneSmokeResult");
    } catch {
      // Page may not be ready yet
      return;
    }

    if (!result || result.status === "running") {
      if (polls >= maxPolls) {
        clearInterval(poll);
        console.error(`[smoke-runner] Poll limit reached without result`);
        writeResult({ status: "timeout", scenario: SCENARIO, error: "No result after max polls" });
        clearTimeout(timeout);
        app.quit();
      }
      return;
    }

    clearInterval(poll);
    clearTimeout(timeout);
    writeResult(result);
    process.nextTick(() => app.quit());
  }, 500);
}

app.on("window-all-closed", () => {
  if (!resultWritten) {
    writeResult({ status: "error", error: "Window closed before test completion", scenario: SCENARIO });
  }
  app.quit();
});
