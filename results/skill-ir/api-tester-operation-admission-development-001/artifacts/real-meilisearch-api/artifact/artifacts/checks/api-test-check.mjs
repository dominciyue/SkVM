import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const PROGRAM_VERSION = "api-tester-production-programs-v2";
const REPORT_VERSION = "skill-ir-api-tester-production-validation-report/v2";

function record(value) { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exactKeys(value, keys) { return record(value) && Object.keys(value).sort().join("|") === [...keys].sort().join("|"); }
function argumentsFor(argv) {
  const known = new Set(["--binding", "--contract", "--workdir", "--input-sha256"]), result = new Map();
  if (argv.length % 2 !== 0) throw new Error("invalid checker arguments");
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
function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number), date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
function validFormat(format, value) {
  if (format === "email") return typeof value === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
  if (format === "uri") { if (typeof value !== "string") return false; try { new URL(value); return true; } catch { return false; } }
  if (format === "date") return validDate(value);
  if (format === "float" || format === "double") return typeof value === "number" && Number.isFinite(value);
  return !format;
}
function deepEqual(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function uniqueValues(values) { return new Set(values.map((value) => JSON.stringify(value))).size; }
function scalarMatches(field, value) {
  if (field.type === "string" && typeof value !== "string") return false;
  if (field.type === "integer" && (typeof value !== "number" || !Number.isInteger(value))) return false;
  if (field.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) return false;
  if (field.type === "boolean" && typeof value !== "boolean") return false;
  if (typeof value === "string" && ((field.minLength !== undefined && value.length < field.minLength) || (field.maxLength !== undefined && value.length > field.maxLength))) return false;
  if (typeof value === "number" && ((field.minimum !== undefined && value < field.minimum) || (field.maximum !== undefined && value > field.maximum))) return false;
  if (field.enumValues && !field.enumValues.some((candidate) => deepEqual(candidate, value))) return false;
  return !field.format || validFormat(field.format, value);
}
function validField(field, value) {
  if (field.kind === "scalar") return scalarMatches(field, value);
  return Array.isArray(value)
    && (field.minItems === undefined || value.length >= field.minItems)
    && (field.maxItems === undefined || value.length <= field.maxItems)
    && (!field.uniqueItems || uniqueValues(value) === value.length)
    && value.every((item) => scalarMatches(field.items, item));
}
function scalarWitness(field, kind, value, valid, invalid) {
  if (kind === "minLength" && typeof value === "string") return (valid && value.length === field.minLength) || (invalid && value.length < field.minLength);
  if (kind === "maxLength" && typeof value === "string") return (valid && value.length === field.maxLength) || (invalid && value.length > field.maxLength);
  if (kind === "minimum" && typeof value === "number") return (valid && value === field.minimum) || (invalid && value < field.minimum);
  if (kind === "maximum" && typeof value === "number") return (valid && value === field.maximum) || (invalid && value > field.maximum);
  if (kind === "enum") return (valid && field.enumValues.some((entry) => deepEqual(entry, value))) || (invalid && !field.enumValues.some((entry) => deepEqual(entry, value)));
  if (kind === "format") return (valid && validFormat(field.format, value)) || (invalid && !validFormat(field.format, value));
  return false;
}
function evidenceFor(field) {
  const result = [];
  if (field.required) result.push("required");
  if (field.kind === "scalar") {
    for (const key of ["minLength", "maxLength", "minimum", "maximum"]) if (field[key] !== undefined) result.push(key);
    if (field.enumValues) result.push("enum");
    if (field.format) result.push("format");
  } else {
    for (const key of ["minItems", "maxItems"]) if (field[key] !== undefined) result.push(key);
    if (field.uniqueItems) result.push("uniqueItems");
    for (const key of ["minLength", "maxLength", "minimum", "maximum"]) if (field.items[key] !== undefined) result.push("item." + key);
    if (field.items.enumValues) result.push("item.enum");
    if (field.items.format) result.push("item.format");
  }
  return result;
}
function witnesses(field, kind, testCase, operation) {
  const found = observed(testCase, field), valid = documented(testCase, operation.successStatuses, ["boundary"]), invalid = documented(testCase, operation.errorStatuses, ["error"]);
  if (kind === "required") return !found.present && invalid;
  if (!found.present) return false;
  if (field.kind === "scalar") return scalarWitness(field, kind, found.value, valid, invalid);
  if (!Array.isArray(found.value)) return false;
  if (kind === "minItems") return (valid && found.value.length === field.minItems) || (invalid && found.value.length < field.minItems);
  if (kind === "maxItems") return (valid && found.value.length === field.maxItems) || (invalid && found.value.length > field.maxItems);
  if (kind === "uniqueItems") return (valid && uniqueValues(found.value) === found.value.length) || (invalid && uniqueValues(found.value) < found.value.length);
  const itemKind = kind.slice("item.".length);
  return found.value.some((item) => scalarWitness(field.items, itemKind, item, valid, invalid));
}
function validCase(testCase) {
  return exactKeys(testCase, ["id", "category", "request", "expectedStatus", "assertions", "independent", "timeoutMs"])
    && typeof testCase.id === "string" && testCase.id.length > 0
    && ["happy", "boundary", "error"].includes(testCase.category) && record(testCase.request)
    && Object.keys(testCase.request).every((key) => ["body", "path", "query", "headers"].includes(key) && record(testCase.request[key]))
    && Number.isInteger(testCase.expectedStatus) && Array.isArray(testCase.assertions)
    && testCase.assertions.length > 0 && testCase.assertions.every((entry) => typeof entry === "string" && entry.length > 0)
    && testCase.independent === true && Number.isInteger(testCase.timeoutMs) && testCase.timeoutMs > 0 && testCase.timeoutMs <= 30000;
}
function expectedEncodings(operation) {
  return operation.fields.filter((field) => field.kind === "array" && field.location === "query").map((field) => ({ location: "query", name: field.name, ...field.encoding }));
}
function validEncoding(value) {
  return exactKeys(value, ["location", "name", "style", "explode", "wireFormat"])
    && value.location === "query" && typeof value.name === "string" && value.name.length > 0
    && value.style === "form" && typeof value.explode === "boolean"
    && value.wireFormat === (value.explode ? "repeated-value" : "comma-separated");
}
function assess(contract, plan, report, binding, inputGrounding) {
  const artifactShape = exactKeys(plan, ["schemaVersion", "source", "framework", "endpoints"])
    && plan.schemaVersion === "api-test-plan/v2" && plan.source === "public-openapi" && plan.framework === "node:test"
    && Array.isArray(plan.endpoints) && plan.endpoints.every((endpoint) => exactKeys(endpoint, ["method", "path", "arrayParameterEncodings", "cases"])
      && typeof endpoint.method === "string" && typeof endpoint.path === "string"
      && Array.isArray(endpoint.arrayParameterEncodings) && endpoint.arrayParameterEncodings.every(validEncoding)
      && Array.isArray(endpoint.cases) && endpoint.cases.every(validCase));
  const endpoints = artifactShape ? plan.endpoints : [];
  const expected = contract.operations.map((operation) => operation.method + ":" + operation.path);
  const actual = endpoints.map((endpoint) => endpoint.method + ":" + endpoint.path);
  const operationCoverage = artifactShape && expected.length === actual.length && new Set(actual).size === actual.length
    && expected.every((key) => actual.includes(key));
  let arrayEncoding = operationCoverage, schemaDerivedCases = operationCoverage, securityResponse = operationCoverage, independenceVerification = operationCoverage;
  const ids = new Set();
  for (const operation of contract.operations) {
    const endpoint = endpoints.find((candidate) => candidate.method === operation.method && candidate.path === operation.path);
    const cases = endpoint?.cases ?? [];
    if (JSON.stringify(endpoint?.arrayParameterEncodings ?? []) !== JSON.stringify(expectedEncodings(operation))) arrayEncoding = false;
    const happy = cases.some((testCase) => testCase.category === "happy"
      && documented(testCase, operation.successStatuses, ["happy"])
      && operation.fields.every((field) => { const value = observed(testCase, field); return value.present && validField(field, value.value); }));
    if (!happy) schemaDerivedCases = false;
    for (const field of operation.fields) {
      if (!evidenceFor(field).every((kind) => cases.some((testCase) => witnesses(field, kind, testCase, operation)))) schemaDerivedCases = false;
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
      if (ids.has(testCase.id)) independenceVerification = false;
      ids.add(testCase.id);
    }
  }
  const caseCount = endpoints.reduce((sum, endpoint) => sum + endpoint.cases.length, 0);
  const reportGrounding = exactKeys(report, ["schemaVersion", "bindingId", "input", "publicContract", "programVersion", "discoverySource", "generatedCaseCount", "verification", "limitations"])
    && report.schemaVersion === "api-test-report/v2" && report.bindingId === binding.bindingId
    && exactKeys(report.input, ["path", "sha256"]) && report.input.path === binding.input.path && report.input.sha256 === inputGrounding.expected
    && exactKeys(report.publicContract, ["schemaVersion", "supportContractId"])
    && report.publicContract.schemaVersion === contract.schemaVersion && report.publicContract.supportContractId === contract.supportContractId
    && report.programVersion === PROGRAM_VERSION && report.discoverySource === "public-openapi" && report.generatedCaseCount === caseCount
    && exactKeys(report.verification, ["status", "checker"]) && report.verification.status === "not-run"
    && report.verification.checker === "independent-public-contract-v2" && Array.isArray(report.limitations);
  const checks = { inputGrounding: inputGrounding.pass, artifactShape, operationCoverage, arrayEncoding, schemaDerivedCases, securityResponse, independenceVerification, reportGrounding };
  const mapping = [
    ["inputGrounding", "INPUT_GROUNDING_FAILED"], ["artifactShape", "INVALID_ARTIFACT_SHAPE"],
    ["operationCoverage", "OPERATION_COVERAGE_FAILED"], ["arrayEncoding", "ARRAY_ENCODING_FAILED"],
    ["schemaDerivedCases", "SCHEMA_DERIVED_CASES_FAILED"], ["securityResponse", "SECURITY_RESPONSE_FAILED"],
    ["independenceVerification", "INDEPENDENCE_VERIFICATION_FAILED"], ["reportGrounding", "REPORT_GROUNDING_FAILED"],
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
