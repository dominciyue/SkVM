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

function ordinaryTimedOutRun() {
  const script = `
    import { mock } from "bun:test";
    const root = ${JSON.stringify(root)};
    mock.module(root + "/src/adapters/registry.ts", () => ({
      ALL_ADAPTERS: ["bare-agent"],
      createAdapter: () => ({ name: "bare-agent" })
    }));
    mock.module(root + "/src/core/run-session.ts", () => ({
      shortModel: (model) => model,
      RunSession: {
        start: async () => ({
          id: "cli-timeout-session",
          async fail() {},
          async complete() {}
        })
      }
    }));
    const skill = { skillId: "test-skill", skillPath: root + "/SKILL.md", skillDir: root, bundleFiles: [] };
    const task = { id: "timeout-task", prompt: "timeout", eval: [], timeoutMs: 10, maxSteps: 1, taskPath: root + "/task.json" };
    mock.module(root + "/src/run/index.ts", () => ({
      loadRunSkill: async () => skill,
      loadRunTask: async () => task,
      executeRun: async () => ({
        task,
        skill,
        workDir: root,
        runResult: {
          text: "partial",
          steps: [],
          tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          cost: 0,
          durationMs: 10,
          llmDurationMs: 10,
          workDir: root,
          runStatus: "timeout",
          statusDetail: "timed out in test",
          usageAvailable: false
        }
      })
    }));
    process.argv = [process.execPath, "skvm", "run", "--task=task.json", "--skill=SKILL.md", "--model=test/model"];
    const { RUN_FLAGS, runRun } = await import(root + "/src/cli/run.ts");
    await runRun(RUN_FLAGS.parse(process.argv.slice(3)));
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
  expect(result.stdout).toContain("Source: failed (timeout)")
  expect(result.stdout).toContain("Capture: complete")
  expect(result.stdout).toContain("Optimization phase: capture")
  expect(result.stdout).not.toContain("source result remains usable")
  expect(result.stdout).not.toContain("cannot continue without complete capture evidence")
})

test("ordinary run preserves a nonzero exit code for a timed-out source", () => {
  const result = ordinaryTimedOutRun()
  expect(result.error).toBeUndefined()
  expect(result.stdout).toContain("runStatus: timeout")
  expect(result.status).toBe(1)
})
