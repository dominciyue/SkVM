import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import type { ExecutionEnvelope } from "./execution-resilience";
import { GenericDomainPlanRepairReportSchema } from "./automatic-domain-plan-generic-repair";
import {
  REVIEWED_AOT_EFFICIENCY_FREEZE_PATH,
  REVIEWED_AOT_EFFICIENCY_POLICY_PATH,
  ReviewedAotEfficiencyPolicySchema,
  ReviewedAotEfficiencyRowSchema,
  assertReviewedAotEfficiencyPrefix,
  buildReviewedAotBundle,
  buildReviewedAotOriginalPlan,
  executeReviewedAotRow,
  validateReviewedAotEfficiencyFreeze,
  validateReviewedAotEfficiencyPolicy,
  type ReviewedAotEfficiencyRow,
} from "./reviewed-aot-efficiency-matrix";
import { buildOptimizationCostAccountingReport, type OptimizationCostAccountingInput } from "./optimization-cost-accounting";
import { executeProspectiveDevelopmentRow } from "./prospective-development-run";
import type { ProspectiveDevelopmentLock, ProspectiveDevelopmentPlan } from "./prospective-development";
import { scoreRawRunRows, type RawAgentRunRow, type ScoredAgentRunRow } from "./scoring";
import { sha256Bytes } from "./source-fixture";
import type { SkillIRBenchmarkTask } from "./real-agent";

type Phase = "plan" | "execute";
type PrefixEntry = {
  row: ReviewedAotEfficiencyRow;
  raw: RawAgentRunRow;
  scored: ScoredAgentRunRow;
  originalEnvelope: ExecutionEnvelope | null;
  scorerDurationMs: number;
};

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
}

function safeChild(root: string, path: string): string {
  const candidate = resolve(root, path);
  const fromRoot = relative(resolve(root), candidate);
  if (!fromRoot || fromRoot.startsWith("..") || isAbsolute(fromRoot)) throw new Error("reviewed-AOT output must be a child directory");
  return candidate;
}

async function writeAtomicJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.next`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

async function readPrefix(path: string): Promise<PrefixEntry[]> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (!Array.isArray(value)) throw new Error("reviewed-AOT prefix must be an array");
    return value.map((entry, index) => {
      if (!entry || typeof entry !== "object" || !("row" in entry) || !("raw" in entry)
        || !("scored" in entry) || !("originalEnvelope" in entry) || !("scorerDurationMs" in entry)) {
        throw new Error(`reviewed-AOT prefix entry ${index + 1} is malformed`);
      }
      const record = entry as PrefixEntry;
      ReviewedAotEfficiencyRowSchema.parse(record.row);
      if (!Number.isFinite(record.scorerDurationMs) || record.scorerDurationMs < 0) {
        throw new Error(`reviewed-AOT prefix scorer duration ${index + 1} is malformed`);
      }
      return record;
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function shouldStop(classification: ExecutionEnvelope["classification"]): boolean {
  return new Set(["qualification-failure", "parser-incompatible", "runtime-crash", "measurement-invalid"])
    .has(classification);
}

function measured(value: number) { return { status: "measured" as const, value }; }
function usage(input: number, output: number, cacheRead: number, cacheWrite: number) {
  return {
    inputTokens: measured(input), outputTokens: measured(output),
    cacheReadTokens: measured(cacheRead), cacheWriteTokens: measured(cacheWrite),
  };
}

async function evidenceRef(rootDir: string, absolutePath: string) {
  const path = relative(rootDir, absolutePath).replaceAll("\\", "/");
  if (!path || path.startsWith("../") || isAbsolute(path)) throw new Error("reviewed-AOT evidence escapes repository");
  return { path, sha256: sha256Bytes(await readFile(absolutePath)) };
}

async function buildCostReport(options: {
  rootDir: string;
  policy: ReturnType<typeof ReviewedAotEfficiencyPolicySchema.parse>;
  freezePath: string;
  entries: PrefixEntry[];
  capturePath: string;
  rawPath: string;
  scoredPath: string;
  envelopePath: string;
}) {
  const original = options.entries.filter((entry) => entry.row.system === "original");
  const reviewed = options.entries.filter((entry) => entry.row.system === "reviewed-aot");
  const envelopes = original.map((entry) => {
    if (!entry.originalEnvelope?.usage.available) throw new Error("reviewed-AOT original row usage is unavailable");
    return entry.originalEnvelope;
  });
  if (original.length !== 4 || reviewed.length !== 4) throw new Error("reviewed-AOT cost report requires eight rows");
  const reviewPath = resolve(options.rootDir, options.policy.frozenInputs.reviewReport.path);
  const review = JSON.parse(await readFile(reviewPath, "utf8")) as {
    inputs: { automaticReport: { path: string } };
    patch: { humanMinutes: number; physicalLoc: number; coreBranchDelta: number };
    construction: {
      synthesis: { durationMs: number }; compile: { durationMs: number }; profile: { durationMs: number };
      package: { durationMs: number; bytes: number };
    };
  };
  const synthesisPath = resolve(options.rootDir, review.inputs.automaticReport.path);
  const synthesis = GenericDomainPlanRepairReportSchema.parse(JSON.parse(await readFile(synthesisPath, "utf8")));
  if (!synthesis.tokens) throw new Error("reviewed-AOT synthesis usage is missing");
  const scoreKey = (entry: PrefixEntry) => `${entry.row.taskId}:${entry.row.repetition}`;
  const originals = new Map(original.map((entry) => [scoreKey(entry), entry.scored]));
  const qualityEquivalent = reviewed.every((entry) => {
    const baseline = originals.get(scoreKey(entry));
    return entry.scored.success && entry.scored.evaluatorScore === 1
      && baseline?.evaluatorScore !== undefined && entry.scored.evaluatorScore >= baseline.evaluatorScore
      && entry.scored.failureType === undefined;
  });
  const sumEnvelope = (field: "input" | "output" | "cacheRead" | "cacheWrite") =>
    envelopes.reduce((sum, envelope) => sum + envelope.usage[field], 0);
  const originalDuration = original.reduce((sum, entry) => sum + entry.raw.durationMs, 0);
  const reviewedDuration = reviewed.reduce((sum, entry) => sum + entry.raw.durationMs, 0);
  const scorerDuration = options.entries.reduce((sum, entry) => sum + entry.scorerDurationMs, 0);
  const evidence = await Promise.all([
    evidenceRef(options.rootDir, resolve(options.rootDir, REVIEWED_AOT_EFFICIENCY_POLICY_PATH)),
    evidenceRef(options.rootDir, options.freezePath),
    evidenceRef(options.rootDir, resolve(options.rootDir, options.policy.constructionCostReadiness.path)),
    evidenceRef(options.rootDir, reviewPath), evidenceRef(options.rootDir, synthesisPath),
    evidenceRef(options.rootDir, options.capturePath), evidenceRef(options.rootDir, options.rawPath),
    evidenceRef(options.rootDir, options.scoredPath), evidenceRef(options.rootDir, options.envelopePath),
  ]);
  const input: OptimizationCostAccountingInput = {
    skillId: "env-manager-reviewed-aot",
    experimentId: options.policy.experimentId,
    quality: { equivalent: qualityEquivalent, evidence: await evidenceRef(options.rootDir, options.capturePath) },
    adaptation: {
      humanMinutes: review.patch.humanMinutes, adapterLoc: review.patch.physicalLoc,
      coreBranchDelta: review.patch.coreBranchDelta,
      reusedArtifactKinds: ["automatic-domain-plan", "deterministic-review-patch"],
      unautomatedSteps: ["case-local domain review patch authoring"],
    },
    production: {
      oneTime: {
        compile: {
          modelTokens: measured(options.policy.productionOneTime.compileModelTokens),
          durationMs: measured(review.construction.synthesis.durationMs + review.construction.compile.durationMs),
        },
        profile: {
          modelTokens: measured(options.policy.productionOneTime.profileModelTokens),
          durationMs: measured(review.construction.profile.durationMs),
        },
        package: {
          modelTokens: measured(options.policy.productionOneTime.packageModelTokens),
          durationMs: measured(review.construction.package.durationMs), bytes: measured(review.construction.package.bytes),
        },
      },
      runtime: {
        original: { samples: 4, aggregateModelTokens: sumEnvelope("input") + sumEnvelope("output"), aggregateDurationMs: originalDuration },
        optimized: { samples: 4, aggregateModelTokens: 0, aggregateDurationMs: reviewedDuration },
        repairModelTokensPerRun: 0,
      },
    },
    research: {
      attempts: [
        {
          id: "automatic-domain-plan-synthesis", kind: "repair", attempts: 1,
          usage: usage(synthesis.tokens.input, synthesis.tokens.output, synthesis.tokens.cacheRead, synthesis.tokens.cacheWrite),
          durationMs: measured(synthesis.durationMs),
        },
        {
          id: "paid-original-matrix", kind: "matrix", attempts: 4,
          usage: usage(sumEnvelope("input"), sumEnvelope("output"), sumEnvelope("cacheRead"), sumEnvelope("cacheWrite")),
          durationMs: measured(originalDuration),
          selected: {
            attempts: 4,
            usage: usage(sumEnvelope("input"), sumEnvelope("output"), sumEnvelope("cacheRead"), sumEnvelope("cacheWrite")),
            durationMs: measured(originalDuration),
          },
        },
        {
          id: "deterministic-reviewed-aot-matrix", kind: "matrix", attempts: 4,
          usage: usage(0, 0, 0, 0), durationMs: measured(reviewedDuration),
          selected: { attempts: 4, usage: usage(0, 0, 0, 0), durationMs: measured(reviewedDuration) },
        },
      ],
      scorer: { modelTokens: measured(0), durationMs: measured(scorerDuration) },
      repair: { modelTokens: measured(0), durationMs: measured(0) },
    },
    evidence,
  };
  return buildOptimizationCostAccountingReport(input);
}

async function main() {
  const rootDir = resolve(argument("root") ?? process.cwd());
  const phase = argument("phase") as Phase | undefined;
  if (phase !== "plan" && phase !== "execute") throw new Error("--phase=plan|execute is required");
  const outDir = safeChild(resolve(rootDir, "results/skill-ir"),
    argument("out-dir") ?? "env-manager-reviewed-aot-efficiency-v1/run");
  const policyPath = resolve(rootDir, REVIEWED_AOT_EFFICIENCY_POLICY_PATH);
  const freezePath = resolve(rootDir, REVIEWED_AOT_EFFICIENCY_FREEZE_PATH);
  const policy = ReviewedAotEfficiencyPolicySchema.parse(JSON.parse(await readFile(policyPath, "utf8")));
  const validated = await validateReviewedAotEfficiencyPolicy(policy, rootDir);
  await validateReviewedAotEfficiencyFreeze(JSON.parse(await readFile(freezePath, "utf8")), rootDir, policy);
  const originalPlan = await buildReviewedAotOriginalPlan({ rootDir, outDir, policy });
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "plan.json"), `${JSON.stringify({
    schemaVersion: "skill-ir-reviewed-aot-efficiency-plan/v1", experimentId: policy.experimentId,
    rows: validated.rows, originalPlan: originalPlan.rows,
  }, null, 2)}\n`, "utf8");
  if (phase === "plan") return { phase, rows: 8, paidCalls: 0, matrixExecuted: false };
  if (!process.env[policy.runtime.apiKeyEnv]?.trim()) throw new Error(`Missing ${policy.runtime.apiKeyEnv}`);

  const prefixPath = join(outDir, "matrix-prefix.json");
  const prefix = await readPrefix(prefixPath);
  assertReviewedAotEfficiencyPrefix(validated.rows, prefix.map((entry) => entry.row));
  const priorBlocker = prefix.find((entry) => entry.originalEnvelope && shouldStop(entry.originalEnvelope.classification));
  if (priorBlocker) throw new Error(`reviewed-AOT persisted blocker: ${priorBlocker.originalEnvelope!.classification}`);
  const bundle = await buildReviewedAotBundle({ rootDir, outDir: join(outDir, "reviewed-aot-bundle"), policy, review: validated.review });
  const taskSet = JSON.parse(await readFile(resolve(rootDir, policy.frozenInputs.tasks.path), "utf8")) as { tasks: SkillIRBenchmarkTask[] };
  const taskById = new Map(taskSet.tasks.map((task) => [task.id, task]));
  for (let index = prefix.length; index < validated.rows.length; index += 1) {
    const identity = validated.rows[index]!;
    const originalRow = originalPlan.rows.find((row) => row.caseId.endsWith(`:${identity.taskId}`) && row.runIndex === identity.repetition);
    if (!originalRow) throw new Error(`reviewed-AOT missing original row for ${identity.taskId}/${identity.repetition}`);
    let raw: RawAgentRunRow;
    let originalEnvelope: ExecutionEnvelope | null = null;
    if (identity.system === "original") {
      const executed = await executeProspectiveDevelopmentRow({
        row: originalRow as unknown as ProspectiveDevelopmentPlan["plan"][number],
        lock: { experimentId: policy.experimentId, runtime: policy.runtime } as unknown as ProspectiveDevelopmentLock,
        env: { ...process.env, SKVM_AUTO_PROBE: "0" },
      });
      raw = executed.raw;
      originalEnvelope = executed.envelope;
    } else {
      raw = await executeReviewedAotRow({
        rootDir, policy, originalRow, bundlePath: bundle.path,
        workDir: join(outDir, "reviewed-aot-workdirs", identity.taskId, `run-${identity.repetition}`),
      });
    }
    const scorerStarted = performance.now();
    const [scored] = await scoreRawRunRows([raw], taskById);
    const scorerDurationMs = performance.now() - scorerStarted;
    if (!scored) throw new Error("reviewed-AOT scorer did not produce a row");
    prefix.push({ row: identity, raw, scored, originalEnvelope, scorerDurationMs });
    await writeAtomicJson(prefixPath, prefix);
    console.log(JSON.stringify({ completed: index + 1, total: 8, system: identity.system,
      classification: originalEnvelope?.classification ?? (scored.failureType ?? "semantic-complete") }));
    if ((originalEnvelope && shouldStop(originalEnvelope.classification))
      || (identity.system === "reviewed-aot" && scored.failureType === "infrastructure")) {
      throw new Error(`reviewed-AOT execution blocker at row ${index + 1}`);
    }
  }

  const rawPath = join(outDir, "raw-runs.jsonl");
  const scoredPath = join(outDir, "scored-runs.jsonl");
  const envelopePath = join(outDir, "execution-envelopes.jsonl");
  await Promise.all([
    writeFile(rawPath, `${prefix.map((entry) => JSON.stringify(entry.raw)).join("\n")}\n`, "utf8"),
    writeFile(scoredPath, `${prefix.map((entry) => JSON.stringify(entry.scored)).join("\n")}\n`, "utf8"),
    writeFile(envelopePath, `${prefix.filter((entry) => entry.originalEnvelope).map((entry) => JSON.stringify(entry.originalEnvelope)).join("\n")}\n`, "utf8"),
  ]);
  const pairs = policy.denominator.taskIds.flatMap((taskId) => [1, 2].map((repetition) => {
    const pair = prefix.filter((entry) => entry.row.taskId === taskId && entry.row.repetition === repetition);
    const original = pair.find((entry) => entry.row.system === "original")!.scored;
    const reviewed = pair.find((entry) => entry.row.system === "reviewed-aot")!.scored;
    return {
      taskId, repetition, originalScore: original.evaluatorScore ?? null,
      reviewedAotScore: reviewed.evaluatorScore ?? null,
      regressed: (reviewed.evaluatorScore ?? -1) < (original.evaluatorScore ?? 1),
      reviewedAotPassed: reviewed.success,
    };
  }));
  const capturePath = join(dirname(outDir), "matrix-capture.json");
  const capture = {
    schemaVersion: "skill-ir-reviewed-aot-efficiency-capture/v1", experimentId: policy.experimentId,
    policySha256: sha256Bytes(await readFile(policyPath)), freezeSha256: sha256Bytes(await readFile(freezePath)),
    attemptedRows: 8, paidOriginalRows: 4, deterministicReviewedAotRows: 4, retries: 0, pairs,
    qualityEquivalent: pairs.every((pair) => pair.reviewedAotPassed && !pair.regressed),
    authorizations: { heldOut: false, readinessPromotion: false },
  };
  await writeAtomicJson(capturePath, capture);
  const cost = await buildCostReport({ rootDir, policy, freezePath, entries: prefix, capturePath, rawPath, scoredPath, envelopePath });
  const costPath = join(dirname(outDir), "cost-accounting.json");
  await writeAtomicJson(costPath, cost);
  return {
    phase, rows: 8, paidCalls: 4, retries: 0, qualityEquivalent: cost.quality.equivalent,
    classification: cost.eligibility.classification,
    productionCostComplete: cost.completeness.productionCostComplete,
    allAttemptCostComplete: cost.completeness.allAttemptCostComplete,
    breakEven: cost.breakEven, costPath,
  };
}

main().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
