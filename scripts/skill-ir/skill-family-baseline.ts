import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ApiSkillMappingSchema, runApiSkillMapping } from "../../src/skill-ir/api-skill-mapping";
import { createContainedDirectory, resolveContainedExistingFile } from "../../src/benchmarks/skill-ir/public-skill-responsibility-corpus-paths";

type Member = { mappingId: string; skillId: string; responsibilityId: string; requestedOutputFormat: string };
type BaselineArguments = { analysis: { skills: Array<{ skillId: string; responsibilities: Array<{ id: string; obligations: string[] }> }> };
  inputs: { inputs: Array<{ inputId: string; status: string; localPath?: string | null; format?: string | null; sha256?: string | null; error?: string | null }> };
  member: Member; analysisPath: string; inputRoot: string; profile?: "api-tester-openapi-subset-v2" | "api-request-cases/v2" | "api-request-specimens/v1" | "api-request-body-negatives/v1" };

export function createBaselineMapping(options: BaselineArguments) {
  const reviews = options.analysis.skills.filter((s) => s.skillId === options.member.skillId);
  if (reviews.length !== 1) throw new Error("expected unique source member");
  const responsibilities = reviews[0]!.responsibilities.filter((r) => r.id === options.member.responsibilityId);
  if (responsibilities.length !== 1) throw new Error("expected unique source responsibility");
  const mapping = ApiSkillMappingSchema.parse({ schemaVersion: "api-skill-mapping/v1", ...options.member,
    analysisPath: options.analysisPath, obligations: responsibilities[0]!.obligations,
    profile: options.profile ?? "api-tester-openapi-subset-v2", extraction: "agent-reviewed-declaration",
    tasks: options.inputs.inputs.filter((i) => i.status === "acquired").map((i) => ({ taskId: i.inputId,
      inputPath: `${options.inputRoot}/${i.localPath}`, format: i.format, sha256: i.sha256 })),
  });
  return { mapping, unavailableInputs: options.inputs.inputs.filter((i) => i.status !== "acquired") };
}

export async function runSkillFamilyBaseline(options: { rootDir: string; configPath: string; outputPath: string; nodeExecutable: string }) {
  const load = async (path: string) => JSON.parse(await readFile(await resolveContainedExistingFile(options.rootDir, path, "baseline input"), "utf8"));
  const config = await load(options.configPath) as { analysisPath: string; inputIndexPath: string; members: Member[]; profile?: BaselineArguments["profile"] };
  if (!Array.isArray(config.members) || !config.members.length || new Set(config.members.map((m) => m.mappingId)).size !== config.members.length) throw new Error("baseline members must be nonempty and unique");
  const analysis = await load(config.analysisPath);
  const inputs = await load(config.inputIndexPath);
  const output = await createContainedDirectory(options.rootDir, options.outputPath, "baseline output");
  const git = (args: string[]) => execFileSync("git", ["-c", `safe.directory=${options.rootDir.replaceAll("\\", "/")}`, ...args], { cwd: options.rootDir, encoding: "utf8", windowsHide: true }).trim();
  const report = { schemaVersion: "skill-family-baseline/v1", exposure: "development", startedAt: new Date().toISOString(),
    executionCommit: git(["rev-parse", "HEAD"]), runtime: { bun: Bun.version, node: execFileSync(options.nodeExecutable, ["--version"], { encoding: "utf8", windowsHide: true }).trim() },
    configPath: options.configPath, inputIndexPath: config.inputIndexPath, inputDocuments: inputs.inputs.length,
    profile: config.profile ?? "api-tester-openapi-subset-v2",
    uniqueProviders: new Set(inputs.inputs.map((i: any) => i.provider)).size,
    plannedSkillInputTasks: config.members.length * inputs.inputs.length,
    members: [] as Array<{ mappingId: string; skillId: string; mappingPath: string; reportPath: string; unavailableInputs: unknown[]; error: string | null; taskTotals: unknown[] }>,
    accounting: { projectModelCalls: 0, paidCalls: 0, extractionAuthor: "development-agent", extractionHumanMinutes: null },
    claimLimit: "bounded v2 artifact checks do not prove original skill obligations, output format or live API behavior" };
  await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  for (const member of config.members) {
    const row = { mappingId: member.mappingId, skillId: member.skillId, mappingPath: `${options.outputPath}/${member.mappingId}-mapping.json`,
      reportPath: `${options.outputPath}/${member.mappingId}/report.json`, unavailableInputs: [] as unknown[], error: null as string | null, taskTotals: [] as unknown[] };
    report.members.push(row);
    try {
      const prepared = createBaselineMapping({ analysis, inputs, member, profile: config.profile, analysisPath: config.analysisPath, inputRoot: dirname(config.inputIndexPath).replaceAll("\\", "/") });
      row.unavailableInputs = prepared.unavailableInputs;
      await writeFile(resolve(options.rootDir, row.mappingPath), JSON.stringify(prepared.mapping, null, 2) + "\n", { flag: "wx" });
      const result = await runApiSkillMapping({ rootDir: options.rootDir, mappingPath: row.mappingPath, outputPath: `${options.outputPath}/${member.mappingId}`, nodeExecutable: options.nodeExecutable });
      row.taskTotals = result.tasks.map((t) => ({ taskId: t.taskId, error: t.error, totals: t.operationReport?.totals,
        gates: t.operationReport?.gates, obligationCoverage: t.operationReport?.obligationCoverage,
        requestCases: t.requestCasesVerification, requestSpecimens: t.requestSpecimensVerification,
        requestBodyNegatives: t.requestBodyNegativesVerification, elapsedMillis: t.elapsedMillis }));
    } catch (error) { row.error = String(error); }
    await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify({ member: member.mappingId, error: row.error, tasks: row.taskTotals.length }));
  }
  return report;
}

if (import.meta.main) {
  const configPath = process.argv.find((v) => v.startsWith("--config="))?.slice(9);
  const outputPath = process.argv.find((v) => v.startsWith("--out="))?.slice(6);
  const nodeExecutable = Bun.which("node");
  if (!configPath || !outputPath || !nodeExecutable) throw new Error("usage: --config=<baseline-config.json> --out=<new-output-path>; Node required");
  await runSkillFamilyBaseline({ rootDir: process.cwd(), configPath, outputPath, nodeExecutable });
}
