import { test, expect } from "bun:test"
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { verifyShareLink } from "../authorization-authoring-loop-v1/practical.ts"
test("ShareLink verification uses the caller's output root without rewriting historical evidence", async () => {
  const destination = await mkdtemp(path.join(os.tmpdir(), "bk-sharelink-"))
  await mkdir(path.join(destination, "verification"))
  await writeFile(path.join(destination, "verification/sharelink-result.json"), JSON.stringify({ owned: "new-purpose" }))
  expect(await (verifyShareLink as any)(destination)).toEqual({ owned: "new-purpose" })
})
