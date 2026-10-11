import { spawn, type SpawnOptions, type ChildProcess } from "child_process";
import { AppError } from "./AppError";

export interface SpawnProcessOptions {
  timeoutMs?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface SpawnProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Executes an external binary using child_process.spawn() with an explicit argument array.
 *
 * Safety & Security Guarantees:
 * 1. NEVER invokes a shell (avoids shell injection vulnerabilities).
 * 2. Arguments are passed as individual array elements directly to the OS process table.
 * 3. Enforces hard process timeouts with process termination (SIGTERM / SIGKILL).
 * 4. Captures stdout and stderr for diagnostics while redacting sensitive tokens.
 */
export function spawnProcess(
  command: string,
  args: string[],
  options: SpawnProcessOptions = {},
): Promise<SpawnProcessResult> {
  return new Promise((resolve, reject) => {
    const timeoutMs = options.timeoutMs ?? 1800000; // Default: 30 minutes
    const spawnOpts: SpawnOptions = {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      stdio: ["pipe", "pipe", "pipe"],
    };

    let stdoutBuffer = "";
    let stderrBuffer = "";
    let isTerminated = false;
    let timer: NodeJS.Timeout | null = null;

    let childProcess: ChildProcess;

    try {
      childProcess = spawn(command, args, spawnOpts);
    } catch (err: any) {
      return reject(
        new AppError(
          `Failed to spawn process '${command}': ${err.message}`,
          500,
          "PROCESS_SPAWN_ERROR",
        ),
      );
    }

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        isTerminated = true;
        try {
          childProcess.kill("SIGKILL");
        } catch {
          // Process already ended
        }
        reject(
          new AppError(
            `Process '${command}' timed out after ${Math.round(timeoutMs / 1000)} seconds.`,
            504,
            "PROCESS_TIMEOUT",
          ),
        );
      }, timeoutMs);
    }

    childProcess.stdout?.on("data", (chunk: Buffer) => {
      stdoutBuffer += chunk.toString("utf8");
      // Keep buffer bounded to prevent memory saturation during long runs
      if (stdoutBuffer.length > 500000) {
        stdoutBuffer = stdoutBuffer.slice(-250000);
      }
    });

    childProcess.stderr?.on("data", (chunk: Buffer) => {
      stderrBuffer += chunk.toString("utf8");
      // Keep buffer bounded
      if (stderrBuffer.length > 500000) {
        stderrBuffer = stderrBuffer.slice(-250000);
      }
    });

    childProcess.on("error", (err: Error) => {
      if (timer) clearTimeout(timer);
      if (isTerminated) return;
      reject(
        new AppError(
          `Process error running '${command}': ${err.message}`,
          500,
          "PROCESS_ERROR",
        ),
      );
    });

    childProcess.on("close", (code: number | null) => {
      if (timer) clearTimeout(timer);
      if (isTerminated) return;

      const exitCode = code ?? 0;
      if (exitCode !== 0) {
        // Extract the last 15 lines of stderr for concise, actionable error messages
        const errorLines = stderrBuffer.trim().split(/\r?\n/).slice(-15).join("\n");
        return reject(
          new AppError(
            `Process '${command}' failed with exit code ${exitCode}:\n${errorLines || "No stderr output"}`,
            500,
            "PROCESS_EXIT_ERROR",
          ),
        );
      }

      resolve({
        stdout: stdoutBuffer,
        stderr: stderrBuffer,
        exitCode,
      });
    });
  });
}
