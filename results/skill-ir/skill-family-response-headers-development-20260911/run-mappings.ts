import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { runApiSkillMapping } from "../../../src/skill-ir/api-skill-mapping";
const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const base = "results/skill-ir/skill-family-response-headers-development-20260911/";
const prior = "results/skill-ir/skill-family-deepening-20260911/";
const out = process.argv.find(x => x.startsWith("--out="))?.slice(6);
if (!out || !process.argv.find(x => x.startsWith("--node="))) throw new Error("--out=<new repository-relative directory> --node=<node executable> required");
const nodeExecutable = process.argv.find(x => x.startsWith("--node="))!.slice(7);
const { createContainedDirectory } = await import("../../../src/benchmarks/skill-ir/public-skill-responsibility-corpus-paths");
await createContainedDirectory(process.cwd(), out, "header mapping evidence");
await mkdir(resolve(out, "bindings"));
const bytes = await readFile(base + "source-example-report.json"), examples = JSON.parse(bytes.toString("utf8"));
const analysis = JSON.parse(await readFile(prior + "skill-responsibilities.json", "utf8"));
const selected = examples.documents.filter((d: any) => d.observations.length);
const rows = [];
for (const [member, responsibilityId] of [["lambda", "emit-test-code"], ["jeremy", "response-validation"]]) {
  const old = JSON.parse(await readFile(prior + `baseline-v2/${member}-mapping.json`, "utf8"));
  const responsibility = analysis.skills.find((s: any) => s.skillId === old.skillId)?.responsibilities.find((r: any) => r.id === responsibilityId);
  if (!responsibility) throw new Error("source responsibility missing");
  const tasks = [];
  for (const document of selected) {
    const task = old.tasks.find((t: any) => t.taskId === document.inputId);
    if (!task || task.sha256 !== document.sourceSha256) throw new Error("source-example binding drift");
    const observationPath = `${out}/bindings/${member}-${document.inputId}.json`;
    const observationBytes = JSON.stringify({ schemaVersion: "api-response-header-observations/v1", provenance: "source-example",
      observations: document.observations.map((o: any) => o.observation) }, null, 2) + "\n";
    await writeFile(observationPath, observationBytes, { flag: "wx" });
    tasks.push({ ...task, observationPath, observationSha256: sha(observationBytes) });
  }
  const mappingPath = `${out}/${member}-mapping.json`;
  await writeFile(mappingPath, JSON.stringify({ ...old, mappingId: `${member}-header-observations`, responsibilityId,
    obligations: responsibility.obligations, profile: "api-response-header-observations/v1", tasks }, null, 2) + "\n", { flag: "wx" });
  const report = await runApiSkillMapping({ rootDir: process.cwd(), mappingPath, outputPath: `${out}/${member}`, nodeExecutable });
  for (const task of report.tasks) {
    const original = selected.find((d: any) => d.inputId === task.taskId);
    rows.push({ member, taskId: task.taskId, error: task.error,
      coreChecksEqual: JSON.stringify(task.responseHeaderObservations?.checks) === JSON.stringify(original.observations.map((o: any) => o.check)),
      selectedObligations: task.sourceObligations, residualResponsibilities: report.residualResponsibilities.map(r => r.id),
      wholeSkillCompleted: report.wholeSkillCompleted, originalOutputConformance: report.originalOutputConformance });
  }
}
const report = { status: rows.every(r => !r.error && r.coreChecksEqual) ? "pass" : "fail", exposure: "development-source-examples-not-live",
  parentReportSha256: sha(bytes), mappingImplementationSha256: sha(await readFile("src/skill-ir/api-skill-mapping.ts")),
  uniqueDocuments: selected.length, sharedMembers: 2, rows, realHttpCalls: 0, modelCalls: 0, paidCalls: 0,
  developerAgentCosts: "separate-not-instrumented", independentRealSamplesAdded: 0 };
await writeFile(`${out}/comparison.json`, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ status: report.status, tasks: rows.length, uniqueDocuments: selected.length }));
if (report.status !== "pass") process.exitCode = 1;
