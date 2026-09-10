import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { runSkillFamilyBaseline } from "./skill-family-baseline";
import { getSchemaCheckerCacheMetrics } from "../../src/skill-ir/api-schema-checker";

// Same deterministic baseline runner; comparison is on complete semantic payloads,
// never merely pass counts. Output directories must be newly allocated by that runner.
const argument = (name: string) => process.argv.find((v) => v.startsWith(`--${name}=`))?.slice(name.length + 3);
if (import.meta.main) {
  const configPath = argument("config"), priorPath = argument("prior"), outputPath = argument("out");
  const nodeExecutable = Bun.which("node");
  if (!configPath || !priorPath || !outputPath || !nodeExecutable) throw new Error("--config=<path> --prior=<baseline-directory> --out=<new-directory>");
  const rootDir = process.cwd();
  const read = async (path: string) => JSON.parse(await readFile(resolve(rootDir, path), "utf8"));
  const prior = await read(`${priorPath}/report.json`);
  const metricsBefore = getSchemaCheckerCacheMetrics();
  const result = await runSkillFamilyBaseline({ rootDir, configPath, outputPath, nodeExecutable });
  const comparisons = [];
  for (const member of result.members) {
    const previous = prior.members.find((m: any) => m.mappingId === member.mappingId);
    if (!previous || member.error) throw new Error(`missing or failed member: ${member.mappingId}`);
    const oldReport = await read(previous.reportPath), newReport = await read(member.reportPath);
    if (oldReport.tasks.length !== newReport.tasks.length) throw new Error("task denominator changed");
    for (const task of newReport.tasks) {
      const old = oldReport.tasks.find((t: any) => t.taskId === task.taskId);
      comparisons.push({ member: member.mappingId, taskId: task.taskId,
        equal: !!old && isDeepStrictEqual(old.requestCasesReport, task.requestCasesReport)
          && isDeepStrictEqual(old.requestCasesVerification, task.requestCasesVerification)
          && old.error === task.error && isDeepStrictEqual(old.sourceObligations, task.sourceObligations),
        priorMillis: old?.elapsedMillis ?? null, currentMillis: task.elapsedMillis });
    }
  }
  const files = ["src/skill-ir/api-schema-checker.ts", "scripts/skill-ir/skill-family-cache-comparison.ts", configPath];
  const bindings = await Promise.all(files.map(async (path) => ({ path,
    sha256: createHash("sha256").update(await readFile(resolve(rootDir, path))).digest("hex") })));
  const report = { exposure: "development", priorPath, outputPath, bindings, metricsBefore,
    metricsAfter: getSchemaCheckerCacheMetrics(), comparisons,
    status: comparisons.every((c) => c.equal) ? "pass" : "fail",
    claimLimit: "single-machine observational timing; source binding, semantic payloads and residual obligations compared; no whole-skill or human savings claim" };
  await writeFile(resolve(rootDir, outputPath, "comparison.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify(report));
  if (report.status !== "pass") process.exitCode = 1;
}
