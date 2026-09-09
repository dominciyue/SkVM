import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const PROGRAM_VERSION = "api-tester-production-programs-v2";

function record(value) { return typeof value === "object" && value !== null && !Array.isArray(value); }
function argumentsFor(argv) {
  const known = new Set(["--binding", "--contract", "--workdir", "--input-sha256"]), result = new Map();
  if (argv.length % 2 !== 0) throw new Error("invalid generator arguments");
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
  const base = path.resolve(root), target = path.resolve(base, ...safeRelative(relativePath).split("/"));
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
function stringValue(field, variant = 0) {
  const minimum = field.minLength ?? 0, maximum = field.maxLength ?? Number.POSITIVE_INFINITY;
  if (minimum > maximum) return undefined;
  const token = variant < 62 ? "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"[variant] : variant.toString(36);
  if (field.format === "email") {
    const suffix = "@b.co", local = Math.max(1, minimum - suffix.length);
    const value = "a".repeat(Math.max(0, local - token.length)) + token + suffix;
    return value.length <= maximum ? value : undefined;
  }
  if (field.format === "uri") {
    const base = "https://a.co/" + token, value = base.length >= minimum ? base : base + "x".repeat(minimum - base.length);
    return value.length <= maximum ? value : undefined;
  }
  if (field.format === "date") {
    const value = new Date(Date.UTC(2000, 0, variant + 1)).toISOString().slice(0, 10);
    return value.length >= minimum && value.length <= maximum ? value : undefined;
  }
  if (maximum === 0) return variant === 0 ? "" : undefined;
  const length = Math.max(1, minimum, token.length);
  if (length > maximum) return undefined;
  return "x".repeat(Math.max(0, length - token.length)) + token;
}
function uniqueValues(values) {
  const seen = new Set();
  return values.filter((value) => { const key = JSON.stringify(value); if (seen.has(key)) return false; seen.add(key); return true; });
}
function scalarCandidates(field, count) {
  if (field.enumValues) return uniqueValues(field.enumValues.filter((value) => scalarMatches(field, value))).map((value) => structuredClone(value));
  if (field.type === "integer") {
    const lower = Math.ceil(field.minimum ?? 1), upper = Math.floor(field.maximum ?? lower + Math.max(count, 2) - 1);
    return Array.from({ length: Math.max(0, Math.min(Math.max(count, 2), upper - lower + 1)) }, (_unused, index) => lower + index).filter((value) => scalarMatches(field, value));
  }
  if (field.type === "number") {
    const lower = field.minimum ?? 1, upper = field.maximum, target = Math.max(count, 2);
    const values = upper === undefined ? Array.from({ length: target }, (_unused, index) => lower + index)
      : upper < lower ? [] : upper === lower ? [lower]
      : Array.from({ length: target }, (_unused, index) => lower + ((upper - lower) * index) / (target - 1));
    return uniqueValues(values.filter((value) => scalarMatches(field, value)));
  }
  if (field.type === "boolean") return [true, false].filter((value) => scalarMatches(field, value));
  const result = [];
  for (let index = 0; index < Math.max(count * 2, 64); index++) {
    const value = stringValue(field, index);
    if (value !== undefined && scalarMatches(field, value)) result.push(value);
    if (uniqueValues(result).length >= count) break;
  }
  return uniqueValues(result);
}
function scalarValue(field) {
  const value = scalarCandidates(field, 1)[0];
  if (value === undefined) throw new Error("contract contains an unconstructible scalar");
  return structuredClone(value);
}
function arrayAtCount(field, count) {
  const candidates = scalarCandidates(field.items, field.uniqueItems ? count : 1);
  if (count > 0 && candidates.length === 0) throw new Error("contract contains unconstructible array items");
  if (field.uniqueItems && candidates.length < count) throw new Error("contract contains unconstructible unique array");
  return field.uniqueItems ? candidates.slice(0, count).map((value) => structuredClone(value))
    : Array.from({ length: count }, () => structuredClone(candidates[0]));
}
function validValue(field) {
  if (field.kind === "scalar") return scalarValue(field);
  const minimum = field.minItems ?? 0, maximum = field.maxItems ?? 64;
  const count = minimum === 0 && maximum > 0 ? 1 : minimum;
  return arrayAtCount(field, count);
}
function validField(field, value) {
  if (field.kind === "scalar") return scalarMatches(field, value);
  if (!Array.isArray(value)) return false;
  if (field.minItems !== undefined && value.length < field.minItems) return false;
  if (field.maxItems !== undefined && value.length > field.maxItems) return false;
  if (field.uniqueItems && uniqueValues(value).length !== value.length) return false;
  return value.every((item) => scalarMatches(field.items, item));
}
function scalarWitness(field, kind) {
  if (kind === "minLength") return "x".repeat(field.minLength);
  if (kind === "maxLength") return "x".repeat(field.maxLength);
  if (kind === "minimum" || kind === "maximum") return field[kind];
  return scalarValue(field);
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
function witnessValue(field, kind) {
  if (field.kind === "scalar") return scalarWitness(field, kind);
  if (kind === "minItems") return arrayAtCount(field, field.minItems);
  if (kind === "maxItems") return arrayAtCount(field, field.maxItems);
  if (kind === "uniqueItems") return validValue(field);
  const value = validValue(field), itemKind = kind.slice("item.".length);
  if (value.length === 0) throw new Error("array cannot witness an item constraint");
  value[0] = scalarWitness(field.items, itemKind);
  return value;
}
function caseRecord(id, category, request, expectedStatus) {
  return { id, category, request, expectedStatus, assertions: ["status"], independent: true, timeoutMs: 5000 };
}
function slug(value) { return value.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "root"; }
function arrayEncodings(operation) {
  return operation.fields.filter((field) => field.kind === "array" && field.location === "query").map((field) => ({
    location: field.location,
    name: field.name,
    ...field.encoding,
  }));
}
function createPlan(contract) {
  return {
    schemaVersion: "api-test-plan/v2",
    source: "public-openapi",
    framework: "node:test",
    endpoints: contract.operations.map((operation, operationIndex) => {
      const base = {};
      for (const field of operation.fields) setValue(base, field, validValue(field));
      for (const header of operation.securityHeaders) section(base, "header")[header] = "${API_TEST_TOKEN}";
      const success = operation.successStatuses[0], error = operation.errorStatuses[0];
      const prefix = "op-" + operationIndex + "-" + operation.method.toLowerCase() + "-" + slug(operation.path);
      const cases = [caseRecord(prefix + "-happy", "happy", structuredClone(base), success)];
      operation.fields.forEach((field, fieldIndex) => {
        evidenceFor(field).forEach((kind, evidenceIndex) => {
          const request = structuredClone(base);
          if (kind === "required") {
            deleteValue(request, field);
            cases.push(caseRecord(prefix + "-field-" + fieldIndex + "-" + evidenceIndex + "-required", "error", request, error));
            return;
          }
          const value = witnessValue(field, kind);
          setValue(request, field, value);
          const valid = validField(field, value);
          if (!valid && error === undefined) throw new Error("constraint witness requires an explicit error response");
          cases.push(caseRecord(prefix + "-field-" + fieldIndex + "-" + evidenceIndex + "-" + kind, valid ? "boundary" : "error", request, valid ? success : error));
        });
      });
      if (operation.securityHeaders.length > 0) {
        const request = structuredClone(base);
        for (const header of operation.securityHeaders) delete section(request, "header")[header];
        const unauthorized = operation.errorStatuses.find((status) => status === 401 || status === 403);
        cases.push(caseRecord(prefix + "-unauthorized", "error", request, unauthorized));
      }
      return { method: operation.method, path: operation.path, arrayParameterEncodings: arrayEncodings(operation), cases };
    }),
  };
}
function countCases(plan) { return plan.endpoints.reduce((sum, endpoint) => sum + endpoint.cases.length, 0); }

const args = argumentsFor(process.argv.slice(2));
const binding = await jsonFile(args.get("--binding")), contract = await jsonFile(args.get("--contract"));
const workdir = path.resolve(args.get("--workdir")), expectedInputSha256 = args.get("--input-sha256");
const inputBytes = await readFile(contained(workdir, binding.input.path));
if (sha256(inputBytes) !== expectedInputSha256) throw new Error("protected input digest mismatch");
const planPath = contained(workdir, binding.outputs.plan), reportPath = contained(workdir, binding.outputs.report);
for (const output of [planPath, reportPath]) {
  try { await access(output); throw new Error("production output already exists: " + output); } catch (error) {
    if (error && error.code !== "ENOENT") throw error;
  }
}
const plan = createPlan(contract);
const report = {
  schemaVersion: "api-test-report/v2",
  bindingId: binding.bindingId,
  input: { path: binding.input.path, sha256: expectedInputSha256 },
  publicContract: { schemaVersion: contract.schemaVersion, supportContractId: contract.supportContractId },
  programVersion: PROGRAM_VERSION,
  discoverySource: "public-openapi",
  generatedCaseCount: countCases(plan),
  verification: { status: "not-run", checker: "independent-public-contract-v2" },
  limitations: [],
};
await Promise.all([mkdir(path.dirname(planPath), { recursive: true }), mkdir(path.dirname(reportPath), { recursive: true })]);
await writeFile(planPath, JSON.stringify(plan, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
