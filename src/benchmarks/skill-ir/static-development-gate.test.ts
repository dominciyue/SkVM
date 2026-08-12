import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readAndValidateStaticDevelopmentLock, StaticDevelopmentLockSchema } from "./static-development";
import { buildStaticDevelopmentGateReport } from "./static-development-gate";
import { runStaticDevelopmentGateFile } from "./static-development-gate-run";
import type { RawAgentRunRow, ScoredAgentRunRow } from "./scoring";
import { sha256Bytes } from "./source-fixture";

const rootDir = path.resolve(import.meta.dir, "../../..");
const lockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/law-to-markdown/law-to-markdown-static-development-lock.json",
);
const i18nGatePath = path.join(rootDir, "results/skill-ir/ihc-static-v1/gate-report.json");
const i18nInfrastructureAuditPath = path.join(
  rootDir,
  "results/skill-ir/ihc-static-v1/infrastructure-audit.json",
);
const tasks = [
  { id: "law-to-markdown-statute-dev-001", split: "development", hardGateIds: [
    "law-protected-input", "law-required-artifacts", "law-source-accounting",
  ] },
  { id: "law-to-markdown-standard-dev-002", split: "development", hardGateIds: [
    "law-protected-input", "law-required-artifacts", "law-source-accounting",
  ] },
];

type System = "no-skill" | "original" | "ir-static";

function identity(taskId: string, system: System, runIndex: number) {
  return {
    caseId: `law-to-markdown:skvm:windows:clean:${taskId}`,
    system,
    model: "xty/gpt-5.6-sol",
    modelFamily: "gpt",
    adapter: "bare-agent",
    adapterVersion: "workspace-law-static-v1",
    panelConfigId: "law-to-markdown-static-development-v1",
    runIndex,
  } as const;
}

function raw(taskId: string, system: System, runIndex: number): RawAgentRunRow {
  return {
    ...identity(taskId, system, runIndex),
    taskPath: "task.json",
    workDir: "workdir",
    exitCode: 0,
    runStatus: "ok",
    durationMs: 10,
    stdout: "PRIVATE MODEL OUTPUT",
    stderr: "",
    successSource: "execution-only",
  };
}

function scored(opts: {
  taskId: string;
  system: System;
  runIndex: number;
  success: boolean;
  score: number;
  hardGatesPass?: boolean;
  infrastructure?: boolean;
}): ScoredAgentRunRow {
  const parsed = identity(opts.taskId, opts.system, opts.runIndex);
  const hardGatesPass = opts.hardGatesPass ?? true;
  return {
    ...parsed,
    skill: "law-to-markdown",
    agent: "skvm",
    environment: "windows",
    context: "clean",
    task: opts.taskId,
    taskSplit: "development",
    success: opts.success,
    ruleViolations: opts.success ? 0 : 1,
    stepCoverage: 1,
    latencyMs: 10,
    inputTokens: 100,
    outputTokens: 20,
    tokenCost: 120,
    runStatus: opts.infrastructure ? "adapter-crashed" : "ok",
    successSource: "deterministic-evaluator",
    failedCriteria: opts.success ? [] : ["law-heading-structure"],
    ...(opts.infrastructure ? { failureType: "infrastructure" as const } : {}),
    evaluatorScore: opts.score,
    evaluationSummary: [
      ...tasks[0]!.hardGateIds.map((id) => ({
        method: "custom",
        id,
        pass: hardGatesPass,
        score: hardGatesPass ? 1 : 0,
        details: "PRIVATE evaluator details",
      })),
      { method: "custom", id: "law-heading-structure", pass: opts.success, score: opts.score, details: "PRIVATE" },
    ],
  };
}

function passingRows() {
  const rawRows: RawAgentRunRow[] = [];
  const scoredRows: ScoredAgentRunRow[] = [];
  let staticIndex = 0;
  for (const task of tasks) {
    for (const runIndex of [1, 2]) {
      for (const system of ["no-skill", "original", "ir-static"] as const) {
        rawRows.push(raw(task.id, system, runIndex));
        if (system === "no-skill") {
          scoredRows.push(scored({ taskId: task.id, system, runIndex, success: false, score: 0.5 }));
        } else if (system === "original") {
          scoredRows.push(scored({ taskId: task.id, system, runIndex, success: false, score: 0.75 }));
        } else {
          staticIndex += 1;
          scoredRows.push(scored({
            taskId: task.id,
            system,
            runIndex,
            success: staticIndex <= 3,
            score: staticIndex <= 3 ? 0.9 : 0.8,
          }));
        }
      }
    }
  }
  return { rawRows, scoredRows };
}

describe("static development gate", () => {
  test("freezes the i18n infrastructure failure without private execution content", async () => {
    const gateText = await readFile(i18nGatePath, "utf8");
    const auditText = await readFile(i18nInfrastructureAuditPath, "utf8");
    const gate = JSON.parse(gateText) as {
      passed: boolean;
      counts: Record<string, number>;
      interpretation: Record<string, boolean>;
      evidence: Record<string, string>;
    };
    const audit = JSON.parse(auditText) as {
      status: string;
      denominator: Record<string, number>;
      nonOkRows: Array<{ runStatus: string; inputTokens: number; outputTokens: number }>;
      classification: Record<string, boolean | number>;
      evidence: { gate: { sha256: string } };
    };
    expect(gate).toMatchObject({
      passed: false,
      counts: {
        expectedRows: 12,
        observedRawRows: 12,
        observedScoredRows: 12,
        expectedTriplets: 4,
        completeTriplets: 4,
        infrastructureFailures: 4,
      },
      interpretation: {
        heldOutPlanningAllowed: false,
        residualAuditAllowed: false,
        heldOutExecutionAllowed: false,
        entersMainClaim: false,
      },
    });
    expect(audit).toMatchObject({
      status: "frozen-infrastructure-failed",
      denominator: { expectedRows: 12, observedRawRows: 12, observedScoredRows: 12, retries: 0 },
      classification: {
        infrastructureFailures: 4,
        crossSystemSameTaskRunIndexFailure: true,
        semanticAttributionAllowed: false,
        sameLockRerunAllowed: false,
        artifactEligibilityAllowed: false,
        heldOutAllowed: false,
      },
    });
    expect(audit.nonOkRows.map((row) => row.runStatus)).toEqual([
      "timeout", "parse-failed", "parse-failed", "parse-failed",
    ]);
    expect(audit.nonOkRows.slice(1).every((row) => row.inputTokens === 0 && row.outputTokens === 0)).toBe(true);
    expect(audit.evidence.gate.sha256).toBe(sha256Bytes(Buffer.from(gateText)));
    expect(`${gateText}\n${auditText}`).not.toMatch(
      /(?:[A-Za-z]:\\|sk-[A-Za-z0-9_-]{16,}|authorization|bearer\s+|stdout|stderr|final output)/iu,
    );
  });

  test("passes the frozen denominator with three static successes and an improved pair", async () => {
    const lock = await readAndValidateStaticDevelopmentLock({ rootDir, lockPath });
    const report = buildStaticDevelopmentGateReport({ lock, tasks, ...passingRows() });
    expect(report).toMatchObject({
      schemaVersion: "skill-ir-static-development-gate-report/v1",
      experimentId: lock.experimentId,
      methodEvidence: true,
      passed: true,
      counts: {
        expectedRows: 12,
        observedRawRows: 12,
        observedScoredRows: 12,
        expectedTriplets: 4,
        completeTriplets: 4,
        infrastructureFailures: 0,
        hardGateRegressions: 0,
        improvedPairs: 4,
      },
      gates: {
        completeRows: true,
        completeTriplets: true,
        minimumIrStaticSuccesses: true,
        minimumIrStaticMeanScore: true,
        maximumInfrastructureFailures: true,
        maximumHardGateRegressions: true,
        minimumImprovedPairs: true,
      },
    });
    expect(report.systems["ir-static"]).toMatchObject({ successes: 3, meanScoreIncludingMissing: 0.875 });
    expect(report.interpretation).toEqual({
      heldOutPlanningAllowed: true,
      heldOutExecutionAllowed: false,
      entersMainClaim: false,
    });
    expect(JSON.stringify(report)).not.toContain("PRIVATE");
  });

  test("fails on hard-gate regression even when aggregate static thresholds pass", async () => {
    const lock = await readAndValidateStaticDevelopmentLock({ rootDir, lockPath });
    const rows = passingRows();
    const target = rows.scoredRows.find((row) => row.system === "ir-static")!;
    rows.scoredRows[rows.scoredRows.indexOf(target)] = scored({
      taskId: target.task,
      system: "ir-static",
      runIndex: target.runIndex!,
      success: true,
      score: 0.9,
      hardGatesPass: false,
    });
    const report = buildStaticDevelopmentGateReport({ lock, tasks, ...rows });
    expect(report.counts.hardGateRegressions).toBe(1);
    expect(report.gates.maximumHardGateRegressions).toBe(false);
    expect(report.passed).toBe(false);
  });

  test("admits saturated static fidelity with zero improvements and rejects any score regression", async () => {
    const base = await readAndValidateStaticDevelopmentLock({ rootDir, lockPath });
    const lock = StaticDevelopmentLockSchema.parse({
      ...base,
      evaluationMode: "static-fidelity",
      gate: {
        minimumIrStaticSuccesses: 4,
        minimumIrStaticMeanScore: 1,
        maximumInfrastructureFailures: 0,
        maximumHardGateRegressions: 0,
        minimumImprovedPairs: 0,
        maximumRegressedPairs: 0,
      },
      promotionBoundary: { ...base.promotionBoundary, permitsResidualAudit: true },
    });
    const rows = passingRows();
    rows.scoredRows = rows.scoredRows.map((entry) => {
      if (entry.system === "no-skill") return entry;
      if (entry.system !== "original" && entry.system !== "ir-static") {
        throw new Error(`unexpected static test system ${entry.system}`);
      }
      return scored({
        taskId: entry.task,
        system: entry.system,
        runIndex: entry.runIndex!,
        success: true,
        score: 1,
      });
    });
    const passed = buildStaticDevelopmentGateReport({ lock, tasks, ...rows });
    expect(passed).toMatchObject({
      passed: true,
      counts: { improvedPairs: 0, regressedPairs: 0 },
      gates: { minimumImprovedPairs: true, maximumRegressedPairs: true },
      interpretation: {
        heldOutPlanningAllowed: false,
        residualAuditAllowed: true,
        heldOutExecutionAllowed: false,
        entersMainClaim: false,
      },
    });

    const regressed = rows.scoredRows.find((entry) => entry.system === "ir-static")!;
    rows.scoredRows[rows.scoredRows.indexOf(regressed)] = scored({
      taskId: regressed.task,
      system: "ir-static",
      runIndex: regressed.runIndex!,
      success: false,
      score: 0.8,
    });
    const failed = buildStaticDevelopmentGateReport({ lock, tasks, ...rows });
    expect(failed.counts.regressedPairs).toBe(1);
    expect(failed.gates.maximumRegressedPairs).toBe(false);
    expect(failed.passed).toBe(false);
  });

  test("routes an improvement gate to residual audit without opening held-out planning", async () => {
    const base = await readAndValidateStaticDevelopmentLock({ rootDir, lockPath });
    const lock = StaticDevelopmentLockSchema.parse({
      ...base,
      evaluationMode: "improvement",
      gate: { ...base.gate, maximumRegressedPairs: 0 },
      promotionBoundary: { ...base.promotionBoundary, permitsResidualAudit: true },
    });
    const report = buildStaticDevelopmentGateReport({ lock, tasks, ...passingRows() });
    expect(report.passed).toBe(true);
    expect(report.interpretation).toEqual({
      heldOutPlanningAllowed: false,
      residualAuditAllowed: true,
      heldOutExecutionAllowed: false,
      entersMainClaim: false,
    });
  });

  test("keeps missing and infrastructure rows in the frozen denominator", async () => {
    const lock = await readAndValidateStaticDevelopmentLock({ rootDir, lockPath });
    const missing = passingRows();
    missing.rawRows.pop();
    missing.scoredRows.pop();
    const report = buildStaticDevelopmentGateReport({ lock, tasks, ...missing });
    expect(report.counts).toMatchObject({
      observedRawRows: 11,
      observedScoredRows: 11,
      completeTriplets: 3,
      infrastructureFailures: 1,
    });
    expect(report.systems["ir-static"].meanScoreIncludingMissing).toBe(0.675);
    expect(report.passed).toBe(false);
  });

  test("forces a raw execution failure to zero even if a scored row carries a score", async () => {
    const lock = await readAndValidateStaticDevelopmentLock({ rootDir, lockPath });
    const rows = passingRows();
    const rawStatic = rows.rawRows.find((row) => row.system === "ir-static")!;
    rows.rawRows[rows.rawRows.indexOf(rawStatic)] = {
      ...rawStatic,
      exitCode: 1,
      runStatus: "adapter-crashed",
    };
    const report = buildStaticDevelopmentGateReport({ lock, tasks, ...rows });
    expect(report.counts.infrastructureFailures).toBe(1);
    expect(report.systems["ir-static"]).toMatchObject({ successes: 2, meanScoreIncludingMissing: 0.65 });
    expect(report.passed).toBe(false);
  });

  test("rejects duplicate rows and frozen identity drift", async () => {
    const lock = await readAndValidateStaticDevelopmentLock({ rootDir, lockPath });
    const duplicate = passingRows();
    expect(() => buildStaticDevelopmentGateReport({
      lock,
      tasks,
      rawRows: [...duplicate.rawRows, duplicate.rawRows[0]!],
      scoredRows: duplicate.scoredRows,
    })).toThrow("duplicate raw");
    const drift = passingRows();
    drift.scoredRows[0] = { ...drift.scoredRows[0]!, model: "xty/other" };
    expect(() => buildStaticDevelopmentGateReport({ lock, tasks, ...drift })).toThrow("model");
  });

  test("binds the file report to frozen raw, scored, resource, route, and lock evidence", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "law-static-gate-"));
    try {
      const rows = passingRows();
      const rawPath = path.join(dir, "raw.jsonl");
      const scoredPath = path.join(dir, "scored.jsonl");
      const resourcePath = path.join(dir, "resource.json");
      const routePath = path.join(dir, "route.json");
      const outPath = path.join(dir, "gate.json");
      await writeFile(rawPath, `${rows.rawRows.map((row) => JSON.stringify(row)).join("\n")}\n`);
      await writeFile(scoredPath, `${rows.scoredRows.map((row) => JSON.stringify(row)).join("\n")}\n`);
      await writeFile(resourcePath, `${JSON.stringify({
        schemaVersion: "skill-ir-resource-probe-result/v1",
        methodEvidence: false,
        status: "ok",
        executableSource: "env",
        requiredModules: ["docx", "pdfplumber"],
        exitCode: 0,
        stderrClass: "none",
        durationMs: 1,
      })}\n`);
      await writeFile(routePath, `${JSON.stringify({
        schemaVersion: "skill-ir-static-route-probe-result/v1",
        experimentId: "law-to-markdown-static-development-v1",
        methodEvidence: false,
        lockSha256: "LOCK_SHA_PLACEHOLDER",
        model: "xty/gpt-5.6-sol",
        caseId: "law-to-markdown:skvm:windows:clean:law-to-markdown-statute-dev-001",
        system: "original",
        status: "ok",
        exitCode: 0,
        timedOut: false,
        durationMs: 1,
      })}\n`);
      const lockBytes = await readFile(lockPath);
      await writeFile(routePath, (await readFile(routePath, "utf8")).replace(
        "LOCK_SHA_PLACEHOLDER",
        sha256Bytes(lockBytes),
      ));
      const report = await runStaticDevelopmentGateFile({
        rootDir,
        lockPath,
        rawPath,
        scoredPath,
        resourcePath,
        routePath,
        outPath,
      });
      expect(report.passed).toBe(true);
      expect(report.evidence).toMatchObject({
        lockSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        rawSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        scoredSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        resourceProbeSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        routeProbeSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      });
      expect(await readFile(outPath, "utf8")).not.toContain("PRIVATE");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
