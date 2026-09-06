import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import {
  ApiTesterProductionDevelopmentReportSchema,
  runApiTesterProductionDevelopment,
} from "./api-tester-production-development";
import {
  buildApiTesterProductionCheckerSource,
  buildApiTesterProductionGeneratorSource,
} from "./api-tester-production-programs";

const temporaryDirectories: string[] = [];

afterAll(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("API Tester production development evidence", () => {
  test("freezes two ordinary-parameter new-input runs with zero model activity", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "skvm-api-production-development-"));
    temporaryDirectories.push(outDir);
    const report = ApiTesterProductionDevelopmentReportSchema.parse(
      await runApiTesterProductionDevelopment({
        rootDir: process.cwd(),
        outDir,
        nodeExecutable: Bun.which("node")!,
      }),
    );
    expect(report).toMatchObject({
      status: "passed",
      identity: "skill-ir-api-tester-production-binding-development-001",
      denominator: { developmentInputs: 2, successfulRuns: 2 },
      genericity: {
        ordinaryParameterFields: ["input.path", "input.format", "outputs.plan", "outputs.report"],
        taskIds: 0,
        taskPrompts: 0,
        perInputCodeBranches: 0,
        templates: 0,
        manualMappings: 0,
      },
      sourceBoundary: {
        developmentOnly: true,
        heldOutAccess: false,
        prospectiveSelection: false,
        changesReadiness: false,
      },
      accounting: { modelCalls: 0, apiCalls: 0, paidCalls: 0 },
    });
    expect(report.runs.map(({ inputFormat }) => inputFormat)).toEqual(["json", "yaml"]);
    expect(new Set(report.runs.map(({ bindingSha256 }) => bindingSha256)).size).toBe(2);
    expect(new Set(report.runs.map(({ inputSha256 }) => inputSha256)).size).toBe(2);
    expect(new Set(report.runs.map(({ generatorSha256 }) => generatorSha256)).size).toBe(1);
    expect(new Set(report.runs.map(({ checkerSha256 }) => checkerSha256)).size).toBe(1);
    expect(report.programParity.generatorAndCheckerDistinct).toBe(true);
  });

  test("programs contain no fixture identity branch, task prompt, or held-out marker", () => {
    const programs = `${buildApiTesterProductionGeneratorSource()}\n${buildApiTesterProductionCheckerSource()}`;
    expect(programs).not.toMatch(/books-api|orders-api|taskId|task prompt|held.?out/iu);
  });

  test("committed report exactly matches a fresh deterministic reproduction", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "skvm-api-production-reproduction-"));
    temporaryDirectories.push(outDir);
    const fresh = await runApiTesterProductionDevelopment({
      rootDir: process.cwd(),
      outDir,
      nodeExecutable: Bun.which("node")!,
    });
    const committed = ApiTesterProductionDevelopmentReportSchema.parse(JSON.parse(await readFile(
      join(process.cwd(), "results", "skill-ir", "api-tester-production-binding-development-001", "report.json"),
      "utf8",
    )));
    expect(fresh).toEqual(committed);
  });
});
