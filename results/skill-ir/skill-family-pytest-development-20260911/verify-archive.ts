import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
const root = process.cwd(), output = process.argv[2];
if (!output) throw new Error("new output file required");
const base = "results/skill-ir/skill-family-pytest-development-20260911", form = "results/skill-ir/skill-family-form-development-20260911/first-run";
const sha = (v: Buffer | string) => createHash("sha256").update(v).digest("hex");
const load = async (path: string) => JSON.parse(await readFile(resolve(root, path), "utf8"));
const batch = await load(`${base}/first-run/report.json`), panel = [];
for (const row of batch.rows) {
  const bytes = await readFile(resolve(root, base, "first-run", row.inputId, "suite.json"));
  const python = await readFile(resolve(root, base, "first-run", row.inputId, "test_api_requests.py"));
  const junit = await readFile(resolve(root, base, "first-run", row.inputId, "pytest.junit.xml"));
  const suite = JSON.parse(bytes.toString("utf8")), prior = await load(`${form}/${row.inputId}.json`);
  panel.push({ inputId: row.inputId, suiteSha256: sha(bytes), testPythonSha256: sha(python), junitSha256: sha(junit),
    storedHashesMatch: sha(bytes) === row.suiteSha256 && sha(python) === row.testPythonSha256,
    formSpecimensExact: JSON.stringify(suite.specimens) === JSON.stringify(prior.report),
    allSkipped: row.status === "collected-all-skipped" && row.python.counts.tests === suite.rows.length && row.python.counts.skipped === suite.rows.length,
    collectedCases: suite.rows.length, constructedCases: row.verification.constructedCases, placeholders: suite.rows.filter((r: any) => r.status === "inventory-unresolved").length });
}
const mapping = await load(`${base}/cross-member/report.json`), mapped = [];
for (const member of mapping.members) {
  const report = await load(member.reportPath);
  for (const task of report.tasks) {
    const files = task.pytestSuiteFiles;
    const bytes = await readFile(resolve(root, files.suitePath)), python = await readFile(resolve(root, files.testPythonPath));
    const prior = panel.find((r) => r.inputId === task.taskId);
    mapped.push({ member: member.mappingId, taskId: task.taskId, suitePath: files.suitePath, testPythonPath: files.testPythonPath,
      exactPanelBytes: sha(bytes) === prior?.suiteSha256 && sha(python) === prior.testPythonSha256,
      status: task.error === null && task.pytestSuiteVerification.status === "pass" ? "pass" : "fail",
      wholeSkillCompleted: report.wholeSkillCompleted, nativeClaim: report.originalOutputConformance,
      sourceObligations: task.sourceObligations });
  }
}
const status = panel.length === batch.rows.length && panel.every((r) => r.storedHashesMatch && r.formSpecimensExact && r.allSkipped)
  && mapped.length === mapping.plannedSkillInputTasks && mapped.every((r) => r.exactPanelBytes && r.status === "pass"
    && r.wholeSkillCompleted === false && r.nativeClaim === "pytest-profile-runtime-not-evaluated") ? "pass" : "fail";
await writeFile(resolve(root, output), JSON.stringify({ exposure: "development", status, panel, mapped,
  totals: { documents: panel.length, collected: panel.reduce((n, r) => n + r.collectedCases, 0), constructed: panel.reduce((n, r) => n + r.constructedCases, 0),
    incompleteOperationPlaceholders: panel.reduce((n, r) => n + r.placeholders, 0), realHttpCalls: 0 },
  scriptSha256: sha(await readFile(import.meta.path)) }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ status, documents: panel.length, mappingTasks: mapped.length }));
if (status !== "pass") process.exitCode = 1;
