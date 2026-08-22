import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import { validateValidatedArtifactPackage } from "./validated-artifact-catalog";

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const IdentifierSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const PortablePathSchema = z.string().min(1).refine((value) => {
  if (/^(?:[A-Za-z]:[\\/]|[\\/])/u.test(value) || value.includes("\\")) return false;
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}, "evidence path must be repository-relative and slash-normalized");

export const ProspectiveCompilerCostEvidenceRefSchema = z.object({
  relativePath: PortablePathSchema,
  sha256: Sha256Schema,
}).strict();

const CompilerCostEnvironmentInputSchema = z.object({
  runtime: z.string().min(1),
  runtimeVersion: z.string().min(1),
  platform: z.string().min(1),
  architecture: z.string().min(1),
}).strict();

export const CompilerCostEnvironmentIdentitySchema = CompilerCostEnvironmentInputSchema.extend({
  identitySha256: Sha256Schema,
}).strict().superRefine((environment, context) => {
  const expected = sha256Text(JSON.stringify({
    runtime: environment.runtime,
    runtimeVersion: environment.runtimeVersion,
    platform: environment.platform,
    architecture: environment.architecture,
  }));
  if (environment.identitySha256 !== expected) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["identitySha256"],
      message: "environment identity digest mismatch",
    });
  }
});

export function buildCompilerCostEnvironmentIdentity(
  rawInput: z.input<typeof CompilerCostEnvironmentInputSchema>,
) {
  const input = CompilerCostEnvironmentInputSchema.parse(rawInput);
  return CompilerCostEnvironmentIdentitySchema.parse({
    ...input,
    identitySha256: sha256Text(JSON.stringify(input)),
  });
}

export const ProspectiveCompilerCostIdentitySchema = z.object({
  schemaVersion: z.literal("skill-ir-prospective-compiler-cost/v1"),
  experimentId: IdentifierSchema,
  skillId: IdentifierSchema,
  constructionOrigin: z.enum(["automatic-prospective", "manual-existing"]),
  unautomatedConstructionSteps: z.array(z.string().min(1)),
  evidence: z.object({
    sourceClosure: z.array(ProspectiveCompilerCostEvidenceRefSchema).min(1),
    taskContract: ProspectiveCompilerCostEvidenceRefSchema,
    publicContract: ProspectiveCompilerCostEvidenceRefSchema,
    resourceContract: ProspectiveCompilerCostEvidenceRefSchema,
    baseIr: ProspectiveCompilerCostEvidenceRefSchema,
    sourceAudit: ProspectiveCompilerCostEvidenceRefSchema,
    adapter: ProspectiveCompilerCostEvidenceRefSchema,
    compilerImplementation: ProspectiveCompilerCostEvidenceRefSchema,
    catalogRuntime: z.array(ProspectiveCompilerCostEvidenceRefSchema).min(1),
  }).strict(),
  environment: CompilerCostEnvironmentIdentitySchema,
}).strict().superRefine((identity, context) => {
  const refs = [
    ...identity.evidence.sourceClosure,
    identity.evidence.taskContract,
    identity.evidence.publicContract,
    identity.evidence.resourceContract,
    identity.evidence.baseIr,
    identity.evidence.sourceAudit,
    identity.evidence.adapter,
    identity.evidence.compilerImplementation,
    ...identity.evidence.catalogRuntime,
  ];
  const paths = new Set<string>();
  for (const ref of refs) {
    if (paths.has(ref.relativePath)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["evidence"],
        message: `duplicate cost evidence path: ${ref.relativePath}`,
      });
    }
    paths.add(ref.relativePath);
  }
});

export type ProspectiveCompilerCostIdentity = z.infer<typeof ProspectiveCompilerCostIdentitySchema>;

export const ProspectiveCompilerModelUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
}).strict();

const CompilerCostStageIdSchema = z.enum(["optimizer", "compiler", "package", "compiler-package"]);
const MeasuredStageResultSchema = z.object({
  modelCalls: z.number().int().nonnegative(),
  usage: ProspectiveCompilerModelUsageSchema,
}).passthrough().superRefine((result, context) => {
  const aggregateUsage = Object.values(result.usage).reduce((sum, value) => sum + value, 0);
  if (result.modelCalls === 0 && aggregateUsage !== 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["usage"],
      message: "zero model calls require zero model usage",
    });
  }
  if (result.modelCalls > 0 && aggregateUsage === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["usage"],
      message: "positive model calls require non-zero model usage",
    });
  }
});

const ProspectiveCompilerCostStageSchema = z.object({
  id: CompilerCostStageIdSchema,
  durationMs: z.number().nonnegative(),
  modelCalls: z.number().int().nonnegative(),
  usage: ProspectiveCompilerModelUsageSchema,
}).strict();

const ProspectiveCompilerCostPackageSchema = z.object({
  id: IdentifierSchema,
  skillId: IdentifierSchema,
  manifestSha256: Sha256Schema,
  packageBytes: z.number().int().positive(),
  validation: z.literal("passed"),
}).strict();

export const ProspectiveCompilerCostReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-prospective-compiler-cost/v1"),
  identity: ProspectiveCompilerCostIdentitySchema,
  identitySha256: Sha256Schema,
  stages: z.array(ProspectiveCompilerCostStageSchema).min(1),
  packages: z.array(ProspectiveCompilerCostPackageSchema).min(1),
  summary: z.object({
    modelCalls: z.number().int().nonnegative(),
    aggregateModelTokens: z.number().int().nonnegative(),
    cacheReadTokens: z.number().int().nonnegative(),
    cacheWriteTokens: z.number().int().nonnegative(),
    durationMs: z.number().nonnegative(),
    packageCount: z.number().int().positive(),
    packageBytes: z.number().int().positive(),
  }).strict(),
  eligibility: z.object({
    status: z.enum(["eligible", "mechanism-only"]),
    reasons: z.array(z.string().min(1)),
  }).strict(),
  claimBoundary: z.string().min(1),
}).strict();

export type ProspectiveCompilerCostReport = z.infer<typeof ProspectiveCompilerCostReportSchema>;

export type ProspectiveCompilerCostRunContext = {
  outRoot: string;
  measureStage<T>(
    stageId: z.infer<typeof CompilerCostStageIdSchema>,
    operation: () => Promise<{
      value: T;
      modelCalls: number;
      usage: z.input<typeof ProspectiveCompilerModelUsageSchema>;
    }>,
  ): Promise<T>;
};

export type ProspectiveCompilerCostRunResult = {
  packages: Array<{ id: string; directory: string }>;
};

function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function identityEvidence(identity: ProspectiveCompilerCostIdentity) {
  return [
    ...identity.evidence.sourceClosure,
    identity.evidence.taskContract,
    identity.evidence.publicContract,
    identity.evidence.resourceContract,
    identity.evidence.baseIr,
    identity.evidence.sourceAudit,
    identity.evidence.adapter,
    identity.evidence.compilerImplementation,
    ...identity.evidence.catalogRuntime,
  ];
}

async function verifyEvidence(rootDir: string, identity: ProspectiveCompilerCostIdentity): Promise<void> {
  await Promise.all(identityEvidence(identity).map(async (ref) => {
    const bytes = await readFile(path.resolve(rootDir, ...ref.relativePath.split("/")));
    const actual = sha256Bytes(bytes);
    if (actual !== ref.sha256) {
      throw new Error(
        `Prospective compiler cost evidence digest mismatch for ${ref.relativePath}: expected ${ref.sha256}, got ${actual}`,
      );
    }
  }));
}

function containedPackageDirectory(outRoot: string, directory: string): string {
  const root = path.resolve(outRoot);
  const target = path.resolve(directory);
  const relative = path.relative(root, target);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Prospective compiler package directory must be a child of the capture output root");
  }
  return target;
}

export async function captureProspectiveCompilerCost(
  rawInput: { rootDir: string; identity: ProspectiveCompilerCostIdentity },
  run: (context: ProspectiveCompilerCostRunContext) => Promise<ProspectiveCompilerCostRunResult>,
): Promise<ProspectiveCompilerCostReport> {
  const rootDir = path.resolve(rawInput.rootDir);
  const identity = ProspectiveCompilerCostIdentitySchema.parse(rawInput.identity);
  await verifyEvidence(rootDir, identity);

  const outRoot = await mkdtemp(path.join(tmpdir(), "skvm-prospective-compiler-cost-"));
  const stages: Array<z.infer<typeof ProspectiveCompilerCostStageSchema>> = [];
  const seenStages = new Set<string>();
  try {
    const context: ProspectiveCompilerCostRunContext = {
      outRoot,
      async measureStage(stageId, operation) {
        const id = CompilerCostStageIdSchema.parse(stageId);
        if (seenStages.has(id)) throw new Error(`Prospective compiler cost stage repeated: ${id}`);
        const startedAt = performance.now();
        const rawResult = await operation();
        const durationMs = performance.now() - startedAt;
        const result = MeasuredStageResultSchema.parse(rawResult);
        stages.push(ProspectiveCompilerCostStageSchema.parse({
          id,
          durationMs,
          modelCalls: result.modelCalls,
          usage: result.usage,
        }));
        seenStages.add(id);
        return rawResult.value;
      },
    };
    const runResult = await run(context);
    if (!Array.isArray(runResult.packages) || runResult.packages.length === 0) {
      throw new Error("Prospective compiler cost capture requires at least one package");
    }
    if (stages.length === 0) throw new Error("Prospective compiler cost capture requires at least one measured stage");

    const packageIds = new Set<string>();
    const packages = [];
    for (const rawPackage of runResult.packages) {
      const id = IdentifierSchema.parse(rawPackage.id);
      if (packageIds.has(id)) throw new Error(`Duplicate prospective compiler package id: ${id}`);
      packageIds.add(id);
      const directory = containedPackageDirectory(outRoot, rawPackage.directory);
      const validated = await validateValidatedArtifactPackage(directory);
      if (validated.manifest.skillId !== identity.skillId) {
        throw new Error(
          `Prospective compiler package skill mismatch: expected ${identity.skillId}, got ${validated.manifest.skillId}`,
        );
      }
      packages.push(ProspectiveCompilerCostPackageSchema.parse({
        id,
        skillId: validated.manifest.skillId,
        manifestSha256: sha256Bytes(await readFile(path.join(directory, "package-manifest.json"))),
        packageBytes: validated.packageBytes,
        validation: "passed",
      }));
    }
    packages.sort((left, right) => left.id.localeCompare(right.id));

    const reasons: string[] = [];
    if (identity.constructionOrigin !== "automatic-prospective") {
      reasons.push("compiler construction origin is manual-existing");
    }
    if (identity.unautomatedConstructionSteps.length > 0) {
      reasons.push("unautomated construction steps remain");
    }
    const requiredAutomaticStages = ["optimizer", "compiler", "package"] as const;
    const missingAutomaticStages = requiredAutomaticStages.filter((stage) => !seenStages.has(stage));
    if (identity.constructionOrigin === "automatic-prospective" && missingAutomaticStages.length > 0) {
      reasons.push(`required automatic stages missing: ${missingAutomaticStages.join(", ")}`);
    }

    const report = {
      schemaVersion: "skill-ir-prospective-compiler-cost/v1" as const,
      identity,
      identitySha256: sha256Text(JSON.stringify(identity)),
      stages,
      packages,
      summary: {
        modelCalls: stages.reduce((sum, stage) => sum + stage.modelCalls, 0),
        aggregateModelTokens: stages.reduce(
          (sum, stage) => sum + stage.usage.inputTokens + stage.usage.outputTokens,
          0,
        ),
        cacheReadTokens: stages.reduce((sum, stage) => sum + stage.usage.cacheReadTokens, 0),
        cacheWriteTokens: stages.reduce((sum, stage) => sum + stage.usage.cacheWriteTokens, 0),
        durationMs: stages.reduce((sum, stage) => sum + stage.durationMs, 0),
        packageCount: packages.length,
        packageBytes: packages.reduce((sum, item) => sum + item.packageBytes, 0),
      },
      eligibility: {
        status: reasons.length === 0 ? "eligible" as const : "mechanism-only" as const,
        reasons,
      },
      claimBoundary: "Only automatic-prospective construction with complete optimizer/compiler/package stages can supply automatic production compile cost; manual-existing zero-token execution is mechanism evidence only.",
    };
    return ProspectiveCompilerCostReportSchema.parse(report);
  } finally {
    await rm(outRoot, { recursive: true, force: true });
  }
}
