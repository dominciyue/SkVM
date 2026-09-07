import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { SafeRelativePathSchema, Sha256Schema } from "../benchmarks/skill-ir/artifact-package";
import { sha256Bytes } from "../benchmarks/skill-ir/source-fixture";
import {
  API_TESTER_PRODUCTION_IDENTITY_V2,
  runApiTesterProductionArtifactV2,
  validateApiTesterProductionArtifactV2,
} from "./api-tester-production-artifact-v2";
import { API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID_V2 } from "./api-tester-production-contract-v2";
import { API_TESTER_PRODUCTION_PROGRAM_VERSION_V2 } from "./api-tester-production-programs-v2";

export const API_TESTER_PRODUCTION_SUCCESSOR_DEVELOPMENT_REPORT_SCHEMA_VERSION =
  "skill-ir-api-tester-production-successor-development-report/v1" as const;

const INPUT_RELATIVE_PATH = "open-meteo/forecast.yml" as const;
const LICENSE_RELATIVE_PATH = "open-meteo/LICENSE" as const;
const BINDING_RELATIVE_PATH =
  "benchmarks/skill-ir/development/api-tester-successor/open-meteo-binding.json" as const;
const EXPECTED_INPUT_BYTES = 136_988;
const EXPECTED_INPUT_SHA256 = "fdd3195d66fade678924c1df99d32de4f1d6aa7c954c5bc7ff1646ed8c558def";
const EXPECTED_LICENSE_BYTES = 34_522;
const EXPECTED_LICENSE_SHA256 = "20b067f86de375aae6db0f283ab2e65de24d537733b89bd58432c101259d84cf";

const DigestRefSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict();

export const ApiTesterProductionSuccessorDevelopmentReportSchema = z.object({
  schemaVersion: z.literal(API_TESTER_PRODUCTION_SUCCESSOR_DEVELOPMENT_REPORT_SCHEMA_VERSION),
  status: z.literal("passed"),
  identity: z.literal(API_TESTER_PRODUCTION_IDENTITY_V2),
  supportContractId: z.literal(API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID_V2),
  input: z.object({
    inputId: z.literal("real-open-meteo-forecast-exposed-development"),
    exposure: z.literal("development-only-after-2026-09-07-first-run"),
    format: z.literal("yaml"),
    bytes: z.literal(EXPECTED_INPUT_BYTES),
    sha256: z.literal(EXPECTED_INPUT_SHA256),
    upstream: z.object({
      repository: z.literal("https://github.com/open-meteo/open-meteo"),
      commit: z.literal("6c45053fb1ef0c049de931292a0f5cb35f14c0ba"),
      path: z.literal("openapi/forecast.yml"),
    }).strict(),
    license: z.object({
      summary: z.literal("AGPL-3.0 repository; OpenAPI info field declares CC-BY-4.0"),
      bytes: z.literal(EXPECTED_LICENSE_BYTES),
      sha256: z.literal(EXPECTED_LICENSE_SHA256),
    }).strict(),
  }).strict(),
  binding: z.object({
    bindingId: z.literal("development-open-meteo-forecast-v2"),
    path: z.literal(BINDING_RELATIVE_PATH),
    sha256: Sha256Schema,
  }).strict(),
  capabilities: z.object({
    operationCount: z.literal(1),
    fieldCount: z.literal(23),
    scalarFieldCount: z.literal(18),
    arrayFieldCount: z.literal(5),
    queryArrayEncodings: z.object({
      commaSeparated: z.literal(5),
      repeatedValue: z.literal(0),
    }).strict(),
    formats: z.object({
      date: z.literal(2),
      float: z.literal(3),
    }).strict(),
  }).strict(),
  pipeline: z.object({
    stages: z.tuple([
      z.literal("parse"),
      z.literal("normalize"),
      z.literal("package"),
      z.literal("generate"),
      z.literal("check"),
    ]),
    programVersion: z.literal(API_TESTER_PRODUCTION_PROGRAM_VERSION_V2),
    publicContract: DigestRefSchema,
    packageManifest: DigestRefSchema,
    generator: DigestRefSchema,
    checker: DigestRefSchema,
    plan: DigestRefSchema,
    report: DigestRefSchema,
    validationReport: DigestRefSchema,
    checkerStatus: z.literal("pass"),
  }).strict(),
  priorFrozenEvidence: z.object({
    identity: z.literal("skill-ir-api-tester-constructor-prospective-001"),
    rowId: z.literal("real-open-meteo-forecast"),
    outcome: z.literal("rejected"),
    rejectionCode: z.literal("UNSUPPORTED_SCHEMA"),
    checkerStatus: z.literal("not-run"),
    mutated: z.literal(false),
  }).strict(),
  accounting: z.object({
    modelCalls: z.literal(0),
    apiCalls: z.literal(0),
    paidCalls: z.literal(0),
  }).strict(),
  evidenceBoundary: z.object({
    prospective: z.literal(false),
    unseenInput: z.literal(false),
    heldOutAccess: z.literal(false),
    humanComparison: z.literal("not-measured"),
    changesReadiness: z.literal(false),
  }).strict(),
  claimBoundary: z.string().min(1),
}).strict();

export type ApiTesterProductionSuccessorDevelopmentReport = z.infer<
  typeof ApiTesterProductionSuccessorDevelopmentReportSchema
>;

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function requireDirectory(path: string, label: string): Promise<void> {
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label} must be a non-symlink directory`);
}

async function requireRegularFile(path: string, label: string): Promise<Uint8Array> {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a non-symlink regular file`);
  return readFile(path);
}

async function ensureEmptyDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
  await requireDirectory(path, "successor development output");
  if ((await readdir(path)).length > 0) throw new Error("successor development output must be empty");
}

function requireExpectedBytes(
  bytes: Uint8Array,
  expectedLength: number,
  expectedSha256: string,
  label: string,
): void {
  const actualSha256 = sha256Bytes(bytes);
  if (bytes.byteLength !== expectedLength || actualSha256 !== expectedSha256) {
    throw new Error(`${label} digest/length mismatch: bytes=${bytes.byteLength} sha256=${actualSha256}`);
  }
}

export async function runApiTesterProductionSuccessorDevelopment(options: {
  rootDir: string;
  externalCacheRoot: string;
  outDir: string;
  nodeExecutable: string;
}): Promise<ApiTesterProductionSuccessorDevelopmentReport> {
  const rootDir = resolve(options.rootDir);
  const externalCacheRoot = resolve(options.externalCacheRoot);
  const outDir = resolve(options.outDir);
  await Promise.all([
    requireDirectory(rootDir, "repository root"),
    requireDirectory(externalCacheRoot, "successor development cache root"),
  ]);
  await ensureEmptyDirectory(outDir);

  const [inputBytes, licenseBytes, bindingBytes] = await Promise.all([
    requireRegularFile(join(externalCacheRoot, INPUT_RELATIVE_PATH), "Open-Meteo input"),
    requireRegularFile(join(externalCacheRoot, LICENSE_RELATIVE_PATH), "Open-Meteo license"),
    requireRegularFile(join(rootDir, BINDING_RELATIVE_PATH), "successor development binding"),
  ]);
  requireExpectedBytes(inputBytes, EXPECTED_INPUT_BYTES, EXPECTED_INPUT_SHA256, "Open-Meteo input");
  requireExpectedBytes(licenseBytes, EXPECTED_LICENSE_BYTES, EXPECTED_LICENSE_SHA256, "Open-Meteo license");

  const executionRoot = await mkdtemp(join(tmpdir(), "skvm-api-successor-development-"));
  try {
    const workDir = join(executionRoot, "workdir");
    const executionOut = join(executionRoot, "output");
    await mkdir(join(workDir, "open-meteo"), { recursive: true });
    await writeFile(join(workDir, INPUT_RELATIVE_PATH), inputBytes, { flag: "wx" });
    const run = await runApiTesterProductionArtifactV2({
      rootDir,
      bindingPath: BINDING_RELATIVE_PATH,
      workDir,
      outDir: executionOut,
      nodeExecutable: options.nodeExecutable,
    });
    const artifact = await validateApiTesterProductionArtifactV2(join(executionOut, "artifact"));
    if (run.binding.sha256 !== sha256Bytes(bindingBytes)) {
      throw new Error("successor development binding source/canonical digest mismatch");
    }
    if (run.binding.inputSha256 !== EXPECTED_INPUT_SHA256) {
      throw new Error("successor development workdir input digest mismatch");
    }
    const fields = artifact.contract.operations.flatMap((operation) => operation.fields);
    const scalarFields = fields.filter((field) => field.kind === "scalar");
    const arrayFields = fields.filter((field) => field.kind === "array");
    const formatCounts = scalarFields.reduce<Record<string, number>>((counts, field) => {
      if (field.format) counts[field.format] = (counts[field.format] ?? 0) + 1;
      return counts;
    }, {});
    const commaSeparated = arrayFields.filter((field) =>
      field.location === "query" && field.encoding.wireFormat === "comma-separated").length;
    const repeatedValue = arrayFields.filter((field) =>
      field.location === "query" && field.encoding.wireFormat === "repeated-value").length;
    const report = ApiTesterProductionSuccessorDevelopmentReportSchema.parse({
      schemaVersion: API_TESTER_PRODUCTION_SUCCESSOR_DEVELOPMENT_REPORT_SCHEMA_VERSION,
      status: "passed",
      identity: API_TESTER_PRODUCTION_IDENTITY_V2,
      supportContractId: API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID_V2,
      input: {
        inputId: "real-open-meteo-forecast-exposed-development",
        exposure: "development-only-after-2026-09-07-first-run",
        format: "yaml",
        bytes: inputBytes.byteLength,
        sha256: sha256Bytes(inputBytes),
        upstream: {
          repository: "https://github.com/open-meteo/open-meteo",
          commit: "6c45053fb1ef0c049de931292a0f5cb35f14c0ba",
          path: "openapi/forecast.yml",
        },
        license: {
          summary: "AGPL-3.0 repository; OpenAPI info field declares CC-BY-4.0",
          bytes: licenseBytes.byteLength,
          sha256: sha256Bytes(licenseBytes),
        },
      },
      binding: {
        bindingId: run.binding.bindingId,
        path: BINDING_RELATIVE_PATH,
        sha256: run.binding.sha256,
      },
      capabilities: {
        operationCount: artifact.contract.operations.length,
        fieldCount: fields.length,
        scalarFieldCount: scalarFields.length,
        arrayFieldCount: arrayFields.length,
        queryArrayEncodings: { commaSeparated, repeatedValue },
        formats: { date: formatCounts.date ?? 0, float: formatCounts.float ?? 0 },
      },
      pipeline: {
        stages: ["parse", "normalize", "package", "generate", "check"],
        programVersion: run.validation.programVersion,
        publicContract: artifact.manifest.publicContract,
        packageManifest: { path: "artifact/package-manifest.json", sha256: run.package.manifestSha256 },
        generator: run.package.generator,
        checker: run.package.checker,
        plan: run.outputs.plan,
        report: run.outputs.report,
        validationReport: run.outputs.validationReport,
        checkerStatus: run.validation.status,
      },
      priorFrozenEvidence: {
        identity: "skill-ir-api-tester-constructor-prospective-001",
        rowId: "real-open-meteo-forecast",
        outcome: "rejected",
        rejectionCode: "UNSUPPORTED_SCHEMA",
        checkerStatus: "not-run",
        mutated: false,
      },
      accounting: { modelCalls: 0, apiCalls: 0, paidCalls: 0 },
      evidenceBoundary: {
        prospective: false,
        unseenInput: false,
        heldOutAccess: false,
        humanComparison: "not-measured",
        changesReadiness: false,
      },
      claimBoundary: "This report proves one exposed Open-Meteo development input completed parse, normalization, package construction, deterministic generation, and independent v2 public-contract checking. It is not a prospective or unseen-input result, does not alter the frozen v1 0/4 panel, and does not establish human savings, general reliability, held-out behavior, cross-profile transfer, readiness, or an optimized LLM.",
    });
    await writeFile(join(outDir, "report.json"), jsonText(report), { encoding: "utf8", flag: "wx" });
    return report;
  } finally {
    await rm(executionRoot, { recursive: true, force: true });
  }
}
