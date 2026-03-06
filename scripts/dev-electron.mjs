import electronPath from "electron";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.VITE_PORT ?? "5173");
const devUrl = `http://127.0.0.1:${port}`;
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const spawnChild = (command, args, options = {}) =>
  spawn(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    ...options
  });

const stopChild = (child) => {
  if (!child || child.killed) return;

  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    return;
  }

  child.kill("SIGTERM");
};

const runDesktopBuild = () =>
  new Promise((resolve, reject) => {
    const child = spawnChild(npmCommand, ["run", "build:desktop"], {
      shell: process.platform === "win32"
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Desktop build failed with exit code ${code ?? "unknown"}.`));
    });
  });

const waitForPort = (targetPort, timeoutMs = 30000) =>
  new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const tryConnect = () => {
      const socket = net.createConnection({ host: "127.0.0.1", port: targetPort });

      socket.once("connect", () => {
        socket.end();
        resolve();
      });

      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Vite dev server did not start on port ${targetPort}.`));
          return;
        }

        setTimeout(tryConnect, 300);
      });
    };

    tryConnect();
  });

let viteProcess;
let electronProcess;

const shutdown = (exitCode = 0) => {
  stopChild(electronProcess);
  stopChild(viteProcess);
  process.exit(exitCode);
};

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

await runDesktopBuild();

viteProcess = spawnChild(
  npmCommand,
  ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port)],
  {
    shell: process.platform === "win32"
  }
);

viteProcess.on("exit", (code) => {
  if (code === 0) {
    shutdown(0);
    return;
  }

  shutdown(code ?? 1);
});

await waitForPort(port);

electronProcess = spawnChild(electronPath, ["."], {
  env: {
    ...process.env,
    ELECTRON_RENDERER_URL: devUrl
  }
});

electronProcess.on("exit", (code) => {
  stopChild(viteProcess);
  process.exit(code ?? 0);
});
