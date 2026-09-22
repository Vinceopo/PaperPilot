/**
 * Starts FastAPI (port 8000) + Vite together so `npm run dev` always brings the API up.
 * Usage: from `web/` → `npm run dev`  |  from project root → `npm run dev`
 */
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const apiDir = path.join(root, "api");
const webDir = path.join(root, "web");
const API_PORT = 8000;
const WEB_PORT = 5173;
const BIND_HOST = process.env.PAPERPILOT_HOST || "0.0.0.0";

function localLanIps() {
  try {
    const nets = os.networkInterfaces();
    const ips = [];
    for (const entries of Object.values(nets || {})) {
      for (const entry of entries || []) {
        if (entry.family !== "IPv4" || entry.internal) continue;
        ips.push(entry.address);
      }
    }
    return ips;
  } catch {
    return [];
  }
}

function resolvePython() {
  const candidates = [
    path.join(root, ".venv", "Scripts", "python.exe"),
    path.join(root, ".venv", "bin", "python"),
    path.join(apiDir, ".venv", "Scripts", "python.exe"),
    path.join(apiDir, ".venv", "bin", "python"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return process.platform === "win32" ? "python" : "python3";
}

function portOpen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
}

function apiHealthy(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port: API_PORT, path: "/health", timeout: timeoutMs },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });
}

function freePortWindows(port) {
  try {
    const out = execFileSync("netstat", ["-ano"], { encoding: "utf8" });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes(`:${port}`) || !/\sLISTEN/i.test(line)) continue;
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (/^\d+$/.test(pid) && pid !== "0") pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execFileSync("taskkill", ["/PID", pid, "/T", "/F"], { stdio: "ignore" });
        console.log(`[dev] freed port ${port} (killed pid ${pid})`);
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
}

function freePortUnix(port) {
  try {
    const out = execFileSync("lsof", ["-ti", `tcp:${port}`], { encoding: "utf8" });
    for (const pid of out.split(/\s+/).filter(Boolean)) {
      try {
        process.kill(Number(pid), "SIGTERM");
        console.log(`[dev] freed port ${port} (killed pid ${pid})`);
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
}

async function ensurePortFree(port) {
  if (!(await portOpen(port))) return;
  console.log(`[dev] port ${port} is busy — clearing leftover process…`);
  if (process.platform === "win32") freePortWindows(port);
  else freePortUnix(port);
  await new Promise((r) => setTimeout(r, 800));
}

function run(command, args, cwd, name, { shell = false, autoRestart = false } = {}) {
  let child;
  let stopping = false;
  let restartTimer = null;
  let restartAttempts = 0;

  function start() {
    child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell,
      env: { ...process.env },
    });
    child.on("error", (err) => {
      console.error(`[${name}] failed to start:`, err.message);
    });
    child.on("exit", (code, signal) => {
      if (stopping) return;
      if (signal) {
        console.log(`[${name}] stopped (${signal})`);
        return;
      }
      if (code && code !== 0) {
        console.error(`[${name}] exited with code ${code}`);
      }
      if (!autoRestart) return;

      // Successful start resets the counter next time via exit code 0 without restart need.
      // Only count failed exits toward the limit.
      if (code === 0) {
        restartAttempts = 0;
        return;
      }

      restartAttempts += 1;
      if (restartAttempts > 8) {
        console.error(
          `[${name}] gave up after ${restartAttempts} failed restarts — stop other "npm run dev" sessions and try again`
        );
        return;
      }

      console.log(`[${name}] restarting in 2 s…`);
      clearTimeout(restartTimer);
      restartTimer = setTimeout(async () => {
        // Another Vite/dev instance often still owns 5173 after a crash.
        if (name === "web") {
          try {
            await ensurePortFree(WEB_PORT);
          } catch {
            // ignore
          }
        }
        start();
      }, 2000);
    });
  }

  start();

  return {
    get killed() {
      return child?.killed ?? true;
    },
    kill(sig) {
      stopping = true;
      clearTimeout(restartTimer);
      child?.kill(sig);
    },
  };
}

async function waitForApi(maxMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (await apiHealthy()) {
      console.log(`[api] ready on http://127.0.0.1:${API_PORT} (bound ${BIND_HOST})`);
      return true;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  console.error("[api] did not become healthy in time — Vite will still start");
  return false;
}

function readEnvFileValue(filePath, key) {
  try {
    const text = fs.readFileSync(filePath, "utf8");
    const match = text.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+)\\s*$`, "m"));
    if (match) return match[1].trim().replace(/^["']|["']$/g, "");
  } catch {
    // ignore
  }
  return "";
}

function readViteApiUrl() {
  if (process.env.VITE_API_URL) return process.env.VITE_API_URL.trim();
  return readEnvFileValue(path.join(webDir, ".env"), "VITE_API_URL") || "/api";
}

function readProxyTarget() {
  if (process.env.VITE_API_PROXY_TARGET) return process.env.VITE_API_PROXY_TARGET.trim();
  return readEnvFileValue(path.join(webDir, ".env"), "VITE_API_PROXY_TARGET");
}

function usesRemoteApi(apiUrl, proxyTarget) {
  if (/^https?:\/\//i.test(apiUrl || "")) return true;
  // Only treat as remote when the proxy itself is https (explicit opt-in).
  // Default local proxy http://127.0.0.1:8000 always starts uvicorn.
  return /^https:\/\//i.test(proxyTarget || "");
}

function printAccessUrls(apiUrl, remote, proxyTarget) {
  const lan = localLanIps();
  console.log("");
  console.log("[dev] Open PaperPilot:");
  console.log(`  Local:   http://127.0.0.1:${WEB_PORT}`);
  for (const ip of lan) {
    console.log(`  Network: http://${ip}:${WEB_PORT}`);
  }
  if (remote) {
    const target = /^https?:\/\//i.test(apiUrl || "") ? apiUrl : proxyTarget || apiUrl;
    console.log(`  API:     ${target} (remote — local uvicorn not started)`);
  } else {
    console.log(`  API:     http://127.0.0.1:${API_PORT}`);
    for (const ip of lan) {
      console.log(`  API LAN: http://${ip}:${API_PORT}`);
    }
  }
  console.log("");
}

const children = [];

function shutdown() {
  for (const child of children) {
    if (!child.killed) {
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
    }
  }
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});
process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});

const python = resolvePython();
const apiUrl = readViteApiUrl();
const proxyTarget = readProxyTarget();
const remoteApi = usesRemoteApi(apiUrl, proxyTarget);

if (remoteApi) {
  const target = /^https?:\/\//i.test(apiUrl) ? apiUrl : proxyTarget || apiUrl;
  console.log(`[api] using remote API: ${target}`);
  console.log("[api] skipping local uvicorn (set VITE_API_PROXY_TARGET=http://127.0.0.1:8000 to run API locally)");
} else {
  if (!fs.existsSync(path.join(root, ".venv")) && python === (process.platform === "win32" ? "python" : "python3")) {
    console.warn("[api] No .venv found — using system Python. Prefer creating PaperPilot-main/.venv");
  }
  await ensurePortFree(API_PORT);
  console.log(`[api] starting with ${python} on ${BIND_HOST}:${API_PORT}`);
  children.push(
    run(
      python,
      ["-m", "uvicorn", "app.main:app", "--reload", "--host", BIND_HOST, "--port", String(API_PORT)],
      apiDir,
      "api",
      { autoRestart: true }
    )
  );
  await waitForApi();
}

if (await portOpen(WEB_PORT)) {
  await ensurePortFree(WEB_PORT);
}

printAccessUrls(apiUrl, remoteApi, proxyTarget);
console.log("[web] starting Vite");
children.push(run("npm", ["run", "web"], webDir, "web", { shell: true, autoRestart: true }));

if (remoteApi) {
  // Keep this process alive while only Vite is managed.
  setInterval(() => {}, 1 << 30);
}