import { readdir, readFile } from "node:fs/promises";
import { isAbsolute, posix, relative, resolve, win32 } from "node:path";
import { z } from "zod";
import { sha256Bytes } from "./source-fixture";

export const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

export function parseSafeRelativePath(value: string): string {
  if (value.length === 0 || isAbsolute(value) || win32.isAbsolute(value)) {
    throw new Error(`Artifact path must be relative: ${value}`);
  }
  if (value.includes("\\")) {
    throw new Error(`Artifact path must use normalized POSIX separators: ${value}`);
  }
  const normalized = posix.normalize(value);
  if (normalized !== value) {
    throw new Error(`Artifact path must be normalized: ${value}`);
  }
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`Artifact path escapes its root: ${value}`);
  }
  return normalized;
}

export const SafeRelativePathSchema = z.string().transform((value, ctx) => {
  try {
    return parseSafeRelativePath(value);
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: error instanceof Error ? error.message : String(error),
    });
    return z.NEVER;
  }
});

export const RuntimeValidationCodeSchema = z.enum([
  "MISSING_FILE",
  "INVALID_JSON",
  "MISSING_FIELD",
  "EXTRA_FIELD",
  "TYPE_MISMATCH",
  "UNFILLED_TEMPLATE",
  "SECRET_PATTERN_PRESENT",
  "PROTECTED_FILE_MUTATED",
]);

export const RuntimeExpectedTypeSchema = z.enum([
  "object",
  "array",
  "string",
  "number",
  "boolean",
  "integer",
]);

const RuntimeValidationErrorSchema = z.object({
  code: RuntimeValidationCodeSchema,
  relativePath: SafeRelativePathSchema.optional(),
  jsonPointer: z.string().regex(/^\/(?:[^~\/]|~[01])*(?:\/(?:[^~\/]|~[01])*)*$/).optional(),
  missingField: z.string().regex(/^[A-Za-z_][A-Za-z0-9_.-]*$/).optional(),
  expectedType: RuntimeExpectedTypeSchema.optional(),
}).strict();

export const RuntimeValidationReportSchema = z.object({
  schemaVersion: z.literal("runtime-validation-report/v1"),
  status: z.enum(["pass", "fail"]),
  repairEligible: z.boolean(),
  errors: z.array(RuntimeValidationErrorSchema),
}).strict().superRefine((report, ctx) => {
  if (report.status === "pass" && (report.repairEligible || report.errors.length > 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Passing validation cannot include repair errors" });
  }
  if (report.status === "fail" && report.errors.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Failing validation requires at least one error" });
  }
});

const ArtifactRecordSchema = z.object({
  path: SafeRelativePathSchema,
  kind: z.enum([
    "skill-ir",
    "skill-view",
    "contract",
    "template",
    "checker",
    "validation-policy",
  ]),
  sha256: Sha256Schema,
  targetPath: SafeRelativePathSchema.optional(),
}).strict();

const DigestRefSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict();

const SemanticArtifactRecordSchema = z.object({
  path: SafeRelativePathSchema,
  kind: z.enum([
    "skill-ir",
    "skill-view",
    "contract",
    "semantic-contract-schema",
    "evidence-program",
    "checker",
    "template",
    "validation-policy",
  ]),
  sha256: Sha256Schema,
  targetPath: SafeRelativePathSchema.optional(),
}).strict();

export const SemanticArtifactPackageManifestSchema = z.object({
  schemaVersion: z.literal("skill-ir-semantic-artifact-package-manifest/v1"),
  catalog: z.literal("executable-semantic-artifact/v2"),
  skillId: z.literal("env-manager"),
  provenance: DigestRefSchema,
  contract: DigestRefSchema,
  semanticContractSchema: DigestRefSchema,
  evidenceProgram: z.object({
    path: SafeRelativePathSchema,
    timeoutMs: z.number().int().min(1).max(30_000),
  }).strict(),
  checker: z.object({
    path: SafeRelativePathSchema,
    timeoutMs: z.number().int().min(1).max(30_000),
  }).strict(),
  runtimeContract: z.object({
    path: SafeRelativePathSchema,
    protected: z.literal(true),
  }).strict(),
  generatedOutputs: z.array(SafeRelativePathSchema).min(1),
  artifacts: z.array(SemanticArtifactRecordSchema).min(1),
}).strict();

export const SemanticArtifactPackageProvenanceSchema = z.object({
  schemaVersion: z.literal("skill-ir-semantic-artifact-package-provenance/v1"),
  catalog: z.literal("executable-semantic-artifact/v2"),
  skillId: z.literal("env-manager"),
  constructionSplit: z.literal("development"),
  source: DigestRefSchema,
  baseIr: DigestRefSchema,
  taskContract: z.object({
    taskIds: z.array(z.string().min(1)).min(1),
    promptDigest: Sha256Schema,
    sha256: Sha256Schema,
  }).strict(),
  compiler: z.object({
    id: z.literal("env-manager-semantic-artifact-compiler"),
    version: z.literal("v2"),
    configSha256: Sha256Schema,
  }).strict(),
  artifacts: z.array(SemanticArtifactRecordSchema).min(1),
}).strict();

const PublicContractArtifactRecordSchema = z.object({
  path: SafeRelativePathSchema,
  kind: z.enum([
    "skill-ir",
    "skill-view",
    "output-contract",
    "public-policy",
    "public-contract-schema",
    "evidence-program",
    "checker",
    "template",
    "validation-policy",
  ]),
  sha256: Sha256Schema,
  targetPath: SafeRelativePathSchema.optional(),
}).strict();

export const PublicContractArtifactPackageManifestSchema = z.object({
  schemaVersion: z.literal("skill-ir-public-contract-artifact-package-manifest/v1"),
  catalog: z.literal("executable-public-contract-artifact/v3"),
  skillId: z.literal("env-manager"),
  provenance: DigestRefSchema,
  outputContract: DigestRefSchema,
  publicPolicy: DigestRefSchema,
  publicRuntimeContractSchema: DigestRefSchema,
  evidenceProgram: z.object({
    path: SafeRelativePathSchema,
    timeoutMs: z.number().int().min(1).max(30_000),
  }).strict(),
  checker: z.object({
    path: SafeRelativePathSchema,
    timeoutMs: z.number().int().min(1).max(30_000),
  }).strict(),
  runtimeContract: z.object({
    path: SafeRelativePathSchema,
    protected: z.literal(true),
  }).strict(),
  generatedOutputs: z.array(SafeRelativePathSchema).min(1),
  artifacts: z.array(PublicContractArtifactRecordSchema).min(1),
}).strict();

export const PublicContractArtifactPackageProvenanceSchema = z.object({
  schemaVersion: z.literal("skill-ir-public-contract-artifact-package-provenance/v1"),
  catalog: z.literal("executable-public-contract-artifact/v3"),
  skillId: z.literal("env-manager"),
  constructionSplit: z.literal("development"),
  source: DigestRefSchema,
  baseIr: DigestRefSchema,
  taskContract: z.object({
    taskIds: z.array(z.string().min(1)).min(1),
    promptDigest: Sha256Schema,
    sha256: Sha256Schema,
  }).strict(),
  compiler: z.object({
    id: z.literal("env-manager-public-contract-artifact-compiler"),
    version: z.literal("v3"),
    configSha256: Sha256Schema,
  }).strict(),
  artifacts: z.array(PublicContractArtifactRecordSchema).min(1),
}).strict();

const ContractRepairArtifactRecordSchema = z.object({
  path: SafeRelativePathSchema,
  kind: z.enum([
    "skill-ir",
    "skill-view",
    "output-contract",
    "repair-recipe",
    "public-policy",
    "public-contract-schema",
    "evidence-program",
    "checker",
    "deterministic-repairer",
    "template",
    "validation-policy",
  ]),
  sha256: Sha256Schema,
  targetPath: SafeRelativePathSchema.optional(),
}).strict();

const ProtectedRuntimeContractSchema = z.object({
  path: SafeRelativePathSchema,
  protected: z.literal(true),
}).strict();

export const ContractRepairArtifactPackageManifestSchema = z.object({
  schemaVersion: z.literal("skill-ir-contract-repair-artifact-package-manifest/v1"),
  catalog: z.literal("executable-contract-repair-artifact/v4"),
  skillId: z.literal("env-manager"),
  provenance: DigestRefSchema,
  outputContract: DigestRefSchema,
  repairRecipe: DigestRefSchema,
  publicPolicy: DigestRefSchema,
  publicRuntimeContractSchema: DigestRefSchema,
  evidenceProgram: z.object({
    path: SafeRelativePathSchema,
    timeoutMs: z.number().int().min(1).max(30_000),
  }).strict(),
  checker: z.object({
    path: SafeRelativePathSchema,
    timeoutMs: z.number().int().min(1).max(30_000),
  }).strict(),
  deterministicRepairer: z.object({
    path: SafeRelativePathSchema,
    timeoutMs: z.number().int().min(1).max(30_000),
  }).strict(),
  runtimeContracts: z.object({
    public: ProtectedRuntimeContractSchema,
    executableRepair: ProtectedRuntimeContractSchema,
  }).strict().refine(
    (contracts) => contracts.public.path !== contracts.executableRepair.path,
    "V4 runtime contract paths must be distinct",
  ),
  generatedOutputs: z.array(SafeRelativePathSchema).min(1),
  artifacts: z.array(ContractRepairArtifactRecordSchema).min(1),
}).strict();

const DevelopmentLearnedRuleLineageSchema = z.object({
  ruleId: z.enum(["server-dsn-sensitive/v1", "signing-key-minimum-length/v1"]),
  sourceCriterion: z.literal("env-schema-rules"),
  evidenceSha256: Sha256Schema,
  status: z.literal("candidate"),
}).strict();

export const ContractRepairArtifactPackageProvenanceSchema = z.object({
  schemaVersion: z.literal("skill-ir-contract-repair-artifact-package-provenance/v1"),
  catalog: z.literal("executable-contract-repair-artifact/v4"),
  skillId: z.literal("env-manager"),
  constructionSplit: z.literal("development"),
  source: DigestRefSchema,
  baseIr: DigestRefSchema,
  taskContract: z.object({
    taskIds: z.array(z.string().min(1)).min(1),
    promptDigest: Sha256Schema,
    sha256: Sha256Schema,
  }).strict(),
  developmentEvidence: z.object({
    coverageAudit: DigestRefSchema,
    replayFreeze: DigestRefSchema,
    replaySummary: DigestRefSchema,
  }).strict(),
  learnedRules: z.tuple([
    DevelopmentLearnedRuleLineageSchema.extend({
      ruleId: z.literal("server-dsn-sensitive/v1"),
    }),
    DevelopmentLearnedRuleLineageSchema.extend({
      ruleId: z.literal("signing-key-minimum-length/v1"),
    }),
  ]),
  compiler: z.object({
    id: z.literal("env-manager-contract-repair-artifact-compiler"),
    version: z.literal("v4"),
    configSha256: Sha256Schema,
  }).strict(),
  artifacts: z.array(ContractRepairArtifactRecordSchema).min(1),
}).strict();

export const ArtifactPackageManifestSchema = z.object({
  schemaVersion: z.literal("skill-ir-artifact-package-manifest/v1"),
  catalog: z.literal("executable-artifact/v1"),
  skillId: z.string().min(1),
  provenance: DigestRefSchema,
  contract: DigestRefSchema,
  checker: z.object({
    path: SafeRelativePathSchema,
    timeoutMs: z.number().int().min(1).max(30_000),
  }).strict(),
  generatedOutputs: z.array(SafeRelativePathSchema).min(1),
  artifacts: z.array(ArtifactRecordSchema).min(1),
}).strict();

export const ArtifactPackageProvenanceSchema = z.object({
  schemaVersion: z.literal("skill-ir-artifact-package-provenance/v1"),
  catalog: z.literal("executable-artifact/v1"),
  skillId: z.string().min(1),
  constructionSplit: z.literal("development"),
  source: DigestRefSchema,
  baseIr: DigestRefSchema,
  repairEvidence: DigestRefSchema,
  taskContract: z.object({
    taskIds: z.array(z.string().min(1)).min(1),
    promptDigest: Sha256Schema,
    sha256: Sha256Schema,
  }).strict(),
  compiler: z.object({
    id: z.string().min(1),
    version: z.string().min(1),
    configSha256: Sha256Schema,
  }).strict(),
  predecessors: z.array(DigestRefSchema),
  scope: z.object({
    model: z.string().min(1),
    modelFamily: z.string().min(1),
    adapter: z.string().min(1),
    adapterVersion: z.string().min(1),
    environment: z.string().min(1),
    context: z.string().min(1),
  }).strict(),
  artifacts: z.array(ArtifactRecordSchema).min(1),
}).strict();

export const ArtifactDevelopmentLockSchema = z.object({
  schemaVersion: z.literal("skill-ir-env-manager-executable-artifact-lock/v1"),
  stage: z.literal("executable-artifact-development"),
  status: z.literal("preregistered"),
  catalog: z.literal("executable-artifact/v1"),
  corpus: z.literal("pilot"),
  skillId: z.literal("env-manager"),
  package: z.object({
    path: z.string().min(1),
    manifestSha256: Sha256Schema,
    provenanceSha256: Sha256Schema,
  }).strict(),
  model: z.object({ route: z.string().min(1), family: z.string().min(1) }).strict(),
  adapter: z.object({ id: z.string().min(1), version: z.string().min(1) }).strict(),
  matrix: z.object({
    system: z.literal("ir-artifact-dev"),
    repairModes: z.array(z.enum(["check-only", "one-repair"])).length(2),
    contexts: z.array(z.string().min(1)).min(1),
    agents: z.array(z.string().min(1)).min(1),
    environments: z.array(z.string().min(1)).min(1),
    taskSplit: z.literal("development"),
    taskIds: z.array(z.string().min(1)).min(1),
    repetitions: z.number().int().min(1),
    initialGenerationRows: z.number().int().min(1),
  }).strict(),
  runtime: z.object({
    stateMachine: z.tuple([
      z.literal("preflight"),
      z.literal("generation"),
      z.literal("validate"),
      z.literal("optional-one-repair"),
      z.literal("revalidate"),
      z.literal("stop"),
    ]),
    maxSemanticRepairCalls: z.literal(1),
    apiKeyEnv: z.string().min(1),
  }).strict(),
  scoring: z.object({
    authority: z.literal("existing-deterministic-env-manager-scorer"),
    runtimeValidatorIsScorer: z.literal(false),
    repairCostReportedSeparately: z.literal(true),
  }).strict(),
  developmentGate: z.object({
    minimumSuccesses: z.number().int().min(1),
    minimumMeanScore: z.number().min(0).max(1),
    maximumHardGateRegressions: z.number().int().min(0),
    maximumInfrastructureFailures: z.number().int().min(0),
  }).strict(),
  prohibited: z.array(z.string().min(1)).min(1),
}).strict();

export const SemanticArtifactDevelopmentLockSchema = ArtifactDevelopmentLockSchema.omit({
  schemaVersion: true,
  stage: true,
  catalog: true,
}).extend({
  schemaVersion: z.literal("skill-ir-env-manager-executable-semantic-artifact-lock/v1"),
  stage: z.literal("executable-semantic-artifact-development"),
  catalog: z.literal("executable-semantic-artifact/v2"),
  codeCatalog: z.literal("semantic-error-codes/v1"),
  attributionGate: z.object({
    minimumRepairAttempts: z.number().int().min(1),
    compareModes: z.tuple([z.literal("check-only"), z.literal("one-repair")]),
    scorerAuthorityUnchanged: z.literal(true),
  }).strict(),
}).strict();

export const PublicContractArtifactDevelopmentLockSchema = z.object({
  schemaVersion: z.literal("skill-ir-env-manager-executable-public-contract-artifact-lock/v1"),
  stage: z.literal("executable-public-contract-artifact-development"),
  status: z.literal("preregistered"),
  catalog: z.literal("executable-public-contract-artifact/v3"),
  codeCatalog: z.literal("public-contract-error-codes/v2"),
  corpus: z.literal("pilot"),
  skillId: z.literal("env-manager"),
  package: z.object({
    path: z.string().min(1),
    manifestSha256: Sha256Schema,
    provenanceSha256: Sha256Schema,
  }).strict(),
  model: z.object({
    route: z.string().min(1),
    family: z.string().min(1),
  }).strict(),
  adapter: z.object({
    id: z.string().min(1),
    version: z.string().min(1),
  }).strict(),
  matrix: z.object({
    system: z.literal("ir-public-artifact-dev"),
    contexts: z.array(z.string().min(1)).min(1),
    agents: z.array(z.string().min(1)).min(1),
    environments: z.array(z.string().min(1)).min(1),
    taskSplit: z.literal("development"),
    taskIds: z.array(z.string().min(1)).min(1),
    repetitions: z.number().int().min(1),
    initialGenerationRows: z.number().int().min(1),
  }).strict(),
  runtime: z.object({
    stateMachine: z.tuple([
      z.literal("preflight"),
      z.literal("generation"),
      z.literal("capture-pre-repair-snapshot"),
      z.literal("validate"),
      z.literal("optional-one-repair"),
      z.literal("revalidate"),
      z.literal("capture-post-repair-snapshot"),
      z.literal("stop"),
    ]),
    maxSemanticRepairCalls: z.literal(1),
    apiKeyEnv: z.string().min(1),
    sharedGeneration: z.literal(true),
  }).strict(),
  scoring: z.object({
    authority: z.literal("existing-deterministic-env-manager-scorer"),
    runtimeValidatorIsScorer: z.literal(false),
    repairCostReportedSeparately: z.literal(true),
    logicalArms: z.tuple([z.literal("check-only"), z.literal("one-repair")]),
  }).strict(),
  attributionGate: z.object({
    minimumRepairAttempts: z.number().int().min(1),
    requireSharedGenerationIdentity: z.literal(true),
    scorerAuthorityUnchanged: z.literal(true),
  }).strict(),
  developmentGate: z.object({
    minimumSuccesses: z.number().int().min(1),
    minimumMeanScore: z.number().min(0).max(1),
    maximumHardGateRegressions: z.number().int().min(0),
    maximumInfrastructureFailures: z.number().int().min(0),
  }).strict(),
  prohibited: z.array(z.string().min(1)).min(1),
}).strict();

export const ContractRepairArtifactDevelopmentLockSchema = z.object({
  schemaVersion: z.literal("skill-ir-env-manager-contract-repair-artifact-lock/v1"),
  stage: z.literal("contract-repair-artifact-development"),
  status: z.literal("preregistered"),
  catalog: z.literal("executable-contract-repair-artifact/v4"),
  codeCatalog: z.literal("public-contract-error-codes/v2"),
  corpus: z.literal("pilot"),
  skillId: z.literal("env-manager"),
  package: z.object({
    path: z.string().min(1),
    manifestSha256: Sha256Schema,
    provenanceSha256: Sha256Schema,
  }).strict(),
  scorer: DigestRefSchema,
  tasks: DigestRefSchema,
  model: z.object({ route: z.string().min(1), family: z.string().min(1) }).strict(),
  adapter: z.object({ id: z.string().min(1), version: z.string().min(1) }).strict(),
  matrix: z.object({
    system: z.literal("ir-contract-artifact-dev"),
    panelConfigId: z.string().min(1),
    contexts: z.array(z.string().min(1)).min(1),
    agents: z.array(z.string().min(1)).min(1),
    environments: z.array(z.string().min(1)).min(1),
    taskSplit: z.literal("development"),
    taskIds: z.array(z.string().min(1)).min(1),
    repetitions: z.number().int().min(1),
    initialGenerationRows: z.number().int().min(1),
  }).strict(),
  runtime: z.object({
    stateMachine: z.tuple([
      z.literal("preflight"),
      z.literal("generation"),
      z.literal("capture-pre-repair-snapshot"),
      z.literal("validate"),
      z.literal("deterministic-repair"),
      z.literal("revalidate"),
      z.literal("optional-one-model-repair-for-residual"),
      z.literal("final-validate"),
      z.literal("capture-post-repair-snapshot"),
      z.literal("stop"),
    ]),
    maxDeterministicRepairCalls: z.literal(1),
    maxModelRepairCalls: z.literal(1),
    apiKeyEnv: z.string().min(1),
    sharedGeneration: z.literal(true),
  }).strict(),
  scoring: z.object({
    authority: z.literal("existing-deterministic-env-manager-scorer"),
    runtimeValidatorIsScorer: z.literal(false),
    generationDenominator: z.literal("preregistered-generation"),
    missingPairIsInfrastructure: z.literal(true),
    deterministicRepairCostReportedSeparately: z.literal(true),
    modelRepairCostReportedSeparately: z.literal(true),
    logicalArms: z.tuple([z.literal("check-only"), z.literal("one-repair")]),
  }).strict(),
  attributionGate: z.object({
    minimumDeterministicRepairAttempts: z.number().int().min(1),
    requireSharedGenerationIdentity: z.literal(true),
    scorerAuthorityUnchanged: z.literal(true),
  }).strict(),
  developmentGate: z.object({
    minimumSuccesses: z.number().int().min(1),
    minimumMeanScore: z.number().min(0).max(1),
    maximumHardGateRegressions: z.number().int().min(0),
    maximumInfrastructureFailures: z.number().int().min(0),
  }).strict(),
  prohibited: z.array(z.string().min(1)).min(1),
}).strict().superRefine((lock, ctx) => {
  if (lock.matrix.initialGenerationRows !== lock.matrix.taskIds.length * lock.matrix.repetitions) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["matrix", "initialGenerationRows"],
      message: "V4 initialGenerationRows must equal taskIds x repetitions",
    });
  }
});

export type RuntimeValidationReport = z.infer<typeof RuntimeValidationReportSchema>;
export type ArtifactPackageManifest = z.infer<typeof ArtifactPackageManifestSchema>;
export type ArtifactPackageProvenance = z.infer<typeof ArtifactPackageProvenanceSchema>;
export type ArtifactDevelopmentLock = z.infer<typeof ArtifactDevelopmentLockSchema>;
export type SemanticArtifactDevelopmentLock = z.infer<typeof SemanticArtifactDevelopmentLockSchema>;
export type ArtifactRecord = z.infer<typeof ArtifactRecordSchema>;
export type SemanticArtifactRecord = z.infer<typeof SemanticArtifactRecordSchema>;
export type SemanticArtifactPackageManifest = z.infer<typeof SemanticArtifactPackageManifestSchema>;
export type SemanticArtifactPackageProvenance = z.infer<typeof SemanticArtifactPackageProvenanceSchema>;
export type PublicContractArtifactPackageManifest = z.infer<
  typeof PublicContractArtifactPackageManifestSchema
>;
export type PublicContractArtifactPackageProvenance = z.infer<
  typeof PublicContractArtifactPackageProvenanceSchema
>;
export type PublicContractArtifactDevelopmentLock = z.infer<
  typeof PublicContractArtifactDevelopmentLockSchema
>;
export type ContractRepairArtifactPackageManifest = z.infer<
  typeof ContractRepairArtifactPackageManifestSchema
>;
export type ContractRepairArtifactPackageProvenance = z.infer<
  typeof ContractRepairArtifactPackageProvenanceSchema
>;
export type ContractRepairArtifactDevelopmentLock = z.infer<
  typeof ContractRepairArtifactDevelopmentLockSchema
>;

export type ValidatedArtifactPackage = {
  packageDir: string;
  manifest: ArtifactPackageManifest;
  provenance: ArtifactPackageProvenance;
};

export type ValidatedSemanticArtifactPackage = {
  packageDir: string;
  manifest: SemanticArtifactPackageManifest;
  provenance: SemanticArtifactPackageProvenance;
};

export type ValidatedPublicContractArtifactPackage = {
  packageDir: string;
  manifest: PublicContractArtifactPackageManifest;
  provenance: PublicContractArtifactPackageProvenance;
};

export type ValidatedContractRepairArtifactPackage = {
  packageDir: string;
  manifest: ContractRepairArtifactPackageManifest;
  provenance: ContractRepairArtifactPackageProvenance;
};

async function listFiles(root: string, directory = root): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(root, absolute));
    } else if (entry.isFile()) {
      files.push(relative(root, absolute).replaceAll("\\", "/"));
    } else {
      throw new Error(`Unsupported package entry type: ${relative(root, absolute)}`);
    }
  }
  return files.sort();
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function verifyDigest(root: string, ref: { path: string; sha256: string }): Promise<void> {
  const bytes = await readFile(resolve(root, parseSafeRelativePath(ref.path)));
  const actual = sha256Bytes(bytes);
  if (actual !== ref.sha256) {
    throw new Error(`Artifact digest mismatch for ${ref.path}: expected ${ref.sha256}, got ${actual}`);
  }
}

function stableArtifactIdentity<T extends {
  path: string;
  kind: string;
  sha256: string;
  targetPath?: string;
}>(artifacts: T[]): string {
  return JSON.stringify(
    artifacts
      .map((artifact) => ({ ...artifact }))
      .sort((left, right) => left.path.localeCompare(right.path)),
  );
}

async function validateV1ArtifactPackage(opts: {
  packageDir: string;
}): Promise<ValidatedArtifactPackage> {
  const packageDir = resolve(opts.packageDir);
  const manifest = ArtifactPackageManifestSchema.parse(
    await readJson(resolve(packageDir, "package-manifest.json")),
  );
  await verifyDigest(packageDir, manifest.provenance);
  const provenance = ArtifactPackageProvenanceSchema.parse(
    await readJson(resolve(packageDir, manifest.provenance.path)),
  );
  if (manifest.skillId !== provenance.skillId) {
    throw new Error(`Artifact package skill identity mismatch: ${manifest.skillId} != ${provenance.skillId}`);
  }
  if (manifest.catalog !== provenance.catalog) {
    throw new Error(`Artifact package catalog mismatch: ${manifest.catalog} != ${provenance.catalog}`);
  }
  if (stableArtifactIdentity(manifest.artifacts) !== stableArtifactIdentity(provenance.artifacts)) {
    throw new Error("Artifact manifest/provenance artifact identity mismatch");
  }

  const paths = new Set<string>();
  for (const artifact of manifest.artifacts) {
    if (paths.has(artifact.path)) {
      throw new Error(`Duplicate artifact path: ${artifact.path}`);
    }
    paths.add(artifact.path);
    await verifyDigest(packageDir, artifact);
  }
  const contract = manifest.artifacts.find((artifact) => artifact.path === manifest.contract.path);
  if (!contract || contract.kind !== "contract" || contract.sha256 !== manifest.contract.sha256) {
    throw new Error("Manifest contract reference does not identify the declared contract artifact");
  }
  const checker = manifest.artifacts.find((artifact) => artifact.path === manifest.checker.path);
  if (!checker || checker.kind !== "checker") {
    throw new Error("Manifest checker reference does not identify the declared checker artifact");
  }
  for (const output of manifest.generatedOutputs) {
    parseSafeRelativePath(output);
  }

  const allowed = new Set(["package-manifest.json", manifest.provenance.path, ...paths]);
  for (const file of await listFiles(packageDir)) {
    if (!allowed.has(file)) {
      throw new Error(`Undeclared package file: ${file}`);
    }
  }

  return { packageDir, manifest, provenance };
}

async function validateV2ArtifactPackage(opts: {
  packageDir: string;
}): Promise<ValidatedSemanticArtifactPackage> {
  const packageDir = resolve(opts.packageDir);
  const manifest = SemanticArtifactPackageManifestSchema.parse(
    await readJson(resolve(packageDir, "package-manifest.json")),
  );
  await verifyDigest(packageDir, manifest.provenance);
  const provenance = SemanticArtifactPackageProvenanceSchema.parse(
    await readJson(resolve(packageDir, manifest.provenance.path)),
  );
  if (manifest.skillId !== provenance.skillId || manifest.catalog !== provenance.catalog) {
    throw new Error("Semantic artifact manifest/provenance identity mismatch");
  }
  if (stableArtifactIdentity(manifest.artifacts) !== stableArtifactIdentity(provenance.artifacts)) {
    throw new Error("Semantic artifact manifest/provenance artifact identity mismatch");
  }

  const paths = new Set<string>();
  for (const artifact of manifest.artifacts) {
    if (paths.has(artifact.path)) throw new Error(`Duplicate artifact path: ${artifact.path}`);
    paths.add(artifact.path);
    await verifyDigest(packageDir, artifact);
  }
  for (const [label, ref, kind] of [
    ["contract", manifest.contract, "contract"],
    ["semantic contract schema", manifest.semanticContractSchema, "semantic-contract-schema"],
  ] as const) {
    const artifact = manifest.artifacts.find((candidate) => candidate.path === ref.path);
    if (!artifact || artifact.kind !== kind || artifact.sha256 !== ref.sha256) {
      throw new Error(`Manifest ${label} reference is invalid`);
    }
  }
  const evidence = manifest.artifacts.find((artifact) => artifact.path === manifest.evidenceProgram.path);
  if (!evidence || evidence.kind !== "evidence-program") {
    throw new Error("Manifest evidence program reference is invalid");
  }
  const checker = manifest.artifacts.find((artifact) => artifact.path === manifest.checker.path);
  if (!checker || checker.kind !== "checker") {
    throw new Error("Manifest checker reference is invalid");
  }
  for (const output of manifest.generatedOutputs) parseSafeRelativePath(output);
  parseSafeRelativePath(manifest.runtimeContract.path);

  const allowed = new Set(["package-manifest.json", manifest.provenance.path, ...paths]);
  for (const file of await listFiles(packageDir)) {
    if (!allowed.has(file)) throw new Error(`Undeclared package file: ${file}`);
  }
  return { packageDir, manifest, provenance };
}

async function validateV3ArtifactPackage(opts: {
  packageDir: string;
}): Promise<ValidatedPublicContractArtifactPackage> {
  const packageDir = resolve(opts.packageDir);
  const manifest = PublicContractArtifactPackageManifestSchema.parse(
    await readJson(resolve(packageDir, "package-manifest.json")),
  );
  await verifyDigest(packageDir, manifest.provenance);
  const provenance = PublicContractArtifactPackageProvenanceSchema.parse(
    await readJson(resolve(packageDir, manifest.provenance.path)),
  );
  if (manifest.skillId !== provenance.skillId || manifest.catalog !== provenance.catalog) {
    throw new Error("Public-contract artifact manifest/provenance identity mismatch");
  }
  if (stableArtifactIdentity(manifest.artifacts) !== stableArtifactIdentity(provenance.artifacts)) {
    throw new Error("Public-contract artifact manifest/provenance artifact identity mismatch");
  }

  const paths = new Set<string>();
  for (const artifact of manifest.artifacts) {
    if (paths.has(artifact.path)) throw new Error(`Duplicate artifact path: ${artifact.path}`);
    paths.add(artifact.path);
    await verifyDigest(packageDir, artifact);
  }
  for (const [label, ref, kind] of [
    ["output contract", manifest.outputContract, "output-contract"],
    ["public policy", manifest.publicPolicy, "public-policy"],
    ["public runtime contract schema", manifest.publicRuntimeContractSchema, "public-contract-schema"],
  ] as const) {
    const artifact = manifest.artifacts.find((candidate) => candidate.path === ref.path);
    if (!artifact || artifact.kind !== kind || artifact.sha256 !== ref.sha256) {
      throw new Error(`Manifest ${label} reference is invalid`);
    }
  }
  const evidence = manifest.artifacts.find((artifact) => artifact.path === manifest.evidenceProgram.path);
  if (!evidence || evidence.kind !== "evidence-program") {
    throw new Error("Manifest evidence program reference is invalid");
  }
  const checker = manifest.artifacts.find((artifact) => artifact.path === manifest.checker.path);
  if (!checker || checker.kind !== "checker") {
    throw new Error("Manifest checker reference is invalid");
  }
  for (const output of manifest.generatedOutputs) parseSafeRelativePath(output);
  parseSafeRelativePath(manifest.runtimeContract.path);

  const allowed = new Set(["package-manifest.json", manifest.provenance.path, ...paths]);
  for (const file of await listFiles(packageDir)) {
    if (!allowed.has(file)) throw new Error(`Undeclared package file: ${file}`);
  }
  return { packageDir, manifest, provenance };
}

async function validateV4ArtifactPackage(opts: {
  packageDir: string;
}): Promise<ValidatedContractRepairArtifactPackage> {
  const packageDir = resolve(opts.packageDir);
  const manifest = ContractRepairArtifactPackageManifestSchema.parse(
    await readJson(resolve(packageDir, "package-manifest.json")),
  );
  await verifyDigest(packageDir, manifest.provenance);
  const provenance = ContractRepairArtifactPackageProvenanceSchema.parse(
    await readJson(resolve(packageDir, manifest.provenance.path)),
  );
  if (manifest.skillId !== provenance.skillId || manifest.catalog !== provenance.catalog) {
    throw new Error("Contract-repair artifact manifest/provenance identity mismatch");
  }
  if (stableArtifactIdentity(manifest.artifacts) !== stableArtifactIdentity(provenance.artifacts)) {
    throw new Error("Contract-repair artifact manifest/provenance artifact identity mismatch");
  }

  const paths = new Set<string>();
  for (const artifact of manifest.artifacts) {
    if (paths.has(artifact.path)) throw new Error(`Duplicate artifact path: ${artifact.path}`);
    paths.add(artifact.path);
    await verifyDigest(packageDir, artifact);
  }
  for (const [label, ref, kind] of [
    ["output contract", manifest.outputContract, "output-contract"],
    ["repair recipe", manifest.repairRecipe, "repair-recipe"],
    ["public policy", manifest.publicPolicy, "public-policy"],
    ["public runtime contract schema", manifest.publicRuntimeContractSchema, "public-contract-schema"],
  ] as const) {
    const artifact = manifest.artifacts.find((candidate) => candidate.path === ref.path);
    if (!artifact || artifact.kind !== kind || artifact.sha256 !== ref.sha256) {
      throw new Error(`Manifest ${label} reference is invalid`);
    }
  }
  for (const [label, path, kind] of [
    ["evidence program", manifest.evidenceProgram.path, "evidence-program"],
    ["checker", manifest.checker.path, "checker"],
    ["deterministic repairer", manifest.deterministicRepairer.path, "deterministic-repairer"],
  ] as const) {
    const artifact = manifest.artifacts.find((candidate) => candidate.path === path);
    if (!artifact || artifact.kind !== kind) throw new Error(`Manifest ${label} reference is invalid`);
  }
  for (const output of manifest.generatedOutputs) parseSafeRelativePath(output);
  parseSafeRelativePath(manifest.runtimeContracts.public.path);
  parseSafeRelativePath(manifest.runtimeContracts.executableRepair.path);

  const allowed = new Set(["package-manifest.json", manifest.provenance.path, ...paths]);
  for (const file of await listFiles(packageDir)) {
    if (!allowed.has(file)) throw new Error(`Undeclared package file: ${file}`);
  }
  return { packageDir, manifest, provenance };
}

export function validateArtifactPackage(opts: {
  packageDir: string;
  expectedCatalog?: "executable-artifact/v1";
}): Promise<ValidatedArtifactPackage>;
export function validateArtifactPackage(opts: {
  packageDir: string;
  expectedCatalog: "executable-semantic-artifact/v2";
}): Promise<ValidatedSemanticArtifactPackage>;
export function validateArtifactPackage(opts: {
  packageDir: string;
  expectedCatalog: "executable-public-contract-artifact/v3";
}): Promise<ValidatedPublicContractArtifactPackage>;
export function validateArtifactPackage(opts: {
  packageDir: string;
  expectedCatalog: "executable-contract-repair-artifact/v4";
}): Promise<ValidatedContractRepairArtifactPackage>;
export async function validateArtifactPackage(opts: {
  packageDir: string;
  expectedCatalog?:
    | "executable-artifact/v1"
    | "executable-semantic-artifact/v2"
    | "executable-public-contract-artifact/v3"
    | "executable-contract-repair-artifact/v4";
}): Promise<
  | ValidatedArtifactPackage
  | ValidatedSemanticArtifactPackage
  | ValidatedPublicContractArtifactPackage
  | ValidatedContractRepairArtifactPackage
> {
  const raw = await readJson(resolve(opts.packageDir, "package-manifest.json"));
  const catalog = z.object({ catalog: z.string() }).passthrough().parse(raw).catalog;
  if (opts.expectedCatalog && catalog !== opts.expectedCatalog) {
    throw new Error(`Artifact catalog mismatch: expected ${opts.expectedCatalog}, got ${catalog}`);
  }
  if (catalog === "executable-artifact/v1") return validateV1ArtifactPackage(opts);
  if (catalog === "executable-semantic-artifact/v2") return validateV2ArtifactPackage(opts);
  if (catalog === "executable-public-contract-artifact/v3") return validateV3ArtifactPackage(opts);
  if (catalog === "executable-contract-repair-artifact/v4") return validateV4ArtifactPackage(opts);
  throw new Error(`Unsupported artifact catalog: ${catalog}`);
}

function sameValues(actual: Iterable<string> | undefined, expected: string[]): boolean {
  if (!actual) return false;
  const values = [...actual].sort();
  return JSON.stringify(values) === JSON.stringify([...expected].sort());
}

export async function readAndValidateArtifactDevelopmentLock(opts: {
  rootDir: string;
  lockPath: string;
  packageDir: string;
  expected: {
    corpus: string;
    skillId: string;
    model: string;
    modelFamily: string;
    adapter: string;
    adapterVersion: string;
    repairMode: "check-only" | "one-repair";
    repetitions: number;
    contexts?: Iterable<string>;
    agents?: Iterable<string>;
    environments?: Iterable<string>;
    tasks?: Iterable<string>;
  };
}): Promise<ArtifactDevelopmentLock> {
  const lockPath = resolve(opts.lockPath);
  const lock = ArtifactDevelopmentLockSchema.parse(await readJson(lockPath));
  const rootCandidate = isAbsolute(lock.package.path)
    ? resolve(lock.package.path)
    : resolve(opts.rootDir, parseSafeRelativePath(lock.package.path));
  const siblingCandidate = isAbsolute(lock.package.path)
    ? rootCandidate
    : resolve(lockPath, "..", parseSafeRelativePath(lock.package.path));
  const actualPackageDir = resolve(opts.packageDir);
  if (actualPackageDir !== rootCandidate && actualPackageDir !== siblingCandidate) {
    throw new Error(`Artifact lock package path mismatch: ${lock.package.path}`);
  }
  const manifestSha256 = sha256Bytes(await readFile(resolve(actualPackageDir, "package-manifest.json")));
  if (manifestSha256 !== lock.package.manifestSha256) {
    throw new Error("Artifact lock package manifest digest mismatch");
  }
  const provenanceSha256 = sha256Bytes(await readFile(resolve(actualPackageDir, "package-provenance.json")));
  if (provenanceSha256 !== lock.package.provenanceSha256) {
    throw new Error("Artifact lock package provenance digest mismatch");
  }
  const expected = opts.expected;
  if (expected.corpus !== lock.corpus || expected.skillId !== lock.skillId) {
    throw new Error("Artifact lock corpus or skill identity mismatch");
  }
  if (expected.model !== lock.model.route || expected.modelFamily !== lock.model.family) {
    throw new Error("Artifact lock model identity mismatch");
  }
  if (expected.adapter !== lock.adapter.id || expected.adapterVersion !== lock.adapter.version) {
    throw new Error("Artifact lock adapter identity mismatch");
  }
  if (!lock.matrix.repairModes.includes(expected.repairMode)) {
    throw new Error(`Artifact lock does not allow repair mode ${expected.repairMode}`);
  }
  if (expected.repetitions !== lock.matrix.repetitions) {
    throw new Error(`Artifact lock repetitions mismatch: expected ${lock.matrix.repetitions}`);
  }
  for (const [name, actual, frozen] of [
    ["contexts", expected.contexts, lock.matrix.contexts],
    ["agents", expected.agents, lock.matrix.agents],
    ["environments", expected.environments, lock.matrix.environments],
    ["tasks", expected.tasks, lock.matrix.taskIds],
  ] as const) {
    if (!sameValues(actual, frozen)) {
      throw new Error(`Artifact lock ${name} mismatch`);
    }
  }
  return lock;
}

export async function readAndValidateSemanticArtifactDevelopmentLock(opts: {
  rootDir: string;
  lockPath: string;
  packageDir: string;
  expected: {
    corpus: string;
    skillId: string;
    model: string;
    modelFamily: string;
    adapter: string;
    adapterVersion: string;
    repairMode: "check-only" | "one-repair";
    repetitions: number;
    contexts?: Iterable<string>;
    agents?: Iterable<string>;
    environments?: Iterable<string>;
    tasks?: Iterable<string>;
  };
}): Promise<SemanticArtifactDevelopmentLock> {
  const lockPath = resolve(opts.lockPath);
  const lock = SemanticArtifactDevelopmentLockSchema.parse(await readJson(lockPath));
  const rootCandidate = isAbsolute(lock.package.path)
    ? resolve(lock.package.path)
    : resolve(opts.rootDir, parseSafeRelativePath(lock.package.path));
  const siblingCandidate = isAbsolute(lock.package.path)
    ? rootCandidate
    : resolve(lockPath, "..", parseSafeRelativePath(lock.package.path));
  const actualPackageDir = resolve(opts.packageDir);
  if (actualPackageDir !== rootCandidate && actualPackageDir !== siblingCandidate) {
    throw new Error(`Semantic artifact lock package path mismatch: ${lock.package.path}`);
  }
  const manifestSha256 = sha256Bytes(await readFile(resolve(actualPackageDir, "package-manifest.json")));
  if (manifestSha256 !== lock.package.manifestSha256) {
    throw new Error("Semantic artifact lock package manifest digest mismatch");
  }
  const provenanceSha256 = sha256Bytes(await readFile(resolve(actualPackageDir, "package-provenance.json")));
  if (provenanceSha256 !== lock.package.provenanceSha256) {
    throw new Error("Semantic artifact lock package provenance digest mismatch");
  }
  const expected = opts.expected;
  if (expected.corpus !== lock.corpus || expected.skillId !== lock.skillId) {
    throw new Error("Semantic artifact lock corpus or skill identity mismatch");
  }
  if (expected.model !== lock.model.route || expected.modelFamily !== lock.model.family) {
    throw new Error("Semantic artifact lock model identity mismatch");
  }
  if (expected.adapter !== lock.adapter.id || expected.adapterVersion !== lock.adapter.version) {
    throw new Error("Semantic artifact lock adapter identity mismatch");
  }
  if (!lock.matrix.repairModes.includes(expected.repairMode)) {
    throw new Error(`Semantic artifact lock does not allow repair mode ${expected.repairMode}`);
  }
  if (expected.repetitions !== lock.matrix.repetitions) {
    throw new Error(`Semantic artifact lock repetitions mismatch: expected ${lock.matrix.repetitions}`);
  }
  for (const [name, actual, frozen] of [
    ["contexts", expected.contexts, lock.matrix.contexts],
    ["agents", expected.agents, lock.matrix.agents],
    ["environments", expected.environments, lock.matrix.environments],
    ["tasks", expected.tasks, lock.matrix.taskIds],
  ] as const) {
    if (!sameValues(actual, frozen)) throw new Error(`Semantic artifact lock ${name} mismatch`);
  }
  return lock;
}

export async function readAndValidatePublicContractArtifactDevelopmentLock(opts: {
  rootDir: string;
  lockPath: string;
  packageDir: string;
  expected: {
    corpus: string;
    skillId: string;
    model: string;
    modelFamily: string;
    adapter: string;
    adapterVersion: string;
    repairMode: "check-only" | "one-repair";
    repetitions: number;
    contexts?: Iterable<string>;
    agents?: Iterable<string>;
    environments?: Iterable<string>;
    tasks?: Iterable<string>;
  };
}): Promise<PublicContractArtifactDevelopmentLock> {
  const lockPath = resolve(opts.lockPath);
  const lock = PublicContractArtifactDevelopmentLockSchema.parse(await readJson(lockPath));
  const rootCandidate = isAbsolute(lock.package.path)
    ? resolve(lock.package.path)
    : resolve(opts.rootDir, parseSafeRelativePath(lock.package.path));
  const siblingCandidate = isAbsolute(lock.package.path)
    ? rootCandidate
    : resolve(lockPath, "..", parseSafeRelativePath(lock.package.path));
  const actualPackageDir = resolve(opts.packageDir);
  if (actualPackageDir !== rootCandidate && actualPackageDir !== siblingCandidate) {
    throw new Error(`Public-contract artifact lock package path mismatch: ${lock.package.path}`);
  }
  if (sha256Bytes(await readFile(resolve(actualPackageDir, "package-manifest.json"))) !== lock.package.manifestSha256) {
    throw new Error("Public-contract artifact lock package manifest digest mismatch");
  }
  if (sha256Bytes(await readFile(resolve(actualPackageDir, "package-provenance.json"))) !== lock.package.provenanceSha256) {
    throw new Error("Public-contract artifact lock package provenance digest mismatch");
  }
  const expected = opts.expected;
  if (expected.corpus !== lock.corpus || expected.skillId !== lock.skillId) {
    throw new Error("Public-contract artifact lock corpus or skill identity mismatch");
  }
  if (expected.model !== lock.model.route || expected.modelFamily !== lock.model.family) {
    throw new Error("Public-contract artifact lock model identity mismatch");
  }
  if (expected.adapter !== lock.adapter.id || expected.adapterVersion !== lock.adapter.version) {
    throw new Error("Public-contract artifact lock adapter identity mismatch");
  }
  if (expected.repairMode !== "one-repair") {
    throw new Error("Public-contract shared-generation runtime requires one-repair execution");
  }
  if (expected.repetitions !== lock.matrix.repetitions) {
    throw new Error(`Public-contract artifact lock repetitions mismatch: expected ${lock.matrix.repetitions}`);
  }
  for (const [name, actual, frozen] of [
    ["contexts", expected.contexts, lock.matrix.contexts],
    ["agents", expected.agents, lock.matrix.agents],
    ["environments", expected.environments, lock.matrix.environments],
    ["tasks", expected.tasks, lock.matrix.taskIds],
  ] as const) {
    if (!sameValues(actual, frozen)) throw new Error(`Public-contract artifact lock ${name} mismatch`);
  }
  return lock;
}

export async function readAndValidateContractRepairArtifactDevelopmentLock(opts: {
  rootDir: string;
  lockPath: string;
  packageDir: string;
  expected: {
    corpus: string;
    skillId: string;
    model: string;
    modelFamily: string;
    adapter: string;
    adapterVersion: string;
    panelConfigId: string;
    repairMode: "check-only" | "one-repair";
    repetitions: number;
    contexts?: Iterable<string>;
    agents?: Iterable<string>;
    environments?: Iterable<string>;
    tasks?: Iterable<string>;
  };
}): Promise<ContractRepairArtifactDevelopmentLock> {
  const lockPath = resolve(opts.lockPath);
  const lock = ContractRepairArtifactDevelopmentLockSchema.parse(await readJson(lockPath));
  const rootCandidate = isAbsolute(lock.package.path)
    ? resolve(lock.package.path)
    : resolve(opts.rootDir, parseSafeRelativePath(lock.package.path));
  const siblingCandidate = isAbsolute(lock.package.path)
    ? rootCandidate
    : resolve(lockPath, "..", parseSafeRelativePath(lock.package.path));
  const actualPackageDir = resolve(opts.packageDir);
  if (actualPackageDir !== rootCandidate && actualPackageDir !== siblingCandidate) {
    throw new Error(`Contract-repair artifact lock package path mismatch: ${lock.package.path}`);
  }
  if (sha256Bytes(await readFile(resolve(actualPackageDir, "package-manifest.json")))
    !== lock.package.manifestSha256) {
    throw new Error("Contract-repair artifact lock package manifest digest mismatch");
  }
  if (sha256Bytes(await readFile(resolve(actualPackageDir, "package-provenance.json")))
    !== lock.package.provenanceSha256) {
    throw new Error("Contract-repair artifact lock package provenance digest mismatch");
  }
  for (const [label, ref] of [["scorer", lock.scorer], ["tasks", lock.tasks]] as const) {
    const path = resolve(opts.rootDir, parseSafeRelativePath(ref.path));
    if (sha256Bytes(await readFile(path)) !== ref.sha256) {
      throw new Error(`Contract-repair artifact lock ${label} digest mismatch`);
    }
  }
  const expected = opts.expected;
  if (expected.corpus !== lock.corpus || expected.skillId !== lock.skillId) {
    throw new Error("Contract-repair artifact lock corpus or skill identity mismatch");
  }
  if (expected.model !== lock.model.route || expected.modelFamily !== lock.model.family) {
    throw new Error("Contract-repair artifact lock model identity mismatch");
  }
  if (expected.adapter !== lock.adapter.id || expected.adapterVersion !== lock.adapter.version) {
    throw new Error("Contract-repair artifact lock adapter identity mismatch");
  }
  if (expected.panelConfigId !== lock.matrix.panelConfigId) {
    throw new Error("Contract-repair artifact lock panel identity mismatch");
  }
  if (expected.repairMode !== "one-repair") {
    throw new Error("Contract-repair shared-generation runtime requires one-repair execution");
  }
  if (expected.repetitions !== lock.matrix.repetitions) {
    throw new Error(`Contract-repair artifact lock repetitions mismatch: expected ${lock.matrix.repetitions}`);
  }
  for (const [name, actual, frozen] of [
    ["contexts", expected.contexts, lock.matrix.contexts],
    ["agents", expected.agents, lock.matrix.agents],
    ["environments", expected.environments, lock.matrix.environments],
    ["tasks", expected.tasks, lock.matrix.taskIds],
  ] as const) {
    if (!sameValues(actual, frozen)) throw new Error(`Contract-repair artifact lock ${name} mismatch`);
  }
  return lock;
}
