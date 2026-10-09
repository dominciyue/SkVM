export type PreparationPhase = "walk" | "load" | "lexical" | "ast" | "postprocess" | "complete"
export interface PreparationProgress {
  phase: PreparationPhase; state: "started" | "progress" | "completed" | "failed" | "cancelled";
  elapsedMs: number; currentPath: string | null; completedFiles: number; totalFiles: number; bytes: number;
  durationMs?: number; detail?: string; error?: string
}
export interface SourcePreparationOptions {
  signal?: AbortSignal; timeoutMs?: number; onProgress?: (event: PreparationProgress) => void
}
export function sourcePreparation(options: SourcePreparationOptions = {}) {
  if (options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1)) throw new Error("Invalid preparation timeout")
  const started = performance.now(), events: PreparationProgress[] = []
  let phase: PreparationPhase = "walk", currentPath: string | null = null, completedFiles = 0, totalFiles = 0, bytes = 0, completed = false
  const emit = (state: PreparationProgress["state"], extra: Partial<PreparationProgress> = {}) => {
    const event = { phase, state, elapsedMs: performance.now() - started, currentPath, completedFiles, totalFiles, bytes, ...extra }
    events.push(event); options.onProgress?.(event)
  }
  const check = () => {
    if (options.signal?.aborted) throw new Error("Source preparation cancelled")
    if (!completed && options.timeoutMs !== undefined && performance.now() - started >= options.timeoutMs) throw new Error("Source preparation cancelled: deadline exceeded")
  }
  return {
    events, check,
    start(next: PreparationPhase, file: string | null = null) { check(); phase = next; currentPath = file; emit("started") },
    progress(extra: Partial<PreparationProgress> = {}) { check(); if (completed) return; if (extra.currentPath !== undefined) currentPath = extra.currentPath; if (extra.completedFiles !== undefined) completedFiles = extra.completedFiles; if (extra.totalFiles !== undefined) totalFiles = extra.totalFiles; if (extra.bytes !== undefined) bytes = extra.bytes; emit("progress", extra) },
    end(extra: Partial<PreparationProgress> = {}) { emit("completed", extra); check() },
    fail(error: unknown) { const message = error instanceof Error ? error.message : String(error); emit(/cancelled/.test(message) ? "cancelled" : "failed", { error: message, ...(error && typeof error === "object" && "ownedWorkerExited" in error ? { detail: "owned-worker-exited" } : {}) }) },
    complete() { check(); completed = true; phase = "complete"; currentPath = null; emit("completed") },
  }
}
