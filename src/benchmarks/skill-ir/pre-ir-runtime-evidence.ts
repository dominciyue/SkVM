import type { RawAgentRunRow } from "./scoring.ts"

export function hasBunRuntimeCrash(stderr: string): boolean {
  const normalized = stderr.toLowerCase()
  return normalized.includes("panic(main thread): internal assertion failure")
    || normalized.includes("bun has crashed")
}

export function normalizePreIrRuntimeFailure(row: RawAgentRunRow): RawAgentRunRow {
  if (row.exitCode === 0 || !hasBunRuntimeCrash(row.stderr)) return row
  return { ...row, runStatus: "adapter-crashed" }
}
