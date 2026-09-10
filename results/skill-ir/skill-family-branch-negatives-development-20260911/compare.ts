import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const sha = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
const out = process.argv.find((s) => s.startsWith("--out="))?.slice(6);
if (!out) throw new Error("--out=<new-comparison.json>");
const root = "results/skill-ir/skill-family-branch-negatives-development-20260911";
const previous = "results/skill-ir/skill-family-body-negatives-development-20260911/first-run";
const index = JSON.parse(await readFile("results/skill-ir/skill-family-deepening-20260911/api-inputs/inputs.json", "utf8"));
const rows = [], changes = [], failures: string[] = [];
const total = { operations: 0, fieldObligations: 0, previousFieldCovered: 0, currentFieldCovered: 0,
  bodyObligations: 0, previousBodyConstructed: 0, currentBodyConstructed: 0, currentBodyUnresolved: 0 };
function inventory(report: any, kind: "field" | "body") {
  const entries: Array<[string, any]> = kind === "body"
    ? report.operations.flatMap((o: any) => o.cases.map((c: any) => [JSON.stringify([o.key, c.id]), c]))
    : report.fields.operations.flatMap((o: any) => o.schemas.flatMap((s: any) => s.cases.cases.map((c: any) => [JSON.stringify([o.key, s.id, c.id]), c])));
  const map = new Map<string, any>(entries);
  if (map.size !== entries.length) throw new Error("duplicate case identities");
  return map;
}
for (const input of index.inputs) {
  const priorPath = `${previous}/${input.inputId}.json`, currentPath = `${root}/first-run/${input.inputId}.json`;
  const priorBytes = await readFile(priorPath), currentBytes = await readFile(currentPath);
  const old = JSON.parse(priorBytes.toString()), now = JSON.parse(currentBytes.toString());
  const baselineUnchanged = JSON.stringify(old.report.specimens) === JSON.stringify(now.report.specimens);
  const sourceFieldsUnchanged = JSON.stringify(old.report.fields.operations.map((o: any) => [o.key, o.projectedOperation, o.issues, o.sourceAdvisories])) ===
    JSON.stringify(now.report.fields.operations.map((o: any) => [o.key, o.projectedOperation, o.issues, o.sourceAdvisories]));
  if (!baselineUnchanged || !sourceFieldsUnchanged || now.verification.status !== "pass") failures.push(`${input.inputId}: baseline/source/check changed`);
  const row: any = { inputId: input.inputId, priorPath, priorSha256: sha(priorBytes), currentPath, currentSha256: sha(currentBytes), baselineUnchanged, sourceFieldsUnchanged, verification: now.verification.status };
  total.operations += now.report.operations.length;
  for (const kind of ["field", "body"] as const) {
    const a = inventory(old.report, kind), b = inventory(now.report, kind);
    const idsEqual = JSON.stringify([...a.keys()]) === JSON.stringify([...b.keys()]);
    if (!idsEqual) failures.push(`${input.inputId}:${kind}: inventory changed`);
    let unchangedSuccesses = 0, newlyCovered = 0;
    const success = kind === "field" ? "covered" : "constructed";
    for (const [id, before] of a) {
      const after = b.get(id);
      if (!after) continue;
      if (before.status === success) {
        if (JSON.stringify(before) !== JSON.stringify(after)) failures.push(`${input.inputId}:${kind}:${id}: old success changed`);
        else unchangedSuccesses++;
      } else if (JSON.stringify(before) !== JSON.stringify(after)) {
        changes.push({ inputId: input.inputId, kind, id, before, after });
        if (before.status === "unresolved" && after.status === success) newlyCovered++;
        else failures.push(`${input.inputId}:${kind}:${id}: unexpected non-success change`);
      }
    }
    row[kind] = { inventoryEqual: idsEqual, cases: b.size, unchangedSuccesses, newlyCovered };
    if (kind === "field") {
      total.fieldObligations += b.size; total.previousFieldCovered += [...a.values()].filter((c) => c.status === success).length;
      total.currentFieldCovered += [...b.values()].filter((c) => c.status === success).length;
    } else {
      total.bodyObligations += b.size; total.previousBodyConstructed += [...a.values()].filter((c) => c.status === success).length;
      total.currentBodyConstructed += [...b.values()].filter((c) => c.status === success).length;
      total.currentBodyUnresolved += [...b.values()].filter((c) => c.status === "unresolved").length;
    }
  }
  rows.push(row);
}
const integrations = [];
for (const member of ["lambda", "jeremy", "pactflow"]) {
  const path = `${root}/cross-member/${member}/report.json`, bytes = await readFile(path), report = JSON.parse(bytes.toString());
  for (const task of report.tasks) {
    const base = JSON.parse(await readFile(`${root}/first-run/${task.taskId}.json`, "utf8"));
    const equal = JSON.stringify(task.requestBodyNegativesReport) === JSON.stringify(base.report);
    const residualsRetained = !report.wholeSkillCompleted && task.sourceObligations.every((o: any) => o.status === "not-fully-verified");
    if (task.error || !equal || !residualsRetained || task.requestBodyNegativesVerification?.status !== "pass") failures.push(`${member}:${task.taskId}: integration mismatch`);
    integrations.push({ member, inputId: task.taskId, reportPath: path, reportSha256: sha(bytes), equal, residualsRetained, verification: task.requestBodyNegativesVerification });
  }
}
const result = { exposure: "development-existing-panel", rows, changes, total, integrations, failures, pass: failures.length === 0,
  note: "Field and body changes are overlapping views of the same20 new negative values, not40 independent successes. Old successful case values and baseline specimens must remain exact.",
  projectModelCalls: 0, paidCalls: 0, developerAgentCost: "unmeasured-separate", comparisonScriptSha256: sha(await readFile(import.meta.path)) };
await writeFile(out, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ total, failures, pass: result.pass }));
if (!result.pass) process.exitCode = 1;
