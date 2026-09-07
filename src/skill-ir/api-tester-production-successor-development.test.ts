import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import {
  ApiTesterProductionSuccessorDevelopmentReportSchema,
  runApiTesterProductionSuccessorDevelopment,
} from "./api-tester-production-successor-development";

const externalCacheRoot = process.env.SKVM_API_TESTER_DEVELOPMENT_CACHE
  ? resolve(process.env.SKVM_API_TESTER_DEVELOPMENT_CACHE)
  : resolve(process.cwd(), "..", ".tmp-api-prospective-20260907");
const temporaryDirectories: string[] = [];

afterAll(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("API Tester production successor development", () => {
  test("committed report freezes one exposed real parse-to-checker path", async () => {
    const committed = ApiTesterProductionSuccessorDevelopmentReportSchema.parse(JSON.parse(await readFile(
      join(process.cwd(), "results", "skill-ir", "api-tester-production-binding-successor-development-001", "report.json"),
      "utf8",
    )));
    expect(committed).toMatchObject({
      status: "passed",
      identity: "skill-ir-api-tester-production-binding-successor-development-001",
      supportContractId: "api-tester-openapi-subset-v2",
      input: {
        inputId: "real-open-meteo-forecast-exposed-development",
        exposure: "development-only-after-2026-09-07-first-run",
        sha256: "fdd3195d66fade678924c1df99d32de4f1d6aa7c954c5bc7ff1646ed8c558def",
      },
      capabilities: {
        operationCount: 1,
        fieldCount: 23,
        scalarFieldCount: 18,
        arrayFieldCount: 5,
        queryArrayEncodings: { commaSeparated: 5, repeatedValue: 0 },
        formats: { date: 2, float: 3 },
      },
      pipeline: {
        stages: ["parse", "normalize", "package", "generate", "check"],
        checkerStatus: "pass",
      },
      accounting: { modelCalls: 0, apiCalls: 0, paidCalls: 0 },
      evidenceBoundary: {
        prospective: false,
        unseenInput: false,
        heldOutAccess: false,
        humanComparison: "not-measured",
        changesReadiness: false,
      },
    });
    expect(JSON.stringify(committed)).not.toMatch(/(?:^|["'])[A-Za-z]:[\\/]|\.tmp-api-prospective/u);
  });

  test.skipIf(!existsSync(join(externalCacheRoot, "open-meteo", "forecast.yml")))(
    "exactly reproduces the committed report when the digest-bound external cache is present",
    async () => {
      const outDir = await mkdtemp(join(tmpdir(), "skvm-api-successor-development-test-"));
      temporaryDirectories.push(outDir);
      const fresh = await runApiTesterProductionSuccessorDevelopment({
        rootDir: process.cwd(),
        externalCacheRoot,
        outDir,
        nodeExecutable: Bun.which("node")!,
      });
      const committed = ApiTesterProductionSuccessorDevelopmentReportSchema.parse(JSON.parse(await readFile(
        join(process.cwd(), "results", "skill-ir", "api-tester-production-binding-successor-development-001", "report.json"),
        "utf8",
      )));
      expect(fresh).toEqual(committed);
    },
  );
});
