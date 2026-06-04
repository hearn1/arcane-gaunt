import { spawn, execSync } from "node:child_process";
import http from "node:http";
import { readFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SERVER_PORT = parseInt(process.env.ARCANE_SMOKE_PORT || "8000", 10);
const SCENARIO = process.argv[2] || process.env.ARCANE_SMOKE_SCENARIO || "all";
const TIMEOUT_MS = parseInt(process.env.ARCANE_SMOKE_TIMEOUT || "120000", 10);
const RESULT_FILE = resolve(__dirname, `.smoke-result-${SCENARIO.replace(/[^a-z0-9_-]/g, "_")}.json`);

const IS_WINDOWS = process.platform === "win32";

function log(msg) {
  console.log(`[test-runner] ${msg}`);
}

function err(msg) {
  console.error(`[test-runner] ERROR: ${msg}`);
}

// The Python server is tracked at module scope so it can be torn down from any
// exit path — the success path, the error path, and the process-level safety
// net handlers below.
let serverProc = null;

// Kill the dev server *and its children*, synchronously. The server is spawned
// with `shell: true`, so on Windows `serverProc.kill()` only signals the shell
// wrapper and leaves the real `python.exe` grandchild holding port 8000 — which
// breaks the next run. `taskkill /T` kills the whole process tree by pid. This
// must run synchronously (not via setTimeout) because callers `process.exit()`
// immediately afterward, which would cut off any deferred work.
function killServer() {
  if (!serverProc || serverProc.killed) return;
  const pid = serverProc.pid;
  serverProc = null;
  try {
    if (IS_WINDOWS) {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: "ignore" });
    } else {
      // On POSIX, kill the whole process group spawned via the shell wrapper.
      try { process.kill(-pid, "SIGTERM"); } catch { process.kill(pid, "SIGTERM"); }
    }
  } catch {
    // Already gone, or never fully started — nothing to clean up.
  }
}

// Safety net: tear the server down if the runner is interrupted (Ctrl+C) or
// exits through a path that didn't already call killServer().
process.on("exit", killServer);
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => {
    killServer();
    process.exit(1);
  });
}

function startPythonServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn("python", ["scripts/serve.py", String(SERVER_PORT)], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
      // Force unbuffered stdout so serve.py's "running: http://localhost..."
      // banner is flushed immediately; otherwise Python buffers it when stdout
      // is a pipe and the readiness probe below never sees it, failing with
      // "Python server did not start within 15s".
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });

    // Track at module scope right away so killServer() can reap the process
    // tree even if startup fails before this promise resolves.
    serverProc = proc;

    let started = false;
    const timeout = setTimeout(() => {
      if (!started) {
        killServer();
        reject(new Error("Python server did not start within 15s"));
      }
    }, 15000);

    proc.stdout.on("data", (data) => {
      const text = data.toString();
      if (!started && text.includes("localhost")) {
        started = true;
        clearTimeout(timeout);
        resolve(proc);
      }
    });

    proc.stderr.on("data", (data) => {
      const text = data.toString();
      if (!started && (text.includes("localhost") || text.includes("serving"))) {
        started = true;
        clearTimeout(timeout);
        resolve(proc);
      }
    });

    proc.on("exit", (code) => {
      if (!started) {
        clearTimeout(timeout);
        reject(new Error(`Python server exited with code ${code} before starting`));
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to start Python server: ${err.message}`));
    });
  });
}

function waitForServer(url, maxAttempts = 60) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      const req = http.get(url, (res) => {
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

async function findElectron() {
  const candidates = [
    resolve(ROOT, "node_modules", "electron", "dist", "electron.exe"),
    resolve(ROOT, "node_modules", ".bin", "electron"),
    resolve(ROOT, "node_modules", "electron", "cli.js"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  try {
    return execSync("npx electron --version", { cwd: ROOT, encoding: "utf8", stdio: "pipe" }) && "npx electron";
  } catch {
    return null;
  }
}

function runElectronTests() {
  // NOTE: the promise resolver is named `done` (not `resolve`) so it does not
  // shadow `resolve` imported from node:path used just below.
  return new Promise((done, reject) => {
    const electronPath = resolve(ROOT, "node_modules", "electron", "dist", "electron.exe");
    const testMain = resolve(__dirname, "electron-smoke.cjs");
    const env = {
      ...process.env,
      ARCANE_SMOKE_PORT: String(SERVER_PORT),
      ARCANE_SMOKE_SCENARIO: SCENARIO,
      ARCANE_SMOKE_RESULT_FILE: RESULT_FILE,
      ARCANE_SMOKE_TIMEOUT: String(TIMEOUT_MS),
    };

    log(`Launching Electron with scenario "${SCENARIO}"...`);
    const proc = spawn(electronPath, [testMain], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env,
      shell: true,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("exit", (code) => {
      log(`Electron exited with code ${code}`);
      if (stdout.trim()) {
        const lines = stdout.trim().split("\n").filter((l) => l.trim());
        for (const line of lines) {
          console.log(`  ${line}`);
        }
      }
      if (stderr.trim()) {
        const smokeLines = stderr.trim().split("\n").filter((l) => l.includes("[smoke]"));
        for (const line of smokeLines) {
          console.log(`  ${line}`);
        }
      }

      if (existsSync(RESULT_FILE)) {
        try {
          const data = JSON.parse(readFileSync(RESULT_FILE, "utf8"));
          done(data);
          return;
        } catch (e) {
          err(`Failed to parse result file: ${e.message}`);
        }
      }
      done({ status: "error", error: "No result file was produced", scenario: SCENARIO });
    });

    proc.on("error", (e) => {
      reject(new Error(`Failed to launch Electron: ${e.message}`));
    });
  });
}

function summarize(result) {
  if (!result) {
    return { passed: 0, failed: 1, total: 1, status: "error" };
  }

  const summary = { passed: 0, failed: 0, total: 0, status: result.status };
  const steps = [];

  if (result.scenarios) {
    summary.total = result.scenarios.length;
    for (const s of result.scenarios) {
      if (s.status === "passed") summary.passed++;
      else summary.failed++;
      steps.push({ scenario: s.scenario, status: s.status, error: s.error || null, steps: s.steps?.length || 0 });
    }
  } else if (result.steps) {
    summary.total = result.steps.length;
    for (const s of result.steps) {
      if (s.status === "passed") summary.passed++;
      else summary.failed++;
    }
    steps.push({ scenario: result.scenario, status: result.status, error: result.error || null, steps: result.steps.length });
  } else {
    summary.total = 1;
    if (result.status === "passed") summary.passed = 1;
    else summary.failed = 1;
  }

  return { summary, steps };
}

async function main() {
  log(`Smoke test runner — scenario: "${SCENARIO}", port: ${SERVER_PORT}, timeout: ${TIMEOUT_MS}ms`);
  log(`Root: ${ROOT}`);

  // Validate dependencies
  if (!existsSync(resolve(ROOT, "node_modules", "electron", "dist", "electron.exe"))) {
    err("Electron not found. Run 'npm install' first.");
    process.exit(1);
  }

  try {
    // Start Python dev server (assigns module-level serverProc)
    log("Starting Python dev server...");
    await startPythonServer();
    log("Python dev server started.");

    // Wait for server to be ready
    await waitForServer(`http://localhost:${SERVER_PORT}/index.html`);
    log("Dev server is accepting requests.");

    // Run smoke tests via Electron
    const result = await runElectronTests();
    const { summary, steps } = summarize(result);

    log("");
    log("=".repeat(50));
    log("SMOKE TEST RESULTS");
    log("=".repeat(50));
    log(`  Status:   ${summary.status === "passed" ? "PASSED" : "FAILED"}`);
    log(`  Passed:   ${summary.passed}`);
    log(`  Failed:   ${summary.failed}`);
    log(`  Total:    ${summary.total}`);
    log("=".repeat(50));

    if (steps.length > 0) {
      log("");
      log("Details:");
      for (const step of steps) {
        const icon = step.status === "passed" ? "OK" : "!!";
        log(`  [${icon}] ${step.scenario} — ${step.status}${step.error ? `: ${step.error}` : ""}`);
      }
    }

    // Tear the server (and its child python.exe) down synchronously *before*
    // exiting — a deferred setTimeout would be cut off by process.exit and
    // orphan the server, leaving port 8000 bound for the next run.
    cleanup();
    process.exit(summary.failed > 0 ? 1 : 0);
  } catch (e) {
    err(`Test run failed: ${e.message}`);
    cleanup();
    process.exit(1);
  }
}

function cleanup() {
  killServer();
  if (existsSync(RESULT_FILE)) {
    try { unlinkSync(RESULT_FILE); } catch {}
  }
}

main();
