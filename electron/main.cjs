const { app, BrowserWindow, Menu, net, protocol, ipcMain, dialog } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const APP_PROTOCOL = "arcane";
const SAVE_FILES = Object.freeze({
  settings: "settings.v1.json",
  profile: "profile.v1.json",
});
const LOG_FILES = Object.freeze({
  main: "main.log",
  renderer: "renderer.log",
});
const MAX_LOG_TEXT = 12000;
const MAX_CONTEXT_TEXT = 4000;

app.setName("ArcaneGaunt");
app.setAppUserModelId("com.arcanegaunt.game");

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function response(text, status, contentType = "text/plain") {
  return new Response(text, {
    status,
    headers: { "content-type": contentType },
  });
}

function trimText(value, max = MAX_LOG_TEXT) {
  const text = String(value ?? "");
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n...[truncated]`;
}

function errorEntry(source, err) {
  return {
    version: 1,
    timestamp: new Date().toISOString(),
    level: "error",
    source: trimText(source, 120),
    name: trimText(err?.name || err?.constructor?.name || "Error", 120),
    message: trimText(err?.message || String(err || "Unknown error")),
    stack: trimText(err?.stack || ""),
  };
}

function logDir() {
  return path.join(app.getPath("userData"), "logs");
}

function logFileForKind(kind) {
  const fileName = LOG_FILES[kind];
  if (!fileName) return null;
  return path.join(logDir(), fileName);
}

function appendLogSync(kind, entry) {
  const filePath = logFileForKind(kind);
  if (!filePath) return false;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, "utf8");
    return true;
  } catch (err) {
    console.error("[ArcaneGaunt] Failed to write log", err);
    return false;
  }
}

async function appendLog(kind, entry) {
  const filePath = logFileForKind(kind);
  if (!filePath) return false;
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
  return true;
}

function reportMainError(source, err, showDialog = false) {
  const entry = errorEntry(source, err);
  appendLogSync("main", entry);
  console.error(`[ArcaneGaunt:${source}]`, err);
  if (showDialog) {
    dialog.showErrorBox("ArcaneGaunt failed to start", `${entry.message}\n\nLocal log: ${logFileForKind("main")}`);
  }
  return entry;
}

function sanitizeRendererLogEntry(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const contextText = (() => {
    try {
      return JSON.stringify(source.context || {});
    } catch {
      return "{}";
    }
  })();

  return {
    version: 1,
    timestamp: trimText(source.timestamp || new Date().toISOString(), 80),
    level: source.level === "warning" ? "warning" : "error",
    source: trimText(source.source || "renderer", 120),
    name: trimText(source.name || "Error", 120),
    message: trimText(source.message || "Unknown renderer error"),
    stack: trimText(source.stack || ""),
    href: trimText(source.href || "", 500),
    userAgent: trimText(source.userAgent || "", 500),
    context: trimText(contextText, MAX_CONTEXT_TEXT),
  };
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fallbackHtml(title, body, details = "") {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  html, body { width: 100%; height: 100%; margin: 0; background: #0a0a12; color: #e8e6f5; font-family: "Segoe UI", system-ui, sans-serif; }
  body { display: grid; place-items: center; padding: 28px; box-sizing: border-box; }
  main { max-width: 760px; border: 1px solid rgba(255, 85, 102, 0.45); background: rgba(14, 12, 28, 0.92); border-radius: 8px; padding: 24px; }
  h1 { margin: 0 0 12px; color: #ff5566; font-size: 30px; }
  p { line-height: 1.55; color: #d8d4ef; }
  pre { max-height: 40vh; overflow: auto; white-space: pre-wrap; color: #ffb4be; background: rgba(0,0,0,0.25); padding: 14px; border-radius: 6px; }
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(body)}</p>
  ${details ? `<pre>${escapeHtml(details)}</pre>` : ""}
</main>
</body>
</html>`;
}

function showWindowFallback(win, title, body, details = "") {
  if (!win || win.isDestroyed()) return;
  const html = fallbackHtml(title, body, details);
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch((err) => {
    reportMainError("fallback-load", err);
  });
}

function resolveAppAsset(requestUrl) {
  const appRoot = app.getAppPath();
  const parsed = new URL(requestUrl);
  const requestedPath = decodeURIComponent(parsed.pathname || "/index.html");
  const relativePath = requestedPath === "/" ? "index.html" : requestedPath.slice(1);
  const filePath = path.normalize(path.join(appRoot, relativePath));
  const normalizedRoot = path.normalize(appRoot + path.sep);

  if (!filePath.startsWith(normalizedRoot)) {
    return null;
  }

  return filePath;
}

function registerAppProtocol() {
  protocol.handle(APP_PROTOCOL, async (request) => {
    let filePath;
    try {
      filePath = resolveAppAsset(request.url);
    } catch (err) {
      reportMainError("protocol-resolve", err);
      return response("ArcaneGaunt failed to resolve this app asset.", 500);
    }

    if (!filePath) {
      return response("Forbidden", 403);
    }

    try {
      const targetPath = fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()
        ? path.join(filePath, "index.html")
        : filePath;

      if (!fs.existsSync(targetPath)) {
        return response("Not found", 404);
      }

      return net.fetch(pathToFileURL(targetPath).toString());
    } catch (err) {
      reportMainError("protocol-fetch", err);
      return response("ArcaneGaunt failed to load this app asset.", 500);
    }
  });
}

function saveDir() {
  return path.join(app.getPath("userData"), "saves");
}

function saveFileForKey(key) {
  const fileName = SAVE_FILES[key];
  if (!fileName) return null;
  return path.join(saveDir(), fileName);
}

function readStartupSettings() {
  const filePath = saveFileForKey("settings");
  if (!filePath || !fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    reportMainError("startup-settings-read", err);
    return {};
  }
}

function registerStorageIpc() {
  ipcMain.handle("arcane:load-json", async (_event, key) => {
    const filePath = saveFileForKey(key);
    if (!filePath || !fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(await fs.promises.readFile(filePath, "utf8"));
    } catch (err) {
      reportMainError(`storage-load-${key}`, err);
      return null;
    }
  });

  ipcMain.handle("arcane:save-json", async (_event, key, data) => {
    const filePath = saveFileForKey(key);
    if (!filePath) throw new Error("Unknown save key");
    try {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      const tempPath = `${filePath}.tmp`;
      await fs.promises.writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
      await fs.promises.rename(tempPath, filePath);
      return true;
    } catch (err) {
      reportMainError(`storage-save-${key}`, err);
      throw err;
    }
  });

  ipcMain.handle("arcane:delete-json", async (_event, key) => {
    const filePath = saveFileForKey(key);
    if (!filePath) throw new Error("Unknown save key");
    try {
      await fs.promises.unlink(filePath);
    } catch (err) {
      if (err?.code !== "ENOENT") {
        reportMainError(`storage-delete-${key}`, err);
        throw err;
      }
    }
    return true;
  });

  ipcMain.handle("arcane:storage-meta", async () => ({
    backend: "electron-file",
    path: saveFileForKey("settings"),
    settingsPath: saveFileForKey("settings"),
    profilePath: saveFileForKey("profile"),
    cloudRelativePath: `saves/${SAVE_FILES.settings}`,
    cloudRelativePaths: {
      settings: `saves/${SAVE_FILES.settings}`,
      profile: `saves/${SAVE_FILES.profile}`,
    },
  }));

  ipcMain.handle("arcane:set-fullscreen", (event, fullscreen) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    win.setFullScreen(!!fullscreen);
    return win.isFullScreen();
  });

  ipcMain.handle("arcane:is-fullscreen", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return !!win?.isFullScreen();
  });

  ipcMain.handle("arcane:write-renderer-log", async (_event, entry) => {
    await appendLog("renderer", sanitizeRendererLogEntry(entry));
    return true;
  });

  ipcMain.handle("arcane:log-meta", async () => ({
    backend: "electron-file",
    rendererLogPath: logFileForKind("renderer"),
    mainLogPath: logFileForKind("main"),
  }));
}

function createWindow() {
  Menu.setApplicationMenu(null);
  const startupSettings = readStartupSettings();
  let fallbackLoaded = false;

  const iconPath = path.join(app.getAppPath(), "assets/icons/arcane.ico");
  const windowIcon = fs.existsSync(iconPath) ? iconPath : undefined;
  if (!windowIcon) {
    reportMainError("icon-missing", new Error(`Window icon not found at ${iconPath}`));
  }

  const win = new BrowserWindow({
    icon: windowIcon,
    title: "ArcaneGaunt",
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: "#0a0a12",
    autoHideMenuBar: true,
    show: false,
    fullscreen: !!startupSettings.display?.fullscreen,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    if (fallbackLoaded) return;
    fallbackLoaded = true;
    const err = new Error(`${errorCode}: ${errorDescription}`);
    err.url = validatedURL;
    const entry = reportMainError("window-load", err);
    showWindowFallback(
      win,
      "ArcaneGaunt failed to load",
      `The app shell could not load the game files. Local log: ${logFileForKind("main")}`,
      `${entry.message}\n${entry.stack || ""}`,
    );
  });

  win.webContents.on("render-process-gone", (_event, details) => {
    const err = new Error(`Renderer process ${details.reason || "exited"} (${details.exitCode ?? "unknown"})`);
    const entry = reportMainError("renderer-process-gone", err);
    showWindowFallback(
      win,
      "ArcaneGaunt renderer stopped",
      `The game process stopped unexpectedly. Local log: ${logFileForKind("main")}`,
      `${entry.message}\n${entry.stack || ""}`,
    );
  });

  if (process.env.ARCANEGAUNT_DEVTOOLS === "1") {
    win.webContents.openDevTools({ mode: "detach" });
  }

  win.loadURL(`${APP_PROTOCOL}://game/index.html`);
}

process.on("uncaughtException", (err) => {
  reportMainError("uncaught-exception", err, true);
});

process.on("unhandledRejection", (reason) => {
  reportMainError("unhandled-rejection", reason instanceof Error ? reason : new Error(String(reason)));
});

app.whenReady().then(() => {
  try {
    registerAppProtocol();
    registerStorageIpc();
    createWindow();
  } catch (err) {
    reportMainError("startup", err, true);
    app.quit();
    return;
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      try {
        createWindow();
      } catch (err) {
        reportMainError("activate-window", err, true);
      }
    }
  });
}).catch((err) => {
  reportMainError("app-ready", err, true);
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
