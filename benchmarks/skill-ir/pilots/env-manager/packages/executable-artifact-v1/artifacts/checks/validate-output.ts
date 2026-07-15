import { readFile } from "node:fs/promises";
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
