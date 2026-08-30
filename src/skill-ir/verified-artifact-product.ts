import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import {
  DomainAutomaticConstructionInputSchema,
  ThinTaskDescriptionSchema,
  constructDomainSkillCandidates,
} from "../benchmarks/skill-ir/automatic-domain-construction";
import { RestrictedDomainPlanSchema } from "../benchmarks/skill-ir/automatic-restricted-domain-plan";
import { auditReviewPatchSource } from "../benchmarks/skill-ir/review-required";
import { assembleValidatedArtifactPackage } from "../benchmarks/skill-ir/validated-artifact-assembly";
import {
  validateValidatedArtifactPackage,
  type ValidatedArtifactPackage,
} from "../benchmarks/skill-ir/validated-artifact-catalog";
import { runValidatedArtifactPlan } from "../benchmarks/skill-ir/validated-artifact-runtime";
import { sha256Bytes } from "../benchmarks/skill-ir/source-fixture";
import {
  writeInitialWorkdirManifest,
  type InitialWorkdirManifestReference,
} from "../core/workdir-manifest";
import { normalizeDerivedSkillView } from "./artifact-closure-normalization";
import { VerifiedArtifactCollectionPlanSchema } from "./verified-artifact-collection-plan";

const IdentifierSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u);
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const SafeRelativePathSchema = z.string().min(1).max(240).refine((value) =>
  !isAbsolute(value)
  && !value.includes("\\")
  && value.split("/").every((part) => part.length > 0 && part !== "." && part !== ".."), {
  message: "path must be a contained POSIX-style relative path",
});
const DigestRefSchema = z.object({ path: SafeRelativePathSchema, sha256: Sha256Schema }).strict();
const CostValueSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("measured"), value: z.number().nonnegative() }).strict(),
  z.object({ status: z.literal("missing"), value: z.null(), reason: z.string().min(1) }).strict(),
]);
const SnapshotRecordSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
  bytes: z.number().int().nonnegative(),
}).strict();
const DeltaSchema = z.object({
  created: z.array(SafeRelativePathSchema),
  modified: z.array(SafeRelativePathSchema),
  deleted: z.array(SafeRelativePathSchema),
  exactOutputSet: z.boolean(),
}).strict();
const ArtifactIdentitySchema = z.object({
  manifestPath: z.literal("artifact/package-manifest.json"),
  manifestSha256: Sha256Schema,
  closureSha256: Sha256Schema,
}).strict();

const OriginalRuntimeSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("measured"),
    samples: z.number().int().positive(),
    aggregateModelTokens: z.number().nonnegative(),
    aggregateDurationMs: z.number().nonnegative(),
    evidence: DigestRefSchema,
  }).strict(),
  z.object({
    status: z.literal("missing"),
    reason: z.string().min(1),
  }).strict(),
]);

const QualityModeSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("user-accepted") }).strict(),
  z.object({ mode: z.literal("machine-checked"), checker: DigestRefSchema }).strict(),
]);

export const VerifiedArtifactWorkflowConfigSchema = z.object({
  schemaVersion: z.literal("skill-ir-verified-artifact-workflow-config/v1"),
  workflowId: IdentifierSchema,
  source: DomainAutomaticConstructionInputSchema.shape.source,
  taskDescription: DomainAutomaticConstructionInputSchema.shape.taskDescription,
  review: z.object({
    automaticPlan: DigestRefSchema,
    patch: DigestRefSchema,
    publicInterfacePath: SafeRelativePathSchema,
    coreBranchDelta: z.literal(0),
    physicalLoc: z.number().int().positive(),
    humanMinutes: z.number().nonnegative().default(0),
  }).strict(),
  production: z.object({
    oneTimeModelTokens: CostValueSchema,
    originalRuntime: OriginalRuntimeSchema,
  }).strict(),
  quality: QualityModeSchema,
}).strict();

export type VerifiedArtifactWorkflowConfig = z.infer<typeof VerifiedArtifactWorkflowConfigSchema>;

const CandidateSchema = z.object({
  status: z.literal("review-required"),
  automaticConstructionStatus: z.literal("non-executable"),
  skillId: IdentifierSchema,
  automaticPlan: DigestRefSchema,
  reviewPatch: DigestRefSchema,
  coreBranchDelta: z.literal(0),
}).strict();

const CommonQualityEvidenceShape = {
  workflowId: IdentifierSchema,
  artifact: ArtifactIdentitySchema,
  sourceInputs: z.array(DigestRefSchema).length(4),
  workdirInputs: z.array(SnapshotRecordSchema).min(1),
  outputs: z.array(SnapshotRecordSchema).min(1),
  delta: DeltaSchema,
  heldOutAccesses: z.literal(0),
  goldAccesses: z.literal(0),
  scorerAccesses: z.literal(0),
};

const UserAcceptedEvidenceSchema = z.object({
  schemaVersion: z.literal("skill-ir-verified-artifact-quality-evidence/v1"),
  qualityEvidence: z.literal("user-accepted"),
  ...CommonQualityEvidenceShape,
  checkerAbsent: z.literal(true),
  decision: z.literal("accepted"),
  acceptedAt: z.string().datetime(),
  humanMinutes: z.number().positive(),
  note: z.string().min(1).max(1000),
  researchDisposition: z.literal("not-eligible"),
}).strict();

const MachineCheckedEvidenceSchema = z.object({
  schemaVersion: z.literal("skill-ir-verified-artifact-quality-evidence/v1"),
  qualityEvidence: z.literal("machine-checked"),
  ...CommonQualityEvidenceShape,
  checker: DigestRefSchema,
  checkerResultSha256: Sha256Schema,
  status: z.literal("pass"),
  detail: z.string().min(1),
  researchDisposition: z.literal("eligible-for-authority-review"),
}).strict();

export const VerifiedArtifactQualityEvidenceSchema = z.discriminatedUnion("qualityEvidence", [
  UserAcceptedEvidenceSchema,
  MachineCheckedEvidenceSchema,
]);
export type VerifiedArtifactQualityEvidence = z.infer<typeof VerifiedArtifactQualityEvidenceSchema>;

const AmortizationRowSchema = z.object({
  calls: z.union([z.literal(1), z.literal(2), z.literal(5), z.literal(10)]),
  originalModelTokens: z.number().nonnegative().nullable(),
  optimizedModelTokens: z.number().nonnegative().nullable(),
  status: z.enum(["computed", "not-computable"]),
}).strict();

export const VerifiedArtifactProductCostReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-verified-artifact-product-cost/v1"),
  workflowId: IdentifierSchema,
  qualityEvidence: z.enum(["user-accepted", "machine-checked"]),
  claim: z.enum([
    "token-saving-under-user-accepted-quality",
    "token-saving-under-machine-checked-quality",
    "token-savings-not-reached",
    "token-economics-not-computable",
  ]),
  researchEligibility: z.enum(["not-eligible", "eligible-for-authority-review"]),
  production: z.object({
    oneTime: z.object({
      modelTokens: CostValueSchema,
      declaration: z.object({ humanMinutes: z.number().nonnegative() }).strict(),
      reviewAdapter: z.object({ humanMinutes: z.number().nonnegative(), physicalLoc: z.number().int().positive() }).strict(),
      acceptance: z.object({ humanMinutes: z.number().nonnegative() }).strict(),
      totalHumanMinutes: z.number().nonnegative(),
      packageBytes: z.number().int().positive(),
    }).strict(),
    recurring: z.object({
      original: OriginalRuntimeSchema,
      artifact: z.object({ modelTokensPerRun: z.literal(0), durationMsPerRun: z.number().nonnegative() }).strict(),
      acceptanceHumanMinutesPerRun: z.literal(0),
    }).strict(),
  }).strict(),
  amortization: z.tuple([AmortizationRowSchema, AmortizationRowSchema, AmortizationRowSchema, AmortizationRowSchema]),
  breakEven: z.discriminatedUnion("status", [
    z.object({ status: z.literal("computed"), calls: z.number().int().positive(), reason: z.null() }).strict(),
    z.object({ status: z.literal("not-reached"), calls: z.null(), reason: z.string().min(1) }).strict(),
    z.object({ status: z.literal("not-computable"), calls: z.null(), reason: z.string().min(1) }).strict(),
  ]),
  totalCostBreakEven: z.object({
    status: z.literal("not-computable"),
    reason: z.literal("no human-time valuation policy is frozen"),
  }).strict(),
  claimBoundary: z.string().min(1),
}).strict();
export type VerifiedArtifactProductCostReport = z.infer<typeof VerifiedArtifactProductCostReportSchema>;

const RunEvidenceSchema = z.object({
  schemaVersion: z.literal("skill-ir-verified-artifact-run-evidence/v1"),
  workflowId: IdentifierSchema,
  status: z.literal("complete"),
  modelTokens: z.literal(0),
  durationMs: z.number().nonnegative(),
  inputs: z.array(SnapshotRecordSchema).min(1),
  outputs: z.array(SnapshotRecordSchema).min(1),
  protectedInputsPreserved: z.literal(true),
  previewOutputsReproduced: z.literal(true),
}).strict();

const ProductManifestSchema = z.object({
  schemaVersion: z.literal("skill-ir-verified-artifact-product-manifest/v1"),
  workflowId: IdentifierSchema,
  stageOrder: z.tuple([
    z.literal("compile"),
    z.literal("review-or-accept"),
    z.literal("package"),
    z.literal("run"),
    z.literal("cost"),
  ]),
  artifact: ArtifactIdentitySchema,
  qualityEvidence: z.object({ path: z.literal("quality-evidence.json"), sha256: Sha256Schema }).strict(),
  runEvidence: z.object({ path: z.literal("run-evidence.json"), sha256: Sha256Schema }).strict(),
  costReport: z.object({ path: z.literal("cost-report.json"), sha256: Sha256Schema }).strict(),
}).strict();

export type VerifiedArtifactReview = {
  candidate: z.infer<typeof CandidateSchema>;
  artifact: z.infer<typeof ArtifactIdentitySchema>;
  sourceInputs: z.infer<typeof DigestRefSchema>[];
  workdirInputs: z.infer<typeof SnapshotRecordSchema>[];
  outputs: z.infer<typeof SnapshotRecordSchema>[];
  delta: z.infer<typeof DeltaSchema>;
};

export type UserAcceptance = {
  decision: "accepted";
  acceptedAt: string;
  humanMinutes: number;
  note: string;
};

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function containedPath(rootDir: string, path: string): string {
  const root = resolve(rootDir);
  const candidate = resolve(root, SafeRelativePathSchema.parse(path));
  const fromRoot = relative(root, candidate);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) throw new Error(`path escapes root: ${path}`);
  return candidate;
}

async function readPinned(rootDir: string, ref: z.infer<typeof DigestRefSchema>): Promise<Buffer> {
  const bytes = await readFile(containedPath(rootDir, ref.path));
  const actual = sha256Bytes(bytes);
  if (actual !== ref.sha256) throw new Error(`digest mismatch for ${ref.path}`);
  return bytes;
}

async function listFiles(rootDir: string, current = ""): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(join(rootDir, current), { withFileTypes: true })) {
    const path = current ? `${current}/${entry.name}` : entry.name;
    const info = await lstat(join(rootDir, path));
    if (info.isSymbolicLink()) throw new Error(`symbolic link is forbidden: ${path}`);
    if (info.isDirectory()) files.push(...await listFiles(rootDir, path));
    else if (info.isFile()) files.push(path);
    else throw new Error(`special filesystem entry is forbidden: ${path}`);
  }
  return files.sort((left, right) => left.localeCompare(right, "en"));
}

async function snapshot(rootDir: string): Promise<z.infer<typeof SnapshotRecordSchema>[]> {
  return Promise.all((await listFiles(rootDir)).map(async (path) => {
    const bytes = await readFile(join(rootDir, path));
    return SnapshotRecordSchema.parse({ path, sha256: sha256Bytes(bytes), bytes: bytes.byteLength });
  }));
}

async function outputSnapshot(rootDir: string, paths: string[]): Promise<z.infer<typeof SnapshotRecordSchema>[]> {
  return Promise.all([...paths].sort((a, b) => a.localeCompare(b, "en")).map(async (path) => {
    const bytes = await readFile(containedPath(rootDir, path));
    return SnapshotRecordSchema.parse({ path, sha256: sha256Bytes(bytes), bytes: bytes.byteLength });
  }));
}

function sameSnapshot(
  left: z.infer<typeof SnapshotRecordSchema>[],
  right: z.infer<typeof SnapshotRecordSchema>[],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function deltaBetween(
  before: z.infer<typeof SnapshotRecordSchema>[],
  after: z.infer<typeof SnapshotRecordSchema>[],
  outputPaths: string[],
) {
  const old = new Map(before.map((entry) => [entry.path, entry]));
  const current = new Map(after.map((entry) => [entry.path, entry]));
  const created = [...current.keys()].filter((path) => !old.has(path)).sort();
  const modified = [...old.keys()].filter((path) => current.has(path) && current.get(path)!.sha256 !== old.get(path)!.sha256).sort();
  const deleted = [...old.keys()].filter((path) => !current.has(path)).sort();
  return DeltaSchema.parse({
    created,
    modified,
    deleted,
    exactOutputSet: JSON.stringify(created) === JSON.stringify([...outputPaths].sort())
      && modified.length === 0 && deleted.length === 0,
  });
}

async function closureSha256(rootDir: string): Promise<string> {
  const records = await Promise.all((await listFiles(rootDir)).map(async (path) => ({
    path,
    sha256: sha256Bytes(await readFile(join(rootDir, path))),
  })));
  return sha256Bytes(Buffer.from(JSON.stringify(records), "utf8"));
}

async function writeAtomic(path: string, value: unknown): Promise<{ path: string; sha256: string }> {
  await mkdir(dirname(path), { recursive: true });
  const text = jsonText(value);
  const temporary = `${path}.tmp`;
  await writeFile(temporary, text, "utf8");
  await rename(temporary, path);
  return { path, sha256: sha256Bytes(Buffer.from(text, "utf8")) };
}

async function buildBundle(entrypoint: string, root: string): Promise<Buffer> {
  const build = await Bun.build({
    entrypoints: [entrypoint],
    root,
    target: "bun",
    format: "esm",
    minify: false,
    sourcemap: "none",
  });
  if (!build.success || build.outputs.length !== 1) throw new Error(`bundle failed for ${entrypoint}`);
  return Buffer.from(await build.outputs[0]!.arrayBuffer());
}

async function assembleCandidateArtifact(options: {
  rootDir: string;
  candidateDir: string;
  config: VerifiedArtifactWorkflowConfig;
  construction: Awaited<ReturnType<typeof constructDomainSkillCandidates>>;
  sourceBytes: Buffer;
  descriptionBytes: Buffer;
  planBytes: Buffer;
  patchBytes: Buffer;
  protectedInputs: string[];
  outputPaths: string[];
}): Promise<{ package: ValidatedArtifactPackage; artifact: z.infer<typeof ArtifactIdentitySchema> }> {
  const rawPlan = JSON.parse(options.planBytes.toString("utf8"));
  const legacyPlan = RestrictedDomainPlanSchema.safeParse(rawPlan);
  const collectionPlan = VerifiedArtifactCollectionPlanSchema.safeParse(rawPlan);
  if (!legacyPlan.success && !collectionPlan.success) {
    throw new Error("automatic plan is neither a Restricted Domain Plan nor a verified artifact collection plan");
  }
  const plan = legacyPlan.success ? legacyPlan.data : collectionPlan.data;
  const description = ThinTaskDescriptionSchema.parse(JSON.parse(options.descriptionBytes.toString("utf8")));
  const projectRoot = resolve(import.meta.dir, "../..");
  const [planRunner, patchRunner] = await Promise.all([
    buildBundle(resolve(
      import.meta.dir,
      collectionPlan.success ? "verified-artifact-collection-plan-runner.ts" : "verified-artifact-plan-runner.ts",
    ), projectRoot),
    buildBundle(resolve(import.meta.dir, "verified-artifact-patch-runner.ts"), projectRoot),
  ]);
  auditReviewPatchSource(options.patchBytes.toString("utf8"), []);
  const baseIrText = jsonText(options.construction.baseIr);
  const constructionText = jsonText(options.construction);
  const skillViewText = normalizeDerivedSkillView(options.sourceBytes);
  const sourceAuditText = jsonText({
    schemaVersion: "skill-ir-verified-artifact-source-audit/v1",
    status: "digest-only",
    semanticSourceAudit: "not-established",
    automaticCandidateStatus: options.construction.packageCandidate.status,
    source: options.config.source,
    taskDescription: {
      path: options.config.taskDescription.path,
      sha256: options.config.taskDescription.sha256,
    },
    claimBoundary: "Pinned public-source and task-description bytes were verified; semantic source-rule parity was not established automatically.",
  });
  const artifactLayout = [
    { id: "skill-ir", path: "skill-ir.json", kind: "skill-ir" as const },
    { id: "skill-view", path: "skill.md", kind: "skill-view" as const },
    { id: "plan-runner", path: "artifacts/plan-runner.js", kind: "script" as const },
    { id: "patch-runner", path: "artifacts/patch-runner.js", kind: "script" as const },
    { id: "review-patch", path: "artifacts/review-patch.ts", kind: "script" as const },
    { id: "automatic-plan", path: "artifacts/automatic-plan.json", kind: "tool-plan" as const },
    { id: "task-description", path: "artifacts/task-description.json", kind: "schema" as const },
    { id: "construction-candidate", path: "artifacts/construction-candidate.json", kind: "validation-notes" as const },
    { id: "source-audit", path: "artifacts/source-audit.json", kind: "validation-notes" as const },
  ];
  const executionPlan = {
    schemaVersion: "skill-artifact-execution-plan/v1" as const,
    entrypoint: "review-patch",
    nodes: [
      {
        id: "automatic-plan",
        kind: "process" as const,
        dependsOn: [],
        command: {
          interpreter: { env: "SKVM_BUN", fallback: "bun" },
          artifactId: "plan-runner",
          args: ["{artifact:automatic-plan}", "{artifact:task-description}", "{workdir}"],
          envAllowlist: ["SKVM_BUN"],
        },
        timeoutMs: 60_000,
      },
      {
        id: "review-patch",
        kind: "process" as const,
        dependsOn: ["automatic-plan"],
        command: {
          interpreter: { env: "SKVM_BUN", fallback: "bun" },
          artifactId: "patch-runner",
          args: [
            "{artifact:review-patch}",
            "{workdir}",
            options.config.review.publicInterfacePath,
            String(options.outputPaths.length),
          ],
          envAllowlist: ["SKVM_BUN"],
        },
        timeoutMs: 60_000,
      },
    ],
  };
  const compilerConfig = {
    source: options.config.source,
    taskDescription: options.config.taskDescription,
    automaticPlan: options.config.review.automaticPlan,
    patch: options.config.review.patch,
    publicInterfacePath: options.config.review.publicInterfacePath,
    protectedInputs: options.protectedInputs,
    outputPaths: options.outputPaths,
  };
  const packageResult = await assembleValidatedArtifactPackage({
    adapter: {
      schemaVersion: "validated-artifact-assembly-adapter/v1",
      catalog: "validated-skill-artifact/v1",
      skillId: options.construction.contract.skillId,
      adapterId: "verified-artifact-product",
      version: "v1",
      compiler: {
        id: "verified-artifact-product",
        version: "v1",
        configSha256: sha256Bytes(Buffer.from(JSON.stringify(compilerConfig), "utf8")),
      },
      protectedInputs: options.protectedInputs,
      generatedOutputs: options.outputPaths,
      executionPlan,
      artifactLayout,
    },
    provenanceInputs: {
      sourceClosure: [
        { path: options.config.source.path, sha256: options.config.source.sha256 },
        { path: options.config.taskDescription.path, sha256: options.config.taskDescription.sha256 },
        options.config.review.automaticPlan,
        options.config.review.patch,
      ],
      baseIr: { path: "skill-ir.json", sha256: sha256Bytes(Buffer.from(baseIrText, "utf8")) },
      sourceAudit: { path: "artifacts/source-audit.json", sha256: sha256Bytes(Buffer.from(sourceAuditText, "utf8")) },
      resourceContract: { path: "artifacts/task-description.json", sha256: sha256Bytes(options.descriptionBytes) },
      taskContract: {
        taskIds: [description.descriptionId],
        promptDigest: options.config.taskDescription.sha256,
      },
    },
    artifactPayloads: [
      { id: "skill-ir", bytes: baseIrText },
      { id: "skill-view", bytes: skillViewText },
      { id: "plan-runner", bytes: planRunner },
      { id: "patch-runner", bytes: patchRunner },
      { id: "review-patch", bytes: options.patchBytes },
      { id: "automatic-plan", bytes: jsonText(plan) },
      { id: "task-description", bytes: options.descriptionBytes },
      { id: "construction-candidate", bytes: constructionText },
      { id: "source-audit", bytes: sourceAuditText },
    ],
  }, options.candidateDir);
  const artifact = ArtifactIdentitySchema.parse({
    manifestPath: "artifact/package-manifest.json",
    manifestSha256: sha256Bytes(await readFile(join(options.candidateDir, "package-manifest.json"))),
    closureSha256: await closureSha256(options.candidateDir),
  });
  return { package: packageResult, artifact };
}

function buildCostReport(options: {
  config: VerifiedArtifactWorkflowConfig;
  qualityEvidence: VerifiedArtifactQualityEvidence;
  packageBytes: number;
  runDurationMs: number;
}): VerifiedArtifactProductCostReport {
  const oneTime = options.config.production.oneTimeModelTokens;
  const original = options.config.production.originalRuntime;
  const oneTimeTokens = oneTime.status === "measured" ? oneTime.value : null;
  const originalPerRun = original.status === "measured"
    ? original.aggregateModelTokens / original.samples
    : null;
  const calls = [1, 2, 5, 10] as const;
  const amortization = calls.map((count) => ({
    calls: count,
    originalModelTokens: originalPerRun === null ? null : originalPerRun * count,
    optimizedModelTokens: oneTimeTokens === null ? null : oneTimeTokens,
    status: originalPerRun === null || oneTimeTokens === null ? "not-computable" as const : "computed" as const,
  })) as [
    z.infer<typeof AmortizationRowSchema>,
    z.infer<typeof AmortizationRowSchema>,
    z.infer<typeof AmortizationRowSchema>,
    z.infer<typeof AmortizationRowSchema>,
  ];
  const breakEven = originalPerRun === null
    ? { status: "not-computable" as const, calls: null, reason: original.status === "missing" ? original.reason : "original runtime cost is unavailable" }
    : oneTimeTokens === null
      ? { status: "not-computable" as const, calls: null, reason: oneTime.status === "missing" ? oneTime.reason : "one-time model-token cost is unavailable" }
      : originalPerRun <= 0
        ? { status: "not-reached" as const, calls: null, reason: "original runtime has no positive recurring model-token cost" }
        : { status: "computed" as const, calls: Math.max(1, Math.ceil(oneTimeTokens / originalPerRun)), reason: null };
  const acceptanceHumanMinutes = options.qualityEvidence.qualityEvidence === "user-accepted"
    ? options.qualityEvidence.humanMinutes
    : 0;
  const qualityEvidence = options.qualityEvidence.qualityEvidence;
  const claim = breakEven.status === "computed"
    ? qualityEvidence === "user-accepted"
      ? "token-saving-under-user-accepted-quality" as const
      : "token-saving-under-machine-checked-quality" as const
    : breakEven.status === "not-reached"
      ? "token-savings-not-reached" as const
      : "token-economics-not-computable" as const;
  const claimBoundary = breakEven.status === "computed"
    ? qualityEvidence === "user-accepted"
      ? "Token savings are computed under user-accepted quality; this is not machine-established quality equivalence or research efficiency-positive evidence. Human review and acceptance are per-artifact one-time costs, never recurring costs."
      : "Token savings are computed under machine-checked quality, but research promotion still requires the existing evidence authority and all of its independent gates. Human review is per-artifact one-time, never recurring."
    : breakEven.status === "not-reached"
      ? "The measured original runtime has no positive recurring model-token cost, so this artifact does not establish token savings. Quality evidence and human costs remain separately disclosed."
      : "Token economics are not computable because a required production model-token input is missing. Quality evidence and human costs remain separately disclosed; no token-saving claim is made.";
  return VerifiedArtifactProductCostReportSchema.parse({
    schemaVersion: "skill-ir-verified-artifact-product-cost/v1",
    workflowId: options.config.workflowId,
    qualityEvidence,
    claim,
    researchEligibility: qualityEvidence === "machine-checked"
      ? "eligible-for-authority-review"
      : "not-eligible",
    production: {
      oneTime: {
        modelTokens: oneTime,
        declaration: { humanMinutes: options.config.taskDescription.authoring.humanMinutes },
        reviewAdapter: {
          humanMinutes: options.config.review.humanMinutes,
          physicalLoc: options.config.review.physicalLoc,
        },
        acceptance: { humanMinutes: acceptanceHumanMinutes },
        totalHumanMinutes: options.config.taskDescription.authoring.humanMinutes
          + options.config.review.humanMinutes + acceptanceHumanMinutes,
        packageBytes: options.packageBytes,
      },
      recurring: {
        original,
        artifact: { modelTokensPerRun: 0, durationMsPerRun: options.runDurationMs },
        acceptanceHumanMinutesPerRun: 0,
      },
    },
    amortization,
    breakEven,
    totalCostBreakEven: {
      status: "not-computable",
      reason: "no human-time valuation policy is frozen",
    },
    claimBoundary,
  });
}

async function machineEvidence(options: {
  rootDir: string;
  config: VerifiedArtifactWorkflowConfig;
  review: VerifiedArtifactReview;
  previewDir: string;
  initialWorkdirManifest: InitialWorkdirManifestReference;
}): Promise<VerifiedArtifactQualityEvidence> {
  if (options.config.quality.mode !== "machine-checked") throw new Error("machine checker mode is required");
  const checkerBytes = await readPinned(options.rootDir, options.config.quality.checker);
  const checkerPath = containedPath(options.rootDir, options.config.quality.checker.path);
  const module = await import(`${pathToFileURL(checkerPath).href}?sha256=${sha256Bytes(checkerBytes)}`) as {
    checkVerifiedArtifact?: (input: {
      rootDir: string;
      workDir: string;
      outputs: z.infer<typeof SnapshotRecordSchema>[];
      delta: z.infer<typeof DeltaSchema>;
      initialWorkdirManifest: InitialWorkdirManifestReference;
    }) => Promise<unknown>;
  };
  if (typeof module.checkVerifiedArtifact !== "function") throw new Error("checker must export checkVerifiedArtifact");
  const checkerResult = z.object({
    status: z.enum(["pass", "fail"]),
    detail: z.string().min(1).max(1000),
  }).strict().parse(await module.checkVerifiedArtifact({
    rootDir: options.rootDir,
    workDir: options.previewDir,
    outputs: options.review.outputs,
    delta: options.review.delta,
    initialWorkdirManifest: options.initialWorkdirManifest,
  }));
  if (checkerResult.status !== "pass") throw new Error(`deterministic checker failed: ${checkerResult.detail}`);
  return MachineCheckedEvidenceSchema.parse({
    schemaVersion: "skill-ir-verified-artifact-quality-evidence/v1",
    qualityEvidence: "machine-checked",
    workflowId: options.config.workflowId,
    artifact: options.review.artifact,
    sourceInputs: options.review.sourceInputs,
    workdirInputs: options.review.workdirInputs,
    outputs: options.review.outputs,
    delta: options.review.delta,
    heldOutAccesses: 0,
    goldAccesses: 0,
    scorerAccesses: 0,
    checker: options.config.quality.checker,
    checkerResultSha256: sha256Bytes(Buffer.from(JSON.stringify(checkerResult), "utf8")),
    status: "pass",
    detail: checkerResult.detail,
    researchDisposition: "eligible-for-authority-review",
  });
}

export async function runVerifiedArtifactWorkflow(options: {
  rootDir: string;
  workDir: string;
  outDir: string;
  config: VerifiedArtifactWorkflowConfig | unknown;
  accept?: (review: VerifiedArtifactReview) => Promise<UserAcceptance>;
}) {
  const rootDir = resolve(options.rootDir);
  const workDir = resolve(options.workDir);
  const outDir = resolve(options.outDir);
  const config = VerifiedArtifactWorkflowConfigSchema.parse(options.config);
  if (config.production.originalRuntime.status === "measured") {
    await readPinned(rootDir, config.production.originalRuntime.evidence);
  }
  await mkdir(outDir, { recursive: true });
  if ((await readdir(outDir)).length > 0) throw new Error(`product output directory must be empty: ${outDir}`);
  const initialInputs = await snapshot(workDir);
  if (initialInputs.length === 0) throw new Error("workdir must contain at least one input file");
  const [sourceBytes, descriptionBytes, planBytes, patchBytes] = await Promise.all([
    readPinned(rootDir, config.source),
    readPinned(rootDir, { path: config.taskDescription.path, sha256: config.taskDescription.sha256 }),
    readPinned(rootDir, config.review.automaticPlan),
    readPinned(rootDir, config.review.patch),
  ]);
  const description = ThinTaskDescriptionSchema.parse(JSON.parse(descriptionBytes.toString("utf8")));
  const outputPaths = description.outputs.map((output) => output.path);
  if (outputPaths.some((path) => initialInputs.some((entry) => entry.path === path))) {
    throw new Error("declared outputs must not exist before compile/run");
  }
  const construction = await constructDomainSkillCandidates(rootDir, {
    schemaVersion: "skill-ir-domain-automatic-construction-input/v1",
    source: config.source,
    taskDescription: config.taskDescription,
  });
  const candidate = CandidateSchema.parse({
    status: "review-required",
    automaticConstructionStatus: construction.packageCandidate.status,
    skillId: construction.contract.skillId,
    automaticPlan: config.review.automaticPlan,
    reviewPatch: config.review.patch,
    coreBranchDelta: config.review.coreBranchDelta,
  });
  const temporaryRoot = await mkdtemp(join(tmpdir(), "skvm-verified-artifact-product-"));
  try {
    const candidateDir = join(temporaryRoot, "candidate-artifact");
    const assembled = await assembleCandidateArtifact({
      rootDir,
      candidateDir,
      config,
      construction,
      sourceBytes,
      descriptionBytes,
      planBytes,
      patchBytes,
      protectedInputs: initialInputs.map((entry) => entry.path),
      outputPaths,
    });
    const previewDir = join(temporaryRoot, "preview-workdir");
    await cp(workDir, previewDir, { recursive: true, force: false, errorOnExist: true });
    const previewInitialWorkdirManifest = await writeInitialWorkdirManifest({
      workDir: previewDir,
      manifestPath: join(temporaryRoot, "preview-initial-workdir-manifest.json"),
    });
    const previewExecution = await runValidatedArtifactPlan({
      package: assembled.package,
      workDir: previewDir,
      env: { SKVM_BUN: process.execPath },
    });
    if (previewExecution.status !== "complete") throw new Error(`candidate preview failed: ${previewExecution.status}`);
    const previewAfter = await snapshot(previewDir);
    const delta = deltaBetween(initialInputs, previewAfter, outputPaths);
    if (!delta.exactOutputSet) throw new Error("candidate preview does not produce the exact declared output delta");
    const outputs = await outputSnapshot(previewDir, outputPaths);
    const sourceInputs = [
      { path: config.source.path, sha256: config.source.sha256 },
      { path: config.taskDescription.path, sha256: config.taskDescription.sha256 },
      config.review.automaticPlan,
      config.review.patch,
    ];
    const review = {
      candidate,
      artifact: assembled.artifact,
      sourceInputs,
      workdirInputs: initialInputs,
      outputs,
      delta,
    } satisfies VerifiedArtifactReview;
    let qualityEvidence: VerifiedArtifactQualityEvidence;
    if (config.quality.mode === "user-accepted") {
      if (!options.accept) throw new Error("B-default requires an explicit post-preview acceptance callback");
      const acceptance = await options.accept(review);
      const acceptedAt = z.string().datetime().parse(acceptance.acceptedAt);
      if (Date.parse(acceptedAt) > Date.now()) throw new Error("acceptance timestamp is in the future");
      qualityEvidence = UserAcceptedEvidenceSchema.parse({
        schemaVersion: "skill-ir-verified-artifact-quality-evidence/v1",
        qualityEvidence: "user-accepted",
        workflowId: config.workflowId,
        artifact: assembled.artifact,
        sourceInputs,
        workdirInputs: initialInputs,
        outputs,
        delta,
        heldOutAccesses: 0,
        goldAccesses: 0,
        scorerAccesses: 0,
        checkerAbsent: true,
        decision: acceptance.decision,
        acceptedAt,
        humanMinutes: acceptance.humanMinutes,
        note: acceptance.note,
        researchDisposition: "not-eligible",
      });
    } else {
      qualityEvidence = await machineEvidence({
        rootDir,
        config,
        review,
        previewDir,
        initialWorkdirManifest: previewInitialWorkdirManifest,
      });
    }

    if (!sameSnapshot(await snapshot(workDir), initialInputs)) {
      throw new Error("workdir input digest drift after review");
    }
    const artifactDir = join(outDir, "artifact");
    await cp(candidateDir, artifactDir, { recursive: true, force: false, errorOnExist: true });
    const finalPackage = await validateValidatedArtifactPackage(artifactDir);
    const finalArtifact = ArtifactIdentitySchema.parse({
      manifestPath: "artifact/package-manifest.json",
      manifestSha256: sha256Bytes(await readFile(join(artifactDir, "package-manifest.json"))),
      closureSha256: await closureSha256(artifactDir),
    });
    if (JSON.stringify(finalArtifact) !== JSON.stringify(assembled.artifact)) {
      throw new Error("artifact digest drift during package finalization");
    }
    const qualityRef = await writeAtomic(join(outDir, "quality-evidence.json"), qualityEvidence);
    const runStarted = performance.now();
    const runResult = await runValidatedArtifactPlan({
      package: finalPackage,
      workDir,
      env: { SKVM_BUN: process.execPath },
    });
    const runDurationMs = performance.now() - runStarted;
    if (runResult.status !== "complete") throw new Error(`production artifact run failed: ${runResult.status}`);
    const afterRun = await snapshot(workDir);
    const finalDelta = deltaBetween(initialInputs, afterRun, outputPaths);
    const runOutputs = await outputSnapshot(workDir, outputPaths);
    const protectedInputsPreserved = initialInputs.every((entry) =>
      afterRun.find((candidate) => candidate.path === entry.path)?.sha256 === entry.sha256);
    const previewOutputsReproduced = sameSnapshot(outputs, runOutputs);
    if (!finalDelta.exactOutputSet || !protectedInputsPreserved || !previewOutputsReproduced) {
      throw new Error("production run does not reproduce the accepted artifact/input/output closure");
    }
    const runEvidence = RunEvidenceSchema.parse({
      schemaVersion: "skill-ir-verified-artifact-run-evidence/v1",
      workflowId: config.workflowId,
      status: "complete",
      modelTokens: 0,
      durationMs: runDurationMs,
      inputs: initialInputs,
      outputs: runOutputs,
      protectedInputsPreserved: true,
      previewOutputsReproduced: true,
    });
    const runRef = await writeAtomic(join(outDir, "run-evidence.json"), runEvidence);
    const cost = buildCostReport({
      config,
      qualityEvidence,
      packageBytes: finalPackage.packageBytes,
      runDurationMs,
    });
    const costRef = await writeAtomic(join(outDir, "cost-report.json"), cost);
    const stageOrder = ["compile", "review-or-accept", "package", "run", "cost"] as const;
    await writeAtomic(join(outDir, "product-manifest.json"), ProductManifestSchema.parse({
      schemaVersion: "skill-ir-verified-artifact-product-manifest/v1",
      workflowId: config.workflowId,
      stageOrder,
      artifact: finalArtifact,
      qualityEvidence: { path: "quality-evidence.json", sha256: qualityRef.sha256 },
      runEvidence: { path: "run-evidence.json", sha256: runRef.sha256 },
      costReport: { path: "cost-report.json", sha256: costRef.sha256 },
    }));
    return {
      candidate,
      artifact: finalArtifact,
      qualityEvidence,
      runEvidence,
      cost,
      stageOrder,
    };
  } catch (error) {
    await rm(outDir, { recursive: true, force: true });
    throw error;
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function validateVerifiedArtifactProduct(outDir: string) {
  const rootDir = resolve(outDir);
  const manifest = ProductManifestSchema.parse(JSON.parse(await readFile(join(rootDir, "product-manifest.json"), "utf8")));
  const artifactDir = join(rootDir, "artifact");
  const manifestBytes = await readFile(join(artifactDir, "package-manifest.json"));
  if (sha256Bytes(manifestBytes) !== manifest.artifact.manifestSha256) {
    throw new Error("artifact manifest digest mismatch");
  }
  if (await closureSha256(artifactDir) !== manifest.artifact.closureSha256) {
    throw new Error("artifact closure digest mismatch");
  }
  await validateValidatedArtifactPackage(artifactDir);
  const qualityBytes = await readFile(join(rootDir, manifest.qualityEvidence.path));
  if (sha256Bytes(qualityBytes) !== manifest.qualityEvidence.sha256) {
    throw new Error("quality evidence digest mismatch");
  }
  const runBytes = await readFile(join(rootDir, manifest.runEvidence.path));
  if (sha256Bytes(runBytes) !== manifest.runEvidence.sha256) throw new Error("run evidence digest mismatch");
  const costBytes = await readFile(join(rootDir, manifest.costReport.path));
  if (sha256Bytes(costBytes) !== manifest.costReport.sha256) throw new Error("cost report digest mismatch");
  const qualityEvidence = VerifiedArtifactQualityEvidenceSchema.parse(JSON.parse(qualityBytes.toString("utf8")));
  const runEvidence = RunEvidenceSchema.parse(JSON.parse(runBytes.toString("utf8")));
  const cost = VerifiedArtifactProductCostReportSchema.parse(JSON.parse(costBytes.toString("utf8")));
  if (JSON.stringify(qualityEvidence.artifact) !== JSON.stringify(manifest.artifact)) {
    throw new Error("quality evidence artifact identity mismatch");
  }
  if (qualityEvidence.workflowId !== manifest.workflowId
    || runEvidence.workflowId !== manifest.workflowId
    || cost.workflowId !== manifest.workflowId
    || cost.qualityEvidence !== qualityEvidence.qualityEvidence) {
    throw new Error("verified artifact product identity mismatch");
  }
  if (!sameSnapshot(qualityEvidence.workdirInputs, runEvidence.inputs)
    || !sameSnapshot(qualityEvidence.outputs, runEvidence.outputs)) {
    throw new Error("accepted input/output digest closure differs from run evidence");
  }
  return { manifest, qualityEvidence, runEvidence, cost };
}
