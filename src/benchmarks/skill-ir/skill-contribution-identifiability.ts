import { createHash } from "node:crypto"
import { lstat, readFile, realpath } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u)
const SafeIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u)
const SafeRelativePathSchema = z.string().min(1).refine((value) => {
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || value.includes("\\")) {
    return false
  }
  return value.split("/").every(
    (segment) => segment.length > 0 && segment !== "." && segment !== "..",
  )
}, "path must be a safe POSIX relative path")

const BoundFileSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict()

export const ContributionSourceSchema = z.enum([
  "task-outcome",
  "fixture-derived",
  "skill-derived",
  "overlap",
])

export type ContributionSource = z.infer<typeof ContributionSourceSchema>

const EvidenceAnchorBaseSchema = BoundFileSchema.extend({
  quote: z.string().min(1),
})

const EvidenceAnchorSchema = z.discriminatedUnion("source", [
  EvidenceAnchorBaseSchema.extend({
    source: z.literal("task-outcome"),
    kind: z.enum(["task-set", "public-contract"]),
  }).strict(),
  EvidenceAnchorBaseSchema.extend({
    source: z.literal("fixture-derived"),
    kind: z.enum(["task-set", "public-contract", "scorer"]),
  }).strict(),
  EvidenceAnchorBaseSchema.extend({
    source: z.literal("skill-derived"),
    kind: z.literal("skill-source"),
  }).strict(),
  EvidenceAnchorBaseSchema.extend({
    source: z.literal("overlap"),
    kind: z.enum(["task-set", "public-contract", "skill-source"]),
  }).strict(),
])

const CriterionSchema = z.object({
  id: SafeIdSchema,
  taskId: SafeIdSchema,
  weight: z.number().positive().max(1),
  hardGate: z.boolean(),
  claimIds: z.array(SafeIdSchema).min(1),
  provenance: z.array(ContributionSourceSchema).min(1),
}).strict()

const ClaimSchema = z.object({
  id: SafeIdSchema,
  summary: z.string().min(1).max(320),
  taskIds: z.array(SafeIdSchema).min(1),
  failureMode: SafeIdSchema,
  answerBearingDuplication: z.boolean(),
  evidence: z.array(EvidenceAnchorSchema).min(1),
}).strict()

const CanaryRoleSchema = z.enum([
  "canonical-valid",
  "alternative-valid",
  "prompt-only-omission",
  "reverse-evidence",
  "forbidden-sink",
])

const CanarySchema = z.object({
  id: SafeIdSchema,
  role: CanaryRoleSchema,
  taskIds: z.array(SafeIdSchema).min(1),
  claimIds: z.array(SafeIdSchema).min(1),
  observation: BoundFileSchema.extend({
    jsonPointer: z.string().regex(/^\/(?:[^~/]|~[01])*(?:\/(?:[^~/]|~[01])*)*$/u),
    expected: z.boolean(),
  }).strict(),
}).strict()

const ForbiddenEvidenceClassesSchema = z.tuple([
  z.literal("evaluation-split-task"),
  z.literal("evaluator-expected"),
  z.literal("historical-raw-model-text"),
  z.literal("package-generated-answer"),
  z.literal("secret"),
  z.literal("absolute-path"),
])

function requireUnique(
  values: readonly string[],
  context: z.RefinementCtx,
  issuePath: Array<string | number>,
  label: string,
): void {
  if (new Set(values).size !== values.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: issuePath,
      message: `${label} must be unique`,
    })
  }
}

export const SkillContributionIdentifiabilityManifestSchema = z.object({
  schemaVersion: z.literal("skill-contribution-identifiability/v1"),
  auditId: SafeIdSchema,
  skillId: SafeIdSchema,
  taskSetId: SafeIdSchema,
  scope: z.object({
    split: z.literal("development"),
    taskIds: z.array(SafeIdSchema).min(1),
  }).strict(),
  criteria: z.array(CriterionSchema).min(1),
  claims: z.array(ClaimSchema).min(1),
  canaries: z.array(CanarySchema).min(1),
  forbiddenEvidenceClasses: ForbiddenEvidenceClassesSchema,
}).strict().superRefine((manifest, context) => {
  requireUnique(manifest.scope.taskIds, context, ["scope", "taskIds"], "scope task IDs")
  requireUnique(manifest.criteria.map((criterion) => criterion.id), context, ["criteria"], "criterion IDs")
  requireUnique(manifest.claims.map((claim) => claim.id), context, ["claims"], "claim IDs")
  requireUnique(manifest.canaries.map((canary) => canary.id), context, ["canaries"], "canary IDs")

  const taskIds = new Set(manifest.scope.taskIds)
  const claimById = new Map(manifest.claims.map((claim) => [claim.id, claim]))
  for (const [index, claim] of manifest.claims.entries()) {
    requireUnique(claim.taskIds, context, ["claims", index, "taskIds"], `claim ${claim.id} task IDs`)
    if (claim.taskIds.some((taskId) => !taskIds.has(taskId))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["claims", index, "taskIds"],
        message: `claim ${claim.id} references a task outside the development scope`,
      })
    }
  }

  for (const [index, criterion] of manifest.criteria.entries()) {
    requireUnique(
      criterion.claimIds,
      context,
      ["criteria", index, "claimIds"],
      `criterion ${criterion.id} claim IDs`,
    )
    requireUnique(
      criterion.provenance,
      context,
      ["criteria", index, "provenance"],
      `criterion ${criterion.id} provenance`,
    )
    if (!taskIds.has(criterion.taskId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["criteria", index, "taskId"],
        message: `criterion ${criterion.id} references a task outside the development scope`,
      })
    }
    if (criterion.claimIds.some((claimId) => {
      const claim = claimById.get(claimId)
      return !claim || !claim.taskIds.includes(criterion.taskId)
    })) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["criteria", index, "claimIds"],
        message: `criterion ${criterion.id} has an unknown or task-incompatible claim`,
      })
    }
  }

  for (const taskId of manifest.scope.taskIds) {
    const total = manifest.criteria
      .filter((criterion) => criterion.taskId === taskId)
      .reduce((sum, criterion) => sum + criterion.weight, 0)
    if (Math.abs(total - 1) > 1e-9) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["criteria"],
        message: `criterion weights for ${taskId} must sum to 1`,
      })
    }
  }

  for (const [index, canary] of manifest.canaries.entries()) {
    requireUnique(canary.taskIds, context, ["canaries", index, "taskIds"], `canary ${canary.id} task IDs`)
    requireUnique(canary.claimIds, context, ["canaries", index, "claimIds"], `canary ${canary.id} claim IDs`)
    if (canary.taskIds.some((taskId) => !taskIds.has(taskId))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["canaries", index, "taskIds"],
        message: `canary ${canary.id} references a task outside the development scope`,
      })
    }
    if (canary.claimIds.some((claimId) => !claimById.has(claimId))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["canaries", index, "claimIds"],
        message: `canary ${canary.id} references an unknown claim`,
      })
    }
  }
})

export type SkillContributionIdentifiabilityManifest = z.infer<
  typeof SkillContributionIdentifiabilityManifestSchema
>

export type VerifiedContributionManifest = {
  manifest: SkillContributionIdentifiabilityManifest
  canaryObservations: ReadonlyMap<string, boolean>
}

const GateSchema = z.object({
  enoughIndependentClaims: z.boolean(),
  everyTaskMeasuresSkillClaim: z.boolean(),
  enoughSkillDerivedWeightOrHardGate: z.boolean(),
  noAnswerBearingDuplication: z.boolean(),
  requiredCanariesPassed: z.boolean(),
}).strict()

const IssueCodeSchema = z.enum([
  "TOO_FEW_INDEPENDENT_SKILL_CLAIMS",
  "TASK_SKILL_COVERAGE_GAP",
  "SKILL_WEIGHT_OR_HARD_GATE_GAP",
  "ANSWER_BEARING_DUPLICATION",
  "REQUIRED_CANARY_MISSING",
  "CANARY_OBSERVATION_FAILED",
])

export const SkillContributionIdentifiabilityReportSchema = z.object({
  schemaVersion: z.literal("skill-contribution-identifiability-report/v1"),
  auditId: SafeIdSchema,
  skillId: SafeIdSchema,
  taskSetId: SafeIdSchema,
  status: z.enum([
    "eligible-for-baseline",
    "benchmark-underidentified",
  ]),
  inputs: z.array(BoundFileSchema),
  counts: z.object({
    tasks: z.number().int().positive(),
    criteria: z.number().int().positive(),
    claims: z.number().int().positive(),
    independentSkillDerivedClaims: z.number().int().nonnegative(),
    answerBearingDuplications: z.number().int().nonnegative(),
    canaries: z.number().int().positive(),
    provenanceClaims: z.object({
      taskOutcome: z.number().int().nonnegative(),
      fixtureDerived: z.number().int().nonnegative(),
      skillDerived: z.number().int().nonnegative(),
      overlap: z.number().int().nonnegative(),
      unmeasuredSkillDerived: z.number().int().nonnegative(),
    }).strict(),
  }).strict(),
  coverage: z.object({
    taskSetSkillDerivedWeight: z.number().min(0).max(1),
    byTask: z.array(z.object({
      taskId: SafeIdSchema,
      skillDerivedClaims: z.number().int().nonnegative(),
      skillDerivedWeight: z.number().min(0).max(1),
    }).strict()),
  }).strict(),
  canaries: z.array(z.object({
    id: SafeIdSchema,
    role: CanaryRoleSchema,
    passed: z.boolean(),
  }).strict()),
  gates: GateSchema,
  issues: z.array(z.object({
    code: IssueCodeSchema,
    subjectId: SafeIdSchema,
  }).strict()),
  claimBoundary: z.literal(
    "This static audit checks whether development tasks can identify provenance-bound skill contribution. It is not model-performance or optimization evidence.",
  ),
}).strict()

export type SkillContributionReport = z.infer<
  typeof SkillContributionIdentifiabilityReportSchema
>

const FORBIDDEN_SINK =
  /TEST_ONLY_HELDOUT|expectedAnswer|goldAnswer|raw-runs(?:\.jsonl)?|model-output|sk-[A-Za-z0-9_-]{8,}/iu
const WINDOWS_ABSOLUTE_PATH = /\b[A-Za-z]:[\\/][^\s"']+/u

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function isContained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === "" || (
    !path.isAbsolute(relative)
    && relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
  )
}

function assertNoForbiddenSink(value: unknown): void {
  const serialized = JSON.stringify(value)
  if (FORBIDDEN_SINK.test(serialized) || WINDOWS_ABSOLUTE_PATH.test(serialized)) {
    throw new Error("forbidden evidence sink in contribution manifest")
  }
}

async function readBoundFile(
  rootDir: string,
  bound: { path: string; sha256: string },
): Promise<Buffer> {
  const root = await realpath(rootDir)
  const unresolved = path.resolve(rootDir, ...bound.path.split("/"))
  const stat = await lstat(unresolved)
  const resolved = await realpath(unresolved)
  if (!stat.isFile() || stat.isSymbolicLink() || !isContained(root, resolved)) {
    throw new Error(`unsafe bound file: ${bound.path}`)
  }
  const bytes = await readFile(resolved)
  if (sha256(bytes) !== bound.sha256) throw new Error(`digest mismatch: ${bound.path}`)
  return bytes
}

function resolveJsonPointer(value: unknown, pointer: string): unknown {
  const segments = pointer.slice(1).split("/").map((segment) =>
    segment.replace(/~1/gu, "/").replace(/~0/gu, "~")
  )
  let current = value
  for (const segment of segments) {
    if (
      current === null
      || typeof current !== "object"
      || !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      return undefined
    }
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

export async function verifyContributionManifest(
  manifestValue: unknown,
  rootDir: string,
): Promise<VerifiedContributionManifest> {
  const manifest = SkillContributionIdentifiabilityManifestSchema.parse(manifestValue)
  assertNoForbiddenSink(manifest)
  const bytesByIdentity = new Map<string, Buffer>()

  const read = async (bound: { path: string; sha256: string }): Promise<Buffer> => {
    const identity = `${bound.path}:${bound.sha256}`
    const existing = bytesByIdentity.get(identity)
    if (existing) return existing
    const bytes = await readBoundFile(rootDir, bound)
    bytesByIdentity.set(identity, bytes)
    return bytes
  }

  for (const claim of manifest.claims) {
    for (const anchor of claim.evidence) {
      const bytes = await read(anchor)
      if (!bytes.toString("utf8").includes(anchor.quote)) {
        throw new Error(`evidence quote missing: ${claim.id}`)
      }
    }
  }

  const canaryObservations = new Map<string, boolean>()
  for (const canary of manifest.canaries) {
    const bytes = await read(canary.observation)
    let report: unknown
    try {
      report = JSON.parse(bytes.toString("utf8")) as unknown
    } catch {
      throw new Error(`canary report is not JSON: ${canary.id}`)
    }
    canaryObservations.set(
      canary.id,
      resolveJsonPointer(report, canary.observation.jsonPointer) === canary.observation.expected,
    )
  }
  return { manifest, canaryObservations }
}

function round4(value: number): number {
  return Number(value.toFixed(4))
}

function uniqueBoundFiles(manifest: SkillContributionIdentifiabilityManifest) {
  const inputs = [
    ...manifest.claims.flatMap((claim) => claim.evidence.map(({ path, sha256 }) => ({ path, sha256 }))),
    ...manifest.canaries.map(({ observation: { path, sha256 } }) => ({ path, sha256 })),
  ]
  return [...new Map(inputs.map((input) => [`${input.path}:${input.sha256}`, input])).values()]
    .sort((left, right) => left.path.localeCompare(right.path))
}

function qualifiedSkillClaim(
  claim: SkillContributionIdentifiabilityManifest["claims"][number],
): boolean {
  return claim.evidence.some((evidence) =>
    evidence.source === "skill-derived" && evidence.kind === "skill-source"
  ) && claim.evidence.some((evidence) =>
    evidence.source === "fixture-derived"
    && (evidence.kind === "task-set" || evidence.kind === "public-contract")
  ) && claim.evidence.some((evidence) =>
    evidence.source === "fixture-derived" && evidence.kind === "scorer"
  )
}

export function analyzeSkillContribution(
  verified: VerifiedContributionManifest,
): SkillContributionReport {
  const { manifest, canaryObservations } = verified
  const skillClaims = manifest.claims.filter(qualifiedSkillClaim)
  const skillClaimIds = new Set(skillClaims.map((claim) => claim.id))
  const independentFailureModes = new Set(skillClaims.map((claim) => claim.failureMode))

  const byTask = manifest.scope.taskIds.map((taskId) => {
    const criteria = manifest.criteria.filter((criterion) => criterion.taskId === taskId)
    const measuredClaimIds = new Set(criteria.flatMap((criterion) =>
      criterion.claimIds.filter((claimId) => skillClaimIds.has(claimId))
    ))
    const skillDerivedWeight = criteria
      .filter((criterion) =>
        criterion.provenance.includes("skill-derived")
        && criterion.claimIds.some((claimId) => skillClaimIds.has(claimId))
      )
      .reduce((sum, criterion) => sum + criterion.weight, 0)
    return {
      taskId,
      skillDerivedClaims: measuredClaimIds.size,
      skillDerivedWeight: round4(skillDerivedWeight),
    }
  })
  const taskSetSkillDerivedWeight = round4(
    byTask.reduce((sum, task) => sum + task.skillDerivedWeight, 0) / byTask.length,
  )
  const answerBearingDuplications = manifest.claims.filter(
    (claim) => claim.answerBearingDuplication,
  ).length
  const requiredRoles = new Set(CanaryRoleSchema.options)
  const presentRoles = new Set(manifest.canaries.map((canary) => canary.role))
  const requiredCanariesPresent = [...requiredRoles].every((role) => presentRoles.has(role))
  const allCanariesPassed = manifest.canaries.every(
    (canary) => canaryObservations.get(canary.id) === true,
  )
  const hasSkillHardGate = manifest.criteria.some((criterion) =>
    criterion.hardGate
    && criterion.provenance.includes("skill-derived")
    && criterion.claimIds.some((claimId) => skillClaimIds.has(claimId))
  )
  const gates = {
    enoughIndependentClaims: independentFailureModes.size >= 2,
    everyTaskMeasuresSkillClaim: byTask.every((task) => task.skillDerivedClaims >= 1),
    enoughSkillDerivedWeightOrHardGate: taskSetSkillDerivedWeight >= 0.3 || hasSkillHardGate,
    noAnswerBearingDuplication: answerBearingDuplications === 0,
    requiredCanariesPassed: requiredCanariesPresent && allCanariesPassed,
  }

  const issues: SkillContributionReport["issues"] = []
  if (!gates.enoughIndependentClaims) {
    issues.push({ code: "TOO_FEW_INDEPENDENT_SKILL_CLAIMS", subjectId: manifest.skillId })
  }
  if (!gates.everyTaskMeasuresSkillClaim) {
    for (const task of byTask.filter((entry) => entry.skillDerivedClaims === 0)) {
      issues.push({ code: "TASK_SKILL_COVERAGE_GAP", subjectId: task.taskId })
    }
  }
  if (!gates.enoughSkillDerivedWeightOrHardGate) {
    issues.push({ code: "SKILL_WEIGHT_OR_HARD_GATE_GAP", subjectId: manifest.taskSetId })
  }
  if (!gates.noAnswerBearingDuplication) {
    for (const claim of manifest.claims.filter((entry) => entry.answerBearingDuplication)) {
      issues.push({ code: "ANSWER_BEARING_DUPLICATION", subjectId: claim.id })
    }
  }
  if (!requiredCanariesPresent) {
    for (const role of [...requiredRoles].filter((entry) => !presentRoles.has(entry))) {
      issues.push({ code: "REQUIRED_CANARY_MISSING", subjectId: role })
    }
  }
  for (const canary of manifest.canaries.filter(
    (entry) => canaryObservations.get(entry.id) !== true,
  )) {
    issues.push({ code: "CANARY_OBSERVATION_FAILED", subjectId: canary.id })
  }
  issues.sort((left, right) =>
    left.code.localeCompare(right.code) || left.subjectId.localeCompare(right.subjectId)
  )

  const report = SkillContributionIdentifiabilityReportSchema.parse({
    schemaVersion: "skill-contribution-identifiability-report/v1",
    auditId: manifest.auditId,
    skillId: manifest.skillId,
    taskSetId: manifest.taskSetId,
    status: Object.values(gates).every(Boolean)
      ? "eligible-for-baseline"
      : "benchmark-underidentified",
    inputs: uniqueBoundFiles(manifest),
    counts: {
      tasks: manifest.scope.taskIds.length,
      criteria: manifest.criteria.length,
      claims: manifest.claims.length,
      independentSkillDerivedClaims: independentFailureModes.size,
      answerBearingDuplications,
      canaries: manifest.canaries.length,
      provenanceClaims: {
        taskOutcome: manifest.claims.filter((claim) =>
          claim.evidence.some((evidence) => evidence.source === "task-outcome")
        ).length,
        fixtureDerived: manifest.claims.filter((claim) =>
          claim.evidence.some((evidence) => evidence.source === "fixture-derived")
        ).length,
        skillDerived: manifest.claims.filter((claim) =>
          claim.evidence.some((evidence) => evidence.source === "skill-derived")
        ).length,
        overlap: manifest.claims.filter((claim) =>
          claim.evidence.some((evidence) => evidence.source === "overlap")
        ).length,
        unmeasuredSkillDerived: manifest.claims.filter((claim) =>
          claim.evidence.some((evidence) => evidence.source === "skill-derived")
          && !qualifiedSkillClaim(claim)
        ).length,
      },
    },
    coverage: { taskSetSkillDerivedWeight, byTask },
    canaries: manifest.canaries.map((canary) => ({
      id: canary.id,
      role: canary.role,
      passed: canaryObservations.get(canary.id) === true,
    })),
    gates,
    issues,
    claimBoundary:
      "This static audit checks whether development tasks can identify provenance-bound skill contribution. It is not model-performance or optimization evidence.",
  })
  assertNoForbiddenSink(report)
  return report
}
