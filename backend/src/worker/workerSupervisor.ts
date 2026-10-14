import { spawn, type ChildProcess } from "child_process";
import path from "path";
import { isRedisConfigured, ENABLE_WORKER } from "../config/config";

let workerProcess: ChildProcess | null = null;
let isShuttingDown = false;
let restartAttempts = 0;
let lastRestartTimestamp = Date.now();

/**
 * Starts and supervises a dedicated background transcoding worker process
 * inside the same container as the Express API server.
 *
 * Architecture & Zero-Budget Advantages:
 * 1. Process Isolation: Runs in a dedicated child OS process, so heavy FFmpeg operations
 *    or worker garbage collection NEVER block the Express HTTP event loop.
 * 2. High Availability & Supervision: If the worker process exits or is killed by OS (e.g. temporary OOM),
 *    the supervisor automatically restarts it with exponential backoff while the API stays 100% up.
 * 3. Graceful Lifecycle Coordination: When Render sends SIGTERM to the container,
 *    the supervisor forwards SIGTERM to the worker child process, allowing in-flight jobs to finalize.
 */
export function startWorkerSupervisor(): void {
  if (process.env.IS_SUPERVISED_WORKER === "true") {
    // Child worker process itself must never start another supervisor
    return;
  }

  if (!ENABLE_WORKER || process.env.ENABLE_WORKER === "false") {
    console.info("[Supervisor] Embedded worker is disabled (ENABLE_WORKER=false).");
    return;
  }

  if (!isRedisConfigured()) {
    console.info("[Supervisor] Redis is not configured; skipping background worker process spawn.");
    return;
  }

  isShuttingDown = false;
  spawnWorkerProcess();
}

function spawnWorkerProcess(): void {
  if (isShuttingDown) return;

  const workerScript = path.resolve(__dirname, "index.ts");
  const execPath = process.execPath;
  const isBun = typeof (process.versions as any)?.bun !== "undefined";
  const runArgs = isBun ? ["run", workerScript] : [workerScript];

  console.info(`[Supervisor] Launching dedicated worker child process (${execPath} ${runArgs.join(" ")})...`);

  try {
    workerProcess = spawn(execPath, runArgs, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        IS_SUPERVISED_WORKER: "true",
      },
      stdio: ["ignore", "inherit", "inherit"],
    });

    const pid = workerProcess.pid;
    console.info(`[Supervisor] Dedicated worker child process running with PID ${pid}.`);

    workerProcess.on("error", (err) => {
      console.error(`[Supervisor Error] Worker child process spawn error: ${err.message}`);
    });

    workerProcess.on("exit", (code, signal) => {
      console.warn(
        `[Supervisor] Worker child process (PID ${pid}) terminated with code ${code}, signal ${signal}.`,
      );
      workerProcess = null;

      if (isShuttingDown) return;

      // Handle unexpected crash: restart with bounded backoff
      const now = Date.now();
      if (now - lastRestartTimestamp > 60000) {
        restartAttempts = 0; // Reset counter if last crash was over a minute ago
      }
      lastRestartTimestamp = now;
      restartAttempts++;

      if (restartAttempts > 5) {
        console.error(
          "[Supervisor Error] Worker child process crashed 5 times within 60s. Halting auto-restart to prevent flapping.",
        );
        return;
      }

      const delayMs = Math.min(restartAttempts * 2000, 10000);
      console.info(`[Supervisor] Scheduling worker process restart in ${delayMs / 1000}s (attempt ${restartAttempts}/5)...`);

      setTimeout(() => {
        if (!isShuttingDown) {
          spawnWorkerProcess();
        }
      }, delayMs).unref();
    });
  } catch (err: any) {
    console.error(`[Supervisor Fatal] Failed to spawn worker process: ${err.message}`);
  }
}

/**
 * Gracefully terminates the worker child process upon container shutdown.
 */
export async function stopWorkerSupervisor(timeoutMs = 12000): Promise<void> {
  isShuttingDown = true;
  if (!workerProcess) return;

  const proc = workerProcess;
  console.info(`[Supervisor] Relaying SIGTERM to worker child process (PID ${proc.pid})...`);

  return new Promise<void>((resolve) => {
    let resolved = false;

    const forceKillTimer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.warn("[Supervisor Warning] Worker child process did not exit within timeout. Forcing SIGKILL...");
        try {
          proc.kill("SIGKILL");
        } catch {
          // Process already ended
        }
        resolve();
      }
    }, timeoutMs);

    proc.on("exit", () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(forceKillTimer);
        console.info("[Supervisor] Worker child process shut down cleanly.");
        resolve();
      }
    });

    try {
      proc.kill("SIGTERM");
    } catch {
      if (!resolved) {
        resolved = true;
        clearTimeout(forceKillTimer);
        resolve();
      }
    }
  });
}
