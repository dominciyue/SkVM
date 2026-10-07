import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"

const api = await import("./changes.ts").catch(() => ({} as any))
test("named change registrations have separate paths and reject escaping names", () => {
  expect(typeof api.changeRegistrationPaths).toBe("function")
  const root = path.resolve("anonymous-study")
  expect(api.changeRegistrationPaths(root)).toEqual({ inputDirectory: path.join(root, "model/inputs"), registrationFile: path.join(root, "model/change-registration.json") })
  expect(api.changeRegistrationPaths(root, "material-reactivation")).toEqual({ inputDirectory: path.join(root, "model/inputs/material-reactivation"), registrationFile: path.join(root, "model/change-registrations/material-reactivation.json") })
  expect(() => api.changeRegistrationPaths(root, "../original")).toThrow("registration")
})
test("a named current-tree comparison never selects or overwrites the frozen original registration", async () => {
  expect(typeof api.resolveChangeRun).toBe("function")
  const root = await mkdtemp(path.join(os.tmpdir(), "ax-change-registration-")), sha = (value: string) => createHash("sha256").update(value).digest("hex")
  try {
    const original = api.changeRegistrationPaths(root), current = api.changeRegistrationPaths(root, "material-reactivation")
    await mkdir(original.inputDirectory, { recursive: true }); await mkdir(current.inputDirectory, { recursive: true }); await mkdir(path.dirname(current.registrationFile), { recursive: true })
    const old = JSON.stringify({ schemaVersion: "authorization-ax-changes/v1", runtimeTree: "old-tree", baselineAttemptId: "baseline/original", previousSessionPath: "old-session", qualityBasis: "material-only" }) + "\r\n"
    const input = "named current policy bytes\n"
    await writeFile(original.registrationFile, old, { flag: "wx" }); await writeFile(path.join(original.inputDirectory, "download-policy.json"), "frozen original", { flag: "wx" })
    await writeFile(current.registrationFile, JSON.stringify({ schemaVersion: "authorization-ax-changes/v1", registrationId: "material-reactivation", runtimeTree: "new-tree", baselineAttemptId: "baseline/material-reactivation", previousSessionPath: "new-session", qualityBasis: "material-only", inputSha256ByChange: { policy: sha(input) } }), { flag: "wx" })
    await writeFile(path.join(current.inputDirectory, "download-policy.json"), input, { flag: "wx" })
    await expect(api.resolveChangeRun(root, "change-download-policy-fresh", "new-tree")).rejects.toThrow("same baseline production tree")
    const fresh = await api.resolveChangeRun(root, "change-download-policy-fresh", "new-tree", "material-reactivation")
    expect(fresh.inputFile).toBe(path.join(current.inputDirectory, "download-policy.json"))
    expect(fresh.previous).toBeUndefined()
    expect(fresh.binding).toMatchObject({ change: "policy", changeArm: "fresh", baselineAttemptId: "baseline/material-reactivation", changeRegistrationId: "material-reactivation" })
    expect((await api.resolveChangeRun(root, "change-download-policy-previous", "new-tree", "material-reactivation")).previous).toBe("new-session")
    await expect(api.resolveChangeRun(root, "change-download-policy-previous", "old-tree", "material-reactivation")).rejects.toThrow("same baseline production tree")
    await writeFile(fresh.inputFile, "modified current bytes")
    await expect(api.resolveChangeRun(root, "change-download-policy-fresh", "new-tree", "material-reactivation")).rejects.toThrow("Registered changed input bytes")
    expect(await readFile(original.registrationFile, "utf8")).toBe(old)
    expect(await readFile(path.join(original.inputDirectory, "download-policy.json"), "utf8")).toBe("frozen original")
  } finally { await rm(root, { recursive: true, force: true }) }
})
