import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  compileApiTesterValidatedArtifactVariants,
} from "./api-tester-artifact-compiler";
import {
  compileEnvManagerV3ValidatedArtifact,
  loadEnvManagerV3ArtifactCompilerInput,
  type EnvManagerV3ArtifactVariantId,
} from "./env-manager-v3-artifact-compiler";
import {
  buildCompilerCostEnvironmentIdentity,
  captureProspectiveCompilerCost,
  ProspectiveCompilerCostEvidenceRefSchema,
  ProspectiveCompilerCostReportSchema,
  type ProspectiveCompilerCostIdentity,
} from "./prospective-compiler-cost";

const FrozenPackageParitySchema = z.object({
  id: z.string().min(1),
  frozenManifest: ProspectiveCompilerCostEvidenceRefSchema,
  observedManifestSha256: z.string().regex(/^[0-9a-f]{64}$/),
  byteParity: z.boolean(),
}).strict();

export const ProspectiveCompilerCostCanaryReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-prospective-compiler-cost-canary/v1"),
  cases: z.array(z.object({
    cost: ProspectiveCompilerCostReportSchema,
    frozenPackageParity: z.array(FrozenPackageParitySchema).min(1),
  }).strict()).length(2),
  summary: z.object({
    caseCount: z.literal(2),
    packageCount: z.number().int().positive(),
    byteParityCount: z.number().int().nonnegative(),
    automaticCostEligibleCount: z.number().int().nonnegative(),
    mechanismOnlyCount: z.number().int().nonnegative(),
    modelCalls: z.number().int().nonnegative(),
    aggregateModelTokens: z.number().int().nonnegative(),
    ready: z.boolean(),
  }).strict(),
}).strict();

const COMMON_CATALOG_RUNTIME = [
  "src/benchmarks/skill-ir/validated-artifact-assembly.ts",
  "src/benchmarks/skill-ir/validated-artifact-catalog.ts",
  "src/benchmarks/skill-ir/validated-artifact-runtime.ts",
  "src/benchmarks/skill-ir/source-fixture.ts",
  "src/benchmarks/skill-ir/prospective-compiler-cost.ts",
  "src/benchmarks/skill-ir/prospective-compiler-cost-run.ts",
  "src/skill-ir/schema.ts",
  "src/skill-ir/source-audit.ts",
  "src/skill-ir/validate.ts",
  "package.json",
  "bun.lock",
] as const;

const ZERO_USAGE = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function evidenceRef(rootDir: string, relativePath: string) {
  const bytes = await readFile(path.resolve(rootDir, ...relativePath.split("/")));
  return ProspectiveCompilerCostEvidenceRefSchema.parse({ relativePath, sha256: sha256(bytes) });
}

async function buildIdentity(
  rootDir: string,
  input: Omit<ProspectiveCompilerCostIdentity, "schemaVersion" | "environment" | "evidence"> & {
    evidencePaths: {
      sourceClosure: string[];
      taskContract: string;
      publicContract: string;
      resourceContract: string;
      baseIr: string;
      sourceAudit: string;
      adapter: string;
      compilerImplementation: string;
    };
  },
): Promise<ProspectiveCompilerCostIdentity> {
  return {
    schemaVersion: "skill-ir-prospective-compiler-cost/v1",
    experimentId: input.experimentId,
    skillId: input.skillId,
    constructionOrigin: input.constructionOrigin,
    unautomatedConstructionSteps: input.unautomatedConstructionSteps,
    evidence: {
      sourceClosure: await Promise.all(input.evidencePaths.sourceClosure.map((item) => evidenceRef(rootDir, item))),
      taskContract: await evidenceRef(rootDir, input.evidencePaths.taskContract),
      publicContract: await evidenceRef(rootDir, input.evidencePaths.publicContract),
      resourceContract: await evidenceRef(rootDir, input.evidencePaths.resourceContract),
      baseIr: await evidenceRef(rootDir, input.evidencePaths.baseIr),
      sourceAudit: await evidenceRef(rootDir, input.evidencePaths.sourceAudit),
      adapter: await evidenceRef(rootDir, input.evidencePaths.adapter),
      compilerImplementation: await evidenceRef(rootDir, input.evidencePaths.compilerImplementation),
      catalogRuntime: await Promise.all(COMMON_CATALOG_RUNTIME.map((item) => evidenceRef(rootDir, item))),
    },
    environment: buildCompilerCostEnvironmentIdentity({
      runtime: "bun",
      runtimeVersion: Bun.version,
      platform: process.platform,
      architecture: process.arch,
    }),
  };
}

async function frozenParity(
  rootDir: string,
  cost: z.infer<typeof ProspectiveCompilerCostReportSchema>,
  frozenPackages: Array<{ id: string; directory: string }>,
) {
  return Promise.all(frozenPackages.map(async (frozenPackage) => {
    const manifestPath = `${frozenPackage.directory}/package-manifest.json`;
    const frozenManifest = await evidenceRef(rootDir, manifestPath);
    const observed = cost.packages.find((item) => item.id === frozenPackage.id);
    if (!observed) throw new Error(`Prospective compiler cost package missing ${frozenPackage.id}`);
    return FrozenPackageParitySchema.parse({
      id: frozenPackage.id,
      frozenManifest,
      observedManifestSha256: observed.manifestSha256,
      byteParity: observed.manifestSha256 === frozenManifest.sha256,
    });
  }));
}

async function buildApiTesterCase(rootDir: string) {
  const identity = await buildIdentity(rootDir, {
    experimentId: "api-tester-prospective-cost-canary",
    skillId: "api-tester",
    constructionOrigin: "manual-existing",
    unautomatedConstructionSteps: [
      "base IR/source audit was manually reviewed",
      "artifact adapter was manually authored",
      "compiler implementation was manually authored",
      "development lock was manually authored",
    ],
    evidencePaths: {
      sourceClosure: [
        "benchmarks/skill-ir/pilots/api-tester/source/SKILL.md",
        "benchmarks/skill-ir/pilots/api-tester/source/LICENSE.upstream",
      ],
      taskContract: "benchmarks/skill-ir/pilots/api-tester/development/tasks.json",
      publicContract: "benchmarks/skill-ir/pilots/api-tester/public-interface.json",
      resourceContract: "benchmarks/skill-ir/pilots/api-tester/resource-contract.json",
      baseIr: "benchmarks/skill-ir/pilots/api-tester/base-ir.json",
      sourceAudit: "benchmarks/skill-ir/pilots/api-tester/base-ir-source-audit.json",
      adapter: "benchmarks/skill-ir/pilots/api-tester/artifact-adapter.json",
      compilerImplementation: "src/benchmarks/skill-ir/api-tester-artifact-compiler.ts",
    },
  });
  const cost = await captureProspectiveCompilerCost({ rootDir, identity }, async (context) => {
    const compiled = await context.measureStage("compiler-package", async () => ({
      value: await compileApiTesterValidatedArtifactVariants(rootDir, context.outRoot),
      modelCalls: 0,
      usage: ZERO_USAGE,
    }));
    return {
      packages: compiled.map((item) => ({ id: item.variantId, directory: item.packageDir })),
    };
  });
  return {
    cost,
    frozenPackageParity: await frozenParity(rootDir, cost, [
      {
        id: "openapi-json",
        directory: "benchmarks/skill-ir/pilots/api-tester/packages/validated-skill-artifact-v1/openapi-json",
      },
      {
        id: "openapi-yaml",
        directory: "benchmarks/skill-ir/pilots/api-tester/packages/validated-skill-artifact-v1/openapi-yaml",
      },
    ]),
  };
}

async function buildEnvManagerCase(rootDir: string) {
  const identity = await buildIdentity(rootDir, {
    experimentId: "env-manager-v3-prospective-cost-canary",
    skillId: "env-manager-v3",
    constructionOrigin: "manual-existing",
    unautomatedConstructionSteps: [
      "base IR/source audit was manually reviewed",
      "artifact adapter was manually authored",
      "compiler implementation was manually authored",
      "development lock was manually authored",
    ],
    evidencePaths: {
      sourceClosure: [
        "benchmarks/skill-ir/pilots/env-manager/source/SKILL.md",
        "benchmarks/skill-ir/pilots/env-manager/source/LICENSE.upstream",
      ],
      taskContract: "benchmarks/skill-ir/pilots/env-manager/successor-v3/development/tasks.json",
      publicContract: "benchmarks/skill-ir/pilots/env-manager/successor-v3/public-interface.json",
      resourceContract: "benchmarks/skill-ir/pilots/env-manager/successor-v3/resource-contract.json",
      baseIr: "benchmarks/skill-ir/pilots/env-manager/successor-v3/base-ir.json",
      sourceAudit: "benchmarks/skill-ir/pilots/env-manager/successor-v3/base-ir-source-audit.json",
      adapter: "benchmarks/skill-ir/pilots/env-manager/successor-v3/artifact-adapter.json",
      compilerImplementation: "src/benchmarks/skill-ir/env-manager-v3-artifact-compiler.ts",
    },
  });
  const cost = await captureProspectiveCompilerCost({ rootDir, identity }, async (context) => {
    const variants: EnvManagerV3ArtifactVariantId[] = ["node", "vite"];
    const compiled = await context.measureStage("compiler-package", async () => {
      const packages = [];
      for (const variantId of variants) {
        const packageDir = path.join(context.outRoot, variantId);
        await compileEnvManagerV3ValidatedArtifact(
          await loadEnvManagerV3ArtifactCompilerInput(rootDir, variantId),
          packageDir,
        );
        packages.push({ id: variantId, directory: packageDir });
      }
      return { value: packages, modelCalls: 0, usage: ZERO_USAGE };
    });
    return { packages: compiled };
  });
  return {
    cost,
    frozenPackageParity: await frozenParity(rootDir, cost, [
      {
        id: "node",
        directory: "benchmarks/skill-ir/pilots/env-manager/successor-v3/packages/validated-skill-artifact-v1/node",
      },
      {
        id: "vite",
        directory: "benchmarks/skill-ir/pilots/env-manager/successor-v3/packages/validated-skill-artifact-v1/vite",
      },
    ]),
  };
}

export async function buildProspectiveCompilerCostCanaryReport(rootDir: string) {
  const root = path.resolve(rootDir);
  const cases = [await buildApiTesterCase(root), await buildEnvManagerCase(root)];
  const packageCount = cases.reduce((sum, item) => sum + item.cost.packages.length, 0);
  const byteParityCount = cases.reduce(
    (sum, item) => sum + item.frozenPackageParity.filter((entry) => entry.byteParity).length,
    0,
  );
  const summary = {
    caseCount: 2 as const,
    packageCount,
    byteParityCount,
    automaticCostEligibleCount: cases.filter((item) => item.cost.eligibility.status === "eligible").length,
    mechanismOnlyCount: cases.filter((item) => item.cost.eligibility.status === "mechanism-only").length,
    modelCalls: cases.reduce((sum, item) => sum + item.cost.summary.modelCalls, 0),
    aggregateModelTokens: cases.reduce((sum, item) => sum + item.cost.summary.aggregateModelTokens, 0),
    ready: byteParityCount === packageCount && packageCount === 4,
  };
  return ProspectiveCompilerCostCanaryReportSchema.parse({
    schemaVersion: "skill-ir-prospective-compiler-cost-canary/v1",
    cases,
    summary,
  });
}

export async function writeProspectiveCompilerCostCanaryReport(input: {
  rootDir: string;
  outPath?: string;
}) {
  const root = path.resolve(input.rootDir);
  const outPath = path.resolve(
    root,
    input.outPath ?? "results/skill-ir/prospective-compiler-cost-canary.json",
  );
  const report = await buildProspectiveCompilerCostCanaryReport(root);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const outArg = args.find((item) => item.startsWith("--out="));
  const unknown = args.filter((item) => !item.startsWith("--out="));
  if (unknown.length > 0) throw new Error(`Unknown argument: ${unknown[0]}`);
  const report = await writeProspectiveCompilerCostCanaryReport({
    rootDir: process.cwd(),
    ...(outArg ? { outPath: outArg.slice("--out=".length) } : {}),
  });
  console.log(JSON.stringify(report.summary, null, 2));
}
