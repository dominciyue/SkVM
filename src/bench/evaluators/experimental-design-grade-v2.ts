import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { parseDocument } from "yaml";
import { z } from "zod";
import {
  assessExperimentalDesignV2Allocation,
  deriveExperimentalDesignV2LimitationFlags,
  parseExperimentalDesignV2AllocationCsv,
  parseExperimentalDesignV2Study,
  type ExperimentalDesignV2Properties,
  type ExperimentalDesignV2Study,
} from "../../benchmarks/skill-ir/experimental-design-v2-contract.ts";
import type { CustomEvaluator } from "../../framework/types.ts";
import { registerCustomEvaluator } from "../../framework/types.ts";
import {
  assessWorkdirDelta,
  readInitialWorkdirManifest,
  type InitialWorkdirManifestReference,
} from "../../core/workdir-manifest.ts";

const SCHEMA_VERSION = "skill-ir-experimental-design-eval/v2";
const REPORT_OPENING = "```json design-evidence";
const REPORT_CLOSING = "```";
const OUTPUT_PATHS = [
  "design/design-plan.json",
  "design/allocation.csv",
  "design/design-report.md",
] as const;
const PROPERTY_KEYS = [
  "preservesAssignmentUnits",
  "balancesGlobally",
  "balancesWithinStrata",
  "supportsSequentialEnrollment",
] as const;

const SafeRelativePathSchema = z
  .string()
  .min(1)
  .refine((value) => {
    if (
      path.posix.isAbsolute(value) ||
      path.win32.isAbsolute(value) ||
      value.includes("\\")
    ) {
      return false;
    }
    return value
      .split("/")
      .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
  });

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const ExperimentalDesignGradeV2PayloadSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    contractRevision: z.literal("materialized-delta/v1"),
    check: z.enum([
      "input-integrity",
      "artifact-contract",
      "design-semantics",
      "allocation-safety",
      "report-consistency",
    ]),
    paths: z
      .object({
        study: SafeRelativePathSchema,
        contract: SafeRelativePathSchema,
        plan: SafeRelativePathSchema,
        allocation: SafeRelativePathSchema,
        report: SafeRelativePathSchema,
      })
      .strict(),
    protectedSha256: z
      .object({
        study: Sha256Schema,
        contract: Sha256Schema,
      })
      .strict(),
  })
  .strict();

type Payload = z.infer<typeof ExperimentalDesignGradeV2PayloadSchema>;
type GradeResult = Awaited<ReturnType<CustomEvaluator["run"]>>;

const DesignPropertiesSchema = z
  .object({
    preservesAssignmentUnits: z.boolean(),
    balancesGlobally: z.boolean(),
    balancesWithinStrata: z.boolean(),
    supportsSequentialEnrollment: z.boolean(),
  })
  .passthrough();

const PlanSchema = z
  .object({
    studyId: z.string().min(1),
    method: z.string().trim().min(1),
    assignmentLevel: z.enum(["individual", "cluster"]),
    assignmentUnit: z.string().min(1),
    analysisUnit: z.string().min(1),
    response: z.string().min(1),
    arms: z.array(z.string().min(1)).min(2),
    seed: z.number().int().nonnegative(),
    allocationPath: z.literal("design/allocation.csv"),
    designProperties: DesignPropertiesSchema,
  })
  .passthrough();

type Plan = z.infer<typeof PlanSchema>;

class UnsafeFilesystemPathError extends Error {}

function passing(details: string, score = 1): GradeResult {
  return { pass: true, score, details };
}

function failing(details: string, score = 0): GradeResult {
  return { pass: false, score, details };
}

function infrastructure(details: string): GradeResult {
  return { pass: false, score: 0, details, infraError: details };
}

function isContained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) &&
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`))
  );
}

async function resolveSafePath(
  root: string,
  relativePath: string,
): Promise<string | undefined> {
  const segments = relativePath.split("/");
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    if (!isContained(root, current)) throw new UnsafeFilesystemPathError();
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) throw new UnsafeFilesystemPathError();
    } catch (error) {
      if (error instanceof UnsafeFilesystemPathError) throw error;
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }
  const resolved = await realpath(current);
  if (!isContained(root, resolved)) throw new UnsafeFilesystemPathError();
  return resolved;
}

async function readSafeFile(
  root: string,
  relativePath: string,
): Promise<Buffer | undefined> {
  const resolved = await resolveSafePath(root, relativePath);
  if (resolved === undefined) return undefined;
  if (!(await lstat(resolved)).isFile()) return undefined;
  return readFile(resolved);
}

function decodeUtf8(bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

function parseStrictJson(text: string): unknown | undefined {
  try {
    const parsed = JSON.parse(text) as unknown;
    const document = parseDocument(text, {
      schema: "json",
      uniqueKeys: true,
    });
    if (document.errors.length > 0) return undefined;
    document.toJS({ maxAliasCount: 0 });
    return parsed;
  } catch {
    return undefined;
  }
}

async function loadStudy(
  root: string,
  relativePath: string,
): Promise<ExperimentalDesignV2Study | undefined> {
  const bytes = await readSafeFile(root, relativePath);
  const text = bytes && decodeUtf8(bytes);
  if (text === undefined) return undefined;
  const value = parseStrictJson(text);
  try {
    return parseExperimentalDesignV2Study(value);
  } catch {
    return undefined;
  }
}

async function loadPlan(root: string, relativePath: string): Promise<Plan | undefined> {
  const bytes = await readSafeFile(root, relativePath);
  const text = bytes && decodeUtf8(bytes);
  if (text === undefined) return undefined;
  return PlanSchema.safeParse(parseStrictJson(text)).data;
}

async function loadAllocation(
  root: string,
  relativePath: string,
): Promise<ReturnType<typeof parseExperimentalDesignV2AllocationCsv> | undefined> {
  const bytes = await readSafeFile(root, relativePath);
  const text = bytes && decodeUtf8(bytes);
  if (text === undefined) return undefined;
  try {
    return parseExperimentalDesignV2AllocationCsv(text);
  } catch {
    return undefined;
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function checkInputIntegrity(payload: Payload, root: string): Promise<GradeResult> {
  const [studyBytes, contractBytes] = await Promise.all([
    readSafeFile(root, payload.paths.study),
    readSafeFile(root, payload.paths.contract),
  ]);
  const matches =
    studyBytes !== undefined &&
    contractBytes !== undefined &&
    sha256(studyBytes) === payload.protectedSha256.study &&
    sha256(contractBytes) === payload.protectedSha256.contract;
  return matches
    ? passing("Protected public inputs are unchanged.")
    : failing("A protected public input is missing or changed.");
}

async function checkArtifactContract(
  payload: Payload,
  root: string,
  initialWorkdirManifest: InitialWorkdirManifestReference | undefined,
): Promise<GradeResult> {
  if (!initialWorkdirManifest) {
    return infrastructure("Experimental-design v2 initial workdir provenance is unavailable.");
  }
  const [plan, allocation, reportBytes, initialManifest] = await Promise.all([
    loadPlan(root, payload.paths.plan),
    loadAllocation(root, payload.paths.allocation),
    readSafeFile(root, payload.paths.report),
    readInitialWorkdirManifest({ workDir: root, reference: initialWorkdirManifest }),
  ]);
  const report = reportBytes && decodeUtf8(reportBytes);
  const delta = await assessWorkdirDelta({
    workDir: root,
    initialManifest,
    allowedNewDirectories: ["design"],
    requiredNewFiles: [...OUTPUT_PATHS],
  });
  return plan && allocation && report !== undefined && report.length > 0 && delta.status === "pass"
    ? passing("The three public design artifacts are present and parseable.")
    : failing("The public design artifact contract is incomplete or invalid.");
}

function publicProperties(properties: ExperimentalDesignV2Properties): Record<string, boolean> {
  return Object.fromEntries(PROPERTY_KEYS.map((key) => [key, properties[key]]));
}

function planMatchesPublicStudy(
  plan: Plan,
  study: ExperimentalDesignV2Study,
  properties: ExperimentalDesignV2Properties,
): boolean {
  return (
    plan.studyId === study.studyId &&
    plan.assignmentLevel === study.assignmentLevel &&
    plan.assignmentUnit === study.assignmentUnit &&
    plan.analysisUnit === study.analysisUnit &&
    plan.response === study.response &&
    isDeepStrictEqual(plan.arms, study.arms) &&
    plan.seed === study.seed &&
    plan.allocationPath === "design/allocation.csv" &&
    isDeepStrictEqual(
      publicProperties(plan.designProperties),
      publicProperties(properties),
    )
  );
}

async function checkDesignSemantics(payload: Payload, root: string): Promise<GradeResult> {
  const [study, plan, allocation] = await Promise.all([
    loadStudy(root, payload.paths.study),
    loadPlan(root, payload.paths.plan),
    loadAllocation(root, payload.paths.allocation),
  ]);
  if (!study || !plan || !allocation) {
    return failing("Study, plan, or allocation is missing or invalid.");
  }
  const assessment = assessExperimentalDesignV2Allocation(study, allocation);
  return planMatchesPublicStudy(plan, study, assessment.properties)
    ? passing("Plan semantics match the public study and observed allocation.")
    : failing("Plan semantics contradict the public study or observed allocation.");
}

async function checkAllocationSafety(payload: Payload, root: string): Promise<GradeResult> {
  const [study, allocation] = await Promise.all([
    loadStudy(root, payload.paths.study),
    loadAllocation(root, payload.paths.allocation),
  ]);
  if (!study || !allocation) {
    return failing("Study or allocation is missing or invalid.");
  }
  const assessment = assessExperimentalDesignV2Allocation(study, allocation);
  const safe =
    assessment.coverageValid &&
    assessment.armsValid &&
    assessment.strataValid &&
    assessment.sequentialValid;
  return safe
    ? passing("Allocation satisfies the public unit and balance invariants.")
    : failing("Allocation violates a public unit or balance invariant.");
}

function extractEvidenceBlock(report: string): Record<string, unknown> | undefined {
  const lines = report.split(/\r\n?|\n/);
  const openings = lines.flatMap((line, index) =>
    line.replace(/ +$/u, "") === REPORT_OPENING ? [index] : [],
  );
  if (openings.length !== 1) return undefined;
  const opening = openings[0]!;
  const closingOffset = lines
    .slice(opening + 1)
    .findIndex((line) => line.replace(/ +$/u, "") === REPORT_CLOSING);
  if (closingOffset < 0) return undefined;
  const closing = opening + 1 + closingOffset;
  const parsed = parseStrictJson(lines.slice(opening + 1, closing).join("\n"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  return parsed as Record<string, unknown>;
}

function own(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function scalarAtom(
  evidence: Record<string, unknown>,
  expected: Record<string, unknown>,
): { complete: boolean; contradiction: boolean } {
  const keys = Object.keys(expected);
  return {
    complete: keys.every((key) => own(evidence, key) && isDeepStrictEqual(evidence[key], expected[key])),
    contradiction: keys.some(
      (key) => own(evidence, key) && !isDeepStrictEqual(evidence[key], expected[key]),
    ),
  };
}

function armCounts(
  study: ExperimentalDesignV2Study,
  allocation: ReturnType<typeof parseExperimentalDesignV2AllocationCsv>,
): Record<string, number> {
  const counts = Object.fromEntries(study.arms.map((arm) => [arm, 0]));
  for (const row of allocation) {
    counts[row.arm] = (counts[row.arm] ?? 0) + 1;
  }
  return counts;
}

function exactStringSet(value: unknown, expected: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.every((entry): entry is string => typeof entry === "string") &&
    new Set(value).size === value.length &&
    isDeepStrictEqual([...value].sort(), [...expected].sort())
  );
}

function propertiesMatch(value: unknown, expected: ExperimentalDesignV2Properties): boolean {
  const parsed = DesignPropertiesSchema.safeParse(value);
  return (
    parsed.success &&
    isDeepStrictEqual(
      publicProperties(parsed.data),
      publicProperties(expected),
    )
  );
}

async function checkReportConsistency(payload: Payload, root: string): Promise<GradeResult> {
  const [study, plan, allocation, reportBytes] = await Promise.all([
    loadStudy(root, payload.paths.study),
    loadPlan(root, payload.paths.plan),
    loadAllocation(root, payload.paths.allocation),
    readSafeFile(root, payload.paths.report),
  ]);
  const report = reportBytes && decodeUtf8(reportBytes);
  if (!study || !allocation || report === undefined) {
    return passing("Report evidence is unavailable or structurally invalid.", 0);
  }
  const evidence = extractEvidenceBlock(report);
  if (!evidence) {
    return passing("Report evidence is unavailable or structurally invalid.", 0);
  }

  let score = 0.25;
  let contradiction = false;
  const studyAtom = scalarAtom(evidence, {
    studyId: study.studyId,
    assignmentUnit: study.assignmentUnit,
    analysisUnit: study.analysisUnit,
    response: study.response,
    seed: study.seed,
  });
  if (studyAtom.complete) score += 0.25;
  contradiction ||= studyAtom.contradiction;

  const allocationAtom = scalarAtom(evidence, {
    allocationPath: payload.paths.allocation,
    allocationRows: allocation.length,
    armCounts: armCounts(study, allocation),
  });
  if (allocationAtom.complete) score += 0.25;
  contradiction ||= allocationAtom.contradiction;

  const assessment = assessExperimentalDesignV2Allocation(study, allocation);
  const propertiesPresent = own(evidence, "designProperties");
  const limitationsPresent = own(evidence, "limitationFlags");
  const propertiesMatchDerived = propertiesMatch(
    evidence.designProperties,
    assessment.properties,
  );
  const propertiesMatchPlan =
    plan !== undefined &&
    propertiesMatch(evidence.designProperties, plan.designProperties);
  const limitationsMatch = exactStringSet(
    evidence.limitationFlags,
    deriveExperimentalDesignV2LimitationFlags(study),
  );
  if (
    propertiesPresent &&
    limitationsPresent &&
    propertiesMatchDerived &&
    propertiesMatchPlan &&
    limitationsMatch
  ) {
    score += 0.25;
  }
  contradiction ||=
    (propertiesPresent && (!propertiesMatchDerived || !propertiesMatchPlan)) ||
    (limitationsPresent && !limitationsMatch);

  return contradiction
    ? failing("Report evidence contradicts observable design facts.", score)
    : passing("Report evidence is consistent with its observable fields.", score);
}

export const experimentalDesignGradeV2: CustomEvaluator = {
  validatePayload(payload) {
    ExperimentalDesignGradeV2PayloadSchema.parse(payload);
  },

  async run({ criterion, runResult }) {
    const parsed = ExperimentalDesignGradeV2PayloadSchema.safeParse(criterion.payload);
    if (!parsed.success) {
      return infrastructure("Invalid experimental-design v2 evaluator payload.");
    }
    try {
      const root = await realpath(runResult.workDir);
      if (!(await lstat(root)).isDirectory()) {
        return infrastructure("Experimental-design v2 evaluator workdir is unavailable.");
      }
      switch (parsed.data.check) {
        case "input-integrity":
          return await checkInputIntegrity(parsed.data, root);
        case "artifact-contract":
          return await checkArtifactContract(
            parsed.data,
            root,
            runResult.initialWorkdirManifest,
          );
        case "design-semantics":
          return await checkDesignSemantics(parsed.data, root);
        case "allocation-safety":
          return await checkAllocationSafety(parsed.data, root);
        case "report-consistency":
          return await checkReportConsistency(parsed.data, root);
      }
    } catch (error) {
      if (error instanceof UnsafeFilesystemPathError) {
        return infrastructure("Unsafe experimental-design v2 evaluator filesystem path.");
      }
      return infrastructure("Experimental-design v2 evaluator filesystem failure.");
    }
  },
};

registerCustomEvaluator("skill-ir-experimental-design-v2", experimentalDesignGradeV2);
