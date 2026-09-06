import { z } from "zod";

export const API_TESTER_PRODUCTION_PROGRAM_VERSION = "api-tester-production-programs-v1" as const;
export const API_TESTER_PRODUCTION_VALIDATION_REPORT_SCHEMA_VERSION =
  "skill-ir-api-tester-production-validation-report/v1" as const;

const ValidationChecksSchema = z.object({
  inputGrounding: z.boolean(),
  artifactShape: z.boolean(),
  operationCoverage: z.boolean(),
  schemaDerivedCases: z.boolean(),
  securityResponse: z.boolean(),
  independenceVerification: z.boolean(),
  reportGrounding: z.boolean(),
}).strict();

export const ApiTesterProductionValidationReportSchema = z.object({
  schemaVersion: z.literal(API_TESTER_PRODUCTION_VALIDATION_REPORT_SCHEMA_VERSION),
  programVersion: z.literal(API_TESTER_PRODUCTION_PROGRAM_VERSION),
  status: z.enum(["pass", "fail"]),
  bindingId: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u),
  inputSha256: z.string().regex(/^[0-9a-f]{64}$/u),
  checks: ValidationChecksSchema,
  errors: z.array(z.enum([
    "INPUT_GROUNDING_FAILED",
    "INVALID_ARTIFACT_SHAPE",
    "OPERATION_COVERAGE_FAILED",
    "SCHEMA_DERIVED_CASES_FAILED",
    "SECURITY_RESPONSE_FAILED",
    "INDEPENDENCE_VERIFICATION_FAILED",
    "REPORT_GROUNDING_FAILED",
  ])),
}).strict();

export type ApiTesterProductionValidationReport = z.infer<
  typeof ApiTesterProductionValidationReportSchema
>;

const GENERATOR_SOURCE = String.raw`import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const PROGRAM_VERSION = "api-tester-production-programs-v1";

function record(value) { return typeof value === "object" && value !== null && !Array.isArray(value); }
function argumentsFor(argv) {
  const known = new Set(["--binding", "--contract", "--workdir", "--input-sha256"]);
  const result = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index], value = argv[index + 1];
    if (!known.has(key) || value === undefined || result.has(key)) throw new Error("invalid generator arguments");
    result.set(key, value);
  }
  for (const key of known) if (!result.has(key)) throw new Error("missing generator argument " + key);
  return result;
}
function safeRelative(value) {
  if (typeof value !== "string" || value.length === 0 || path.isAbsolute(value) || value.includes("\\")) throw new Error("unsafe relative path");
  if (value.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("unsafe relative path");
  return value;
}
function contained(root, relativePath) {
  const base = path.resolve(root), safe = safeRelative(relativePath), target = path.resolve(base, ...safe.split("/"));
  const relative = path.relative(base, target);
  if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) throw new Error("path escapes workdir");
  return target;
}
async function jsonFile(file) { return JSON.parse(await readFile(file, "utf8")); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function section(request, location) {
  const key = location === "header" ? "headers" : location;
  request[key] ??= {};
  return request[key];
}
function setValue(request, field, value) { section(request, field.location)[field.name] = structuredClone(value); }
function deleteValue(request, field) { delete section(request, field.location)[field.name]; }
function validFormat(format, value) {
  if (typeof value !== "string") return false;
  if (format === "email") return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
  if (format === "uri") { try { new URL(value); return true; } catch { return false; } }
  return true;
}
function matches(field, value) {
  if (field.type === "string" && typeof value !== "string") return false;
  if (field.type === "integer" && (!Number.isInteger(value) || typeof value !== "number")) return false;
  if (field.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) return false;
  if (field.type === "boolean" && typeof value !== "boolean") return false;
  if (typeof value === "string" && ((field.minLength !== undefined && value.length < field.minLength) || (field.maxLength !== undefined && value.length > field.maxLength))) return false;
  if (typeof value === "number" && ((field.minimum !== undefined && value < field.minimum) || (field.maximum !== undefined && value > field.maximum))) return false;
  if (field.format && !validFormat(field.format, value)) return false;
  return true;
}
function stringValue(field) {
  const minimum = field.minLength ?? 0, maximum = field.maxLength ?? Number.POSITIVE_INFINITY;
  if (field.format === "email") {
    const suffix = "@b.co", local = Math.max(1, minimum - suffix.length), value = "a".repeat(local) + suffix;
    return value.length <= maximum ? value : undefined;
  }
  if (field.format === "uri") {
    const base = "https://a.co", value = base.length >= minimum ? base : base + "/" + "x".repeat(minimum - base.length - 1);
    return value.length <= maximum ? value : undefined;
  }
  const length = Math.max(0, minimum, maximum === 0 ? 0 : 1);
  return length <= maximum ? "x".repeat(length) : undefined;
}
function validValue(field) {
  if (field.enumValues) {
    const value = field.enumValues.find((candidate) => matches(field, candidate));
    if (value !== undefined) return structuredClone(value);
    throw new Error("contract contains an unconstructible enum");
  }
  const value = field.type === "string" ? stringValue(field)
    : field.type === "integer" ? Math.ceil(field.minimum ?? 1)
    : field.type === "number" ? field.minimum ?? 1 : true;
  if (value === undefined || !matches(field, value)) throw new Error("contract contains an unconstructible field");
  return value;
}
function caseRecord(id, category, request, expectedStatus) {
  return { id, category, request, expectedStatus, assertions: ["status"], independent: true, timeoutMs: 5000 };
}
function slug(value) { return value.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "root"; }
function planFromContract(contract) {
  return {
    schemaVersion: "api-test-plan/v1",
    source: "public-openapi",
    framework: "node:test",
    endpoints: contract.operations.map((operation, operationIndex) => {
      const base = {};
      for (const field of operation.fields) setValue(base, field, validValue(field));
      for (const header of operation.securityHeaders) section(base, "header")[header] = "${"${API_TEST_TOKEN}"}";
      const success = operation.successStatuses[0], error = operation.errorStatuses[0];
      const prefix = "op-" + operationIndex + "-" + operation.method.toLowerCase() + "-" + slug(operation.path);
      const cases = [caseRecord(prefix + "-happy", "happy", structuredClone(base), success)];
      operation.fields.forEach((field, fieldIndex) => {
        const evidence = [];
        if (field.required) evidence.push("required");
        for (const key of ["minLength", "maxLength", "minimum", "maximum"]) if (field[key] !== undefined) evidence.push(key);
        if (field.enumValues) evidence.push("enum");
        if (field.format) evidence.push("format");
        evidence.forEach((kind, evidenceIndex) => {
          const request = structuredClone(base);
          let category = "boundary", expectedStatus = success;
          if (kind === "required") { deleteValue(request, field); category = "error"; expectedStatus = error; }
          else if (kind === "minLength") setValue(request, field, "x".repeat(field.minLength));
          else if (kind === "maxLength") setValue(request, field, "x".repeat(field.maxLength));
          else if (kind === "minimum" || kind === "maximum") setValue(request, field, field[kind]);
          else setValue(request, field, validValue(field));
          cases.push(caseRecord(prefix + "-field-" + fieldIndex + "-" + evidenceIndex + "-" + kind, category, request, expectedStatus));
        });
      });
      if (operation.securityHeaders.length > 0) {
        const request = structuredClone(base);
        for (const header of operation.securityHeaders) delete section(request, "header")[header];
        const unauthorized = operation.errorStatuses.find((status) => status === 401 || status === 403);
        cases.push(caseRecord(prefix + "-unauthorized", "error", request, unauthorized));
      }
      return { method: operation.method, path: operation.path, cases };
    }),
  };
}
function countCases(plan) { return plan.endpoints.reduce((sum, endpoint) => sum + endpoint.cases.length, 0); }

const args = argumentsFor(process.argv.slice(2));
const binding = await jsonFile(args.get("--binding"));
const contract = await jsonFile(args.get("--contract"));
const workdir = path.resolve(args.get("--workdir"));
const expectedInputSha256 = args.get("--input-sha256");
const inputBytes = await readFile(contained(workdir, binding.input.path));
if (sha256(inputBytes) !== expectedInputSha256) throw new Error("protected input digest mismatch");
const planPath = contained(workdir, binding.outputs.plan), reportPath = contained(workdir, binding.outputs.report);
for (const output of [planPath, reportPath]) {
  try { await access(output); throw new Error("production output already exists: " + output); } catch (error) {
    if (error && error.code !== "ENOENT") throw error;
  }
}
const plan = planFromContract(contract);
const report = {
  schemaVersion: "api-test-report/v1",
  bindingId: binding.bindingId,
  input: { path: binding.input.path, sha256: expectedInputSha256 },
  publicContract: { schemaVersion: contract.schemaVersion, supportContractId: contract.supportContractId },
  programVersion: PROGRAM_VERSION,
  discoverySource: "public-openapi",
  generatedCaseCount: countCases(plan),
  verification: { status: "not-run", checker: "independent-public-contract" },
  limitations: [],
};
await Promise.all([mkdir(path.dirname(planPath), { recursive: true }), mkdir(path.dirname(reportPath), { recursive: true })]);
await writeFile(planPath, JSON.stringify(plan, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
`;

const CHECKER_SOURCE = String.raw`import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const PROGRAM_VERSION = "api-tester-production-programs-v1";
const REPORT_VERSION = "skill-ir-api-tester-production-validation-report/v1";

function record(value) { return typeof value === "object" && value !== null && !Array.isArray(value); }
function argumentsFor(argv) {
  const known = new Set(["--binding", "--contract", "--workdir", "--input-sha256"]), result = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index], value = argv[index + 1];
    if (!known.has(key) || value === undefined || result.has(key)) throw new Error("invalid checker arguments");
    result.set(key, value);
  }
  for (const key of known) if (!result.has(key)) throw new Error("missing checker argument " + key);
  return result;
}
function safeRelative(value) {
  if (typeof value !== "string" || value.length === 0 || path.isAbsolute(value) || value.includes("\\")) throw new Error("unsafe relative path");
  if (value.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("unsafe relative path");
  return value;
}
function contained(root, relativePath) {
  const base = path.resolve(root), target = path.resolve(base, ...safeRelative(relativePath).split("/"));
  const relative = path.relative(base, target);
  if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) throw new Error("path escapes workdir");
  return target;
}
async function jsonFile(file) { return JSON.parse(await readFile(file, "utf8")); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function section(request, location) {
  if (!record(request)) return undefined;
  const key = location === "header" ? "headers" : location;
  return record(request[key]) ? request[key] : undefined;
}
function observed(testCase, field) {
  const value = section(testCase.request, field.location);
  return value && Object.prototype.hasOwnProperty.call(value, field.name)
    ? { present: true, value: value[field.name] } : { present: false };
}
function documented(testCase, statuses, categories) {
  return Number.isInteger(testCase.expectedStatus) && statuses.includes(testCase.expectedStatus)
    && (!categories || categories.includes(testCase.category));
}
function validFormat(format, value) {
  if (typeof value !== "string") return false;
  if (format === "email") return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
  if (format === "uri") { try { new URL(value); return true; } catch { return false; } }
  return false;
}
function deepEqual(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function witnesses(field, kind, testCase, operation) {
  const value = observed(testCase, field), valid = documented(testCase, operation.successStatuses, ["boundary"]), invalid = documented(testCase, operation.errorStatuses, ["error"]);
  if (kind === "required") return !value.present && invalid;
  if (!value.present) return false;
  if (kind === "minLength" && typeof value.value === "string") return (valid && value.value.length === field.minLength) || (invalid && value.value.length < field.minLength);
  if (kind === "maxLength" && typeof value.value === "string") return (valid && value.value.length === field.maxLength) || (invalid && value.value.length > field.maxLength);
  if (kind === "minimum" && typeof value.value === "number") return (valid && value.value === field.minimum) || (invalid && value.value < field.minimum);
  if (kind === "maximum" && typeof value.value === "number") return (valid && value.value === field.maximum) || (invalid && value.value > field.maximum);
  if (kind === "enum") return (valid && field.enumValues.some((entry) => deepEqual(entry, value.value))) || (invalid && !field.enumValues.some((entry) => deepEqual(entry, value.value)));
  if (kind === "format") return (valid && validFormat(field.format, value.value)) || (invalid && !validFormat(field.format, value.value));
  return false;
}
function validCase(testCase) {
  return record(testCase) && typeof testCase.id === "string" && testCase.id.length > 0
    && ["happy", "boundary", "error"].includes(testCase.category) && record(testCase.request)
    && Number.isInteger(testCase.expectedStatus) && Array.isArray(testCase.assertions)
    && testCase.assertions.length > 0 && testCase.assertions.every((entry) => typeof entry === "string" && entry.length > 0)
    && typeof testCase.independent === "boolean" && Number.isInteger(testCase.timeoutMs) && testCase.timeoutMs > 0;
}
function assess(contract, plan, report, binding, inputGrounding) {
  const artifactShape = record(plan) && plan.schemaVersion === "api-test-plan/v1" && plan.source === "public-openapi"
    && plan.framework === "node:test" && Array.isArray(plan.endpoints)
    && plan.endpoints.every((endpoint) => record(endpoint) && typeof endpoint.method === "string" && typeof endpoint.path === "string"
      && Array.isArray(endpoint.cases) && endpoint.cases.every(validCase));
  const endpoints = artifactShape ? plan.endpoints : [];
  const expected = contract.operations.map((operation) => operation.method + ":" + operation.path);
  const actual = endpoints.map((endpoint) => endpoint.method + ":" + endpoint.path);
  const operationCoverage = artifactShape && expected.length === actual.length && new Set(actual).size === actual.length
    && expected.every((key) => actual.includes(key));
  let schemaDerivedCases = operationCoverage, securityResponse = operationCoverage, independenceVerification = operationCoverage;
  const ids = new Set();
  for (const operation of contract.operations) {
    const endpoint = endpoints.find((candidate) => candidate.method === operation.method && candidate.path === operation.path);
    const cases = endpoint?.cases ?? [];
    if (!cases.some((testCase) => testCase.category === "happy" && documented(testCase, operation.successStatuses, ["happy"]))) schemaDerivedCases = false;
    for (const field of operation.fields) {
      const evidence = [];
      if (field.required) evidence.push("required");
      for (const key of ["minLength", "maxLength", "minimum", "maximum"]) if (field[key] !== undefined) evidence.push(key);
      if (field.enumValues) evidence.push("enum");
      if (field.format) evidence.push("format");
      if (!evidence.every((kind) => cases.some((testCase) => witnesses(field, kind, testCase, operation)))) schemaDerivedCases = false;
    }
    for (const header of operation.securityHeaders) {
      if (!cases.some((testCase) => {
        const headers = section(testCase.request, "header");
        return !headers?.[header] && documented(testCase, operation.errorStatuses.filter((status) => status === 401 || status === 403), ["error"]);
      })) securityResponse = false;
      for (const testCase of cases) {
        const headers = section(testCase.request, "header");
        if (headers && Object.prototype.hasOwnProperty.call(headers, header)
          && (typeof headers[header] !== "string" || !/^\$\{[A-Z][A-Z0-9_]*\}$/.test(headers[header]))) securityResponse = false;
      }
    }
    for (const testCase of cases) {
      const documentedStatus = testCase.category === "error"
        ? documented(testCase, operation.errorStatuses, ["error"])
        : documented(testCase, operation.successStatuses, ["happy", "boundary"]);
      if (!documentedStatus) securityResponse = false;
      if (ids.has(testCase.id) || testCase.independent !== true || testCase.timeoutMs > 30000) independenceVerification = false;
      ids.add(testCase.id);
    }
  }
  const caseCount = endpoints.reduce((sum, endpoint) => sum + endpoint.cases.length, 0);
  const reportGrounding = record(report) && report.schemaVersion === "api-test-report/v1"
    && report.bindingId === binding.bindingId && report.input?.path === binding.input.path
    && report.input?.sha256 === inputGrounding.expected && report.programVersion === PROGRAM_VERSION
    && report.publicContract?.schemaVersion === contract.schemaVersion
    && report.publicContract?.supportContractId === contract.supportContractId
    && report.discoverySource === "public-openapi" && report.generatedCaseCount === caseCount
    && report.verification?.status === "not-run" && report.verification?.checker === "independent-public-contract"
    && Array.isArray(report.limitations);
  const checks = { inputGrounding: inputGrounding.pass, artifactShape, operationCoverage, schemaDerivedCases, securityResponse, independenceVerification, reportGrounding };
  const mapping = [
    ["inputGrounding", "INPUT_GROUNDING_FAILED"], ["artifactShape", "INVALID_ARTIFACT_SHAPE"],
    ["operationCoverage", "OPERATION_COVERAGE_FAILED"], ["schemaDerivedCases", "SCHEMA_DERIVED_CASES_FAILED"],
    ["securityResponse", "SECURITY_RESPONSE_FAILED"], ["independenceVerification", "INDEPENDENCE_VERIFICATION_FAILED"],
    ["reportGrounding", "REPORT_GROUNDING_FAILED"],
  ];
  return { checks, errors: mapping.filter(([key]) => !checks[key]).map(([, code]) => code) };
}

const args = argumentsFor(process.argv.slice(2));
const binding = await jsonFile(args.get("--binding")), contract = await jsonFile(args.get("--contract"));
const workdir = path.resolve(args.get("--workdir")), expected = args.get("--input-sha256");
const inputBytes = await readFile(contained(workdir, binding.input.path));
const inputGrounding = { expected, pass: sha256(inputBytes) === expected };
const plan = await jsonFile(contained(workdir, binding.outputs.plan));
const report = await jsonFile(contained(workdir, binding.outputs.report));
const assessment = assess(contract, plan, report, binding, inputGrounding);
const result = {
  schemaVersion: REPORT_VERSION,
  programVersion: PROGRAM_VERSION,
  status: assessment.errors.length === 0 ? "pass" : "fail",
  bindingId: binding.bindingId,
  inputSha256: expected,
  checks: assessment.checks,
  errors: assessment.errors,
};
process.stdout.write(JSON.stringify(result, null, 2) + "\n");
if (result.status !== "pass") process.exitCode = 1;
`;

export function buildApiTesterProductionGeneratorSource(): string {
  return GENERATOR_SOURCE;
}

export function buildApiTesterProductionCheckerSource(): string {
  return CHECKER_SOURCE;
}
