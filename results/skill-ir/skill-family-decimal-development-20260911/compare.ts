import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { parse } from "yaml";
import { createSchemaChecker } from "../../../src/skill-ir/api-schema-checker";
const out = process.argv.find(v => v.startsWith("--out="))?.slice(6);
if (!out) throw new Error("--out=<new-report> required");
const checks = [];
for (const divisorCents of [1,2,5,10,25]) {
  const check = createSchemaChecker({}, { type: "number", multipleOf: divisorCents / 100 });
  for (let cents = -50; cents <= 50; cents++) checks.push({ divisorCents, cents, expected: cents % divisorCents === 0, actual: check(cents / 100) });
}
const indexPath = "results/skill-ir/skill-family-deepening-20260911/api-inputs/inputs.json";
const index = JSON.parse(await readFile(indexPath, "utf8")), occurrences: any[] = [], inputs = [];
for (const input of index.inputs) {
  const bytes = await readFile(resolve(dirname(indexPath), input.localPath)), hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== input.sha256) throw new Error("input digest drift");
  inputs.push({ inputId: input.inputId, sha256: hash });
  function walk(v: any, pointer: string) {
    if (!v || typeof v !== "object") return;
    for (const [key, value] of Object.entries(v)) {
      const p = `${pointer}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;
      if (key === "multipleOf") occurrences.push({ inputId: input.inputId, pointer: p, value });
      walk(value, p);
    }
  }
  walk(input.format === "json" ? JSON.parse(bytes.toString("utf8")) : parse(bytes.toString("utf8")), "");
}
const mismatches = checks.filter(v => v.actual.status !== "checked" || v.actual.valid !== v.expected);
await writeFile(out, JSON.stringify({ exposure: "development", checkerSha256: createHash("sha256").update(await readFile("src/skill-ir/api-schema-checker.ts")).digest("hex"), checks, mismatchCount: mismatches.length, inputs, multipleOfOccurrences: occurrences }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ checks: checks.length, mismatches: mismatches.length, realOccurrences: occurrences.length }));
