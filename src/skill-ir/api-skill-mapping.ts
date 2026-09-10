import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { z } from "zod";
import { loadSkill } from "../core/skill-loader";
import { deriveFamilyResponsibilityAssessment, FAMILY_NECESSARY_CRITERION_IDS } from "../benchmarks/skill-ir/public-structure-offline-family-contract";
import { createContainedDirectory, normalizeRepositoryRelativePath, resolveContainedExistingFile } from "../benchmarks/skill-ir/public-skill-responsibility-corpus-paths";
import { API_TESTER_OPERATION_INPUT_IDENTITY, API_TESTER_OPERATION_INPUT_MANIFEST_SCHEMA_VERSION,
  runApiTesterOperationInput, type ApiTesterOperationInputReport } from "./api-tester-operation-input";
import { API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID_V2 } from "./api-tester-production-contract-v2";

const digest = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const id = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u);
const sha = z.string().regex(/^[0-9a-f]{64}$/u);
const path = z.string().min(1).refine((value) => {
  try { normalizeRepositoryRelativePath(value, "mapping path"); return true; } catch { return false; }
});

export const ApiSkillMappingSchema = z.object({
  schemaVersion: z.literal("api-skill-mapping/v1"), mappingId: id,
  analysisPath: path, skillId: z.string().min(1), responsibilityId: id,
  obligations: z.array(z.string().min(1)).min(1), profile: z.literal(API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID_V2),
  requestedOutputFormat: z.string().min(1), extraction: z.literal("agent-reviewed-declaration"),
  tasks: z.array(z.object({ taskId: id, inputPath: path, format: z.enum(["json", "yaml"]), sha256: sha }).strict()).min(1),
}).strict().superRefine((value, context) => {
  if (new Set(value.tasks.map((task) => task.taskId)).size !== value.tasks.length) context.addIssue({ code: "custom", message: "duplicate task identity" });
  if (new Set(value.obligations).size !== value.obligations.length) context.addIssue({ code: "custom", message: "duplicate obligation" });
});

const ResponsibilitySchema = z.object({ id, description: z.string().min(1), lines: z.tuple([z.number().int().positive(), z.number().int().positive()]), obligations: z.array(z.string()).min(1) }).passthrough();
const ReviewSchema = z.object({ skillId: z.string(), bodyReadComplete: z.boolean(), bodyLines: z.number().int().positive(),
  membershipEvidence: z.object({ startLine: z.number().int().positive(), endLine: z.number().int().positive(), marker: z.string().min(1) }),
  responsibilities: z.array(ResponsibilitySchema).min(1) }).passthrough();
const AnalysisSchema = z.object({ sourceIndex: path, skills: z.array(ReviewSchema) }).passthrough();
const SourceSchema = z.object({ skillId: z.string(), repository: z.string(), commit: z.string(),
  files: z.array(z.object({ kind: z.enum(["skill", "resource", "license"]), localPath: path, sha256: sha }).passthrough()).min(1) }).passthrough();

export async function prepareApiSkillMapping(rootDir: string, mappingPath: string) {
  const mappingBytes = await readFile(await resolveContainedExistingFile(rootDir, mappingPath, "mapping"));
  const mapping = ApiSkillMappingSchema.parse(JSON.parse(mappingBytes.toString("utf8")));
  const analysisFile = await resolveContainedExistingFile(rootDir, mapping.analysisPath, "source analysis");
  const analysisBytes = await readFile(analysisFile);
  const analysis = AnalysisSchema.parse(JSON.parse(analysisBytes.toString("utf8")));
  const reviews = analysis.skills.filter((row) => row.skillId === mapping.skillId);
  if (reviews.length !== 1) throw new Error("skill source review must be unique");
  const review = reviews[0]!;
  if (!review.bodyReadComplete) throw new Error("skill body has not been fully reviewed");
  if (new Set(review.responsibilities.map((row) => row.id)).size !== review.responsibilities.length) throw new Error("duplicate source responsibility");
  const selected = review.responsibilities.find((row) => row.id === mapping.responsibilityId);
  if (!selected) throw new Error("responsibility binding is not in source analysis");
  if (JSON.stringify([...selected.obligations].sort()) !== JSON.stringify([...mapping.obligations].sort())) throw new Error("obligation binding must preserve the full source responsibility");
  const indexRelative = relative(resolve(rootDir), resolve(dirname(analysisFile), analysis.sourceIndex)).replaceAll("\\", "/");
  const sourceIndex = z.object({ skills: z.array(SourceSchema) }).passthrough().parse(JSON.parse(await readFile(
    await resolveContainedExistingFile(rootDir, indexRelative, "source index"), "utf8")));
  const sources = sourceIndex.skills.filter((row) => row.skillId === mapping.skillId);
  if (sources.length !== 1) throw new Error("source identity must be unique");
  const source = sources[0]!;
  const materialPaths = new Map<string, string>();
  for (const file of source.files) {
    const fileRelative = relative(resolve(rootDir), resolve(dirname(analysisFile), file.localPath)).replaceAll("\\", "/");
    const target = await resolveContainedExistingFile(rootDir, fileRelative, "source material");
    if (digest(await readFile(target)) !== file.sha256) throw new Error(`source digest mismatch: ${file.localPath}`);
    materialPaths.set(file.localPath, target);
  }
  const skillFiles = source.files.filter((file) => file.kind === "skill");
  if (skillFiles.length !== 1) throw new Error("exactly one skill body required");
  const skill = await loadSkill(materialPaths.get(skillFiles[0]!.localPath)!);
  const lines = skill.skillContent.split(/\r?\n/u);
  if (lines.length !== review.bodyLines) throw new Error("source line count mismatch");
  const evidence = review.membershipEvidence;
  if (evidence.endLine < evidence.startLine || evidence.endLine > lines.length ||
      !lines.slice(evidence.startLine - 1, evidence.endLine).join("\n").includes(evidence.marker)) throw new Error("source locator mismatch");
  for (const responsibility of review.responsibilities) {
    if (responsibility.lines[1] < responsibility.lines[0] || responsibility.lines[1] > lines.length) throw new Error("responsibility locator outside source");
  }
  const fact = <T extends string>(status: T) => ({ status, evidenceIds: ["bounded-v2-public-contract"], missingEvidence: [] });
  // This assesses the explicit bounded task, NOT the larger source responsibility.
  const boundedTaskFamilyAssessment = deriveFamilyResponsibilityAssessment({
    responsibilityId: "bounded-v2-request-case-subtask", skillId: "declarative-api-task",
    description: "Construct and verify the explicit OpenAPI v2 subset; original skill duties remain residual", completeScope: true,
    dependsOnResponsibilityIds: [], criterionAssessments: FAMILY_NECESSARY_CRITERION_IDS.map((criterionId) => ({ criterionId, ...fact("satisfied") })),
    verificationBasis: fact("sufficient"), constructionBasis: fact("sufficient"), dependencyClosure: fact("closed"),
    sourceValidity: { status: "unknown", evidenceIds: [], missingEvidence: ["per-input admission and dependency verification have not run"] },
    remainingSemanticChoices: fact("explicit-parameters"), executionLimit: fact("none"),
    requiredCapabilities: [{ capabilityId: "api-tester-openapi-subset-v2", implementation: "implemented", validation: "historical-only", supportsNewInputs: true, evidenceIds: ["bounded-v2-public-contract"] }],
  });
  return { mapping, mappingSha256: digest(mappingBytes), analysisSha256: digest(analysisBytes), source, skill,
    selectedResponsibility: selected, residualResponsibilities: review.responsibilities.filter((row) => row.id !== selected.id), boundedTaskFamilyAssessment };
}

export async function runApiSkillMapping(options: { rootDir: string; mappingPath: string; outputPath: string; nodeExecutable: string }) {
  const prepared = await prepareApiSkillMapping(options.rootDir, options.mappingPath);
  const output = await createContainedDirectory(options.rootDir, options.outputPath, "mapping output");
  const tasks: Array<{ taskId: string; operationReport: ApiTesterOperationInputReport | null; error: string | null;
    sourceObligations: Array<{ id: string; status: "not-fully-verified" }>; elapsedMillis: number }> = [];
  const report = { schemaVersion: "api-skill-mapping-report/v1", mappingId: prepared.mapping.mappingId,
    mappingSha256: prepared.mappingSha256, analysisSha256: prepared.analysisSha256,
    skillId: prepared.mapping.skillId, repository: prepared.source.repository, sourceCommit: prepared.source.commit,
    extraction: prepared.mapping.extraction, automaticNaturalLanguageCompilation: false,
    selectedResponsibility: prepared.selectedResponsibility, residualResponsibilities: prepared.residualResponsibilities,
    boundedTaskFamilyAssessment: prepared.boundedTaskFamilyAssessment,
    wholeSkillCompleted: false, originalOutputConformance: "not-implemented-by-v2", tasks,
    accounting: { projectModelCalls: 0, paidCalls: 0, mappingAuthor: "development-agent", humanMinutes: null } };
  for (const task of prepared.mapping.tasks) {
    const started = performance.now();
    let operationReport: ApiTesterOperationInputReport | null = null;
    let error: string | null = null;
    try {
      const input = await readFile(await resolveContainedExistingFile(options.rootDir, task.inputPath, "task input"));
      if (digest(input) !== task.sha256) throw new Error("task input digest mismatch");
      const manifestPath = `${options.outputPath}/${task.taskId}-manifest.json`;
      await writeFile(resolve(options.rootDir, manifestPath), JSON.stringify({
        schemaVersion: API_TESTER_OPERATION_INPUT_MANIFEST_SCHEMA_VERSION, identity: API_TESTER_OPERATION_INPUT_IDENTITY,
        bindingId: task.taskId, supportContractId: API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID_V2,
        input: { path: task.inputPath, format: task.format, bytes: input.length, sha256: task.sha256 },
        output: { path: `${options.outputPath}/${task.taskId}`, writeMode: "exclusive-create-once" },
      }, null, 2) + "\n", { flag: "wx" });
      operationReport = await runApiTesterOperationInput({ rootDir: options.rootDir, manifestPath, nodeExecutable: options.nodeExecutable });
    } catch (caught) { error = String(caught); }
    tasks.push({ taskId: task.taskId, operationReport, error,
      sourceObligations: prepared.mapping.obligations.map((id) => ({ id, status: "not-fully-verified" })),
      elapsedMillis: Math.round(performance.now() - started) });
    await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  }
  return report;
}
