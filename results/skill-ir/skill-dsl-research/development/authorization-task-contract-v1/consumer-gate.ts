import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"

type MaterialReport = { gaps: unknown; included: unknown }

export function sameSharedMaterial(actual: MaterialReport, shared: MaterialReport): boolean {
  return Array.isArray(actual.gaps) && Array.isArray(shared.gaps) && Array.isArray(actual.included) && Array.isArray(shared.included)
    && isDeepStrictEqual(actual.gaps, shared.gaps) && isDeepStrictEqual(actual.included, shared.included)
}

async function exists(file: string): Promise<boolean> {
  try { await access(file); return true } catch { return false }
}

export async function consumerClaimState(directory: string): Promise<"new" | "pre-dispatch" | "completion-unknown" | "terminal"> {
  const claimed = await exists(path.join(directory, "claim.json"))
  const terminal = await exists(path.join(directory, "report.json"))
  if (!claimed) {
    if (terminal) throw new Error(`Consumer report without claim: ${directory}`)
    return "new"
  }
  if (terminal) return "terminal"
  return await exists(path.join(directory, "dispatch-claim.json")) ? "completion-unknown" : "pre-dispatch"
}

export async function readOrCreateOfflineRecord<T>(archive: string, run: () => Promise<T>): Promise<T> {
  if (await exists(archive)) return JSON.parse(await readFile(archive, "utf8")) as T
  const value = await run()
  await mkdir(path.dirname(archive), { recursive: true })
  await writeFile(archive, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
  return value
}
