import { lstat, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { z } from "zod";
import { derivePublicContractClassification } from "./classification-evidence";
import {
  ExecutableRepairContractSchema,
  type ExecutableRepairContract,
} from "./executable-repair-contract";
import {
  PublicRuntimeContractSchema,
  type PublicRuntimeContract,
  type PublicRule,
} from "./public-contract";
import { sha256Bytes } from "./source-fixture";

const GeneratedPathSchema = z.enum(["env-report.json", ".env.schema.json", ".env.example"]);
const DeterministicOperationSchema = z.enum([
  "rewrite-canonical-report",
  "rewrite-redacted-example",
  "upsert-confirmed-schema-rules",
]);

const RepairOperationRecordSchema = z.object({
  operation: DeterministicOperationSchema,
  relativePath: GeneratedPathSchema,
  jsonPointer: z.string().regex(/^\/(?:[^~\/]|~[01])*(?:\/(?:[^~\/]|~[01])*)*$/).optional(),
  contractRef: z.enum([
    "derivations/public-classification/v3",
    "policies/env-manager-development-repair-policy/v1",
    "policies/redacted-dotenv/v1",
  ]),
}).strict();

export const DeterministicRepairReportSchema = z.object({
  schemaVersion: z.literal("deterministic-repair-report/v1"),
  catalog: z.literal("executable-contract-repair-artifact/v4"),
  status: z.enum(["changed", "no-change"]),
  operations: z.array(RepairOperationRecordSchema),
  protectedDigestBefore: z.string().regex(/^[0-9a-f]{64}$/),
  protectedDigestAfter: z.string().regex(/^[0-9a-f]{64}$/),
}).strict().superRefine((report, ctx) => {
  if (report.status === "changed" && report.operations.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "changed repair requires an operation" });
  }
  if (report.status === "no-change" && report.operations.length > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "no-change repair cannot include operations" });
  }
  if (report.protectedDigestBefore !== report.protectedDigestAfter) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "protected workdir content changed" });
  }
});

export type DeterministicRepairReport = z.infer<typeof DeterministicRepairReportSchema>;

type RepairOptions = {
  workDir: string;
  repairContract: ExecutableRepairContract;
};

type TreeEntry = { relativePath: string; sha256: string };

function portableRelative(root: string, path: string): string {
  return relative(root, path).replaceAll("\\", "/");
}

async function protectedTreeDigest(root: string, generated: Set<string>): Promise<string> {
  const entries: TreeEntry[] = [];

  async function visit(directory: string): Promise<void> {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const path = resolve(directory, child.name);
      const relativePath = portableRelative(root, path);
      const stat = await lstat(path);
      if (stat.isSymbolicLink()) {
        throw new Error(`deterministic repair rejects symbolic link: ${relativePath}`);
      }
      if (stat.isDirectory()) {
        await visit(path);
        continue;
      }
      if (!stat.isFile()) {
        throw new Error(`deterministic repair rejects unsupported entry: ${relativePath}`);
      }
      if (stat.nlink > 1) {
        throw new Error(`deterministic repair rejects hard link: ${relativePath}`);
      }
      if (generated.has(relativePath)) continue;
      entries.push({ relativePath, sha256: sha256Bytes(await readFile(path)) });
    }
  }

  await visit(root);
  entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const manifest = entries.map((entry) => `${entry.relativePath}\0${entry.sha256}\0`).join("");
  return sha256Bytes(Buffer.from(manifest, "utf8"));
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return undefined;
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function canonicalJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function confirmedRules(variable: PublicRuntimeContract["variables"][number]): Map<PublicRule["field"], PublicRule["value"]> {
  const rules = new Map<PublicRule["field"], PublicRule["value"]>();
  for (const rule of variable.rules) {
    if (rule.disposition === "confirmed") rules.set(rule.field, rule.value);
  }
  return rules;
}

const RULE_FIELD_ORDER = [
  "type",
  "required",
  "minimum",
  "maximum",
  "format",
  "minLength",
  "sensitive",
] as const;

function lowerSchemaRules(
  runtimeContract: PublicRuntimeContract,
  repairContract: ExecutableRepairContract,
): { variables: Record<string, Record<string, unknown>> } {
  const defaultStringEvidence = new Set(
    repairContract.schemaRulePolicy.defaultStringEvidenceKinds,
  );
  const variables: Record<string, Record<string, unknown>> = {};

  for (const variable of [...runtimeContract.variables].sort((left, right) => left.name.localeCompare(right.name))) {
    const lowered = new Map<string, unknown>();
    const confirmed = confirmedRules(variable);
    for (const [field, value] of confirmed) lowered.set(field, value);

    const evidenceKinds = [...variable.definitions, ...variable.references]
      .map((ref) => ref.evidenceKind);
    const hasStringEvidence = evidenceKinds.some((kind) => defaultStringEvidence.has(
      kind as (typeof repairContract.schemaRulePolicy.defaultStringEvidenceKinds)[number],
    ));
    if (!confirmed.has("type") && hasStringEvidence) lowered.set("type", "string");

    const type = lowered.get("type");
    if (
      hasStringEvidence
      && (type === undefined || type === "string")
      && repairContract.schemaRulePolicy.uriNameSuffixes.some((suffix) => variable.name.endsWith(suffix))
    ) {
      lowered.set("type", "string");
      lowered.set("format", "uri");
    }

    const hasServerReference = variable.references.some(
      (reference) => reference.evidenceKind === "environment-reference",
    );
    const hasClientReference = variable.references.some(
      (reference) => reference.evidenceKind === "client-environment-reference",
    );
    if (
      hasServerReference
      && !hasClientReference
      && repairContract.schemaRulePolicy.learnedRules.some(
        (rule) => rule.kind === "server-sensitive-suffix"
          && variable.name.endsWith(rule.nameSuffix),
      )
    ) {
      lowered.set("sensitive", true);
    }

    const sensitive = confirmed.get("sensitive") === true;
    if (sensitive) {
      for (const rule of repairContract.schemaRulePolicy.learnedRules) {
        if (
          rule.kind === "sensitive-minimum-length-suffix"
          && variable.name.endsWith(rule.nameSuffix)
        ) {
          lowered.set("type", "string");
          lowered.set("minLength", rule.minimum);
        }
      }
    }

    const ordered: Record<string, unknown> = {};
    for (const field of RULE_FIELD_ORDER) {
      if (lowered.has(field)) ordered[field] = lowered.get(field);
    }
    variables[variable.name] = ordered;
  }
  return { variables };
}

async function atomicWrite(path: string, text: string): Promise<void> {
  const current = await lstat(path).catch(() => undefined);
  if (current?.isSymbolicLink()) {
    throw new Error(`deterministic repair rejects symbolic link: ${path}`);
  }
  if (current && (!current.isFile() || current.nlink > 1)) {
    throw new Error(`deterministic repair rejects hard link or unsupported output: ${path}`);
  }
  const temporary = resolve(dirname(path), `.${path.split(/[\\/]/).at(-1)}.skvm-${crypto.randomUUID()}.tmp`);
  try {
    await writeFile(temporary, text, { encoding: "utf8", flag: "wx" });
    try {
      await rename(temporary, path);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST" && code !== "EPERM") throw error;
      await rm(path, { force: true });
      await rename(temporary, path);
    }
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function repairEnvManagerArtifactsDeterministically(
  options: RepairOptions,
): Promise<DeterministicRepairReport> {
  const root = resolve(options.workDir);
  const rootStat = await lstat(root).catch(() => undefined);
  if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error("deterministic repair workdir must be a regular directory");
  }
  const repairContract = ExecutableRepairContractSchema.parse(options.repairContract);
  const runtimeContractPath = resolve(root, ".skvm-artifact", "public-runtime-contract.json");
  const runtimeContractBytes = await readFile(runtimeContractPath);
  if (sha256Bytes(runtimeContractBytes) !== repairContract.runtimeContractSha256) {
    throw new Error("runtime contract digest mismatch");
  }
  const runtimeContract = PublicRuntimeContractSchema.parse(
    JSON.parse(runtimeContractBytes.toString("utf8")),
  );
  if (runtimeContract.taskContractDigest !== repairContract.taskContractDigest) {
    throw new Error("task contract digest mismatch between runtime evidence and repair contract");
  }

  const generated = new Set<string>(runtimeContract.generatedOutputs);
  const contractOutputs = new Set<string>(
    repairContract.outputs.map((output) => output.relativePath),
  );
  if (
    generated.size !== contractOutputs.size
    || [...generated].some((path) => !contractOutputs.has(path))
  ) {
    throw new Error("generated output registry mismatch");
  }

  const protectedDigestBefore = await protectedTreeDigest(root, generated);
  const operations: DeterministicRepairReport["operations"] = [];

  const desiredReport = derivePublicContractClassification(runtimeContract);
  const reportPath = resolve(root, "env-report.json");
  const currentReport = await readJson(reportPath);
  if (!sameJson(currentReport, desiredReport)) {
    await atomicWrite(reportPath, canonicalJson(desiredReport));
    operations.push({
      operation: "rewrite-canonical-report",
      relativePath: "env-report.json",
      jsonPointer: "/",
      contractRef: "derivations/public-classification/v3",
    });
  }

  const expectedNames = runtimeContract.variables.map((variable) => variable.name)
    .sort((left, right) => left.localeCompare(right));
  const examplePath = resolve(root, ".env.example");
  const exampleText = await readFile(examplePath, "utf8").catch(() => "");
  const desiredExample = `${expectedNames.map((name) => `${name}=`).join("\n")}\n`;
  if (exampleText !== desiredExample) {
    await atomicWrite(examplePath, desiredExample);
    operations.push({
      operation: "rewrite-redacted-example",
      relativePath: ".env.example",
      jsonPointer: "/",
      contractRef: "policies/redacted-dotenv/v1",
    });
  }

  const schemaPath = resolve(root, ".env.schema.json");
  const currentSchema = await readJson(schemaPath);
  const desiredSchema = lowerSchemaRules(runtimeContract, repairContract);
  if (!sameJson(currentSchema, desiredSchema)) {
    await atomicWrite(schemaPath, canonicalJson(desiredSchema));
    operations.push({
      operation: "upsert-confirmed-schema-rules",
      relativePath: ".env.schema.json",
      jsonPointer: "/variables",
      contractRef: "policies/env-manager-development-repair-policy/v1",
    });
  }

  const protectedDigestAfter = await protectedTreeDigest(root, generated);
  return DeterministicRepairReportSchema.parse({
    schemaVersion: "deterministic-repair-report/v1",
    catalog: "executable-contract-repair-artifact/v4",
    status: operations.length > 0 ? "changed" : "no-change",
    operations,
    protectedDigestBefore,
    protectedDigestAfter,
  });
}
