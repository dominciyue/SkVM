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
import {
  type ValidatedArtifactExecutionPlan,
  type ValidatedArtifactManifest,
  type ValidatedArtifactProvenance,
  type ValidatedArtifactRecord,
  validateValidatedArtifactPackage,
} from "./validated-artifact-catalog";

const DigestRefSchema = z.object({
  path: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

const VariantSchema = z.discriminatedUnion("id", [
  z.object({
    id: z.literal("openapi-yaml"),
    inputPath: z.literal("api/openapi.yaml"),
    inputFormat: z.literal("yaml"),
  }).strict(),
  z.object({
    id: z.literal("openapi-json"),
    inputPath: z.literal("api/openapi.json"),
    inputFormat: z.literal("json"),
  }).strict(),
]);

export const ApiTesterArtifactAdapterSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-artifact-adapter/v1"),
  catalog: z.literal("validated-skill-artifact/v1"),
  adapterId: z.literal("api-tester-schema-derived-test-plan"),
  version: z.literal("v1"),
  interfacePath: z.literal("api-test-interface.json"),
  variants: z.array(VariantSchema).length(2).superRefine((variants, ctx) => {
    if (new Set(variants.map((variant) => variant.id)).size !== variants.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "API Tester adapter variants must be unique" });
    }
  }),
  outputs: z.object({
    generator: z.literal("api-test-generator.mjs"),
    plan: z.literal("generated/api-test-plan.json"),
    report: z.literal("api-test-report.json"),
  }).strict(),
  generationPolicy: z.object({
    framework: z.literal("node:test"),
    categories: z.tuple([z.literal("happy"), z.literal("boundary"), z.literal("error")]),
    securityPlaceholder: z.string().regex(/^\$\{[A-Z][A-Z0-9_]*\}$/),
    caseTimeoutMs: z.number().int().min(1).max(30_000),
    deterministic: z.literal(true),
    independent: z.literal(true),
  }).strict(),
  resourcePolicy: z.object({
    network: z.literal("forbidden"),
    packageInstall: z.literal("forbidden"),
    shell: z.literal(false),
  }).strict(),
}).strict();

export type ApiTesterArtifactAdapter = z.infer<typeof ApiTesterArtifactAdapterSchema>;
export type ApiTesterArtifactVariantId = ApiTesterArtifactAdapter["variants"][number]["id"];

const ApiTesterArtifactCompilerInputSchema = z.object({
  rootDir: z.string().min(1),
  variantId: z.enum(["openapi-yaml", "openapi-json"]),
  sourceFiles: z.array(DigestRefSchema).min(4),
  baseIr: DigestRefSchema,
  sourceAudit: DigestRefSchema,
  resourceContract: DigestRefSchema,
  taskContract: z.object({
    tasks: z.array(z.object({
      id: z.string().regex(/^api-tester-[a-z0-9-]+-dev-[0-9]+$/),
      prompt: z.string().min(1),
    }).strict()).length(2),
  }).strip(),
}).strict();

export type ApiTesterArtifactCompilerInput = z.input<typeof ApiTesterArtifactCompilerInputSchema>;

const FORBIDDEN_EVIDENCE_CLASSES = [
  "evaluator-payload",
  "held-out",
  "runtime-output",
  "profile-feedback",
  "secret-value",
] as const;

const COMPILER_ID = "api-tester-validated-artifact-compiler";
const COMPILER_VERSION = "v1";
const PILOT_DIR = "benchmarks/skill-ir/pilots/api-tester";

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function digestRef(rootDir: string, path: string): Promise<{ path: string; sha256: string }> {
  const normalized = parseSafeRelativePath(path);
  return { path: normalized, sha256: sha256Bytes(await readFile(join(rootDir, normalized))) };
}

async function verifiedBytes(rootDir: string, ref: { path: string; sha256: string }): Promise<Uint8Array> {
  const path = parseSafeRelativePath(ref.path);
  const bytes = await readFile(join(rootDir, path));
  const actual = sha256Bytes(bytes);
  if (actual !== ref.sha256) {
    throw new Error(`Compiler input digest mismatch for ${path}: expected ${ref.sha256}, got ${actual}`);
  }
  return bytes;
}

function sourceBySuffix(
  records: Array<{ path: string; sha256: string }>,
  suffix: string,
): { path: string; sha256: string } {
  const matches = records.filter((record) => record.path.replaceAll("\\", "/").endsWith(suffix));
  if (matches.length !== 1) throw new Error(`API Tester compiler requires one source ending in ${suffix}`);
  return matches[0]!;
}

async function ensureEmptyOutputDirectory(outDir: string): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const pending = [outDir];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        throw new Error(`API Tester artifact output directory must not contain files: ${outDir}`);
      }
      pending.push(join(directory, entry.name));
    }
  }
}

async function writeArtifact(
  outDir: string,
  record: Omit<ValidatedArtifactRecord, "sha256">,
  bytes: Uint8Array | string,
): Promise<ValidatedArtifactRecord> {
  const target = join(outDir, record.path);
  await mkdir(dirname(target), { recursive: true });
  const content = typeof bytes === "string" ? Buffer.from(bytes, "utf8") : bytes;
  await writeFile(target, content);
  return { ...record, sha256: sha256Bytes(content) };
}

const RUNTIME_SOURCE = String.raw`
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const CONFIG = __CONFIG_JSON__;
const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

function record(value) { return typeof value === "object" && value !== null && !Array.isArray(value); }
function stringValue(value) { return typeof value === "string" && value.length > 0 ? value : undefined; }
function finiteNumber(value) { return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
function safeRelative(value) {
  if (typeof value !== "string" || value.length === 0 || path.isAbsolute(value) || value.includes("\\")) throw new Error("unsafe relative path");
  if (value.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("unsafe relative path");
  return value;
}
function contained(root, relativePath) {
  const safe = safeRelative(relativePath);
  const base = path.resolve(root);
  const target = path.resolve(base, ...safe.split("/"));
  const rel = path.relative(base, target);
  if (rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel)) throw new Error("path escapes workdir");
  return target;
}
function values(argv) {
  const result = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index], value = argv[index + 1];
    if (!key || !key.startsWith("--") || value === undefined) throw new Error("invalid arguments");
    result.set(key, value);
  }
  return result;
}
function statuses(responses) {
  if (!record(responses)) return undefined;
  const codes = Object.keys(responses).filter((key) => /^\d{3}$/.test(key)).map(Number);
  const success = codes.filter((code) => code >= 200 && code < 300).sort((a, b) => a - b);
  if (success.length === 0) return undefined;
  return { success, error: codes.filter((code) => code >= 400 && code < 600).sort((a, b) => a - b) };
}
function deriveConstraints(location, name, schema, required) {
  const base = { location, name, ...(stringValue(schema.type) ? { type: schema.type } : {}) };
  const result = [];
  if (required) result.push({ ...base, required: true, evidence: "required" });
  for (const key of ["minLength", "maxLength", "minimum", "maximum"]) {
    const value = finiteNumber(schema[key]);
    if (value !== undefined) result.push({ ...base, required: false, evidence: key, [key]: value });
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) result.push({ ...base, required: false, evidence: "enum", enumValues: structuredClone(schema.enum) });
  if (stringValue(schema.format)) result.push({ ...base, required: false, evidence: "format", format: schema.format });
  return result;
}
function parameters(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return undefined;
  const result = [];
  for (const parameter of value) {
    if (!record(parameter) || !record(parameter.schema) || !stringValue(parameter.name)) return undefined;
    const location = parameter.in === "headers" ? "header" : parameter.in;
    if (!["path", "query", "header"].includes(String(location))) return undefined;
    result.push(...deriveConstraints(location, parameter.name, parameter.schema, parameter.required === true));
  }
  return result;
}
function body(value) {
  if (value === undefined) return [];
  if (!record(value) || !record(value.content) || !record(value.content["application/json"]) || !record(value.content["application/json"].schema)) return undefined;
  const schema = value.content["application/json"].schema;
  if (!record(schema.properties)) return undefined;
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((entry) => typeof entry === "string") : []);
  const result = [];
  for (const name of Object.keys(schema.properties).sort()) {
    const property = schema.properties[name];
    if (!record(property)) return undefined;
    result.push(...deriveConstraints("body", name, property, required.has(name)));
  }
  return result;
}
function securityHeaders(document, operation) {
  const security = operation.security ?? document.security;
  if (security === undefined || (Array.isArray(security) && security.length === 0)) return [];
  if (!Array.isArray(security)) return undefined;
  const components = record(document.components) ? document.components : {};
  const schemes = record(components.securitySchemes) ? components.securitySchemes : {};
  const headers = new Set();
  for (const requirement of security) {
    if (!record(requirement)) return undefined;
    for (const name of Object.keys(requirement)) {
      const scheme = schemes[name];
      if (!record(scheme)) return undefined;
      if (scheme.type === "http" && String(scheme.scheme).toLowerCase() === "bearer") headers.add("Authorization");
      else if (scheme.type === "apiKey" && scheme.in === "header" && stringValue(scheme.name)) headers.add(scheme.name);
      else return undefined;
    }
  }
  return [...headers].sort();
}
function deriveOracle(document) {
  if (!record(document) || !stringValue(document.openapi) || !record(document.paths)) throw new Error("unconfirmed public OpenAPI");
  const operations = [];
  for (const route of Object.keys(document.paths).sort()) {
    const item = document.paths[route];
    if (!route.startsWith("/") || !record(item)) throw new Error("invalid path item");
    const shared = parameters(item.parameters);
    if (!shared) throw new Error("unsupported shared parameters");
    for (const method of HTTP_METHODS) {
      const operation = item[method];
      if (operation === undefined) continue;
      if (!record(operation)) throw new Error("invalid operation");
      const response = statuses(operation.responses), local = parameters(operation.parameters), request = body(operation.requestBody), headers = securityHeaders(document, operation);
      if (!response || !local || !request || !headers) throw new Error("unsupported public operation evidence");
      operations.push({ method, path: route, successStatuses: response.success, errorStatuses: response.error, securityHeaders: headers, constraints: [...shared, ...local, ...request] });
    }
  }
  operations.sort((left, right) => (left.path + ":" + left.method).localeCompare(right.path + ":" + right.method));
  if (operations.length === 0) throw new Error("no public operations");
  return operations;
}
function section(request, location) {
  const key = location === "header" ? "headers" : location;
  request[key] ??= {};
  return request[key];
}
function setValue(request, constraint, value) { section(request, constraint.location)[constraint.name] = value; }
function deleteValue(request, constraint) { delete section(request, constraint.location)[constraint.name]; }
function validValue(constraint) {
  if (constraint.enumValues?.length) return constraint.enumValues[0];
  if (constraint.format === "email") return "person@example.test";
  if (constraint.format === "uri") return "https://example.test/callback";
  if (constraint.type === "integer" || constraint.type === "number") return constraint.minimum ?? 1;
  return "x".repeat(Math.max(1, constraint.minLength ?? 1));
}
function planFor(document) {
  return {
    schemaVersion: "api-test-plan/v1",
    source: "public-openapi",
    framework: CONFIG.adapter.generationPolicy.framework,
    endpoints: deriveOracle(document).map((operation) => {
      const base = {};
      for (const constraint of operation.constraints) setValue(base, constraint, validValue(constraint));
      for (const header of operation.securityHeaders) section(base, "header")[header] = CONFIG.adapter.generationPolicy.securityPlaceholder;
      const success = operation.successStatuses[0], error = operation.errorStatuses[0] ?? 400;
      const prefix = operation.method + "-" + operation.path.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const cases = [{ id: prefix + "-happy", category: "happy", request: structuredClone(base), expectedStatus: success, assertions: ["status"], independent: true, timeoutMs: CONFIG.adapter.generationPolicy.caseTimeoutMs }];
      operation.constraints.forEach((constraint, index) => {
        const request = structuredClone(base);
        let category = "boundary", expectedStatus = success;
        if (constraint.required) { deleteValue(request, constraint); category = "error"; expectedStatus = error; }
        else if (constraint.maxLength !== undefined) setValue(request, constraint, "x".repeat(constraint.maxLength));
        else if (constraint.maximum !== undefined) setValue(request, constraint, constraint.maximum);
        cases.push({ id: prefix + "-constraint-" + index, category, request, expectedStatus, assertions: ["status"], independent: true, timeoutMs: CONFIG.adapter.generationPolicy.caseTimeoutMs });
      });
      if (operation.securityHeaders.length > 0) {
        const request = structuredClone(base);
        for (const header of operation.securityHeaders) delete section(request, "header")[header];
        cases.push({ id: prefix + "-unauthorized", category: "error", request, expectedStatus: operation.errorStatuses.find((status) => status === 401 || status === 403) ?? error, assertions: ["status"], independent: true, timeoutMs: CONFIG.adapter.generationPolicy.caseTimeoutMs });
      }
      return { method: operation.method, path: operation.path, cases };
    }),
  };
}
async function parseDocument(root, relativePath) {
  const text = await readFile(contained(root, relativePath), "utf8");
  return relativePath.endsWith(".json") ? JSON.parse(text) : parseYaml(text);
}
async function writePlan(root, inputPath, outPath) {
  const plan = planFor(await parseDocument(root, inputPath));
  const target = contained(root, outPath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(plan, null, 2) + "\n", "utf8");
  return plan;
}
function caseCount(plan) { return plan.endpoints.reduce((sum, endpoint) => sum + endpoint.cases.length, 0); }
async function generate(workdir) {
  const inputPath = CONFIG.variant.inputPath;
  const plan = await writePlan(workdir, inputPath, CONFIG.adapter.outputs.plan);
  await copyFile(fileURLToPath(import.meta.url), contained(workdir, CONFIG.adapter.outputs.generator));
  const report = {
    schemaVersion: "api-test-report/v1",
    discoverySource: "public-openapi",
    generatedCaseCount: caseCount(plan),
    verification: { status: "passed", command: ["node", CONFIG.adapter.outputs.generator, "--input", inputPath, "--out", CONFIG.adapter.outputs.plan] },
    limitations: [],
  };
  await writeFile(contained(workdir, CONFIG.adapter.outputs.report), JSON.stringify(report, null, 2) + "\n", "utf8");
}
async function listFiles(root, current = "") {
  const files = [];
  for (const entry of await readdir(path.join(root, current), { withFileTypes: true })) {
    const relative = current ? current + "/" + entry.name : entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(root, relative));
    else if (entry.isFile()) files.push(relative);
    else throw new Error("unsupported workdir entry");
  }
  return files.sort();
}
async function validate(workdir) {
  const errors = [];
  try {
    const expected = planFor(await parseDocument(workdir, CONFIG.variant.inputPath));
    const actual = JSON.parse(await readFile(contained(workdir, CONFIG.adapter.outputs.plan), "utf8"));
    if (JSON.stringify(actual) !== JSON.stringify(expected)) errors.push({ code: "PLAN_SEMANTIC_MISMATCH", relativePath: CONFIG.adapter.outputs.plan, contractRef: "api-test-interface/v1" });
    const [generator, checker] = await Promise.all([readFile(contained(workdir, CONFIG.adapter.outputs.generator)), readFile(fileURLToPath(import.meta.url))]);
    if (!generator.equals(checker)) errors.push({ code: "GENERATOR_REPLAY_MISMATCH", relativePath: CONFIG.adapter.outputs.generator, contractRef: "api-test-interface/v1" });
    const report = JSON.parse(await readFile(contained(workdir, CONFIG.adapter.outputs.report), "utf8"));
    if (report.generatedCaseCount !== caseCount(actual) || report.verification?.status !== "passed") errors.push({ code: "REPORT_GROUNDING_MISMATCH", relativePath: CONFIG.adapter.outputs.report, contractRef: "api-test-interface/v1" });
    const publicInterface = JSON.parse(await readFile(contained(workdir, CONFIG.adapter.interfacePath), "utf8"));
    if (JSON.stringify(publicInterface.outputs) !== JSON.stringify(Object.values(CONFIG.adapter.outputs))) errors.push({ code: "PUBLIC_INTERFACE_MISMATCH", relativePath: CONFIG.adapter.interfacePath, contractRef: "api-test-interface/v1" });
    const expectedFiles = [CONFIG.variant.inputPath, CONFIG.adapter.interfacePath, ...Object.values(CONFIG.adapter.outputs)].sort();
    if (JSON.stringify(await listFiles(workdir)) !== JSON.stringify(expectedFiles)) errors.push({ code: "EXACT_OUTPUT_SET_MISMATCH", contractRef: "api-test-interface/v1" });
  } catch {
    errors.push({ code: "ARTIFACT_VALIDATION_FAILED", contractRef: "api-test-interface/v1" });
  }
  process.stdout.write(JSON.stringify({ schemaVersion: "skill-artifact-validation-report/v1", status: errors.length ? "fail" : "pass", errors }) + "\n");
}

const argv = process.argv.slice(2);
if (argv[0] === "generate" || argv[0] === "validate") {
  const args = values(argv.slice(1)), workdir = args.get("--workdir");
  if (!workdir) throw new Error("missing workdir");
  if (argv[0] === "generate") await generate(workdir); else await validate(workdir);
} else {
  const args = values(argv), input = args.get("--input"), out = args.get("--out");
  if (!input || !out) throw new Error("usage: node api-test-generator.mjs --input <path> --out <path>");
  await writePlan(process.cwd(), input, out);
}
`;

async function bundleRuntime(
  rootDir: string,
  config: { adapter: ApiTesterArtifactAdapter; variant: ApiTesterArtifactAdapter["variants"][number] },
): Promise<Uint8Array> {
  const root = await mkdtemp(join(tmpdir(), "skvm-api-tester-bundle-"));
  try {
    const entrypoint = join(root, "api-test-runtime.mjs");
    const outDir = join(root, "out");
    const source = RUNTIME_SOURCE.replace("__CONFIG_JSON__", JSON.stringify(config));
    await writeFile(entrypoint, source, "utf8");
    const built = await Bun.build({
      entrypoints: [entrypoint],
      root: rootDir,
      plugins: [{
        name: "api-tester-yaml-resolution",
        setup(build) {
          build.onResolve({ filter: /^yaml$/u }, () => ({
            path: join(rootDir, "node_modules/yaml/dist/index.js"),
          }));
        },
      }],
      outdir: outDir,
      target: "node",
      format: "esm",
      sourcemap: "none",
      minify: { identifiers: false, syntax: true, whitespace: true },
    });
    if (!built.success || built.outputs.length !== 1) {
      throw new Error(`API Tester runtime bundle failed: ${built.logs.map(String).join("; ")}`);
    }
    return new Uint8Array(await built.outputs[0]!.arrayBuffer());
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export async function loadApiTesterArtifactCompilerInput(
  rootDir: string,
  variantId: ApiTesterArtifactVariantId,
): Promise<ApiTesterArtifactCompilerInput> {
  const tasksValue = JSON.parse(await readFile(join(rootDir, PILOT_DIR, "development/tasks.json"), "utf8")) as {
    skillId?: unknown;
    tasks?: unknown;
  };
  if (tasksValue.skillId !== "api-tester" || !Array.isArray(tasksValue.tasks)) {
    throw new Error("API Tester compiler task registry identity mismatch");
  }
  const tasks = tasksValue.tasks.map((raw) => {
    if (!raw || typeof raw !== "object") throw new Error("API Tester compiler task is invalid");
    const task = raw as Record<string, unknown>;
    if (task.split !== "development" || typeof task.id !== "string" || typeof task.prompt !== "string") {
      throw new Error("API Tester compiler accepts only development prompt projections");
    }
    return { id: task.id, prompt: task.prompt };
  });
  const sourcePaths = [
    `${PILOT_DIR}/source/SKILL.md`,
    `${PILOT_DIR}/public-interface.json`,
    `${PILOT_DIR}/artifact-adapter.json`,
    "node_modules/yaml/package.json",
  ];
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

export async function compileApiTesterValidatedArtifact(
  rawInput: ApiTesterArtifactCompilerInput,
  outDir: string,
): Promise<void> {
  const input = ApiTesterArtifactCompilerInputSchema.parse(rawInput);
  await ensureEmptyOutputDirectory(outDir);
  const skillRef = sourceBySuffix(input.sourceFiles, "/source/SKILL.md");
  const interfaceRef = sourceBySuffix(input.sourceFiles, "/public-interface.json");
  const adapterRef = sourceBySuffix(input.sourceFiles, "/artifact-adapter.json");
  const [skillBytes, interfaceBytes, adapterBytes, baseIrBytes, auditBytes, resourceBytes] = await Promise.all([
    verifiedBytes(input.rootDir, skillRef),
    verifiedBytes(input.rootDir, interfaceRef),
    verifiedBytes(input.rootDir, adapterRef),
    verifiedBytes(input.rootDir, input.baseIr),
    verifiedBytes(input.rootDir, input.sourceAudit),
    verifiedBytes(input.rootDir, input.resourceContract),
    ...input.sourceFiles
      .filter((record) => ![skillRef.path, interfaceRef.path, adapterRef.path].includes(record.path))
      .map((record) => verifiedBytes(input.rootDir, record)),
  ]);
  const baseIr = SkillIRSchema.parse(JSON.parse(Buffer.from(baseIrBytes).toString("utf8")));
  const audit = SkillIRSourceAuditSchema.parse(JSON.parse(Buffer.from(auditBytes).toString("utf8")));
  const validation = validateSkillIR(baseIr);
  if (validation.errors.length > 0 || validation.warnings.length > 0) {
    throw new Error(`API Tester base IR validation failed: ${[...validation.errors, ...validation.warnings].join("; ")}`);
  }
  const auditReport = await verifySkillIRSourceAudit(baseIr, audit, input.rootDir);
  if (auditReport.errors.length > 0 || auditReport.warnings.length > 0) {
    throw new Error(`API Tester source audit failed: ${[...auditReport.errors, ...auditReport.warnings].join("; ")}`);
  }
  const adapter = ApiTesterArtifactAdapterSchema.parse(JSON.parse(Buffer.from(adapterBytes).toString("utf8")));
  const variant = adapter.variants.find((candidate) => candidate.id === input.variantId);
  if (!variant) throw new Error(`API Tester adapter does not declare variant ${input.variantId}`);
  const resource = ResourceContractSchema.parse(JSON.parse(Buffer.from(resourceBytes).toString("utf8")));
  const publicInterface = JSON.parse(Buffer.from(interfaceBytes).toString("utf8")) as { outputs?: unknown };
  if (JSON.stringify(publicInterface.outputs) !== JSON.stringify(Object.values(adapter.outputs))) {
    throw new Error("API Tester adapter output contract does not match the public interface");
  }

  const runtimeBytes = await bundleRuntime(input.rootDir, { adapter, variant });
  const artifacts: ValidatedArtifactRecord[] = [];
  artifacts.push(await writeArtifact(outDir, { id: "skill-ir", path: "skill-ir.json", kind: "skill-ir" }, baseIrBytes));
  artifacts.push(await writeArtifact(outDir, { id: "skill-view", path: "skill.md", kind: "skill-view" }, [
    "# API Tester - Compiled Artifact View",
    "",
    "Catalog: validated-skill-artifact/v1",
    `Variant: ${variant.id} (${variant.inputPath})`,
    "Execution: bundled deterministic Node generator followed by public semantic validation.",
    "Network and package installation are forbidden.",
    "The deterministic offline scorer remains the task-success authority.",
    "",
    Buffer.from(skillBytes).toString("utf8").split(/\r?\n/u).find((line) => line.startsWith("# ")) ?? "",
    "",
  ].join("\n")));
  artifacts.push(await writeArtifact(outDir, {
    id: "api-test-generator", path: "artifacts/scripts/api-test-generator.mjs", kind: "script",
  }, runtimeBytes));
  artifacts.push(await writeArtifact(outDir, {
    id: "api-test-checker", path: "artifacts/checks/api-test-check.mjs", kind: "check",
  }, runtimeBytes));
  artifacts.push(await writeArtifact(outDir, {
    id: "api-test-interface", path: "artifacts/schemas/api-test-interface.json", kind: "schema",
  }, interfaceBytes));
  artifacts.push(await writeArtifact(outDir, {
    id: "api-test-tool-plan", path: "artifacts/tool-plans/api-tester.json", kind: "tool-plan",
  }, jsonText({
    schemaVersion: "api-tester-tool-plan/v1",
    mode: "schema-derived-offline-generation",
    variant,
    outputs: adapter.outputs,
    interpreter: resource.interpreter,
    shell: false,
    network: resource.network,
    packageInstall: resource.packageInstall,
  })));
  artifacts.push(await writeArtifact(outDir, {
    id: "api-test-validation-policy", path: "validation-policy.json", kind: "validation-policy",
  }, jsonText({
    schemaVersion: "api-tester-artifact-validation-policy/v1",
    protectedInputs: [variant.inputPath, adapter.interfacePath],
    exactOutputs: Object.values(adapter.outputs),
    checks: ["generator-replay", "operation-coverage", "schema-derived-cases", "security-response", "report-grounding"],
    scorerAuthority: "skill-ir-api-tester",
  })));
  artifacts.push(await writeArtifact(outDir, {
    id: "api-test-validation-notes", path: "validation-notes.json", kind: "validation-notes",
  }, jsonText({
    schemaVersion: "skill-artifact-validation-notes/v1",
    status: "candidate",
    variant: variant.id,
    developmentGatePassed: false,
    heldOutExecutionAllowed: false,
    entersMainClaim: false,
    modelGenerationTokens: 0,
  })));

  const executionPlan: ValidatedArtifactExecutionPlan = {
    schemaVersion: "skill-artifact-execution-plan/v1",
    entrypoint: "validate-api-test-artifacts",
    nodes: [
      {
        id: "generate-api-test-artifacts",
        kind: "process",
        dependsOn: [],
        command: {
          interpreter: { env: resource.interpreter.env, fallback: resource.interpreter.fallbackCommand },
          artifactId: "api-test-generator",
          args: ["generate", "--workdir", "{workdir}"],
          envAllowlist: [resource.interpreter.env],
        },
        timeoutMs: 30_000,
      },
      {
        id: "validate-api-test-artifacts",
        kind: "validate",
        dependsOn: ["generate-api-test-artifacts"],
        command: {
          interpreter: { env: resource.interpreter.env, fallback: resource.interpreter.fallbackCommand },
          artifactId: "api-test-checker",
          args: ["validate", "--workdir", "{workdir}"],
          envAllowlist: [resource.interpreter.env],
        },
        timeoutMs: 30_000,
      },
    ],
  };
  const executionText = jsonText(executionPlan);
  await writeFile(join(outDir, "execution-plan.json"), executionText, "utf8");

  const promptProjection = input.taskContract.tasks
    .map((task) => ({ id: task.id, prompt: task.prompt }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const compilerConfig = {
    catalog: adapter.catalog,
    adapter: adapter.adapterId,
    adapterVersion: adapter.version,
    compiler: COMPILER_ID,
    compilerVersion: COMPILER_VERSION,
    variant,
  };
  const provenance: ValidatedArtifactProvenance = {
    schemaVersion: "validated-skill-artifact-provenance/v1",
    catalog: "validated-skill-artifact/v1",
    skillId: "api-tester",
    constructionSplit: "development",
    compiler: {
      id: COMPILER_ID,
      version: COMPILER_VERSION,
      configSha256: sha256Bytes(Buffer.from(JSON.stringify(compilerConfig), "utf8")),
    },
    inputs: {
      sourceClosure: input.sourceFiles.map((record) => ({
        path: parseSafeRelativePath(record.path), sha256: record.sha256,
      })).sort((left, right) => left.path.localeCompare(right.path)),
      baseIr: { path: parseSafeRelativePath(input.baseIr.path), sha256: input.baseIr.sha256 },
      sourceAudit: { path: parseSafeRelativePath(input.sourceAudit.path), sha256: input.sourceAudit.sha256 },
      resourceContract: {
        path: parseSafeRelativePath(input.resourceContract.path), sha256: input.resourceContract.sha256,
      },
      taskContract: {
        taskIds: promptProjection.map((task) => task.id),
        promptDigest: sha256Bytes(Buffer.from(JSON.stringify(promptProjection), "utf8")),
      },
    },
    forbiddenEvidenceClasses: [...FORBIDDEN_EVIDENCE_CLASSES],
    artifacts,
  };
  const provenanceText = jsonText(provenance);
  await writeFile(join(outDir, "package-provenance.json"), provenanceText, "utf8");
  const manifest: ValidatedArtifactManifest = {
    schemaVersion: "validated-skill-artifact-manifest/v1",
    catalog: "validated-skill-artifact/v1",
    skillId: "api-tester",
    provenance: { path: "package-provenance.json", sha256: sha256Bytes(Buffer.from(provenanceText, "utf8")) },
    executionPlan: { path: "execution-plan.json", sha256: sha256Bytes(Buffer.from(executionText, "utf8")) },
    protectedInputs: [variant.inputPath, adapter.interfacePath],
    generatedOutputs: Object.values(adapter.outputs),
    artifacts,
  };
  await writeFile(join(outDir, "package-manifest.json"), jsonText(manifest), "utf8");
  await validateValidatedArtifactPackage(outDir);
}

export async function compileApiTesterValidatedArtifactVariants(
  rootDir: string,
  outRoot: string,
): Promise<Array<{
  variantId: ApiTesterArtifactVariantId;
  packageDir: string;
  packageBytes: number;
}>> {
  const variants: ApiTesterArtifactVariantId[] = ["openapi-json", "openapi-yaml"];
  const report = [];
  for (const variantId of variants) {
    const packageDir = join(outRoot, variantId);
    await compileApiTesterValidatedArtifact(
      await loadApiTesterArtifactCompilerInput(rootDir, variantId),
      packageDir,
    );
    const validated = await validateValidatedArtifactPackage(packageDir);
    report.push({ variantId, packageDir, packageBytes: validated.packageBytes });
  }
  return report;
}
