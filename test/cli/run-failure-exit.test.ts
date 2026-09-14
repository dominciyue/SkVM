import { expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import path from "node:path"

const root = path.resolve(import.meta.dir, "../..")

function failedRecovery() {
  // Isolate provider/session doubles in a child; exercise the real CLI router,
  // run handler and diagnostic printer without a model request or paid retry.
  const script = `
    import { mock } from "bun:test";
    mock.module(${JSON.stringify(path.join(root, "src/run/optimization-session.ts"))}, () => ({
      readOptimizationSession: async () => ({
        binding: { model: "test/offline" },
        sourceRun: { status: "failed", runStatus: "timeout" },
        capture: { status: "complete" },
        optimization: { status: "failed", phase: "capture" }
      })
    }));
    mock.module(${JSON.stringify(path.join(root, "src/run/optimization-handoff.ts"))}, () => ({
      runCapturedOptimization: async () => { throw new Error("source run ended with timeout"); }
    }));
    process.argv = [process.execPath, "skvm", "run", "--resume-optimization=offline-session.json"];
    await import(${JSON.stringify(path.join(root, "src/index.ts"))});
  `
  return spawnSync(process.execPath, ["--eval", script], {
    cwd: root, encoding: "utf8", timeout: 20_000,
    env: { ...process.env, SKVM_AUTO_PROBE: "0" },
  })
}

test("real CLI preserves the nonzero exit code set by a failed optimization handler", () => {
  const result = failedRecovery()
  expect(result.error).toBeUndefined()
  expect(result.stdout).toContain("Problem: source run ended with timeout")
  expect(result.status).toBe(1)
})

test("complete capture with source timeout is not described as missing capture or usable output", () => {
  const result = failedRecovery()
  expect(result.stdout).toContain("source task did not finish")
  expect(result.stdout).not.toContain("source result remains usable")
  expect(result.stdout).not.toContain("cannot continue without complete capture evidence")
})
