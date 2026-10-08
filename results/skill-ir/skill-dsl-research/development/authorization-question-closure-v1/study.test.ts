import { expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { prepareChanges } from "./study.ts"

test("AY change preparation refuses invalid registration, active baseline and stale production tree before writing inputs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ay-change-baseline-"))
  const manifest = { positions: [{ id: "consumer-download", status: "running", attempts: ["consumer-download/original"] }] }
  try {
    await writeFile(path.join(root, "manifest.json"), JSON.stringify(manifest))
    await expect(prepareChanges("../escape", root)).rejects.toThrow("explicit named")
    await expect(prepareChanges("current-test", root)).rejects.toThrow("current original public Download consumer")
    manifest.positions[0]!.status = "completed"
    await writeFile(path.join(root, "manifest.json"), JSON.stringify(manifest))
    const attempt = path.join(root, "attempts/consumer-download/original")
    await mkdir(attempt, { recursive: true })
    await writeFile(path.join(attempt, "report.json"), JSON.stringify({ runtimeTree: "stale-production-tree", sessionPath: path.join(root, "must-not-read-session") }))
    await expect(prepareChanges("current-test", root)).rejects.toThrow("same current production tree")
    await expect(readFile(path.join(root, "model/change-registrations/current-test.json"))).rejects.toThrow()
  } finally { await rm(root, { recursive: true, force: true }) }
})
