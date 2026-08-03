import { expect, test } from "bun:test"
import { buildNamespacedResourceDevelopmentGateReport } from "./namespaced-resource-development-gate.ts"
import { NamespacedResourceDevelopmentQualityLockSchema } from "./namespaced-resource-development-lock.ts"
import type { ScoredAgentRunRow } from "./scoring.ts"

const lock = NamespacedResourceDevelopmentQualityLockSchema.parse({
  schemaVersion: "skill-ir-namespaced-resource-quality-development-lock/v1",
  status: "preregistered",
  experimentId: "namespaced-resource-quality-development-v1",
  methodEvidence: true,
  corpus: "pilot",
  compatibilityLock: { path: "a.json", sha256: "0".repeat(64) },
  frozenImplementations: {
    planner: { path: "a.json", sha256: "0".repeat(64) },
    execution: { path: "a.json", sha256: "0".repeat(64) },
    runner: { path: "a.json", sha256: "0".repeat(64) },
  },
  model: { route: "xty/gpt-5.6-sol", family: "gpt" },
  adapter: { id: "pi", version: "0.67.68" },
  matrix: {
    systems: ["no-skill", "original", "ir-static", "optimized"],
    skills: ["law-to-markdown", "experimental-design"],
    taskIds: ["law-to-markdown-statute-dev-001", "law-to-markdown-standard-dev-002", "experimental-design-stratified-dev-001", "experimental-design-cluster-dev-002"],
    contexts: ["clean"], agents: ["skvm"], environments: ["windows"], taskSplit: "development", repetitions: 1,
    expectedRows: 16, expectedQuartets: 4,
  },
  runtime: { apiKeyEnv: "SKVM_XTY_API_KEY", pythonEnv: "SKVM_PYTHON", retries: 0, retryDelayMs: 0, routeProbeRequired: true, resourceProbeRequired: true },
  gate: { expectedRows: 16, expectedQuartets: 4, minimumOptimizedSuccesses: 4, minimumOptimizedMeanScore: 0.85, minimumOptimizedTaskMeanScore: 0.85, maximumInfrastructureFailures: 0, maximumPairwiseRegressions: 0 },
  promotionBoundary: { developmentOnly: true, entersMainClaim: false, permitsHeldOutPlanning: false, permitsHeldOutExecution: false, permitsPgo: false, permitsScorerRetuning: false, permitsPackageRecompile: false },
  prohibited: ["held-out"],
})

test("namespaced gate detects optimized regression against the best model baseline", () => {
  const rows: ScoredAgentRunRow[] = []
  for (const task of ["t1", "t2", "t3", "t4"]) {
    for (const system of ["no-skill", "original", "ir-static", "optimized"] as const) {
      rows.push({
        caseId: task,
        system,
        skill: "fixture",
        agent: "skvm",
        environment: "windows",
        context: "clean",
        task,
        taskSplit: "development",
        runIndex: 1,
        runStatus: "ok",
        success: true,
        ruleViolations: 0,
        stepCoverage: 1,
        latencyMs: 10,
        successSource: "deterministic-evaluator",
        failedCriteria: [],
        evaluatorScore: system === "optimized" ? 0.8 : system === "ir-static" ? 0.9 : 0.85,
        tokenCost: 10,
      })
    }
  }
  const report = buildNamespacedResourceDevelopmentGateReport({ rows, lock })
  expect(report.status).toBe("failed")
  expect(report.counts.pairwiseRegressions).toBe(4)
  expect(report.gate.failures).toContain("pairwise-regression")
})
