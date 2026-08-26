import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ResilientQualificationReportSchema,
  ResilientRunStateSchema,
} from "./reviewed-aot-efficiency-resilient";

const roots: string[] = [];

async function temporary(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "reviewed-aot-detach-test-"));
  roots.push(path);
  return path;
}

async function readState(runDir: string) {
  return ResilientRunStateSchema.parse(JSON.parse(await readFile(join(runDir, "run-state.json"), "utf8")));
}

async function waitForDone(runDir: string) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const state = await readState(runDir);
      if (state.phase !== "running") return state;
    } catch { /* worker has not committed state yet */ }
    await Bun.sleep(25);
  }
  throw new Error("detached qualification worker did not finish");
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("reviewed-AOT detached interruption qualification", () => {
  test("the same worker continues after its controller exits and repeated start does not redispatch", async () => {
    const runDir = await temporary();
    const script = join(process.cwd(), "src/benchmarks/skill-ir/reviewed-aot-efficiency-resilient-run.ts");
    const controller = Bun.spawn([
      process.execPath, "run", script, "--phase=qualification-start", `--out-dir=${runDir}`,
    ], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe", windowsHide: true });
    const [exitCode, stdout, stderr] = await Promise.all([
      controller.exited, new Response(controller.stdout).text(), new Response(controller.stderr).text(),
    ]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    const started = JSON.parse(stdout) as { workerPid: number; controllerPid: number; status: string };
    expect(started.status).toBe("started");
    expect(started.workerPid).not.toBe(started.controllerPid);

    const afterControllerExit = await readState(runDir);
    expect(afterControllerExit.workerPid).toBe(started.workerPid);
    expect(afterControllerExit.phase).toBe("running");
    const done = await waitForDone(runDir);
    expect(done.phase).toBe("done");
    expect(done.completedRows).toBe(2);
    expect(done.dispatchCount).toBe(2);

    const observer = Bun.spawn([
      process.execPath, "run", script, "--phase=qualification-start", `--out-dir=${runDir}`,
    ], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe", windowsHide: true });
    const [observerExit, observerStdout] = await Promise.all([
      observer.exited, new Response(observer.stdout).text(),
    ]);
    expect(observerExit).toBe(0);
    expect((JSON.parse(observerStdout) as { status: string }).status).toBe("observed-done");
    expect((await readState(runDir)).dispatchCount).toBe(2);
  }, 15_000);

  test("writes a zero-paid qualification report for all frozen crash windows", async () => {
    const root = await temporary();
    const reportPath = join(root, "qualification.json");
    const script = join(process.cwd(), "src/benchmarks/skill-ir/reviewed-aot-efficiency-resilient-run.ts");
    const child = Bun.spawn([
      process.execPath, "run", script, "--phase=qualify", `--out-path=${reportPath}`,
    ], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe", windowsHide: true });
    const [exitCode, stderr] = await Promise.all([
      child.exited, new Response(child.stderr).text(),
    ]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    const report = ResilientQualificationReportSchema.parse(JSON.parse(await readFile(reportPath, "utf8")));
    expect(report.status).toBe("passed");
    expect(report.scenarios.controllerExitSameAttempt).toMatchObject({
      controllerExitMode: "forced-termination",
      phaseAfterControllerExit: "running", finalPhase: "done", dispatchCount: 2,
      repeatedStartStatus: "observed-done", repeatedStartDispatchCount: 2,
    });
    expect(report.scenarios.terminalBeforePrefix).toEqual({ prefixBefore: 0, prefixAfter: 1, recovered: true });
    expect(report.scenarios.dispatchedWithoutTerminal).toMatchObject({ phase: "failed", failClosed: true });
    expect(report.accounting).toEqual({ fakeRows: 2, apiCalls: 0, modelCalls: 0, paidCalls: 0 });
  }, 20_000);
});
