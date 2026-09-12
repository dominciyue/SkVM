import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runN5ConsumerEvidence } from "./skill-family-current-v2-n5";

const directories: string[] = [];
afterAll(async () => Promise.all(directories.map((directory) => rm(directory, { recursive: true, force: true }))));

describe("current-v2 N5 native consumer evidence", () => {
  test("two independent task packages execute and all preregistered faults reach their assigned layer", async () => {
    const directory = await mkdtemp(join(tmpdir(), "skvm-n5-"));
    directories.push(directory);
    const report = await runN5ConsumerEvidence({ outputDirectory: directory, pythonExecutable: "python" });
    expect(report.decision).toBe("passed");
    expect(report.fixtures).toHaveLength(2);
    expect(report.fixtures.every((fixture) => fixture.packageCheck.status === "pass" && fixture.junit.passed > 0)).toBe(true);
    expect(report.faultInjection.summary).toEqual({ injected: 8, correctlyDetected: 8, missed: 0, notApplicable: 0 });
    expect(report.faultInjection.cases.every((row) => row.detectedAtExpectedLayer)).toBe(true);
    expect(report.accounting.loopbackHttpCalls).toBeGreaterThanOrEqual(4);
    expect(report.accounting).toMatchObject({ remoteHttpCalls: 0, projectModelCalls: 0, paidCalls: 0 });
    expect(JSON.parse(await readFile(join(directory, "consumer-report.json"), "utf8")).decision).toBe("passed");
  }, 30_000);
});
