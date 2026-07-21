import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { SkillIRSchema, type SkillIR } from "../../skill-ir/schema";
import { renderSkillMarkdown, type SkillIRBenchmarkTask } from "./real-agent";
import { extractEnvManagerTaskContract } from "./artifact-package-compiler";
import {
  PublicContractArtifactPackageManifestSchema,
  PublicContractArtifactPackageProvenanceSchema,
  validateArtifactPackage,
  type PublicContractArtifactPackageManifest,
  type PublicContractArtifactPackageProvenance,
} from "./artifact-package";
import { SemanticScanPolicySchema } from "./semantic-contract";
import { sha256Bytes } from "./source-fixture";

export type CompileEnvManagerPublicContractArtifactPackageOptions = {
  rootDir: string;
  baseIrPath: string;
  taskSetPath: string;
  sourcePath: string;
  outDir: string;
};

type TaskSet = { skillId: string; tasks: SkillIRBenchmarkTask[] };
type ArtifactRecord = PublicContractArtifactPackageManifest["artifacts"][number];

const RUNTIME_CONTRACT_PATH = ".skvm-artifact/public-runtime-contract.json";

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function digestText(value: string): string {
  return sha256Bytes(Buffer.from(value, "utf8"));
}

function recordedInputPath(rootDir: string, path: string): string {
  const candidate = relative(resolve(rootDir), resolve(path)).replaceAll("\\", "/");
  if (!isAbsolute(candidate) && candidate !== ".." && !candidate.startsWith("../")) return candidate;
  return `external-inputs/${basename(path)}`;
}

export function publicRulesFromSource(source: string) {
  const range = source.match(/\b(\d+)\s*[-–]\s*(\d+)\b/);
  const portRange = range?.[1] && range[2]
    ? { minimum: Number(range[1]), maximum: Number(range[2]) }
    : undefined;
  const portVariableSuffixes = /\b[A-Z][A-Z0-9_]*_PORT\b/.test(source) ? ["_PORT"] : [];
  const sensitiveNameTokens = ["KEY", "TOKEN", "PASSWORD", "SECRET"]
    .filter((token) => new RegExp(`(?:\\b|_)${token}(?:\\b|_)`, "i").test(source));
  const publicPrefixes = [
    "NEXT_PUBLIC_",
    "VITE_",
    "REACT_APP_",
    "NUXT_PUBLIC_",
    "VUE_APP_",
  ].filter((prefix) => source.includes(prefix));
  if (portVariableSuffixes.length > 0 && !portRange) {
    throw new Error("Public source names a port variable but does not declare a bounded port range");
  }
  if (sensitiveNameTokens.length === 0) {
    throw new Error("Public source does not declare sensitive-name rules");
  }
  return {
    publicRules: {
      portVariableSuffixes,
      ...(portRange ? { portRange } : {}),
      sensitiveNameTokens,
    },
    publicPrefixes,
  };
}

export function publicRuntimeContractSchemaArtifact(): unknown {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "skill-ir-public-runtime-contract-schema/v3",
    title: "Skill IR public runtime contract",
    type: "object",
    additionalProperties: false,
    required: [
      "schemaVersion",
      "codeCatalog",
      "skillId",
      "taskContractDigest",
      "generatedOutputs",
      "publicPrefixes",
      "variables",
      "sourceQualifiedFindings",
      "limitations",
    ],
    properties: {
      schemaVersion: { const: "skill-ir-public-runtime-contract/v3" },
      codeCatalog: { const: "public-contract-error-codes/v2" },
      skillId: { const: "env-manager" },
      taskContractDigest: { type: "string", pattern: "^[0-9a-f]{64}$" },
      generatedOutputs: { type: "array" },
      publicPrefixes: { type: "array" },
      variables: { type: "array" },
      sourceQualifiedFindings: { type: "array" },
      limitations: { type: "array" },
    },
  };
}

export function generatedSkillView(baseIr: SkillIR): string {
  const rendered = renderSkillMarkdown(baseIr, "ir-static") ?? "";
  return `${rendered}\n\n## Executable Public Contract Artifact\n\n`
    + `- Read the protected runtime contract at \`${RUNTIME_CONTRACT_PATH}\` before producing or repairing outputs.\n`
    + "- Use only confirmed rules for required schema constraints; advisory evidence is not a hard requirement.\n"
    + "- The Runner validates public evidence and may request at most one contract-bound repair.\n";
}

async function bundled(entrypoint: string, label: string): Promise<string> {
  const result = await Bun.build({
    entrypoints: [resolve(import.meta.dir, entrypoint)],
    target: "bun",
    format: "esm",
    minify: false,
    sourcemap: "none",
  });
  if (!result.success || result.outputs.length !== 1) {
    throw new Error(`Failed to bundle ${label}: ${result.logs.map((log) => log.message).join("; ")}`);
  }
  return result.outputs[0]!.text();
}

async function writeArtifact(
  outDir: string,
  path: string,
  kind: ArtifactRecord["kind"],
  text: string,
  targetPath?: string,
): Promise<ArtifactRecord> {
  const destination = resolve(outDir, path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, text, "utf8");
  return { path, kind, sha256: digestText(text), ...(targetPath ? { targetPath } : {}) };
}

export async function compileEnvManagerPublicContractArtifactPackage(
  opts: CompileEnvManagerPublicContractArtifactPackageOptions,
): Promise<{
  manifest: PublicContractArtifactPackageManifest;
  provenance: PublicContractArtifactPackageProvenance;
}> {
  const [baseBytes, taskBytes, sourceBytes, evidenceProgram, checker] = await Promise.all([
    readFile(opts.baseIrPath),
    readFile(opts.taskSetPath),
    readFile(opts.sourcePath),
    bundled("public-contract-evidence-cli.ts", "public contract evidence program"),
    bundled("public-contract-checker-cli.ts", "public contract checker"),
  ]);
  const baseIr = SkillIRSchema.parse(JSON.parse(baseBytes.toString("utf8")));
  if (baseIr.id !== "env-manager") throw new Error(`Unsupported public-contract skill: ${baseIr.id}`);
  if (baseIr.source.kind !== "file" || sha256Bytes(sourceBytes) !== baseIr.source.sha256) {
    throw new Error("Public-contract source does not match the digest-bound base IR source");
  }
  const taskSet = JSON.parse(taskBytes.toString("utf8")) as TaskSet;
  if (taskSet.skillId !== baseIr.id) throw new Error("Task set skill identity does not match base IR");
  const promptProjection = taskSet.tasks.map(({ id, split, prompt }) => ({ id, split, prompt }));
  const { contract: outputContract, taskIds, promptDigest } =
    extractEnvManagerTaskContract(promptProjection);
  const sourcePolicy = publicRulesFromSource(sourceBytes.toString("utf8"));
  const scanPolicy = SemanticScanPolicySchema.parse({
    allowedExtensions: [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"],
    excludedDirectories: [".git", "node_modules", ".skvm-artifact"],
    maxFiles: 500,
    maxBytes: 5_000_000,
  });
  const outputContractText = stableJson(outputContract);
  const validationPolicy = {
    schemaVersion: "skill-ir-public-contract-artifact-validation-policy/v3",
    checkerTimeoutMs: 5000,
    evidenceProgramTimeoutMs: 5000,
    maxSemanticRepairCalls: 1,
    repairInputFields: [
      "code",
      "relativePath",
      "jsonPointer",
      "missingField",
      "expectedType",
      "contractRef",
      "operation",
    ],
    runtimeContract: { path: RUNTIME_CONTRACT_PATH, protected: true },
    publicEvidence: {
      taskContractDigest: digestText(outputContractText),
      generatedOutputs: outputContract.generatedFiles,
      publicPrefixes: sourcePolicy.publicPrefixes,
      publicRules: sourcePolicy.publicRules,
      policy: scanPolicy,
    },
    networkAllowed: false,
    packageInstallationAllowed: false,
    templateSentinel: "__SKVM_REQUIRED__",
  } as const;

  await mkdir(opts.outDir, { recursive: true });
  const artifacts: ArtifactRecord[] = [];
  artifacts.push(await writeArtifact(opts.outDir, "skill-ir.json", "skill-ir", stableJson(baseIr)));
  artifacts.push(await writeArtifact(opts.outDir, "skill.md", "skill-view", generatedSkillView(baseIr)));
  artifacts.push(await writeArtifact(
    opts.outDir,
    "artifacts/contracts/output-contract.json",
    "output-contract",
    outputContractText,
  ));
  artifacts.push(await writeArtifact(
    opts.outDir,
    "artifacts/contracts/public-policy.json",
    "public-policy",
    stableJson(sourcePolicy),
  ));
  artifacts.push(await writeArtifact(
    opts.outDir,
    "artifacts/schemas/public-runtime-contract.schema.json",
    "public-contract-schema",
    stableJson(publicRuntimeContractSchemaArtifact()),
  ));
  artifacts.push(await writeArtifact(
    opts.outDir,
    "artifacts/scripts/evidence-program.mjs",
    "evidence-program",
    evidenceProgram,
  ));
  artifacts.push(await writeArtifact(
    opts.outDir,
    "artifacts/checks/public-contract-checker.mjs",
    "checker",
    checker,
  ));
  artifacts.push(await writeArtifact(
    opts.outDir,
    "artifacts/templates/.env.example",
    "template",
    "# Fill from the protected public runtime contract without copying secret values.\n",
    ".env.example",
  ));
  artifacts.push(await writeArtifact(
    opts.outDir,
    "artifacts/templates/.env.schema.json",
    "template",
    stableJson({ variables: {} }),
    ".env.schema.json",
  ));
  artifacts.push(await writeArtifact(
    opts.outDir,
    "artifacts/templates/env-report.json",
    "template",
    stableJson(Object.fromEntries(outputContract.reportFields.map((field) => [field, []]))),
    "env-report.json",
  ));
  artifacts.push(await writeArtifact(
    opts.outDir,
    "validation-policy.json",
    "validation-policy",
    stableJson(validationPolicy),
  ));
  artifacts.sort((left, right) => left.path.localeCompare(right.path));

  const compilerConfig = {
    catalog: "executable-public-contract-artifact/v3",
    taskIds,
    sourcePolicy,
    scanPolicy,
    runtimeContractPath: RUNTIME_CONTRACT_PATH,
  };
  const provenance = PublicContractArtifactPackageProvenanceSchema.parse({
    schemaVersion: "skill-ir-public-contract-artifact-package-provenance/v1",
    catalog: "executable-public-contract-artifact/v3",
    skillId: baseIr.id,
    constructionSplit: "development",
    source: { path: recordedInputPath(opts.rootDir, opts.sourcePath), sha256: sha256Bytes(sourceBytes) },
    baseIr: { path: recordedInputPath(opts.rootDir, opts.baseIrPath), sha256: sha256Bytes(baseBytes) },
    taskContract: {
      taskIds,
      promptDigest,
      sha256: digestText(outputContractText),
    },
    compiler: {
      id: "env-manager-public-contract-artifact-compiler",
      version: "v3",
      configSha256: digestText(JSON.stringify(compilerConfig)),
    },
    artifacts,
  });
  const provenanceText = stableJson(provenance);
  await writeFile(resolve(opts.outDir, "package-provenance.json"), provenanceText, "utf8");

  const byKind = (kind: ArtifactRecord["kind"]) =>
    artifacts.find((artifact) => artifact.kind === kind)!;
  const manifest = PublicContractArtifactPackageManifestSchema.parse({
    schemaVersion: "skill-ir-public-contract-artifact-package-manifest/v1",
    catalog: "executable-public-contract-artifact/v3",
    skillId: baseIr.id,
    provenance: { path: "package-provenance.json", sha256: digestText(provenanceText) },
    outputContract: {
      path: byKind("output-contract").path,
      sha256: byKind("output-contract").sha256,
    },
    publicPolicy: {
      path: byKind("public-policy").path,
      sha256: byKind("public-policy").sha256,
    },
    publicRuntimeContractSchema: {
      path: byKind("public-contract-schema").path,
      sha256: byKind("public-contract-schema").sha256,
    },
    evidenceProgram: {
      path: byKind("evidence-program").path,
      timeoutMs: validationPolicy.evidenceProgramTimeoutMs,
    },
    checker: {
      path: byKind("checker").path,
      timeoutMs: validationPolicy.checkerTimeoutMs,
    },
    runtimeContract: validationPolicy.runtimeContract,
    generatedOutputs: outputContract.generatedFiles,
    artifacts,
  });
  await writeFile(resolve(opts.outDir, "package-manifest.json"), stableJson(manifest), "utf8");
  await validateArtifactPackage({
    packageDir: opts.outDir,
    expectedCatalog: "executable-public-contract-artifact/v3",
  });
  return { manifest, provenance };
}
