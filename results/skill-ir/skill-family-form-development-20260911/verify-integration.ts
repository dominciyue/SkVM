import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
const root = process.cwd(), output = process.argv[2];
if (!output) throw new Error("new output path required");
const base = "results/skill-ir/skill-family-form-development-20260911";
const load = async (path: string) => JSON.parse(await readFile(resolve(root, path), "utf8"));
const summary = await load(`${base}/cross-member/report.json`), rows = [];
for (const member of summary.members) {
  const bytes = await readFile(resolve(root, member.reportPath)), report = JSON.parse(bytes.toString("utf8"));
  for (const task of report.tasks) {
    const panel = await load(`${base}/first-run/${task.taskId}.json`);
    rows.push({ member: member.mappingId, taskId: task.taskId, reportPath: member.reportPath,
      reportSha256: createHash("sha256").update(bytes).digest("hex"),
      exactPanelReport: JSON.stringify(task.requestSpecimensReport) === JSON.stringify(panel.report),
      exactVerification: JSON.stringify(task.requestSpecimensVerification) === JSON.stringify(panel.verification),
      error: task.error, wholeSkillCompleted: report.wholeSkillCompleted, originalOutputConformance: report.originalOutputConformance,
      sourceObligations: task.sourceObligations });
  }
}
const status = summary.members.every((m: any) => m.error === null) && rows.length === summary.plannedSkillInputTasks
  && rows.every((r) => r.exactPanelReport && r.exactVerification && r.error === null && r.wholeSkillCompleted === false
    && r.originalOutputConformance === "not-implemented-by-request-specimens" && r.sourceObligations.every((o: any) => o.status === "not-fully-verified")) ? "pass" : "fail";
await writeFile(resolve(root, output), JSON.stringify({ exposure: "development", status, rows,
  scriptSha256: createHash("sha256").update(await readFile(import.meta.path)).digest("hex") }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ status, tasks: rows.length }));
if (status !== "pass") process.exitCode = 1;
