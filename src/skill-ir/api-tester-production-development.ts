import { cp, lstat, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { Sha256Schema } from "../benchmarks/skill-ir/artifact-package";
import {
  API_TESTER_PRODUCTION_IDENTITY,
  runApiTesterProductionArtifact,
} from "./api-tester-production-artifact";
import { API_TESTER_PRODUCTION_PROGRAM_VERSION } from "./api-tester-production-programs";

export const API_TESTER_PRODUCTION_DEVELOPMENT_REPORT_SCHEMA_VERSION =
  "skill-ir-api-tester-production-development-report/v1" as const;

const DevelopmentRunSchema = z.object({
  inputId: z.enum(["books-json", "orders-yaml"]),
  bindingId: z.enum(["books-api", "orders-api"]),
  bindingPath: z.enum([
    "src/skill-ir/fixtures/api-tester-production/books/binding.json",
    "src/skill-ir/fixtures/api-tester-production/orders/binding.json",
  ]),
  bindingSha256: Sha256Schema,
  inputPath: z.string().min(1),
  inputFormat: z.enum(["json", "yaml"]),
  inputSha256: Sha256Schema,
  packageManifestSha256: Sha256Schema,
  generatorSha256: Sha256Schema,
  checkerSha256: Sha256Schema,
  planSha256: Sha256Schema,
  reportSha256: Sha256Schema,
  validationReportSha256: Sha256Schema,
  validationStatus: z.literal("pass"),
  programVersion: z.literal(API_TESTER_PRODUCTION_PROGRAM_VERSION),
}).strict();

export const ApiTesterProductionDevelopmentReportSchema = z.object({
  schemaVersion: z.literal(API_TESTER_PRODUCTION_DEVELOPMENT_REPORT_SCHEMA_VERSION),
  status: z.literal("passed"),
  identity: z.literal(API_TESTER_PRODUCTION_IDENTITY),
  denominator: z.object({
    developmentInputs: z.literal(2),
    successfulRuns: z.literal(2),
  }).strict(),
  runs: z.array(DevelopmentRunSchema).length(2),
  programParity: z.object({
    programVersion: z.literal(API_TESTER_PRODUCTION_PROGRAM_VERSION),
    generatorSha256: Sha256Schema,
    checkerSha256: Sha256Schema,
    reusedAcrossInputs: z.literal(true),
    generatorAndCheckerDistinct: z.literal(true),
  }).strict(),
  genericity: z.object({
    ordinaryParameterFields: z.tuple([
      z.literal("input.path"),
      z.literal("input.format"),
      z.literal("outputs.plan"),
      z.literal("outputs.report"),
    ]),
    taskIds: z.literal(0),
    taskPrompts: z.literal(0),
    perInputCodeBranches: z.literal(0),
    templates: z.literal(0),
    manualMappings: z.literal(0),
  }).strict(),
  sourceBoundary: z.object({
    developmentOnly: z.literal(true),
    heldOutAccess: z.literal(false),
    prospectiveSelection: z.literal(false),
    changesReadiness: z.literal(false),
  }).strict(),
  accounting: z.object({
    modelCalls: z.literal(0),
    apiCalls: z.literal(0),
    paidCalls: z.literal(0),
  }).strict(),
  claimBoundary: z.string().min(1),
}).strict().superRefine((report, context) => {
  if (report.runs[0]?.inputId !== "books-json" || report.runs[0]?.inputFormat !== "json"
    || report.runs[1]?.inputId !== "orders-yaml" || report.runs[1]?.inputFormat !== "yaml") {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Development input denominator/order drift" });
  }
  if (new Set(report.runs.map((run) => run.bindingSha256)).size !== 2
    || new Set(report.runs.map((run) => run.inputSha256)).size !== 2) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Development inputs must be distinct" });
  }
  if (report.runs.some((run) => run.generatorSha256 !== report.programParity.generatorSha256
    || run.checkerSha256 !== report.programParity.checkerSha256)
    || report.programParity.generatorSha256 === report.programParity.checkerSha256) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Development program parity/independence drift" });
  }
});

export type ApiTesterProductionDevelopmentReport = z.infer<
  typeof ApiTesterProductionDevelopmentReportSchema
>;

const INPUTS = [
  {
    inputId: "books-json" as const,
    bindingId: "books-api" as const,
    fixtureDirectory: "books",
    bindingPath: "src/skill-ir/fixtures/api-tester-production/books/binding.json" as const,
  },
  {
    inputId: "orders-yaml" as const,
    bindingId: "orders-api" as const,
    fixtureDirectory: "orders",
    bindingPath: "src/skill-ir/fixtures/api-tester-production/orders/binding.json" as const,
  },
] as const;

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function ensureEmptyDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("API Tester production development output must be a non-symlink directory");
  }
  if ((await readdir(directory)).length > 0) {
    throw new Error("API Tester production development output must be empty");
  }
}

export async function runApiTesterProductionDevelopment(options: {
  rootDir: string;
  outDir: string;
  nodeExecutable: string;
}): Promise<ApiTesterProductionDevelopmentReport> {
  const rootDir = resolve(options.rootDir);
  const outDir = resolve(options.outDir);
  await ensureEmptyDirectory(outDir);
  const executionRoot = await mkdtemp(join(tmpdir(), "skvm-api-production-development-"));
  try {
    const runs: Array<z.infer<typeof DevelopmentRunSchema>> = [];
    for (const input of INPUTS) {
      const source = join(rootDir, "src", "skill-ir", "fixtures", "api-tester-production", input.fixtureDirectory);
      const workDir = join(executionRoot, input.inputId, "workdir");
      const runOutDir = join(executionRoot, input.inputId, "output");
      await cp(source, workDir, { recursive: true });
      const result = await runApiTesterProductionArtifact({
        rootDir,
        bindingPath: input.bindingPath,
        workDir,
        outDir: runOutDir,
        nodeExecutable: options.nodeExecutable,
      });
      if (result.binding.bindingId !== input.bindingId) {
        throw new Error(`API Tester production development binding identity drift: ${input.inputId}`);
      }
      runs.push(DevelopmentRunSchema.parse({
        inputId: input.inputId,
        bindingId: result.binding.bindingId,
        bindingPath: input.bindingPath,
        bindingSha256: result.binding.sha256,
        inputPath: result.binding.inputPath,
        inputFormat: result.binding.inputFormat,
        inputSha256: result.binding.inputSha256,
        packageManifestSha256: result.package.manifestSha256,
        generatorSha256: result.package.generator.sha256,
        checkerSha256: result.package.checker.sha256,
        planSha256: result.outputs.plan.sha256,
        reportSha256: result.outputs.report.sha256,
        validationReportSha256: result.outputs.validationReport.sha256,
        validationStatus: result.validation.status,
        programVersion: result.validation.programVersion,
      }));
    }
    const first = runs[0]!;
    const report = ApiTesterProductionDevelopmentReportSchema.parse({
      schemaVersion: API_TESTER_PRODUCTION_DEVELOPMENT_REPORT_SCHEMA_VERSION,
      status: "passed",
      identity: API_TESTER_PRODUCTION_IDENTITY,
      denominator: { developmentInputs: 2, successfulRuns: 2 },
      runs,
      programParity: {
        programVersion: API_TESTER_PRODUCTION_PROGRAM_VERSION,
        generatorSha256: first.generatorSha256,
        checkerSha256: first.checkerSha256,
        reusedAcrossInputs: true,
        generatorAndCheckerDistinct: true,
      },
      genericity: {
        ordinaryParameterFields: ["input.path", "input.format", "outputs.plan", "outputs.report"],
        taskIds: 0,
        taskPrompts: 0,
        perInputCodeBranches: 0,
        templates: 0,
        manualMappings: 0,
      },
      sourceBoundary: {
        developmentOnly: true,
        heldOutAccess: false,
        prospectiveSelection: false,
        changesReadiness: false,
      },
      accounting: { modelCalls: 0, apiCalls: 0, paidCalls: 0 },
      claimBoundary: "This two-input development report proves one ordinary-parameter API Tester production path and one independent checker within the declared OpenAPI subset. It does not prove arbitrary OpenAPI support, held-out generalization, readiness, portfolio impact, cross-model stability, or an optimized LLM.",
    });
    await writeFile(join(outDir, "report.json"), jsonText(report), { encoding: "utf8", flag: "wx" });
    return report;
  } finally {
    await rm(executionRoot, { recursive: true, force: true });
  }
}
