/**
 * Starts FastAPI (port 8000) + Vite together so `npm run dev` always brings the API up.
 * Usage: from `web/` → `npm run dev`  |  from project root → `npm run dev`
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const apiDir = path.join(root, "api");
const webDir = path.join(root, "web");

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

function run(command, args, cwd, name, { shell = false, autoRestart = false } = {}) {
  let child;
  let stopping = false;

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
      if (autoRestart) {
        console.log(`[${name}] restarting in 2 s…`);
        setTimeout(start, 2000);
      }
    });
  }

  start();

  // Return a proxy so shutdown() can still call .kill()
  return {
    get killed() { return child?.killed ?? true; },
    kill(sig) { stopping = true; child?.kill(sig); },
  };
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

// Always start the API under our watchdog so auto-restart works.
// If something is already listening on 8000 (a leftover process) we wait
// briefly and try again; the user can also kill it manually.
const apiAlreadyUp = await portOpen(8000);
if (apiAlreadyUp) {
  console.log("[api] port 8000 is in use — waiting 2 s for it to free up…");
  await new Promise((r) => setTimeout(r, 2000));
}

console.log(`[api] starting with ${python}`);
children.push(
  run(
    python,
    ["-m", "uvicorn", "app.main:app", "--reload", "--host", "127.0.0.1", "--port", "8000"],
    apiDir,
    "api",
    { autoRestart: true }
  )
);

console.log("[web] starting Vite");
children.push(run("npm", ["run", "web"], webDir, "web", { shell: true }));
