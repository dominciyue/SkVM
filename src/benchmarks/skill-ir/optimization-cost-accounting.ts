import { z } from "zod";

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const PortablePathSchema = z.string().min(1).refine(
  (value) => !/^(?:[A-Za-z]:[\\/]|[\\/])/u.test(value) && !value.includes("\\"),
  "evidence path must be repository-relative and slash-normalized",
);

export const OptimizationCostEvidenceRefSchema = z.object({
  path: PortablePathSchema,
  sha256: Sha256Schema,
}).strict();

export const OptimizationCostValueSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("measured"), value: z.number().nonnegative() }).strict(),
  z.object({
    status: z.literal("missing"),
    value: z.null(),
    reason: z.string().min(1),
  }).strict(),
]);

const CostComponentSchema = z.object({
  modelTokens: OptimizationCostValueSchema,
  durationMs: OptimizationCostValueSchema,
  bytes: OptimizationCostValueSchema.optional(),
}).strict();

const RuntimeArmSchema = z.object({
  samples: z.number().int().positive(),
  aggregateModelTokens: z.number().nonnegative(),
  aggregateDurationMs: z.number().nonnegative(),
}).strict();

const ResearchAttemptSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["operator-failure", "qualification", "matrix", "repair", "other"]),
  attempts: z.number().int().nonnegative(),
  usage: z.object({
    inputTokens: OptimizationCostValueSchema,
    outputTokens: OptimizationCostValueSchema,
    cacheReadTokens: OptimizationCostValueSchema,
    cacheWriteTokens: OptimizationCostValueSchema,
  }).strict(),
  durationMs: OptimizationCostValueSchema,
  selected: z.object({
    attempts: z.number().int().nonnegative(),
    usage: z.object({
      inputTokens: OptimizationCostValueSchema,
      outputTokens: OptimizationCostValueSchema,
      cacheReadTokens: OptimizationCostValueSchema,
      cacheWriteTokens: OptimizationCostValueSchema,
    }).strict(),
    durationMs: OptimizationCostValueSchema,
  }).strict().optional(),
}).strict();

export const OptimizationCostAccountingInputSchema = z.object({
  skillId: z.string().min(1),
  experimentId: z.string().min(1),
  quality: z.object({
    equivalent: z.boolean(),
    evidence: OptimizationCostEvidenceRefSchema,
  }).strict(),
  adaptation: z.object({
    humanMinutes: z.number().nonnegative(),
    adapterLoc: z.number().int().nonnegative(),
    coreBranchDelta: z.number().int().nonnegative(),
    reusedArtifactKinds: z.array(z.string().min(1)),
    unautomatedSteps: z.array(z.string().min(1)),
  }).strict(),
  production: z.object({
    oneTime: z.object({
      compile: CostComponentSchema,
      profile: CostComponentSchema,
      package: CostComponentSchema.extend({ bytes: OptimizationCostValueSchema }),
    }).strict(),
    runtime: z.object({
      original: RuntimeArmSchema,
      optimized: RuntimeArmSchema,
      repairModelTokensPerRun: z.number().nonnegative(),
    }).strict(),
  }).strict(),
  research: z.object({
    attempts: z.array(ResearchAttemptSchema),
    scorer: CostComponentSchema,
    repair: CostComponentSchema,
  }).strict(),
  evidence: z.array(OptimizationCostEvidenceRefSchema).min(1),
}).strict().superRefine((input, context) => {
  const ids = new Set<string>();
  for (const attempt of input.research.attempts) {
    if (ids.has(attempt.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["research", "attempts"],
        message: `duplicate research attempt phase: ${attempt.id}`,
      });
    }
    ids.add(attempt.id);
  }
});

export type OptimizationCostAccountingInput = z.input<typeof OptimizationCostAccountingInputSchema>;

const AmortizationRowSchema = z.discriminatedUnion("status", [
  z.object({
    calls: z.union([z.literal(1), z.literal(2), z.literal(5), z.literal(10)]),
    originalModelTokens: z.number().nonnegative(),
    optimizedModelTokens: z.number().nonnegative(),
    status: z.literal("computed"),
  }).strict(),
  z.object({
    calls: z.union([z.literal(1), z.literal(2), z.literal(5), z.literal(10)]),
    originalModelTokens: z.number().nonnegative(),
    optimizedModelTokens: z.null(),
    status: z.literal("missing"),
  }).strict(),
]);

const BreakEvenSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("computed"), calls: z.number().int().positive(), missing: z.tuple([]) }).strict(),
  z.object({ status: z.literal("not-reached"), calls: z.null(), missing: z.tuple([]) }).strict(),
  z.object({
    status: z.literal("not-computable"),
    calls: z.null(),
    missing: z.array(z.string().min(1)).min(1),
  }).strict(),
]);

export const OptimizationCostAccountingReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-optimization-cost-accounting/v1"),
  skillId: z.string().min(1),
  experimentId: z.string().min(1),
  quality: z.object({
    equivalent: z.boolean(),
    evidence: OptimizationCostEvidenceRefSchema,
  }).strict(),
  adaptation: z.object({
    humanMinutes: z.number().nonnegative(),
    adapterLoc: z.number().int().nonnegative(),
    coreBranchDelta: z.number().int().nonnegative(),
    reusedArtifactKinds: z.array(z.string().min(1)),
    unautomatedSteps: z.array(z.string().min(1)),
  }).strict(),
  production: z.object({
    oneTime: z.object({
      compile: CostComponentSchema,
      profile: CostComponentSchema,
      package: CostComponentSchema.extend({ bytes: OptimizationCostValueSchema }),
    }).strict(),
    runtime: z.object({
      original: RuntimeArmSchema.extend({
        modelTokensPerRun: z.number().nonnegative(),
        durationMsPerRun: z.number().nonnegative(),
      }),
      optimized: RuntimeArmSchema.extend({
        repairModelTokensPerRun: z.number().nonnegative(),
        modelTokensPerRun: z.number().nonnegative(),
        durationMsPerRun: z.number().nonnegative(),
      }),
    }).strict(),
    missing: z.array(z.string().min(1)),
  }).strict(),
  research: z.object({
    attempts: z.array(ResearchAttemptSchema),
    scorer: CostComponentSchema,
    repair: CostComponentSchema,
    knownModelTokens: z.number().nonnegative(),
    knownCacheReadTokens: z.number().nonnegative(),
    knownCacheWriteTokens: z.number().nonnegative(),
    knownDurationMs: z.number().nonnegative(),
    missing: z.array(z.string().min(1)),
  }).strict(),
  amortization: z.tuple([
    AmortizationRowSchema,
    AmortizationRowSchema,
    AmortizationRowSchema,
    AmortizationRowSchema,
  ]),
  breakEven: BreakEvenSchema,
  completeness: z.object({
    productionCostComplete: z.boolean(),
    allAttemptCostComplete: z.boolean(),
    breakEvenComplete: z.boolean(),
  }).strict(),
  eligibility: z.object({
    classification: z.enum(["efficiency-positive", "fidelity-preserving", "not-established"]),
    efficiencyPositiveEligible: z.boolean(),
    reasons: z.array(z.string().min(1)),
  }).strict(),
  evidence: z.array(OptimizationCostEvidenceRefSchema).min(1),
  claimBoundary: z.string().min(1),
}).strict();

export type OptimizationCostAccountingReport = z.infer<typeof OptimizationCostAccountingReportSchema>;

type CostValue = z.infer<typeof OptimizationCostValueSchema>;

function measuredValue(value: CostValue): number | undefined {
  return value.status === "measured" ? value.value : undefined;
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}

function missingComponentFields(
  prefix: string,
  component: z.infer<typeof CostComponentSchema>,
  requireBytes = false,
): string[] {
  const missing: string[] = [];
  if (component.modelTokens.status === "missing") missing.push(`${prefix}.modelTokens`);
  if (component.durationMs.status === "missing") missing.push(`${prefix}.durationMs`);
  if (requireBytes && component.bytes?.status !== "measured") missing.push(`${prefix}.bytes`);
  return missing;
}

export function buildOptimizationCostAccountingReport(rawInput: OptimizationCostAccountingInput) {
  const input = OptimizationCostAccountingInputSchema.parse(rawInput);
  const originalModelTokensPerRun = round4(
    input.production.runtime.original.aggregateModelTokens / input.production.runtime.original.samples,
  );
  const optimizedModelTokensPerRun = round4(
    input.production.runtime.optimized.aggregateModelTokens / input.production.runtime.optimized.samples
      + input.production.runtime.repairModelTokensPerRun,
  );
  const originalDurationMsPerRun = round4(
    input.production.runtime.original.aggregateDurationMs / input.production.runtime.original.samples,
  );
  const optimizedDurationMsPerRun = round4(
    input.production.runtime.optimized.aggregateDurationMs / input.production.runtime.optimized.samples,
  );

  const productionMissing = [
    ...missingComponentFields("production.oneTime.compile", input.production.oneTime.compile),
    ...missingComponentFields("production.oneTime.profile", input.production.oneTime.profile),
    ...missingComponentFields("production.oneTime.package", input.production.oneTime.package, true),
  ];
  const oneTimeTokenFields = [
    ["production.oneTime.compile.modelTokens", input.production.oneTime.compile.modelTokens],
    ["production.oneTime.profile.modelTokens", input.production.oneTime.profile.modelTokens],
    ["production.oneTime.package.modelTokens", input.production.oneTime.package.modelTokens],
  ] as const;
  const breakEvenMissing = oneTimeTokenFields
    .filter(([, value]) => value.status === "missing")
    .map(([path]) => path);
  const oneTimeModelTokens = breakEvenMissing.length === 0
    ? oneTimeTokenFields.reduce((sum, [, value]) => sum + (measuredValue(value) ?? 0), 0)
    : null;

  const calls = [1, 2, 5, 10] as const;
  const amortization = calls.map((count) => ({
    calls: count,
    originalModelTokens: round4(originalModelTokensPerRun * count),
    optimizedModelTokens: oneTimeModelTokens === null
      ? null
      : round4(oneTimeModelTokens + optimizedModelTokensPerRun * count),
    status: oneTimeModelTokens === null ? "missing" as const : "computed" as const,
  }));

  const recurringSavings = originalModelTokensPerRun - optimizedModelTokensPerRun;
  const breakEven = oneTimeModelTokens === null
    ? { status: "not-computable" as const, calls: null, missing: breakEvenMissing }
    : recurringSavings <= 0
      ? { status: "not-reached" as const, calls: null, missing: [] as string[] }
      : {
          status: "computed" as const,
          calls: Math.max(1, Math.ceil(oneTimeModelTokens / recurringSavings)),
          missing: [] as string[],
        };

  const researchMissing: string[] = [];
  let knownModelTokens = 0;
  let knownCacheReadTokens = 0;
  let knownCacheWriteTokens = 0;
  let knownDurationMs = 0;
  for (const attempt of input.research.attempts) {
    for (const [name, value] of Object.entries(attempt.usage)) {
      if (value.status === "missing") {
        researchMissing.push(`research.attempts.${attempt.id}.usage.${name}`);
      }
    }
    if (attempt.usage.inputTokens.status === "measured") {
      knownModelTokens += attempt.usage.inputTokens.value;
    }
    if (attempt.usage.outputTokens.status === "measured") {
      knownModelTokens += attempt.usage.outputTokens.value;
    }
    if (attempt.usage.cacheReadTokens.status === "measured") {
      knownCacheReadTokens += attempt.usage.cacheReadTokens.value;
    }
    if (attempt.usage.cacheWriteTokens.status === "measured") {
      knownCacheWriteTokens += attempt.usage.cacheWriteTokens.value;
    }
    if (attempt.durationMs.status === "measured") knownDurationMs += attempt.durationMs.value;
    else researchMissing.push(`research.attempts.${attempt.id}.durationMs`);
  }
  for (const [name, component] of [
    ["scorer", input.research.scorer],
    ["repair", input.research.repair],
  ] as const) {
    if (component.modelTokens.status === "measured") knownModelTokens += component.modelTokens.value;
    else researchMissing.push(`research.${name}.modelTokens`);
    if (component.durationMs.status === "measured") knownDurationMs += component.durationMs.value;
    else researchMissing.push(`research.${name}.durationMs`);
  }

  const completeness = {
    productionCostComplete: productionMissing.length === 0,
    allAttemptCostComplete: researchMissing.length === 0,
    breakEvenComplete: breakEven.status !== "not-computable",
  };
  const reasons: string[] = [];
  if (!input.quality.equivalent) reasons.push("quality equivalence gate did not pass");
  if (!completeness.productionCostComplete) reasons.push("production compile/profile/package cost is incomplete");
  if (!completeness.allAttemptCostComplete) reasons.push("research all-attempt cost is incomplete");
  if (!completeness.breakEvenComplete) reasons.push("break-even is not computable");
  else if (breakEven.status === "not-reached") reasons.push("optimized runtime has no positive recurring token saving");
  const efficiencyPositiveEligible = input.quality.equivalent
    && completeness.productionCostComplete
    && completeness.allAttemptCostComplete
    && breakEven.status === "computed";

  return OptimizationCostAccountingReportSchema.parse({
    schemaVersion: "skill-ir-optimization-cost-accounting/v1" as const,
    skillId: input.skillId,
    experimentId: input.experimentId,
    quality: input.quality,
    adaptation: input.adaptation,
    production: {
      oneTime: input.production.oneTime,
      runtime: {
        original: {
          ...input.production.runtime.original,
          modelTokensPerRun: originalModelTokensPerRun,
          durationMsPerRun: originalDurationMsPerRun,
        },
        optimized: {
          ...input.production.runtime.optimized,
          repairModelTokensPerRun: input.production.runtime.repairModelTokensPerRun,
          modelTokensPerRun: optimizedModelTokensPerRun,
          durationMsPerRun: optimizedDurationMsPerRun,
        },
      },
      missing: productionMissing,
    },
    research: {
      ...input.research,
      knownModelTokens,
      knownCacheReadTokens,
      knownCacheWriteTokens,
      knownDurationMs,
      missing: researchMissing,
    },
    amortization,
    breakEven,
    completeness,
    eligibility: {
      classification: efficiencyPositiveEligible
        ? "efficiency-positive" as const
        : input.quality.equivalent
          ? "fidelity-preserving" as const
          : "not-established" as const,
      efficiencyPositiveEligible,
      reasons,
    },
    evidence: input.evidence,
    claimBoundary: "Token amortization uses production AOT cost only; research validation cost and human effort remain separately disclosed and are required for efficiency-positive eligibility.",
  });
}
