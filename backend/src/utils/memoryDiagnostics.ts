/**
 * Vion — Memory Diagnostics & Observability
 *
 * Provides structured, zero-overhead memory telemetry tailored for Render's
 * 512MB free-tier container environment.
 */

export interface MemorySnapshot {
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  externalMb: number;
  arrayBuffersMb: number;
  activeTranscodes: number;
  timestamp: string;
}

let activeTranscodesCount = 0;

export function incrementActiveTranscodes(): void {
  activeTranscodesCount++;
}

export function decrementActiveTranscodes(): void {
  activeTranscodesCount = Math.max(0, activeTranscodesCount - 1);
}

export function getActiveTranscodesCount(): number {
  return activeTranscodesCount;
}

/**
 * Returns a clean, high-precision memory snapshot in megabytes.
 */
export function getMemorySnapshot(): MemorySnapshot {
  const mem = process.memoryUsage();
  return {
    rssMb: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
    heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
    heapTotalMb: Math.round((mem.heapTotal / 1024 / 1024) * 10) / 10,
    externalMb: Math.round((mem.external / 1024 / 1024) * 10) / 10,
    arrayBuffersMb: Math.round(((mem as any).arrayBuffers || 0) / 1024 / 1024 * 10) / 10,
    activeTranscodes: activeTranscodesCount,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Logs a structured memory diagnostic line with context and optional attributes.
 */
export function logMemoryUsage(context: string, extra?: Record<string, any>): MemorySnapshot {
  const snapshot = getMemorySnapshot();
  const extraStr = extra ? ` | ${JSON.stringify(extra)}` : "";
  console.info(
    `[Memory Diagnostics] [${context}] RSS: ${snapshot.rssMb}MB | Heap: ${snapshot.heapUsedMb}/${snapshot.heapTotalMb}MB | Ext: ${snapshot.externalMb}MB | ActiveJobs: ${snapshot.activeTranscodes}${extraStr}`,
  );

  // Safety threshold warning: 380MB represents ~74% of Render's 512MB limit
  if (snapshot.rssMb > 380) {
    console.warn(
      `[Memory Alert] Process RSS has reached ${snapshot.rssMb}MB! Approaching Render 512MB container limit.`,
    );
  }

  return snapshot;
}

/**
 * Explicitly triggers garbage collection in Bun or Node.js (if exposed)
 * to reclaim native memory and ArrayBuffers after heavy operations.
 */
export function triggerGarbageCollection(): void {
  try {
    if (typeof (globalThis as any).Bun?.gc === "function") {
      (globalThis as any).Bun.gc(true);
    } else if (typeof globalThis.gc === "function") {
      globalThis.gc();
    }
  } catch {
    // Non-fatal if GC invocation is unavailable
  }
}

let periodicTimer: NodeJS.Timeout | null = null;

/**
 * Starts periodic background memory logging every intervalMs (default: 60s).
 */
export function startPeriodicMemoryDiagnostics(intervalMs = 60000): void {
  if (periodicTimer) return;
  periodicTimer = setInterval(() => {
    logMemoryUsage("heartbeat");
  }, intervalMs);
  periodicTimer.unref();
}

/**
 * Stops periodic memory diagnostics timer.
 */
export function stopPeriodicMemoryDiagnostics(): void {
  if (periodicTimer) {
    clearInterval(periodicTimer);
    periodicTimer = null;
  }
}
