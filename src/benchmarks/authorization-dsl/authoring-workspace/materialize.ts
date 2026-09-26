import { lstat, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { loadLocalAuthorizationInputValue } from "../local-input.ts"
import { planAuthorizationWorkspace, type AuthorizationWorkspacePlan } from "./plan.ts"

export type AuthorizationWorkspaceMaterialization = Omit<AuthorizationWorkspacePlan, "status"> & { status: "created" | "invalid" }

/** Publish a complete new directory. Windows directory rename refuses even an empty existing target. */
export async function materializeAuthorizationWorkspace(workspaceFile: string, outDir: string): Promise<AuthorizationWorkspaceMaterialization> {
  const plan = await planAuthorizationWorkspace(workspaceFile, outDir)
  const result: AuthorizationWorkspaceMaterialization = { ...plan, status: "invalid" }
  if (plan.status !== "valid") return result
  if (process.platform !== "win32") {
    result.diagnostics.push({ code: "workspace-publication-unsupported", field: "$out", message: "Atomic non-overwriting directory publication is currently implemented for Windows only. Read-only planning is available on other platforms." })
    return result
  }
  let staging: string | undefined, identity: Awaited<ReturnType<typeof lstat>> | undefined, published = false
  try {
    const parent = await realpath(path.dirname(plan.outDir))
    staging = await mkdtemp(path.join(parent, ".authorization-compose-"))
    identity = await lstat(staging)
    if (path.dirname(staging) !== parent || !identity.isDirectory() || identity.isSymbolicLink()) throw new Error("Invalid owned staging directory.")
    for (const variant of plan.variants) {
      await writeFile(path.join(staging, path.basename(variant.inputPath)), `${JSON.stringify(variant.input, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
      await writeFile(path.join(staging, path.basename(variant.provenancePath)), `${JSON.stringify(variant.provenance, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
    }
    // Check the bytes we will publish using their final coordinates, not the temporary directory's.
    for (const variant of plan.variants) {
      const value = JSON.parse(await readFile(path.join(staging, path.basename(variant.inputPath)), "utf8"))
      const checked = await loadLocalAuthorizationInputValue(value, variant.inputPath)
      if (checked.status === "invalid") result.diagnostics.push(...checked.diagnostics.map(d => ({ code: d.code, field: d.path ?? "$", message: d.message, variantId: variant.id, file: variant.inputPath })))
    }
    if (result.diagnostics.length) return result
    // No rmdir(out), no rename-over-empty fallback. This final primitive also rejects creation races.
    await rename(staging, plan.outDir)
    published = true
    result.status = "created"
  } catch (error) {
    result.diagnostics.push({ code: "workspace-publication-failed", field: "$out", file: plan.outDir, message: error instanceof Error ? error.message : String(error) })
  } finally {
    if (staging && identity && !published) {
      try {
        const current = await lstat(staging)
        if (!current.isDirectory() || current.isSymbolicLink() || current.ino !== identity.ino || current.dev !== identity.dev) throw new Error("Staging identity changed; refusing cleanup of a path no longer owned by this invocation.")
        await rm(staging, { recursive: true, force: false })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") result.diagnostics.push({ code: "workspace-cleanup-failed", field: "$staging", file: staging, message: error instanceof Error ? error.message : String(error) })
      }
    }
  }
  return result
}
