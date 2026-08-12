import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import { SkillIRSchema } from "../../skill-ir/schema";
import { SkillIRSourceAuditSchema, verifySkillIRSourceAudit } from "../../skill-ir/source-audit";
import { validateSkillIR } from "../../skill-ir/validate";
import { parseSafeRelativePath } from "./artifact-package";
import { ResourceContractSchema } from "./resource-contract";
import { sha256Bytes } from "./source-fixture";
import { assembleValidatedArtifactPackage } from "./validated-artifact-assembly";
import type { ValidatedArtifactAssemblyAdapter } from "./validated-artifact-assembly";

const DigestRefSchema = z.object({
  path: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

const VariantSchema = z.object({
  id: z.enum(["node", "vite"]),
  taskId: z.string().min(1),
  protectedInputs: z.array(z.string().min(1)).min(1),
}).strict();

export const EnvManagerV3ArtifactAdapterSchema = z.object({
  schemaVersion: z.literal("skill-ir-env-manager-v3-artifact-adapter/v1"),
  catalog: z.literal("validated-skill-artifact/v1"),
  adapterId: z.literal("env-manager-public-evidence-audit"),
  version: z.literal("v1"),
  interfacePath: z.literal("env-audit-interface.json"),
  variants: z.array(VariantSchema).length(2),
  outputs: z.tuple([
    z.literal(".env.example"),
    z.literal(".env.schema.json"),
    z.literal("env-report.json"),
  ]),
  resourcePolicy: z.object({
    network: z.literal("forbidden"),
    packageInstall: z.literal("forbidden"),
    shell: z.literal(false),
  }).strict(),
}).strict();

export type EnvManagerV3ArtifactVariantId = "node" | "vite";

const CompilerInputSchema = z.object({
  rootDir: z.string().min(1),
  variantId: z.enum(["node", "vite"]),
  sourceFiles: z.array(DigestRefSchema).min(3),
  baseIr: DigestRefSchema,
  sourceAudit: DigestRefSchema,
  resourceContract: DigestRefSchema,
  taskContract: z.object({
    tasks: z.array(z.object({ id: z.string().min(1), prompt: z.string().min(1) }).strict()).length(2),
  }).strip(),
}).strict();

export type EnvManagerV3ArtifactCompilerInput = z.input<typeof CompilerInputSchema>;

const PILOT_DIR = "benchmarks/skill-ir/pilots/env-manager/successor-v3";
const SOURCE_PATH = "benchmarks/skill-ir/pilots/env-manager/source/SKILL.md";
const FORBIDDEN = [
  "evaluator-payload", "held-out", "runtime-output", "profile-feedback", "secret-value",
] as const;

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function digestRef(rootDir: string, path: string) {
  const safe = parseSafeRelativePath(path);
  return { path: safe, sha256: sha256Bytes(await readFile(join(rootDir, safe))) };
}

async function verifiedBytes(rootDir: string, ref: { path: string; sha256: string }): Promise<Uint8Array> {
  const safe = parseSafeRelativePath(ref.path);
  const bytes = await readFile(join(rootDir, safe));
  if (sha256Bytes(bytes) !== ref.sha256) throw new Error(`Env Manager v3 compiler digest mismatch for ${safe}`);
  return bytes;
}

function sourceBySuffix(records: Array<{ path: string; sha256: string }>, suffix: string) {
  const matches = records.filter((record) => record.path.replaceAll("\\", "/").endsWith(suffix));
  if (matches.length !== 1) throw new Error(`Env Manager v3 compiler requires one source ending in ${suffix}`);
  return matches[0]!;
}

const RUNTIME_SOURCE = String.raw`
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
const CONFIG = __CONFIG_JSON__;
function record(value) { return typeof value === "object" && value !== null && !Array.isArray(value); }
function contained(root, relativePath) {
  if (typeof relativePath !== "string" || !relativePath || path.isAbsolute(relativePath) || relativePath.includes("\\") || relativePath.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("unsafe path");
  const base = path.resolve(root), target = path.resolve(base, ...relativePath.split("/")), rel = path.relative(base, target);
  if (rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel)) throw new Error("path escapes workdir");
  return target;
}
async function listFiles(root, current = "") {
  const files = [];
  for (const entry of await readdir(path.join(root, current), { withFileTypes: true })) {
    const relative = current ? current + "/" + entry.name : entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(root, relative));
    else if (entry.isFile()) files.push(relative);
    else throw new Error("unsupported workspace entry");
  }
  return files.sort();
}
function sorted(values) { return [...new Set(values)].sort((a, b) => a.localeCompare(b, "en")); }
function environmentFile(name) { return /(^|\/)\.env(?:\.[^/]+)?$/.test(name) && !name.endsWith(".example"); }
async function derive(workdir) {
  const interfaceValue = JSON.parse(await readFile(contained(workdir, CONFIG.adapter.interfacePath), "utf8"));
  const outputSet = new Set(CONFIG.adapter.outputs);
  const sensitive = new RegExp(interfaceValue.policy.sensitiveNamePattern, "i");
  const integer = new RegExp(interfaceValue.policy.integerNamePattern, "i");
  const uri = new RegExp(interfaceValue.policy.uriNamePattern, "i");
  const definitions = new Set(), references = new Set(), hardcoded = [], exposures = [];
  for (const relativePath of await listFiles(workdir)) {
    if (outputSet.has(relativePath)) continue;
    const content = await readFile(contained(workdir, relativePath), "utf8");
    if (environmentFile(relativePath)) {
      for (const line of content.split(/\r?\n/)) { const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line); if (match) definitions.add(match[1]); }
      continue;
    }
    if (relativePath === CONFIG.adapter.interfacePath) continue;
    for (const pattern of [/process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g, /import\.meta\.env\.([A-Za-z_][A-Za-z0-9_]*)/g, /os\.environ\s*\[\s*["']([A-Za-z_][A-Za-z0-9_]*)["']\s*\]/g, /os\.getenv\s*\(\s*["']([A-Za-z_][A-Za-z0-9_]*)["']/g]) {
      for (const match of content.matchAll(pattern)) { const name = match[1]; references.add(name); if (interfaceValue.policy.clientPrefixes.some((prefix) => name.startsWith(prefix)) && sensitive.test(name)) exposures.push(relativePath + ":" + name); }
    }
    for (const line of content.split(/\r?\n/)) { const match = /(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*["']([^"']+)["']/.exec(line); if (match && sensitive.test(match[1])) hardcoded.push(relativePath + ":" + match[1]); }
  }
  const inventory = sorted([...definitions, ...references]);
  const properties = {}, required = [];
  for (const name of inventory) {
    const rule = { type: integer.test(name) ? "integer" : "string" };
    if (references.has(name)) required.push(name);
    if (integer.test(name)) { rule.minimum = 1; rule.maximum = name.endsWith("PORT") ? 65535 : 64; }
    if (uri.test(name)) rule.format = "uri";
    if (sensitive.test(name)) { rule.writeOnly = true; rule.minLength = interfaceValue.policy.secretMinimumLength; }
    properties[name] = rule;
  }
  const report = {
    definedAndUsed: sorted([...definitions].filter((name) => references.has(name))),
    definedUnconfirmedUnused: sorted([...definitions].filter((name) => !references.has(name))),
    usedUndefined: sorted([...references].filter((name) => !definitions.has(name))),
    hardcodedSecrets: sorted(hardcoded), exposureRisks: sorted(exposures),
  };
  return { inventory, example: inventory.map((name) => name + "=").join("\n") + "\n", schema: { type: "object", properties, required: sorted(required), additionalProperties: false }, report };
}
async function generate(workdir) {
  const expected = await derive(workdir);
  await writeFile(contained(workdir, ".env.example"), expected.example, "utf8");
  await writeFile(contained(workdir, ".env.schema.json"), JSON.stringify(expected.schema, null, 2) + "\n", "utf8");
  await writeFile(contained(workdir, "env-report.json"), JSON.stringify(expected.report, null, 2) + "\n", "utf8");
}
async function validate(workdir) {
  const errors = [], expected = await derive(workdir);
  try {
    const example = await readFile(contained(workdir, ".env.example"), "utf8");
    const schema = JSON.parse(await readFile(contained(workdir, ".env.schema.json"), "utf8"));
    const report = JSON.parse(await readFile(contained(workdir, "env-report.json"), "utf8"));
    if (example !== expected.example) errors.push({ code: "ENV_EXAMPLE_MISMATCH", relativePath: ".env.example", contractRef: "env-manager-interface/v3" });
    if (JSON.stringify(schema) !== JSON.stringify(expected.schema)) errors.push({ code: "ENV_SCHEMA_MISMATCH", relativePath: ".env.schema.json", contractRef: "env-manager-interface/v3" });
    if (JSON.stringify(report) !== JSON.stringify(expected.report)) errors.push({ code: "ENV_REPORT_MISMATCH", relativePath: "env-report.json", contractRef: "env-manager-interface/v3" });
    const exact = [...CONFIG.variant.protectedInputs, ...CONFIG.adapter.outputs].sort();
    if (JSON.stringify(await listFiles(workdir)) !== JSON.stringify(exact)) errors.push({ code: "EXACT_OUTPUT_SET_MISMATCH", contractRef: "env-manager-interface/v3" });
  } catch { errors.push({ code: "ARTIFACT_VALIDATION_FAILED", contractRef: "env-manager-interface/v3" }); }
  process.stdout.write(JSON.stringify({ schemaVersion: "skill-artifact-validation-report/v1", status: errors.length ? "fail" : "pass", errors }) + "\n");
}
const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);
const mode = process.argv[2], workdir = process.argv[4];
if ((mode !== "generate" && mode !== "validate") || process.argv[3] !== "--workdir" || !workdir) throw new Error("usage: <generate|validate> --workdir <path>");
if (mode === "generate") await generate(workdir); else await validate(workdir);
`;

async function bundleRuntime(rootDir: string, config: unknown): Promise<Uint8Array> {
  const temp = await mkdtemp(join(tmpdir(), "skvm-env-manager-v3-bundle-"));
  try {
    const entrypoint = join(temp, "env-manager-runtime.mjs");
    const outdir = join(temp, "out");
    await writeFile(entrypoint, RUNTIME_SOURCE.replace("__CONFIG_JSON__", JSON.stringify(config)), "utf8");
    const built = await Bun.build({ entrypoints: [entrypoint], root: rootDir, outdir, target: "node", format: "esm", sourcemap: "none", minify: { identifiers: false, syntax: true, whitespace: true } });
    if (!built.success || built.outputs.length !== 1) throw new Error("Env Manager v3 runtime bundle failed");
    return new Uint8Array(await built.outputs[0]!.arrayBuffer());
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

export async function loadEnvManagerV3ArtifactCompilerInput(
  rootDir: string,
  variantId: EnvManagerV3ArtifactVariantId,
): Promise<EnvManagerV3ArtifactCompilerInput> {
  const taskSet = JSON.parse(await readFile(join(rootDir, PILOT_DIR, "development/tasks.json"), "utf8")) as { tasks?: Array<Record<string, unknown>> };
  const tasks = (taskSet.tasks ?? []).map((task) => {
    if (task.split !== "development" || typeof task.id !== "string" || typeof task.prompt !== "string") throw new Error("Env Manager v3 compiler accepts only development prompt projections");
    return { id: task.id, prompt: task.prompt };
  });
  const sourcePaths = [SOURCE_PATH, `${PILOT_DIR}/public-interface.json`, `${PILOT_DIR}/artifact-adapter.json`];
  return {
    rootDir,
    variantId,
    sourceFiles: await Promise.all(sourcePaths.map((path) => digestRef(rootDir, path))),
    baseIr: await digestRef(rootDir, `${PILOT_DIR}/base-ir.json`),
    sourceAudit: await digestRef(rootDir, `${PILOT_DIR}/base-ir-source-audit.json`),
    resourceContract: await digestRef(rootDir, `${PILOT_DIR}/resource-contract.json`),
    taskContract: { tasks },
  };
}

export async function compileEnvManagerV3ValidatedArtifact(
  rawInput: EnvManagerV3ArtifactCompilerInput,
  outDir: string,
): Promise<void> {
  const input = CompilerInputSchema.parse(rawInput);
  await mkdir(outDir, { recursive: true });
  if ((await readdir(outDir)).length > 0) throw new Error("Env Manager v3 artifact output directory must be empty");
  const skillRef = sourceBySuffix(input.sourceFiles, "/source/SKILL.md");
  const interfaceRef = sourceBySuffix(input.sourceFiles, "/public-interface.json");
  const adapterRef = sourceBySuffix(input.sourceFiles, "/artifact-adapter.json");
  const [skillBytes, interfaceBytes, adapterBytes, baseIrBytes, auditBytes, resourceBytes] = await Promise.all([
    verifiedBytes(input.rootDir, skillRef), verifiedBytes(input.rootDir, interfaceRef), verifiedBytes(input.rootDir, adapterRef),
    verifiedBytes(input.rootDir, input.baseIr), verifiedBytes(input.rootDir, input.sourceAudit), verifiedBytes(input.rootDir, input.resourceContract),
  ]);
  const ir = SkillIRSchema.parse(JSON.parse(Buffer.from(baseIrBytes).toString("utf8")));
  if (ir.id !== "env-manager-v3" || ir.profile.length > 0) throw new Error("Env Manager v3 compiler requires profile-empty v3 IR");
  const validation = validateSkillIR(ir);
  if (validation.errors.length || validation.warnings.length) throw new Error("Env Manager v3 base IR validation failed");
  const audit = SkillIRSourceAuditSchema.parse(JSON.parse(Buffer.from(auditBytes).toString("utf8")));
  const auditReport = await verifySkillIRSourceAudit(ir, audit, input.rootDir);
  if (auditReport.errors.length || auditReport.warnings.length) throw new Error("Env Manager v3 source audit failed");
  const adapter = EnvManagerV3ArtifactAdapterSchema.parse(JSON.parse(Buffer.from(adapterBytes).toString("utf8")));
  const variant = adapter.variants.find((candidate) => candidate.id === input.variantId);
  if (!variant) throw new Error(`Unknown Env Manager v3 variant ${input.variantId}`);
  const taskIds = input.taskContract.tasks.map((task) => task.id).sort();
  if (!taskIds.includes(variant.taskId)) throw new Error("Env Manager v3 variant task identity drift");
  const resource = ResourceContractSchema.parse(JSON.parse(Buffer.from(resourceBytes).toString("utf8")));
  const publicInterface = JSON.parse(Buffer.from(interfaceBytes).toString("utf8")) as { outputs?: Record<string, string> };
  if (JSON.stringify(Object.values(publicInterface.outputs ?? {})) !== JSON.stringify(adapter.outputs)) throw new Error("Env Manager v3 output contract drift");
  const runtime = await bundleRuntime(input.rootDir, { adapter, variant });
  const executionPlan: ValidatedArtifactAssemblyAdapter["executionPlan"] = {
    schemaVersion: "skill-artifact-execution-plan/v1",
    entrypoint: "validate-env-audit",
    nodes: [
      { id: "generate-env-audit", kind: "process", dependsOn: [], command: { interpreter: { env: resource.interpreter.env, fallback: resource.interpreter.fallbackCommand }, artifactId: "env-audit-runtime", args: ["generate", "--workdir", "{workdir}"], envAllowlist: [resource.interpreter.env] }, timeoutMs: 30000 },
      { id: "validate-env-audit", kind: "validate", dependsOn: ["generate-env-audit"], command: { interpreter: { env: resource.interpreter.env, fallback: resource.interpreter.fallbackCommand }, artifactId: "env-audit-check", args: ["validate", "--workdir", "{workdir}"], envAllowlist: [resource.interpreter.env] }, timeoutMs: 30000 },
    ],
  };
  const promptProjection = [...input.taskContract.tasks].sort((a, b) => a.id.localeCompare(b.id));
  const assemblyAdapter: ValidatedArtifactAssemblyAdapter = {
    schemaVersion: "validated-artifact-assembly-adapter/v1", catalog: "validated-skill-artifact/v1",
    skillId: "env-manager-v3", adapterId: adapter.adapterId, version: adapter.version,
    compiler: { id: "env-manager-v3-artifact-compiler", version: "v1", configSha256: sha256Bytes(Buffer.from(JSON.stringify({ adapter, variant, resource: adapter.resourcePolicy }))) },
    protectedInputs: variant.protectedInputs, generatedOutputs: adapter.outputs, executionPlan,
    artifactLayout: [
      { id: "skill-ir", path: "skill-ir.json", kind: "skill-ir" },
      { id: "skill-view", path: "skill.md", kind: "skill-view" },
      { id: "env-audit-runtime", path: "artifacts/scripts/env-audit.mjs", kind: "script" },
      { id: "env-audit-check", path: "artifacts/checks/env-audit-check.mjs", kind: "check" },
      { id: "env-audit-interface", path: "artifacts/schemas/env-audit-interface.json", kind: "schema" },
      { id: "env-audit-policy", path: "validation-policy.json", kind: "validation-policy" },
      { id: "env-audit-notes", path: "validation-notes.json", kind: "validation-notes" },
    ],
  };
  await assembleValidatedArtifactPackage({
    adapter: assemblyAdapter,
    provenanceInputs: {
      sourceClosure: input.sourceFiles.map((ref) => ({ path: parseSafeRelativePath(ref.path), sha256: ref.sha256 })).sort((a, b) => a.path.localeCompare(b.path)),
      baseIr: { path: parseSafeRelativePath(input.baseIr.path), sha256: input.baseIr.sha256 },
      sourceAudit: { path: parseSafeRelativePath(input.sourceAudit.path), sha256: input.sourceAudit.sha256 },
      resourceContract: { path: parseSafeRelativePath(input.resourceContract.path), sha256: input.resourceContract.sha256 },
      taskContract: { taskIds, promptDigest: sha256Bytes(Buffer.from(JSON.stringify(promptProjection))) },
    },
    artifactPayloads: [
      { id: "skill-ir", bytes: baseIrBytes },
      { id: "skill-view", bytes: `# Env Manager v3 - Compiled Artifact View\n\nDeterministic audit from public workspace evidence. Network and package installation are forbidden.\n\n${Buffer.from(skillBytes).toString("utf8").split(/\r?\n/).find((line) => line.startsWith("# ")) ?? ""}\n` },
      { id: "env-audit-runtime", bytes: runtime }, { id: "env-audit-check", bytes: runtime },
      { id: "env-audit-interface", bytes: interfaceBytes },
      { id: "env-audit-policy", bytes: jsonText({ schemaVersion: "env-manager-v3-artifact-validation-policy/v1", protectedInputs: variant.protectedInputs, generatedOutputs: adapter.outputs, scorerAuthority: "skill-ir-env-manager-v3", network: adapter.resourcePolicy.network, packageInstall: adapter.resourcePolicy.packageInstall }) },
      { id: "env-audit-notes", bytes: jsonText({ schemaVersion: "skill-artifact-validation-notes/v1", status: "candidate", developmentGatePassed: false, heldOutExecutionAllowed: false, entersMainClaim: false, modelGenerationTokens: 0, forbiddenEvidenceClasses: FORBIDDEN }) },
    ],
  }, outDir);
}
