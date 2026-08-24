import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";
import { DomainPlanManualParityCaseReportSchema } from "./automatic-domain-plan-manual-parity";
import {
  SingleDomainPlanGenerationReportSchema,
} from "./automatic-domain-plan-single-generation";
import { sha256Bytes } from "./source-fixture";

const IdentifierSchema = z.string().regex(/^[a-z][a-z0-9-]{0,127}$/u);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const SafePathSchema = z.string().min(1).max(240).refine((value) =>
  !isAbsolute(value)
  && !value.includes("\\")
  && value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."));
const DigestRefSchema = z.object({ path: SafePathSchema, sha256: Sha256Schema }).strict();

const CrossSkillCaseInputSchema = z.object({
  caseId: IdentifierSchema,
  parityReport: DigestRefSchema.nullable(),
  generationFailureReport: DigestRefSchema.nullable(),
}).strict().superRefine((entry, context) => {
  if ((entry.parityReport === null) === (entry.generationFailureReport === null)) {
    context.addIssue({ code: "custom", message: "case must provide exactly one parity or generation-failure report" });
  }
});

export const CrossSkillDomainPlanParityCatalogSchema = z.object({
  schemaVersion: z.literal("skill-ir-domain-plan-cross-skill-parity-catalog/v1"),
  catalogId: IdentifierSchema,
  cases: z.array(CrossSkillCaseInputSchema).length(2),
  coreBranchDelta: z.number().int().nonnegative(),
}).strict().superRefine((catalog, context) => {
  if (new Set(catalog.cases.map((entry) => entry.caseId)).size !== 2) {
    context.addIssue({ code: "custom", message: "cross-skill parity requires two distinct case ids" });
  }
});

export type CrossSkillDomainPlanParityCatalog = z.infer<typeof CrossSkillDomainPlanParityCatalogSchema>;

const CrossSkillBlockerSchema = z.enum([
  "insufficient-distinct-skills",
  "case-parity-failed",
  "plan-unavailable",
  "core-branch-delta",
]);

const CrossSkillCaseObservationSchema = z.discriminatedUnion("status", [
  z.object({
    caseId: IdentifierSchema,
    status: z.enum(["evaluated-passed", "evaluated-failed"]),
    evidence: DigestRefSchema,
    taskCount: z.literal(2),
    fullParityTasks: z.number().int().min(0).max(2),
    postPlanPassedCriteria: z.number().int().nonnegative(),
    postPlanCriterionCount: z.number().int().positive(),
    distanceToFull: z.number().int().nonnegative(),
  }).strict(),
  z.object({
    caseId: IdentifierSchema,
    status: z.literal("plan-unavailable"),
    evidence: DigestRefSchema,
    generationStatus: z.enum([
      "provider-failure",
      "leakage-rejected",
      "binding-rejected",
      "static-type-rejected",
    ]),
    providerFailureStage: z.string().nullable(),
    providerFailureClass: z.string().nullable(),
  }).strict(),
]);

export const CrossSkillDomainPlanParityReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-domain-plan-cross-skill-parity-report/v1"),
  catalogId: IdentifierSchema,
  catalogSha256: Sha256Schema,
  measurementCompletedAt: z.string().datetime(),
  implementation: z.array(DigestRefSchema).length(5),
  cases: z.array(CrossSkillCaseObservationSchema).length(2),
  semanticParity: z.object({
    status: z.enum(["passed", "failed"]),
    blockers: z.array(CrossSkillBlockerSchema),
    selectedSkillCount: z.literal(2),
    evaluatedSkillCount: z.number().int().min(0).max(2),
    fullyPassingSkillCount: z.number().int().min(0).max(2),
    coreBranchDelta: z.number().int().nonnegative(),
  }).strict(),
  summary: z.object({
    paidCalls: z.number().int().nonnegative(),
    retries: z.literal(0),
    heldOutAccesses: z.literal(0),
    evaluatorPayloadsSentToModel: z.literal(0),
    coreBranchDelta: z.number().int().nonnegative(),
  }).strict(),
}).strict().superRefine((report, context) => {
  if (new Set(report.cases.map((entry) => entry.caseId)).size !== 2) {
    context.addIssue({ code: "custom", message: "cross-skill parity report requires two distinct case ids" });
  }
  const evaluated = report.cases.filter((entry) => entry.status !== "plan-unavailable");
  const passing = evaluated.filter((entry) => entry.status === "evaluated-passed");
  if (report.semanticParity.evaluatedSkillCount !== evaluated.length
    || report.semanticParity.fullyPassingSkillCount !== passing.length) {
    context.addIssue({ code: "custom", message: "cross-skill parity counts do not conserve case evidence" });
  }
  const expectedBlockers: Array<z.infer<typeof CrossSkillBlockerSchema>> = [];
  if (evaluated.length < 2) expectedBlockers.push("insufficient-distinct-skills");
  if (evaluated.some((entry) => entry.status === "evaluated-failed")) expectedBlockers.push("case-parity-failed");
  if (report.cases.some((entry) => entry.status === "plan-unavailable")) expectedBlockers.push("plan-unavailable");
  if (report.semanticParity.coreBranchDelta !== 0) expectedBlockers.push("core-branch-delta");
  if (JSON.stringify(report.semanticParity.blockers) !== JSON.stringify(expectedBlockers)) {
    context.addIssue({ code: "custom", message: "cross-skill parity blockers do not conserve case evidence" });
  }
  if (report.summary.coreBranchDelta !== report.semanticParity.coreBranchDelta) {
    context.addIssue({ code: "custom", message: "cross-skill parity core branch delta does not conserve evidence" });
  }
  const expectedPassed = evaluated.length === 2 && passing.length === 2 && report.semanticParity.blockers.length === 0;
  if (report.semanticParity.status !== (expectedPassed ? "passed" : "failed")) {
    context.addIssue({ code: "custom", message: "cross-skill parity status does not match blockers" });
  }
});

export type CrossSkillDomainPlanParityReport = z.infer<typeof CrossSkillDomainPlanParityReportSchema>;

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function containedPath(rootDir: string, path: string): string {
  const root = resolve(rootDir);
  const candidate = resolve(root, SafePathSchema.parse(path));
  const fromRoot = relative(root, candidate);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) throw new Error(`path escapes root: ${path}`);
  return candidate;
}

async function readPinned(rootDir: string, ref: z.infer<typeof DigestRefSchema>): Promise<Buffer> {
  const bytes = await readFile(containedPath(rootDir, ref.path));
  if (sha256Bytes(bytes) !== ref.sha256) throw new Error(`digest mismatch for ${ref.path}`);
  return bytes;
}

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, path);
}

export async function buildCrossSkillDomainPlanParityReport(options: {
  rootDir: string;
  catalog: CrossSkillDomainPlanParityCatalog;
  outputPath: string;
  measurementCompletedAt?: string;
}): Promise<CrossSkillDomainPlanParityReport> {
  const catalog = CrossSkillDomainPlanParityCatalogSchema.parse(options.catalog);
  const implementationPaths = [
    "src/benchmarks/skill-ir/automatic-domain-plan-cross-skill-parity.ts",
    "src/benchmarks/skill-ir/automatic-domain-plan-cross-skill-parity-run.ts",
    "src/benchmarks/skill-ir/automatic-domain-plan-manual-parity.ts",
    "src/benchmarks/skill-ir/automatic-domain-plan-single-generation.ts",
    "src/benchmarks/skill-ir/source-fixture.ts",
  ];
  const implementation = await Promise.all(implementationPaths.map(async (path) => ({
    path,
    sha256: sha256Bytes(await readFile(containedPath(options.rootDir, path))),
  })));
  const cases: Array<z.infer<typeof CrossSkillCaseObservationSchema>> = [];
  let paidCalls = 0;
  for (const entry of catalog.cases) {
    if (entry.parityReport) {
      const bytes = await readPinned(options.rootDir, entry.parityReport);
      const parity = DomainPlanManualParityCaseReportSchema.parse(JSON.parse(bytes.toString("utf8")));
      if (parity.caseId !== entry.caseId) throw new Error(`parity report case mismatch for ${entry.caseId}`);
      cases.push(CrossSkillCaseObservationSchema.parse({
        caseId: entry.caseId,
        status: parity.caseParity.status === "passed" ? "evaluated-passed" : "evaluated-failed",
        evidence: entry.parityReport,
        taskCount: parity.summary.taskCount,
        fullParityTasks: parity.summary.fullParityTasks,
        postPlanPassedCriteria: parity.summary.postPlanPassedCriteria,
        postPlanCriterionCount: parity.summary.postPlanCriterionCount,
        distanceToFull: parity.summary.distanceToFull,
      }));
      paidCalls += parity.summary.paidCalls;
    } else {
      const evidence = entry.generationFailureReport!;
      const bytes = await readPinned(options.rootDir, evidence);
      const generation = SingleDomainPlanGenerationReportSchema.parse(JSON.parse(bytes.toString("utf8")));
      if (generation.caseId !== entry.caseId || generation.status === "plan-produced" || generation.generatedPlan) {
        throw new Error(`generation failure evidence is invalid for ${entry.caseId}`);
      }
      cases.push(CrossSkillCaseObservationSchema.parse({
        caseId: entry.caseId,
        status: "plan-unavailable",
        evidence,
        generationStatus: generation.status,
        providerFailureStage: generation.providerFailure?.stage ?? null,
        providerFailureClass: generation.providerFailure?.failureClass ?? null,
      }));
      paidCalls += generation.summary.paidCalls;
    }
  }
  const evaluated = cases.filter((entry) => entry.status !== "plan-unavailable");
  const passing = evaluated.filter((entry) => entry.status === "evaluated-passed");
  const blockers: Array<z.infer<typeof CrossSkillBlockerSchema>> = [];
  if (evaluated.length < 2) blockers.push("insufficient-distinct-skills");
  if (evaluated.some((entry) => entry.status === "evaluated-failed")) blockers.push("case-parity-failed");
  if (cases.some((entry) => entry.status === "plan-unavailable")) blockers.push("plan-unavailable");
  if (catalog.coreBranchDelta !== 0) blockers.push("core-branch-delta");
  const completedAt = z.string().datetime().parse(options.measurementCompletedAt ?? new Date().toISOString());
  if (Date.parse(completedAt) > Date.now()) throw new Error("cross-skill parity completion is in the future");
  const report = CrossSkillDomainPlanParityReportSchema.parse({
    schemaVersion: "skill-ir-domain-plan-cross-skill-parity-report/v1",
    catalogId: catalog.catalogId,
    catalogSha256: sha256Bytes(Buffer.from(jsonText(catalog), "utf8")),
    measurementCompletedAt: completedAt,
    implementation,
    cases,
    semanticParity: {
      status: blockers.length === 0 ? "passed" : "failed",
      blockers,
      selectedSkillCount: 2,
      evaluatedSkillCount: evaluated.length,
      fullyPassingSkillCount: passing.length,
      coreBranchDelta: catalog.coreBranchDelta,
    },
    summary: {
      paidCalls,
      retries: 0,
      heldOutAccesses: 0,
      evaluatorPayloadsSentToModel: 0,
      coreBranchDelta: catalog.coreBranchDelta,
    },
  });
  await atomicWrite(options.outputPath, jsonText(report));
  return report;
}
