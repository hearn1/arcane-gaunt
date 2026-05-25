const LOG_SCHEMA_VERSION = 1;
const MAX_TEXT_LENGTH = 12000;

let handlersInstalled = false;
let fatalShown = false;

function trimText(value, max = MAX_TEXT_LENGTH) {
  const text = String(value ?? "");
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n...[truncated]`;
}

function errorName(reason) {
  return trimText(reason?.name || reason?.constructor?.name || "Error", 120);
}

function errorMessage(reason) {
  if (reason instanceof Error) return trimText(reason.message || reason.name || "Unknown error");
  if (typeof reason === "string") return trimText(reason);
  try {
    return trimText(JSON.stringify(reason));
  } catch {
    return trimText(String(reason));
  }
}

function errorStack(reason) {
  if (reason?.stack) return trimText(reason.stack);
  return "";
}

function safeContext(context = {}) {
  try {
    return JSON.parse(JSON.stringify(context));
  } catch {
    return { note: "Context was not serializable." };
  }
}

export function makeLogEntry(reason, source = "renderer", context = {}) {
  return {
    version: LOG_SCHEMA_VERSION,
    timestamp: new Date().toISOString(),
    level: "error",
    source: trimText(source, 120),
    name: errorName(reason),
    message: errorMessage(reason),
    stack: errorStack(reason),
    href: trimText(globalThis.location?.href || "", 500),
    userAgent: trimText(globalThis.navigator?.userAgent || "", 500),
    context: safeContext(context),
  };
}

async function writeLogEntry(entry) {
  const bridge = globalThis.arcaneLog;
  if (!bridge?.write) return false;
  try {
    return !!(await bridge.write(entry));
  } catch {
    return false;
  }
}

export function reportError(reason, source = "renderer", context = {}) {
  const entry = makeLogEntry(reason, source, context);
  console.error(`[ArcaneGaunt:${entry.source}]`, reason);
  writeLogEntry(entry);
  return entry;
}

function addText(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = text;
  return el;
}

async function attachLogHint(container) {
  const hint = addText(
    "div",
    "fatal-log",
    "Details were written to the local log when file logging is available.",
  );
  container.appendChild(hint);

  const bridge = globalThis.arcaneLog;
  if (!bridge?.meta) return;
  try {
    const meta = await bridge.meta();
    if (meta?.rendererLogPath) {
      hint.textContent = `Local log: ${meta.rendererLogPath}`;
    }
  } catch {
    // The visible fallback is already present; logging metadata is optional.
  }
}

export function showFatalError(reason, title = "ArcaneGaunt hit an error") {
  const root = document.getElementById("ui-root");
  if (!root) return;

  const hud = document.getElementById("hud");
  const crosshair = document.getElementById("crosshair");
  hud?.classList.remove("active");
  crosshair?.classList.remove("active");

  root.classList.remove("hidden");
  root.innerHTML = "";

  const panel = document.createElement("div");
  panel.className = "fatal-panel";
  panel.appendChild(addText("h1", "fatal-title", title));
  panel.appendChild(addText(
    "div",
    "fatal-copy",
    "The game could not continue cleanly. Restart ArcaneGaunt and use the local log below when debugging.",
  ));
  panel.appendChild(addText("pre", "fatal-pre", errorStack(reason) || errorMessage(reason)));
  root.appendChild(panel);
  attachLogHint(panel);
}

export function reportFatal(reason, source = "fatal", context = {}) {
  const entry = reportError(reason, source, context);
  if (!fatalShown) {
    fatalShown = true;
    showFatalError(reason);
  }
  return entry;
}

export function installGlobalErrorHandlers() {
  if (handlersInstalled) return;
  handlersInstalled = true;

  globalThis.addEventListener("error", (event) => {
    const reason = event.error || event.message || "Unknown window error";
    reportFatal(reason, "window-error", {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  globalThis.addEventListener("unhandledrejection", (event) => {
    reportFatal(event.reason || "Unhandled promise rejection", "unhandled-rejection");
  });
}
