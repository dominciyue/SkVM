import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { verifyApiRequestCases } from "../../src/skill-ir/api-request-cases-checker";

const arg = (key: string) => process.argv.find((s) => s.startsWith(`--${key}=`))?.slice(key.length + 3);
if (import.meta.main) {
  const priorPath = arg("prior"), currentPath = arg("current");
  if (!priorPath || !currentPath) throw new Error("--prior=<mapping-report.json> --current=<new-mapping-report.json>");
  const priorBytes = await readFile(priorPath), currentBytes = await readFile(currentPath);
  const prior = JSON.parse(priorBytes.toString()), current = JSON.parse(currentBytes.toString());
  const mappingPath = arg("mapping");
  if (!mappingPath) throw new Error("--mapping=<source-bound-mapping.json>");
  const mapping = JSON.parse(await readFile(mappingPath, "utf8"));
  const rows = [];
  for (const task of mapping.tasks) {
    const bytes = await readFile(resolve(task.inputPath));
    if (createHash("sha256").update(bytes).digest("hex") !== task.sha256) throw new Error("input digest mismatch");
    const old = prior.tasks.find((t: any) => t.taskId === task.taskId);
    const next = current.tasks.find((t: any) => t.taskId === task.taskId);
    if (!old?.requestCasesReport || !next?.requestCasesReport) throw new Error("missing task artifact");
    const oldRecheck = verifyApiRequestCases(bytes.toString(), task.format, old.requestCasesReport);
    const changes = [];
    for (const op of next.requestCasesReport.operations) {
      const oldOp = old.requestCasesReport.operations.find((o: any) => o.key === op.key);
      for (const field of op.schemas) for (const c of field.cases.cases) {
        const oldCase = oldOp?.schemas.find((s: any) => s.id === field.id)?.cases.cases.find((x: any) => x.id === c.id);
        if (!oldCase || oldCase.status !== c.status || JSON.stringify(oldCase.value) !== JSON.stringify(c.value))
          changes.push({ operation: op.key, schema: field.id, case: c.id, priorStatus: oldCase?.status ?? null,
            currentStatus: c.status, valueChanged: JSON.stringify(oldCase?.value) !== JSON.stringify(c.value) });
      }
    }
    rows.push({ taskId: task.taskId, oldRecheck, currentVerification: next.requestCasesVerification, changes });
  }
  const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
  const sourceFiles = ["src/skill-ir/api-schema-checker.ts", "src/skill-ir/api-schema-obligations.ts",
    "src/skill-ir/api-schema-cases.ts", "src/skill-ir/api-schema-case-checker.ts"];
  const report = { exposure: "development", priorPath, currentPath, priorSha256: digest(priorBytes), currentSha256: digest(currentBytes),
    sourceBindings: await Promise.all(sourceFiles.map(async (path) => ({ path, sha256: digest(await readFile(path)) }))), rows,
    limitation: "Recheck of already exposed cases; unchanged coverage does not erase synthetic false-acceptance evidence or establish full-skill correctness" };
  const out = arg("out");
  if (!out) throw new Error("--out=<new-recheck-report.json>");
  await writeFile(out, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify(rows.map((r) => ({ task: r.taskId, oldStatus: r.oldRecheck.status,
    oldErrors: r.oldRecheck.errors, newStatus: r.currentVerification.status, changedCases: r.changes.length }))));
}
