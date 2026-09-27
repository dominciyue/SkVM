import { expect, test } from "bun:test"
import path from "node:path"

test("blind evaluation replays all registered units without a provider", () => {
  const root = path.resolve(import.meta.dir, "../../../../..")
  const result = Bun.spawnSync(["bun", path.join(import.meta.dir, "evaluate-panel.ts"), "replay"], { cwd: root })
  expect(result.exitCode).toBe(0)
  const replay = JSON.parse(new TextDecoder().decode(result.stdout))
  expect(replay.status).toBe("reproduced")
  expect(replay.plannedUnits).toBe(54)
  expect(replay.reviewedPackets).toBe(41)
  expect(replay.providerCalls).toBe(0)
})
