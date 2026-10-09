import { expect, test } from "bun:test"
import { mkdtemp } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
const api = await import("./runner.ts").catch(() => ({})) as any
test("BB paid dispatch claim is exclusive across different logical positions", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bb-exclusive-dispatch-")), file = path.join(directory, "dispatch.lock")
  expect(typeof api.claimDispatchLock).toBe("function")
  const release = await api.claimDispatchLock(file, "first")
  await expect(api.claimDispatchLock(file, "second")).rejects.toThrow("dispatch lock")
  await release()
  await (await api.claimDispatchLock(file, "third"))()
})
