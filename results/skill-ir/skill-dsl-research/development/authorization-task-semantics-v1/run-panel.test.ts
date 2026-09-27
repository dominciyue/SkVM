import { expect, test } from "bun:test"
import path from "node:path"

const script = path.join(import.meta.dir, "run-panel.ts")

test("panel runner reports all frozen units without dispatch", () => {
  const result = Bun.spawnSync(["bun", script, "status"], { cwd: path.resolve(import.meta.dir, "../../../../..") })
  expect(result.exitCode).toBe(0)
  const status = JSON.parse(new TextDecoder().decode(result.stdout))
  expect(status.planned).toBe(54)
  expect(status.claimed).toBe(0)
  expect(status.byPhase).toEqual({ initial: 32, repeat: 16, "outcome-only": 6 })
})
