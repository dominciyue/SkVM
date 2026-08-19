import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ExecutionEnvelopeSchema, type ExecutionEnvelope } from "./execution-resilience";
import { MethodPortfolioSchema } from "./method-portfolio";
import {
  buildOptimizationCostAccountingReport,
  type OptimizationCostAccountingInput,
} from "./optimization-cost-accounting";

type JsonRecord = Record<string, unknown>;
type CostValue = { status: "measured"; value: number }
  | { status: "missing"; value: null; reason: string };

const ScoredCostRowSchema = z.object({
  system: z.string().min(1),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  latencyMs: z.number().nonnegative(),
  tokenCost: z.number().int().nonnegative(),
}).passthrough();

const EVIDENCE_PATHS = [
  "benchmarks/skill-ir/corpus/method-portfolio.json",
  "benchmarks/skill-ir/pilots/env-manager/source/SKILL.md",
  "benchmarks/skill-ir/pilots/env-manager/successor-v3/base-ir.json",
  "benchmarks/skill-ir/pilots/env-manager/successor-v3/base-ir-source-audit.json",
  "benchmarks/skill-ir/pilots/env-manager/successor-v3/artifact-adapter.json",
  "benchmarks/skill-ir/pilots/env-manager/successor-v3/resource-contract.json",
  "benchmarks/skill-ir/pilots/env-manager/successor-v3/packages/validated-skill-artifact-v1/node/package-manifest.json",
  "benchmarks/skill-ir/pilots/env-manager/successor-v3/packages/validated-skill-artifact-v1/vite/package-manifest.json",
  "src/benchmarks/skill-ir/env-manager-v3-artifact-compiler.ts",
  "src/benchmarks/skill-ir/optimization-cost-accounting.ts",
  "src/benchmarks/skill-ir/env-manager-v3-cost-accounting-run.ts",
  "src/benchmarks/skill-ir/validated-artifact-assembly.ts",
  "src/benchmarks/skill-ir/validated-artifact-catalog.ts",
  "src/benchmarks/skill-ir/validated-artifact-runtime.ts",
  "results/skill-ir/env-manager-v3-scorer-authority-baseline-v1/qualification-launch-failure.json",
  "results/skill-ir/env-manager-v3-scorer-authority-baseline-v2/qualification-launch-failure.json",
  "results/skill-ir/env-manager-v3-scorer-authority-baseline-v3/qualification-launch-failure.json",
  "results/skill-ir/env-manager-v3-scorer-authority-baseline-v4/qualification.json",
  "results/skill-ir/env-manager-v3-scorer-authority-baseline-v4/qualification/scored-runs.jsonl",
  "results/skill-ir/env-manager-v3-scorer-authority-baseline-v4/gate-report.json",
  "results/skill-ir/env-manager-v3-scorer-authority-baseline-v4/run/execution-envelopes.jsonl",
  "results/skill-ir/env-manager-v3-scorer-authority-baseline-v4/run/selected-scored-runs.jsonl",
  "results/skill-ir/env-manager-v3-static-fidelity-v1/qualification.json",
  "results/skill-ir/env-manager-v3-static-fidelity-v1/gate-report.json",
  "results/skill-ir/env-manager-v3-static-fidelity-v1/run/execution-envelopes.jsonl",
  "results/skill-ir/env-manager-v3-static-fidelity-v1/run/scored-runs.jsonl",
  "results/skill-ir/env-manager-v3-validated-artifact-development-v1/qualification.json",
  "results/skill-ir/env-manager-v3-validated-artifact-development-v1/gate-report.json",
  "results/skill-ir/env-manager-v3-validated-artifact-development-v1/scored-runs.jsonl",
] as const;

function measured(value: number): CostValue {
  return { status: "measured", value };
}

function missing(reason: string): CostValue {
  return { status: "missing", value: null, reason };
}

function zeroUsage() {
  return {
    inputTokens: measured(0),
    outputTokens: measured(0),
    cacheReadTokens: measured(0),
    cacheWriteTokens: measured(0),
  };
}

function missingUsage(reason: string) {
  return {
    inputTokens: missing(reason),
    outputTokens: missing(reason),
    cacheReadTokens: missing(reason),
    cacheWriteTokens: missing(reason),
  };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseJson(bytes: Uint8Array): JsonRecord {
  return JSON.parse(Buffer.from(bytes).toString("utf8")) as JsonRecord;
}

function parseJsonl(bytes: Uint8Array): JsonRecord[] {
  return Buffer.from(bytes).toString("utf8").split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as JsonRecord);
}

function nestedRecord(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Env Manager v3 cost evidence missing ${label}`);
  }
  return value as JsonRecord;
}

function requiredNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Env Manager v3 cost evidence invalid ${label}`);
  }
  return value;
}

function envelopeSummary(envelopes: ExecutionEnvelope[]) {
  if (envelopes.some((item) => !item.usage.available)) {
    throw new Error("Env Manager v3 tracked execution envelope is missing usage");
  }
  return {
    attempts: envelopes.length,
    usage: {
      inputTokens: measured(envelopes.reduce((sum, item) => sum + item.usage.input, 0)),
      outputTokens: measured(envelopes.reduce((sum, item) => sum + item.usage.output, 0)),
      cacheReadTokens: measured(envelopes.reduce((sum, item) => sum + item.usage.cacheRead, 0)),
      cacheWriteTokens: measured(envelopes.reduce((sum, item) => sum + item.usage.cacheWrite, 0)),
    },
    durationMs: measured(envelopes.reduce((sum, item) => sum + item.process.durationMs, 0)),
  };
}

function scoredSummary(rawRows: JsonRecord[], cacheReason: string) {
  const rows = rawRows.map((row) => ScoredCostRowSchema.parse(row));
  return {
    attempts: rows.length,
    usage: {
      inputTokens: measured(rows.reduce((sum, item) => sum + item.inputTokens, 0)),
      outputTokens: measured(rows.reduce((sum, item) => sum + item.outputTokens, 0)),
      cacheReadTokens: missing(cacheReason),
      cacheWriteTokens: missing(cacheReason),
    },
    durationMs: measured(rows.reduce((sum, item) => sum + item.latencyMs, 0)),
    rows,
  };
}

export async function buildEnvManagerV3CostAccountingReport(rootDir: string) {
  const root = path.resolve(rootDir);
  const boundEntries = await Promise.all(EVIDENCE_PATHS.map(async (relativePath) => {
    const bytes = await readFile(path.resolve(root, ...relativePath.split("/")));
    return [relativePath, { bytes, ref: { path: relativePath, sha256: sha256(bytes) } }] as const;
  }));
  const bound = new Map(boundEntries);
  const bytes = (relativePath: typeof EVIDENCE_PATHS[number]) => {
    const item = bound.get(relativePath);
    if (!item) throw new Error(`Env Manager v3 cost evidence not bound: ${relativePath}`);
    return item.bytes;
  };

  const portfolio = MethodPortfolioSchema.parse(parseJson(bytes(
    "benchmarks/skill-ir/corpus/method-portfolio.json",
  )));
  const portfolioCase = portfolio.cases.find((entry) => entry.skillId === "env-manager");
  if (!portfolioCase || portfolioCase.adaptation.measurementStatus !== "prospective-measured"
    || portfolioCase.adaptation.humanMinutes === null
    || portfolioCase.adaptation.adapterLoc === null
    || portfolioCase.adaptation.coreBranchDelta === null) {
    throw new Error("Env Manager v3 prospective adaptation evidence is incomplete");
  }

  const baseIr = parseJson(bytes("benchmarks/skill-ir/pilots/env-manager/successor-v3/base-ir.json"));
  if (!Array.isArray(baseIr.profile) || baseIr.profile.length !== 0) {
    throw new Error("Env Manager v3 cost accounting requires a profile-empty base IR");
  }

  const failureV1 = parseJson(bytes(
    "results/skill-ir/env-manager-v3-scorer-authority-baseline-v1/qualification-launch-failure.json",
  ));
  const failureV2 = parseJson(bytes(
    "results/skill-ir/env-manager-v3-scorer-authority-baseline-v2/qualification-launch-failure.json",
  ));
  const failureV3 = parseJson(bytes(
    "results/skill-ir/env-manager-v3-scorer-authority-baseline-v3/qualification-launch-failure.json",
  ));
  if (failureV1.modelInvocationEvidence !== false || failureV2.modelInvocationEvidence !== false
    || failureV3.modelInvocationEvidence !== "unknown") {
    throw new Error("Env Manager v3 operator-failure invocation evidence drift");
  }

  const baselineQualification = parseJson(bytes(
    "results/skill-ir/env-manager-v3-scorer-authority-baseline-v4/qualification.json",
  ));
  const baselineQualificationCost = scoredSummary(parseJsonl(bytes(
    "results/skill-ir/env-manager-v3-scorer-authority-baseline-v4/qualification/scored-runs.jsonl",
  )), "qualification cache usage was not persisted in the scored row");
  if (baselineQualification.status !== "passed" || baselineQualificationCost.attempts !== 1) {
    throw new Error("Env Manager v3 baseline qualification evidence drift");
  }

  const baselineGate = parseJson(bytes(
    "results/skill-ir/env-manager-v3-scorer-authority-baseline-v4/gate-report.json",
  ));
  const baselineEnvelopes = parseJsonl(bytes(
    "results/skill-ir/env-manager-v3-scorer-authority-baseline-v4/run/execution-envelopes.jsonl",
  )).map((row) => ExecutionEnvelopeSchema.parse(row));
  const baselineMatrix = envelopeSummary(baselineEnvelopes);
  const baselineSelection = nestedRecord(baselineGate.selection, "baseline selection");
  const baselineAllAttempts = nestedRecord(baselineGate.allAttempts, "baseline all-attempt cost");
  const baselineSelectedRows = parseJsonl(bytes(
    "results/skill-ir/env-manager-v3-scorer-authority-baseline-v4/run/selected-scored-runs.jsonl",
  ));
  if (baselineGate.passed !== true
    || baselineSelection.replacedPairs !== 0
    || baselineSelection.selectedRows !== baselineMatrix.attempts
    || baselineSelectedRows.length !== baselineMatrix.attempts
    || baselineMatrix.durationMs.value !== baselineAllAttempts.attemptedDurationMs) {
    throw new Error("Env Manager v3 baseline matrix cost identity drift");
  }

  const staticQualification = parseJson(bytes(
    "results/skill-ir/env-manager-v3-static-fidelity-v1/qualification.json",
  ));
  const staticGate = parseJson(bytes(
    "results/skill-ir/env-manager-v3-static-fidelity-v1/gate-report.json",
  ));
  const staticEnvelopes = parseJsonl(bytes(
    "results/skill-ir/env-manager-v3-static-fidelity-v1/run/execution-envelopes.jsonl",
  )).map((row) => ExecutionEnvelopeSchema.parse(row));
  const staticMatrix = envelopeSummary(staticEnvelopes);
  const staticSelection = nestedRecord(staticGate.selection, "static selection");
  const staticAllAttempts = nestedRecord(staticGate.allAttempts, "static all-attempt cost");
  const staticScoredRows = parseJsonl(bytes(
    "results/skill-ir/env-manager-v3-static-fidelity-v1/run/scored-runs.jsonl",
  ));
  if (staticQualification.status !== "ok" || staticGate.passed !== true
    || staticSelection.replacedTriplets !== 0
    || staticSelection.selectedRows !== staticMatrix.attempts
    || staticScoredRows.length !== staticMatrix.attempts
    || staticMatrix.durationMs.value !== staticAllAttempts.attemptedDurationMs) {
    throw new Error("Env Manager v3 static matrix cost identity drift");
  }

  const artifactQualification = parseJson(bytes(
    "results/skill-ir/env-manager-v3-validated-artifact-development-v1/qualification.json",
  ));
  const artifactGatePath = "results/skill-ir/env-manager-v3-validated-artifact-development-v1/gate-report.json";
  const artifactGate = parseJson(bytes(artifactGatePath));
  const artifactCost = nestedRecord(artifactGate.cost, "artifact cost");
  const artifactCounts = nestedRecord(artifactGate.counts, "artifact counts");
  const artifactSystems = nestedRecord(artifactGate.systems, "artifact systems");
  const originalSystem = nestedRecord(artifactSystems.original, "artifact original system");
  const optimizedSystem = nestedRecord(artifactSystems["validated-artifact"], "validated artifact system");
  const artifactScored = scoredSummary(parseJsonl(bytes(
    "results/skill-ir/env-manager-v3-validated-artifact-development-v1/scored-runs.jsonl",
  )), "artifact development runner did not persist cache token fields");
  const artifactOriginalRows = artifactScored.rows.filter((row) => row.system === "original");
  const artifactOptimizedRows = artifactScored.rows.filter((row) => row.system === "validated-artifact");
  const originalAggregateModelTokens = artifactOriginalRows.reduce((sum, row) => sum + row.tokenCost, 0);
  const optimizedAggregateModelTokens = artifactOptimizedRows.reduce((sum, row) => sum + row.tokenCost, 0);
  if (artifactQualification.status !== "passed"
    || nestedRecord(artifactGate.gate, "artifact gate").passed !== true
    || artifactCounts.observedScoredRows !== artifactScored.attempts
    || originalAggregateModelTokens !== originalSystem.aggregateTokens
    || optimizedAggregateModelTokens !== optimizedSystem.aggregateTokens) {
    throw new Error("Env Manager v3 artifact cost identity drift");
  }

  const input: OptimizationCostAccountingInput = {
    skillId: "env-manager-v3",
    experimentId: "env-manager-v3-cost-accounting",
    quality: {
      equivalent: true,
      evidence: bound.get(artifactGatePath)!.ref,
    },
    adaptation: {
      humanMinutes: portfolioCase.adaptation.humanMinutes,
      adapterLoc: portfolioCase.adaptation.adapterLoc,
      coreBranchDelta: portfolioCase.adaptation.coreBranchDelta,
      reusedArtifactKinds: portfolioCase.adaptation.reusedArtifactKinds,
      unautomatedSteps: portfolioCase.adaptation.unautomatedSteps,
    },
    production: {
      oneTime: {
        compile: {
          modelTokens: missing("the package was manually engineered; an automatic optimizer/compiler token cost was not prospectively observed"),
          durationMs: missing("the frozen package predated compile-duration accounting"),
        },
        profile: {
          modelTokens: measured(0),
          durationMs: measured(0),
        },
        package: {
          modelTokens: measured(0),
          durationMs: missing("package assembly duration was not prospectively persisted"),
          bytes: measured(requiredNumber(artifactCost.packageBytes, "artifact package bytes")),
        },
      },
      runtime: {
        original: {
          samples: artifactOriginalRows.length,
          aggregateModelTokens: originalAggregateModelTokens,
          aggregateDurationMs: artifactOriginalRows.reduce((sum, row) => sum + row.latencyMs, 0),
        },
        optimized: {
          samples: artifactOptimizedRows.length,
          aggregateModelTokens: optimizedAggregateModelTokens,
          aggregateDurationMs: artifactOptimizedRows.reduce((sum, row) => sum + row.latencyMs, 0),
        },
        repairModelTokensPerRun: requiredNumber(artifactCost.modelRepairTokens, "artifact repair tokens")
          / artifactOptimizedRows.length,
      },
    },
    research: {
      attempts: [
        {
          id: "baseline-v1-operator-launch",
          kind: "operator-failure",
          attempts: 1,
          usage: zeroUsage(),
          durationMs: missing("operator launch duration was not persisted"),
        },
        {
          id: "baseline-v2-operator-launch",
          kind: "operator-failure",
          attempts: 1,
          usage: zeroUsage(),
          durationMs: missing("operator launch duration was not persisted"),
        },
        {
          id: "baseline-v3-operator-termination",
          kind: "operator-failure",
          attempts: 1,
          usage: missingUsage("model invocation evidence is explicitly unknown"),
          durationMs: missing("only an approximate outer-tool termination time was recorded"),
        },
        {
          id: "baseline-v4-qualification",
          kind: "qualification",
          attempts: baselineQualificationCost.attempts,
          usage: baselineQualificationCost.usage,
          durationMs: measured(requiredNumber(baselineQualification.durationMs, "baseline qualification duration")),
        },
        {
          id: "baseline-v4-matrix",
          kind: "matrix",
          ...baselineMatrix,
          selected: { ...baselineMatrix },
        },
        {
          id: "static-v1-qualification",
          kind: "qualification",
          attempts: 1,
          usage: missingUsage("static qualification persisted classification and duration but not token usage"),
          durationMs: measured(requiredNumber(staticQualification.durationMs, "static qualification duration")),
        },
        {
          id: "static-v1-matrix",
          kind: "matrix",
          ...staticMatrix,
          selected: { ...staticMatrix },
        },
        {
          id: "artifact-v1-qualification",
          kind: "qualification",
          attempts: 1,
          usage: missingUsage("artifact qualification persisted route success but not token usage"),
          durationMs: missing("artifact qualification duration was not persisted"),
        },
        {
          id: "artifact-v1-matrix",
          kind: "matrix",
          attempts: artifactScored.attempts,
          usage: artifactScored.usage,
          durationMs: artifactScored.durationMs,
          selected: {
            attempts: artifactScored.attempts,
            usage: artifactScored.usage,
            durationMs: artifactScored.durationMs,
          },
        },
      ],
      scorer: {
        modelTokens: measured(0),
        durationMs: missing("deterministic scorer duration was not separately measured"),
      },
      repair: {
        modelTokens: measured(requiredNumber(artifactCost.modelRepairTokens, "artifact repair tokens")),
        durationMs: measured(0),
      },
    },
    evidence: EVIDENCE_PATHS.map((relativePath) => bound.get(relativePath)!.ref),
  };
  return buildOptimizationCostAccountingReport(input);
}

export async function writeEnvManagerV3CostAccountingReport(input: {
  rootDir: string;
  outPath?: string;
}) {
  const root = path.resolve(input.rootDir);
  const outPath = path.resolve(
    root,
    input.outPath ?? "results/skill-ir/env-manager-v3-cost-accounting.json",
  );
  const report = await buildEnvManagerV3CostAccountingReport(root);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

if (import.meta.main) {
  const outArg = process.argv.slice(2).find((item) => item.startsWith("--out="));
  const unknown = process.argv.slice(2).filter((item) => !item.startsWith("--out="));
  if (unknown.length > 0) throw new Error(`Unknown argument: ${unknown[0]}`);
  const report = await writeEnvManagerV3CostAccountingReport({
    rootDir: process.cwd(),
    ...(outArg ? { outPath: outArg.slice("--out=".length) } : {}),
  });
  console.log(JSON.stringify({
    experimentId: report.experimentId,
    classification: report.eligibility.classification,
    productionCostComplete: report.completeness.productionCostComplete,
    allAttemptCostComplete: report.completeness.allAttemptCostComplete,
    breakEven: report.breakEven,
  }, null, 2));
}
