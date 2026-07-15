import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { SkillIRSchema, type SkillIR } from "../../skill-ir/schema";
import { renderSkillMarkdown, type SkillIRBenchmarkTask } from "./real-agent";
import {
  ArtifactPackageManifestSchema,
  ArtifactPackageProvenanceSchema,
  type ArtifactPackageManifest,
  type ArtifactPackageProvenance,
  type ArtifactRecord,
} from "./artifact-package";
import { sha256Bytes } from "./source-fixture";

const GENERATED_FILES = [".env.example", ".env.schema.json", "env-report.json"] as const;
const REPORT_FIELDS = [
  "definedAndUsed",
  "definedUnconfirmedUnused",
  "usedUndefined",
  "hardcodedSecrets",
  "exposureRisks",
] as const;
const RULE_FIELDS = [
  "type",
  "required",
  "minimum",
  "maximum",
  "format",
  "minLength",
  "sensitive",
] as const;

export type EnvManagerTaskContract = {
  schemaVersion: "env-manager-task-contract/v1";
  generatedFiles: [...typeof GENERATED_FILES];
  reportFields: [...typeof REPORT_FIELDS];
  schemaRoot: "variables";
  allowedRuleFields: string[];
  syntheticSecretPrefix: "TEST_ONLY_";
  preserveExistingFiles: true;
};

export type ArtifactCompilerScope = ArtifactPackageProvenance["scope"];

export type CompileEnvManagerArtifactPackageOptions = {
  rootDir: string;
  baseIrPath: string;
  repairEvidencePath: string;
  taskSetPath: string;
  sourcePath: string;
  predecessorPaths: string[];
  outDir: string;
  scope: ArtifactCompilerScope;
};

type TaskSet = {
  skillId: string;
  tasks: SkillIRBenchmarkTask[];
};

type RepairEvidence = {
  schemaVersion: string;
  skillId: string;
  repairs: Array<{ kind: string }>;
};

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function digestText(value: string): string {
  return sha256Bytes(Buffer.from(value, "utf8"));
}

async function digestFile(path: string): Promise<string> {
  return sha256Bytes(await readFile(path));
}

function includesToken(prompt: string, token: string): boolean {
  return prompt.includes(token);
}

function parsePromptContract(task: Pick<SkillIRBenchmarkTask, "id" | "prompt">): EnvManagerTaskContract {
  const missing: string[] = [];
  for (const name of GENERATED_FILES) {
    if (!includesToken(task.prompt, name)) missing.push(name);
  }
  for (const name of REPORT_FIELDS) {
    if (!includesToken(task.prompt, name)) missing.push(name);
  }
  for (const name of RULE_FIELDS) {
    if (!includesToken(task.prompt, name)) missing.push(name);
  }
  if (!includesToken(task.prompt, "variables")) missing.push("variables");
  if (!includesToken(task.prompt, "TEST_ONLY_")) missing.push("TEST_ONLY_");
  if (!/(do not modify|preserve all existing|preserve all input|keep all input|keep all existing)/i.test(task.prompt)) {
    missing.push("preserve-existing-files");
  }
  if (missing.length > 0) {
    throw new Error(`Inconsistent env-manager task contract for ${task.id}; missing ${missing.join(", ")}`);
  }
  return {
    schemaVersion: "env-manager-task-contract/v1",
    generatedFiles: [...GENERATED_FILES],
    reportFields: [...REPORT_FIELDS],
    schemaRoot: "variables",
    allowedRuleFields: [...RULE_FIELDS],
    syntheticSecretPrefix: "TEST_ONLY_",
    preserveExistingFiles: true,
  };
}

export function extractEnvManagerTaskContract(
  tasks: Array<Pick<SkillIRBenchmarkTask, "id" | "split" | "prompt">>,
): { contract: EnvManagerTaskContract; taskIds: string[]; promptDigest: string } {
  const development = tasks
    .filter((task) => task.split === "development")
    .map(({ id, split, prompt }) => ({ id, split, prompt }))
    .sort((left, right) => left.id.localeCompare(right.id));
  if (development.length === 0) {
    throw new Error("Env-manager artifact compilation requires development task prompts");
  }
  const contracts = development.map(parsePromptContract);
  const canonical = JSON.stringify(contracts[0]);
  if (contracts.some((contract) => JSON.stringify(contract) !== canonical)) {
    throw new Error("Inconsistent env-manager development task contracts");
  }
  return {
    contract: contracts[0]!,
    taskIds: development.map((task) => task.id),
    promptDigest: digestText(JSON.stringify(development)),
  };
}

function recordedInputPath(rootDir: string, path: string): string {
  const root = resolve(rootDir);
  const absolute = resolve(path);
  const candidate = relative(root, absolute).replaceAll("\\", "/");
  if (!isAbsolute(candidate) && candidate !== ".." && !candidate.startsWith("../")) {
    return candidate;
  }
  return `external-inputs/${basename(path)}`;
}

function standaloneCheckerSource(): string {
  return `import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const workdirArg = process.argv.find((arg) => arg.startsWith("--workdir="));
if (!workdirArg) throw new Error("--workdir is required");
const workdir = resolve(workdirArg.slice("--workdir=".length));
const contractPath = join(import.meta.dir, "../contracts/env-manager-output-contract.json");
const contract = JSON.parse(await readFile(contractPath, "utf8"));
const errors = [];
const add = (error) => errors.push(error);
const generatedText = [];

async function text(path) {
  try {
    const value = await readFile(join(workdir, path), "utf8");
    generatedText.push(value);
    return value;
  } catch {
    add({ code: "MISSING_FILE", relativePath: path });
    return undefined;
  }
}

async function json(path) {
  const value = await text(path);
  if (value === undefined) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    add({ code: "INVALID_JSON", relativePath: path });
    return undefined;
  }
}

await text(".env.example");
const schema = await json(".env.schema.json");
const report = await json("env-report.json");

if (report && (typeof report !== "object" || Array.isArray(report))) {
  add({ code: "TYPE_MISMATCH", relativePath: "env-report.json", jsonPointer: "/", expectedType: "object" });
} else if (report) {
  const actual = Object.keys(report).sort();
  const expected = [...contract.reportFields].sort();
  for (const field of expected) {
    if (!(field in report)) add({ code: "MISSING_FIELD", relativePath: "env-report.json", jsonPointer: "/" + field, missingField: field, expectedType: "array" });
    else if (!Array.isArray(report[field])) add({ code: "TYPE_MISMATCH", relativePath: "env-report.json", jsonPointer: "/" + field, expectedType: "array" });
    else if (report[field].some((item) => typeof item !== "string")) add({ code: "TYPE_MISMATCH", relativePath: "env-report.json", jsonPointer: "/" + field, expectedType: "string" });
  }
  for (const field of actual.filter((field) => !expected.includes(field))) {
    add({ code: "EXTRA_FIELD", relativePath: "env-report.json", jsonPointer: "/" + field });
  }
}

if (schema && (typeof schema !== "object" || Array.isArray(schema))) {
  add({ code: "TYPE_MISMATCH", relativePath: ".env.schema.json", jsonPointer: "/", expectedType: "object" });
} else if (schema) {
  if (!(contract.schemaRoot in schema)) add({ code: "MISSING_FIELD", relativePath: ".env.schema.json", jsonPointer: "/" + contract.schemaRoot, missingField: contract.schemaRoot, expectedType: "object" });
  else if (typeof schema[contract.schemaRoot] !== "object" || schema[contract.schemaRoot] === null || Array.isArray(schema[contract.schemaRoot])) add({ code: "TYPE_MISMATCH", relativePath: ".env.schema.json", jsonPointer: "/" + contract.schemaRoot, expectedType: "object" });
  else {
    for (const [name, rule] of Object.entries(schema[contract.schemaRoot])) {
      if (typeof rule !== "object" || rule === null || Array.isArray(rule)) {
        add({ code: "TYPE_MISMATCH", relativePath: ".env.schema.json", jsonPointer: "/" + contract.schemaRoot + "/" + name, expectedType: "object" });
        continue;
      }
      for (const field of Object.keys(rule).filter((field) => !contract.allowedRuleFields.includes(field))) {
        add({ code: "EXTRA_FIELD", relativePath: ".env.schema.json", jsonPointer: "/" + contract.schemaRoot + "/" + name + "/" + field });
      }
    }
  }
}

if (generatedText.some((value) => value.includes("__SKVM_REQUIRED__"))) {
  add({ code: "UNFILLED_TEMPLATE" });
}
if (generatedText.some((value) => value.includes(contract.syntheticSecretPrefix))) {
  add({ code: "SECRET_PATTERN_PRESENT" });
}

const reportValue = {
  schemaVersion: "runtime-validation-report/v1",
  status: errors.length === 0 ? "pass" : "fail",
  repairEligible: errors.length > 0,
  errors,
};
console.log(JSON.stringify(reportValue));
`;
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
  return {
    path,
    kind,
    sha256: digestText(text),
    ...(targetPath ? { targetPath } : {}),
  };
}

function generatedSkillView(baseIR: SkillIR): string {
  const rendered = renderSkillMarkdown(baseIR, "ir-static") ?? "";
  return `${rendered}\n\n## Executable Artifacts\n\n- Start from the materialized JSON templates in the workdir.\n- Replace every \`__SKVM_REQUIRED__\` sentinel before completion.\n- The Runner validates generated artifacts and may request at most one repair.\n`;
}

export async function compileEnvManagerArtifactPackage(
  opts: CompileEnvManagerArtifactPackageOptions,
): Promise<{ manifest: ArtifactPackageManifest; provenance: ArtifactPackageProvenance }> {
  const [baseBytes, sourceBytes, evidenceBytes, taskBytes] = await Promise.all([
    readFile(opts.baseIrPath),
    readFile(opts.sourcePath),
    readFile(opts.repairEvidencePath),
    readFile(opts.taskSetPath),
  ]);
  const baseIR = SkillIRSchema.parse(JSON.parse(baseBytes.toString("utf8")));
  if (baseIR.id !== "env-manager" || baseIR.profile.length !== 0) {
    throw new Error("executable-artifact/v1 requires the profile-empty env-manager base IR");
  }
  if (baseIR.source.kind !== "file" || baseIR.source.sha256 !== sha256Bytes(sourceBytes)) {
    throw new Error("Env-manager source does not match the frozen base IR source digest");
  }
  const evidence = JSON.parse(evidenceBytes.toString("utf8")) as RepairEvidence;
  if (evidence.schemaVersion !== "skill-ir-repair-evidence/v1" || evidence.skillId !== baseIR.id) {
    throw new Error("Invalid env-manager RepairEvidence identity");
  }
  const repairKinds = new Set(evidence.repairs.map((repair) => repair.kind));
  for (const required of ["json-schema-contract", "source-qualified-finding"]) {
    if (!repairKinds.has(required)) {
      throw new Error(`Env-manager executable package requires ${required} RepairEvidence`);
    }
  }
  const taskSet = JSON.parse(taskBytes.toString("utf8")) as TaskSet;
  if (taskSet.skillId !== baseIR.id) {
    throw new Error(`Task set skillId ${taskSet.skillId} does not match ${baseIR.id}`);
  }
  const promptProjection = taskSet.tasks.map(({ id, split, prompt }) => ({ id, split, prompt }));
  const { contract, taskIds, promptDigest } = extractEnvManagerTaskContract(promptProjection);

  await mkdir(opts.outDir, { recursive: true });
  const artifacts: ArtifactRecord[] = [];
  artifacts.push(await writeArtifact(opts.outDir, "skill-ir.json", "skill-ir", stableJson(baseIR)));
  artifacts.push(await writeArtifact(opts.outDir, "skill.md", "skill-view", generatedSkillView(baseIR)));
  const contractText = stableJson(contract);
  artifacts.push(await writeArtifact(
    opts.outDir,
    "artifacts/contracts/env-manager-output-contract.json",
    "contract",
    contractText,
  ));
  artifacts.push(await writeArtifact(
    opts.outDir,
    "artifacts/templates/env-report.template.json",
    "template",
    stableJson(Object.fromEntries(contract.reportFields.map((field) => [field, ["__SKVM_REQUIRED__"]]))),
    "env-report.json",
  ));
  artifacts.push(await writeArtifact(
    opts.outDir,
    "artifacts/templates/env-schema.template.json",
    "template",
    stableJson({ variables: { __SKVM_REQUIRED__: { type: "string" } } }),
    ".env.schema.json",
  ));
  artifacts.push(await writeArtifact(
    opts.outDir,
    "artifacts/checks/validate-output.ts",
    "checker",
    standaloneCheckerSource(),
  ));
  const policy = {
    schemaVersion: "skill-ir-artifact-validation-policy/v1",
    checkerTimeoutMs: 5000,
    maxSemanticRepairCalls: 1,
    repairInputFields: ["code", "relativePath", "jsonPointer", "missingField", "expectedType"],
    networkAllowed: false,
    packageInstallationAllowed: false,
    templateSentinel: "__SKVM_REQUIRED__",
  };
  artifacts.push(await writeArtifact(
    opts.outDir,
    "validation-policy.json",
    "validation-policy",
    stableJson(policy),
  ));
  artifacts.sort((left, right) => left.path.localeCompare(right.path));

  const predecessors = await Promise.all(opts.predecessorPaths.map(async (path) => ({
    path: recordedInputPath(opts.rootDir, path),
    sha256: await digestFile(path),
  })));
  const compilerConfig = {
    catalog: "executable-artifact/v1",
    requiredRepairKinds: ["json-schema-contract", "source-qualified-finding"],
    taskIds,
    scope: opts.scope,
  };
  const provenance = ArtifactPackageProvenanceSchema.parse({
    schemaVersion: "skill-ir-artifact-package-provenance/v1",
    catalog: "executable-artifact/v1",
    skillId: baseIR.id,
    constructionSplit: "development",
    source: { path: recordedInputPath(opts.rootDir, opts.sourcePath), sha256: sha256Bytes(sourceBytes) },
    baseIr: { path: recordedInputPath(opts.rootDir, opts.baseIrPath), sha256: sha256Bytes(baseBytes) },
    repairEvidence: {
      path: recordedInputPath(opts.rootDir, opts.repairEvidencePath),
      sha256: sha256Bytes(evidenceBytes),
    },
    taskContract: { taskIds, promptDigest, sha256: digestText(contractText) },
    compiler: {
      id: "env-manager-artifact-compiler",
      version: "v1",
      configSha256: digestText(JSON.stringify(compilerConfig)),
    },
    predecessors,
    scope: opts.scope,
    artifacts,
  });
  const provenanceText = stableJson(provenance);
  await writeArtifact(opts.outDir, "package-provenance.json", "validation-policy", provenanceText);

  const contractArtifact = artifacts.find((artifact) => artifact.kind === "contract")!;
  const checkerArtifact = artifacts.find((artifact) => artifact.kind === "checker")!;
  const manifest = ArtifactPackageManifestSchema.parse({
    schemaVersion: "skill-ir-artifact-package-manifest/v1",
    catalog: "executable-artifact/v1",
    skillId: baseIR.id,
    provenance: { path: "package-provenance.json", sha256: digestText(provenanceText) },
    contract: { path: contractArtifact.path, sha256: contractArtifact.sha256 },
    checker: { path: checkerArtifact.path, timeoutMs: policy.checkerTimeoutMs },
    generatedOutputs: contract.generatedFiles,
    artifacts,
  });
  await writeFile(resolve(opts.outDir, "package-manifest.json"), stableJson(manifest), "utf8");
  return { manifest, provenance };
}
