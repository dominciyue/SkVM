// Derived accounting only; never reruns acquisition, models or candidate execution.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = "results/skill-ir/", initial = root + "skill-family-deepening-20260911/", followup = root + "skill-family-new-members-20260911-r5/";
const bindings: Array<{ path: string; sha256: string }> = [];
async function read(path: string) { const b = await readFile(path); bindings.push({ path, sha256: createHash("sha256").update(b).digest("hex") }); return JSON.parse(b.toString("utf8")); }
function changes(a: any, b: any, path = ""): any[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (a && b && typeof a === "object" && typeof b === "object") return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap(k => changes(a[k], b[k], `${path}/${k}`));
  return [{ path, before: a ?? null, after: b ?? null }];
}
const analysis = await read(followup + "skill-responsibilities.json"), repairedAnalysis = await read(followup + "skill-responsibilities-2.json");
const first = await read(followup + "first-run/report.json"), repaired = await read(followup + "mapping-repair-run/report.json"), preflight = await read(followup + "preflight.json");
const members = [];
for (const member of first.members) {
  const mapping = await read(member.mappingPath), later = repaired.members.find((m: any) => m.mappingId === member.mappingId);
  const executed = member.error ? later : member;
  if (!executed || executed.error) throw new Error("expected executed follow-up result missing");
  const report = await read(executed.reportPath), declared = analysis.skills.find((s: any) => s.skillId === member.skillId);
  if (!declared || report.tasks.length !== mapping.tasks.length) throw new Error("source/task accounting mismatch");
  members.push({ skillId: member.skillId, mappingId: member.mappingId, extraction: analysis.extraction,
    bodyLinesDeclaredFirst: declared.bodyLines, responsibilityCount: declared.responsibilities.length,
    selectedObligationCount: mapping.obligations.length, generatedTaskBindings: mapping.tasks.length,
    firstAttemptError: member.error, firstAttemptExecutedTasks: member.taskTotals.length,
    repairAttemptExecutedTasks: later?.taskTotals.length ?? 0,
    selectedResponsibility: report.selectedResponsibility, residualResponsibilities: report.residualResponsibilities,
    executionMillis: report.tasks.reduce((n: number, t: any) => n + t.elapsedMillis, 0),
    taskErrors: report.tasks.filter((t: any) => t.error).length, originalOutputConformance: report.originalOutputConformance,
    wholeSkillCompleted: report.wholeSkillCompleted, accounting: report.accounting,
    configurationSizeNotHumanEffort: true, extractionAgentTokens: null, extractionAgentCostUsd: null, humanMinutes: null });
}
const model = await read(initial + "model-comparison-first/report.json");
const report = { exposure: "development-derived-accounting", bindings,
  interpretation: "Existing recorded effort only; configuration size is not human time or automatic semantic extraction. No new experiment.",
  mappingRepairChanges: changes(analysis, repairedAnalysis), firstExecutionCommit: first.executionCommit,
  repairExecutionCommit: repaired.executionCommit, frozenCodePreflightPassed: preflight.allFrozenHashesMatch,
  members, modelComparison: { executionCommit: model.executionCommit, matchedTasks: model.rows.length,
    independentApiOperations: new Set(model.rows.map((r: any) => `${r.inputSha256}:${r.operationKey}`)).size,
    skillContexts: new Set(model.rows.map((r: any) => r.skillId)).size,
    deterministicPassed: model.rows.reduce((n: number, r: any) => n + r.deterministic.grade.passed, 0),
    modelPassed: model.rows.reduce((n: number, r: any) => n + r.model.grade.passed, 0),
    witnessObligations: model.rows.reduce((n: number, r: any) => n + r.model.grade.total, 0),
    deterministicMillis: model.rows.reduce((n: number, r: any) => n + r.deterministic.elapsedMs, 0),
    modelMillis: model.rows.reduce((n: number, r: any) => n + r.model.elapsedMs, 0),
    httpAttempts: model.rows.reduce((n: number, r: any) => n + r.model.httpAttempts, 0),
    inputTokens: model.rows.reduce((n: number, r: any) => n + r.model.tokens.input, 0),
    outputTokens: model.rows.reduce((n: number, r: any) => n + r.model.tokens.output, 0),
    costUsd: null, costReason: "provider adapter did not return billing", wholeSkillBenchmark: model.wholeSkillBenchmark },
  remainingMeasurementGaps: ["historical extraction/onboarding agent duration and tokens not instrumented", "actual billing unavailable", "native/full-duty comparison not measured"],
  newRemoteCalls: 0, newPaidCalls: 0, developerAgentCost: "unmeasured-separate" };
const output = process.argv.find(a => a.startsWith("--out="))?.slice(6);
if (!output) throw new Error("--out=<new-file> required");
await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ members: members.length, changes: report.mappingRepairChanges, modelComparison: report.modelComparison }));
