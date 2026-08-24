import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { InitialWorkdirManifest } from "../../core/workdir-manifest";
import type { DomainAutomaticConstructionResult } from "./automatic-domain-construction";
import type { StructuralExecutionPlan } from "./automatic-structural-execution";
import { StructuralExecutionPlanSchema } from "./automatic-structural-execution";
import {
  type ValidatedArtifactRecord,
  ValidatedArtifactExecutionPlanSchema,
  ValidatedArtifactManifestSchema,
  ValidatedArtifactProvenanceSchema,
  validateValidatedArtifactPackage,
} from "./validated-artifact-catalog";
import { sha256Bytes } from "./source-fixture";

type StructuralValidationPackageInput = {
  packageDir: string;
  candidate: DomainAutomaticConstructionResult;
  plan: StructuralExecutionPlan;
  initialManifest: InitialWorkdirManifest;
  sourceBytes: Uint8Array;
  taskId: string;
  taskPrompt: string;
};

async function writeBytes(path: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

async function writeJson(path: string, value: unknown): Promise<Buffer> {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  await writeBytes(path, bytes);
  return bytes;
}

async function artifact(
  packageDir: string,
  id: string,
  path: string,
  kind: ValidatedArtifactRecord["kind"],
): Promise<ValidatedArtifactRecord> {
  return { id, path, kind, sha256: sha256Bytes(await readFile(join(packageDir, path))) };
}

function protectedInputs(
  plan: StructuralExecutionPlan,
  initialManifest: InitialWorkdirManifest,
): string[] {
  const initialFiles = initialManifest.entries.filter((entry) => entry.type === "file").map((entry) => entry.path);
  return [...new Set(plan.targets
    .filter((target) => target.role === "input" && target.access === "read-only")
    .flatMap((target) => [
      ...target.paths,
      ...target.prefixes.flatMap((prefix) => initialFiles.filter((entry) => entry.startsWith(`${prefix}/`))),
    ]))].sort((left, right) => left.localeCompare(right, "en"));
}

function generatedOutputs(plan: StructuralExecutionPlan): string[] {
  const outputs = plan.targets.filter((target) => target.role === "output");
  if (outputs.some((target) => target.prefixes.length > 0)) {
    throw new Error("runtime package requires concrete output bindings for directory outputs");
  }
  return [...new Set(outputs.flatMap((target) => target.paths))]
    .sort((left, right) => left.localeCompare(right, "en"));
}

async function bundleChecker(packageDir: string): Promise<void> {
  const result = await Bun.build({
    entrypoints: [resolve(import.meta.dir, "automatic-structural-execution-checker.ts")],
    outdir: packageDir,
    naming: "structural-checker.js",
    target: "bun",
    format: "esm",
    minify: false,
    sourcemap: "none",
  });
  if (!result.success) {
    throw new Error(`structural checker bundle failed: ${result.logs.map((entry) => entry.message).join("; ")}`);
  }
}

export async function buildStructuralValidationPackage(input: StructuralValidationPackageInput) {
  const packageDir = resolve(input.packageDir);
  const plan = StructuralExecutionPlanSchema.parse(input.plan);
  const protectedPaths = protectedInputs(plan, input.initialManifest);
  const outputPaths = generatedOutputs(plan);
  if (protectedPaths.length === 0) throw new Error("structural runtime package requires a protected input");
  if (outputPaths.length === 0) throw new Error("structural runtime package requires a generated output");

  await rm(packageDir, { recursive: true, force: true });
  await mkdir(packageDir, { recursive: true });
  await Promise.all([
    writeBytes(join(packageDir, "inputs/SKILL.md"), input.sourceBytes),
    writeJson(join(packageDir, "inputs/base-ir.json"), input.candidate.baseIr),
    writeJson(join(packageDir, "inputs/construction-audit.json"), input.candidate.audit),
    writeJson(join(packageDir, "inputs/domain-contract.json"), input.candidate.contract),
    writeJson(join(packageDir, "structural-plan.json"), plan),
    writeJson(join(packageDir, "initial-workdir-manifest.json"), input.initialManifest),
    bundleChecker(packageDir),
  ]);

  const artifacts = await Promise.all([
    artifact(packageDir, "source-skill", "inputs/SKILL.md", "skill-view"),
    artifact(packageDir, "base-ir", "inputs/base-ir.json", "skill-ir"),
    artifact(packageDir, "construction-audit", "inputs/construction-audit.json", "validation-notes"),
    artifact(packageDir, "domain-contract", "inputs/domain-contract.json", "schema"),
    artifact(packageDir, "structural-plan", "structural-plan.json", "validation-policy"),
    artifact(packageDir, "initial-manifest", "initial-workdir-manifest.json", "validation-notes"),
    artifact(packageDir, "structural-checker", "structural-checker.js", "check"),
  ]);
  const artifactById = new Map(artifacts.map((entry) => [entry.id, entry]));
  const executionPlan = ValidatedArtifactExecutionPlanSchema.parse({
    schemaVersion: "skill-artifact-execution-plan/v1",
    entrypoint: "validate-structure",
    nodes: [{
      id: "validate-structure",
      kind: "validate",
      dependsOn: [],
      command: {
        interpreter: { env: "SKVM_BUN_BINARY", fallback: "bun" },
        artifactId: "structural-checker",
        args: [
          "--plan", "{artifact:structural-plan}",
          "--initial-manifest", "{artifact:initial-manifest}",
          "--workdir", "{workdir}",
        ],
        envAllowlist: ["SKVM_BUN_BINARY"],
      },
      timeoutMs: 30_000,
    }],
  });
  const executionBytes = await writeJson(join(packageDir, "execution-plan.json"), executionPlan);
  const provenance = ValidatedArtifactProvenanceSchema.parse({
    schemaVersion: "validated-skill-artifact-provenance/v1",
    catalog: "validated-skill-artifact/v1",
    skillId: plan.skillId,
    constructionSplit: "development",
    compiler: {
      id: "structural-predicate",
      version: "v1",
      configSha256: artifactById.get("structural-plan")!.sha256,
    },
    inputs: {
      sourceClosure: [{ path: "inputs/SKILL.md", sha256: artifactById.get("source-skill")!.sha256 }],
      baseIr: { path: "inputs/base-ir.json", sha256: artifactById.get("base-ir")!.sha256 },
      sourceAudit: { path: "inputs/construction-audit.json", sha256: artifactById.get("construction-audit")!.sha256 },
      resourceContract: { path: "inputs/domain-contract.json", sha256: artifactById.get("domain-contract")!.sha256 },
      taskContract: {
        taskIds: [input.taskId],
        promptDigest: sha256Bytes(Buffer.from(input.taskPrompt, "utf8")),
      },
    },
    forbiddenEvidenceClasses: [
      "evaluator-payload",
      "held-out",
      "runtime-output",
      "profile-feedback",
      "secret-value",
    ],
    artifacts,
  });
  const provenanceBytes = await writeJson(join(packageDir, "provenance.json"), provenance);
  const manifest = ValidatedArtifactManifestSchema.parse({
    schemaVersion: "validated-skill-artifact-manifest/v1",
    catalog: "validated-skill-artifact/v1",
    skillId: plan.skillId,
    provenance: { path: "provenance.json", sha256: sha256Bytes(provenanceBytes) },
    executionPlan: { path: "execution-plan.json", sha256: sha256Bytes(executionBytes) },
    protectedInputs: protectedPaths,
    generatedOutputs: outputPaths,
    artifacts,
  });
  await writeJson(join(packageDir, "package-manifest.json"), manifest);
  return validateValidatedArtifactPackage(packageDir);
}
