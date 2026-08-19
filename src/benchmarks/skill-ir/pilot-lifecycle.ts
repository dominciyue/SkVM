import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { SkillIRBenchmarkTask } from "./real-agent";
import type { RawAgentRunRow, ScoredAgentRunRow } from "./scoring";
import { sha256Bytes } from "./source-fixture";
import { runValidatedArtifactAssemblyParity } from "./validated-artifact-assembly-parity";
import {
  buildValidatedArtifactDevelopmentGateReport,
  type ValidatedArtifactDevelopmentGateReport,
} from "./validated-artifact-development-gate";
import type { ValidatedArtifactDevelopmentLock } from "./validated-artifact-development";

export const PILOT_LIFECYCLE_STAGES = [
  "import",
  "contract",
  "disclosure",
  "freeze",
  "qualification",
  "calibrate",
  "base-ir-static",
  "residual-admission",
  "artifact",
  "report",
] as const;

const IdentifierSchema = z.string().regex(/^[a-z][a-z0-9-]{0,95}$/u);
const RepoPathSchema = z.string().min(1).refine((value) => {
  if (value.includes("\\") || value.startsWith("/") || /^[A-Za-z]:/u.test(value)) return false;
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}, "path must be a safe POSIX repository-relative path");
const JsonPointerSchema = z.string().regex(/^(?:\/(?:[^~/]|~[01])*)+$/u);
const JsonScalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const EvidenceCheckSchema = z.object({
  path: RepoPathSchema,
  statusPointer: JsonPointerSchema,
  passValue: JsonScalarSchema,
}).strict();

const PositiveShadowSchema = z.object({
  kind: z.literal("positive-parity"),
  lockPath: RepoPathSchema,
  qualificationPath: RepoPathSchema,
  rawRowsPath: RepoPathSchema,
  scoredRowsPath: RepoPathSchema,
  gateReportPath: RepoPathSchema,
  expectedDecision: z.enum(["quality-positive", "fidelity-preserving"]),
}).strict();

const NegativeShadowSchema = z.object({
  kind: z.literal("negative-disclosure-canary"),
  expectedDecision: z.literal("measurement-invalid"),
  expectedBlocker: z.string().min(1),
}).strict();

export const PilotAdapterSchema = z.object({
  schemaVersion: z.literal("skill-ir-pilot-adapter/v1"),
  adapterId: IdentifierSchema,
  skillId: IdentifierSchema,
  phenotype: IdentifierSchema,
  source: z.object({
    closure: z.array(RepoPathSchema).min(1),
    licensePath: RepoPathSchema,
    provenancePath: RepoPathSchema.optional(),
  }).strict(),
  contract: z.object({
    taskBuilder: z.object({
      modulePath: RepoPathSchema,
      exportName: z.string().regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/u),
    }).strict(),
    taskRegistryPath: RepoPathSchema,
    publicInterfacePath: RepoPathSchema,
    audit: EvidenceCheckSchema,
  }).strict(),
  scorer: z.object({
    entryPath: RepoPathSchema,
    oracleEntryPath: RepoPathSchema.optional(),
    sourceAnchors: z.array(z.object({
      path: RepoPathSchema,
      lineStart: z.number().int().positive(),
      lineEnd: z.number().int().positive().optional(),
    }).strict()).min(1),
    disclosure: EvidenceCheckSchema.extend({
      blockerPointer: JsonPointerSchema.optional(),
    }).strict(),
  }).strict(),
  artifact: z.object({
    packages: z.array(z.object({
      caseId: IdentifierSchema,
      phenotype: IdentifierSchema,
      packagePath: RepoPathSchema,
    }).strict()).min(2),
  }).strict().optional(),
  runtime: z.object({
    resourceContractPath: RepoPathSchema.optional(),
    platforms: z.array(z.string().min(1)).min(1),
    requiredEnvironment: z.array(z.string().regex(/^[A-Z][A-Z0-9_]*$/u)),
  }).strict(),
  budgets: z.object({
    qualificationCalls: z.number().int().nonnegative(),
    calibrationCalls: z.number().int().nonnegative(),
    staticCalls: z.number().int().nonnegative(),
    dynamicCalls: z.number().int().nonnegative(),
    heldOutCalls: z.literal(0),
  }).strict(),
  stopPolicy: z.object({
    stopOnDisclosureFailure: z.literal(true),
    stopOnStageFailure: z.literal(true),
  }).strict(),
  shadow: z.discriminatedUnion("kind", [PositiveShadowSchema, NegativeShadowSchema]),
}).strict().superRefine((adapter, context) => {
  if (adapter.shadow.kind === "positive-parity" && adapter.artifact === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["artifact"],
      message: "positive parity adapter requires artifact packages",
    });
  }
  for (const anchor of adapter.scorer.sourceAnchors) {
    if (anchor.lineEnd !== undefined && anchor.lineEnd < anchor.lineStart) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scorer", "sourceAnchors"],
        message: "source anchor lineEnd must be at or after lineStart",
      });
    }
  }
});

export const PilotAdapterCatalogSchema = z.object({
  schemaVersion: z.literal("skill-ir-pilot-adapter-catalog/v1"),
  adapters: z.array(PilotAdapterSchema).min(1),
}).strict().superRefine((catalog, context) => {
  if (new Set(catalog.adapters.map((entry) => entry.adapterId)).size !== catalog.adapters.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "pilot adapter ids must be unique" });
  }
});

export type PilotAdapter = z.infer<typeof PilotAdapterSchema>;

type LifecycleStage = {
  id: typeof PILOT_LIFECYCLE_STAGES[number];
  status: "passed" | "failed" | "blocked" | "skipped";
  detail: string;
};

export type PilotLifecycleShadowCaseReport = {
  adapterId: string;
  skillId: string;
  phenotype: string;
  decision: "quality-positive" | "fidelity-preserving" | "measurement-invalid";
  blocker: string | null;
  stages: LifecycleStage[];
  inputDigests: Record<string, string>;
  paidCalls: {
    qualification: 0;
    calibration: 0;
    static: 0;
    dynamic: 0;
    heldOut: 0;
    total: 0;
  };
  shadow: {
    adapterBuilderLoads: number;
    adapterBuilderCalls: number;
    logicalPlanBuilds: number;
    planRows: number;
    planParity: boolean;
    reportParity: boolean;
    packageCount: number;
    byteParityCount: number;
    coreBranchDelta: number;
  };
  ready: boolean;
};

const ZERO_PAID_CALLS = {
  qualification: 0,
  calibration: 0,
  static: 0,
  dynamic: 0,
  heldOut: 0,
  total: 0,
} as const;

function resolveRepoPath(rootDir: string, relativePath: string): string {
  const root = path.resolve(rootDir);
  const target = path.resolve(root, ...relativePath.split("/"));
  const relative = path.relative(root, target);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Pilot adapter path escapes repository root: ${relativePath}`);
  }
  return target;
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

async function readJsonl<T>(filePath: string): Promise<T[]> {
  return (await readFile(filePath, "utf8"))
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

async function digestPath(absolutePath: string, relativePath = ""): Promise<string> {
  const stat = await lstat(absolutePath);
  if (stat.isFile() && !stat.isSymbolicLink()) return sha256Bytes(await readFile(absolutePath));
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`Pilot adapter input must be a regular file or directory: ${absolutePath}`);
  }
  const records: string[] = [];
  for (const entry of (await readdir(absolutePath, { withFileTypes: true }))
    .sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    const childRelative = relativePath ? `${relativePath}/${entry.name}` : entry.name;
    const childPath = path.join(absolutePath, entry.name);
    if (entry.isDirectory()) records.push(`${childRelative}\0${await digestPath(childPath, childRelative)}`);
    else if (entry.isFile()) records.push(`${childRelative}\0${sha256Bytes(await readFile(childPath))}`);
    else throw new Error(`Pilot adapter directory contains unsupported entry: ${childRelative}`);
  }
  return sha256Bytes(Buffer.from(records.join("\n"), "utf8"));
}

function jsonPointer(input: unknown, pointer: string): unknown {
  return pointer.slice(1).split("/").reduce<unknown>((current, segment) => {
    if (typeof current !== "object" || current === null) return undefined;
    const key = segment.replace(/~1/gu, "/").replace(/~0/gu, "~");
    return (current as Record<string, unknown>)[key];
  }, input);
}

function declaredPaths(adapter: PilotAdapter): string[] {
  const paths = [
    ...adapter.source.closure,
    adapter.source.licensePath,
    adapter.source.provenancePath,
    adapter.contract.taskBuilder.modulePath,
    adapter.contract.taskRegistryPath,
    adapter.contract.publicInterfacePath,
    adapter.contract.audit.path,
    adapter.scorer.entryPath,
    adapter.scorer.oracleEntryPath,
    adapter.scorer.disclosure.path,
    adapter.runtime.resourceContractPath,
    ...adapter.scorer.sourceAnchors.map((anchor) => anchor.path),
    ...adapter.artifact?.packages.map((entry) => entry.packagePath) ?? [],
    ...(adapter.shadow.kind === "positive-parity" ? [
      adapter.shadow.lockPath,
      adapter.shadow.qualificationPath,
      adapter.shadow.rawRowsPath,
      adapter.shadow.scoredRowsPath,
      adapter.shadow.gateReportPath,
    ] : []),
  ].filter((value): value is string => value !== undefined);
  return [...new Set(paths)];
}

async function verifyDeclaredInputs(rootDir: string, adapter: PilotAdapter): Promise<Record<string, string>> {
  const inputDigests: Record<string, string> = {};
  for (const relativePath of declaredPaths(adapter)) {
    const absolute = resolveRepoPath(rootDir, relativePath);
    inputDigests[relativePath] = await digestPath(absolute);
  }
  for (const anchor of adapter.scorer.sourceAnchors) {
    const lines = (await readFile(resolveRepoPath(rootDir, anchor.path), "utf8")).split(/\r?\n/u);
    const lineEnd = anchor.lineEnd ?? anchor.lineStart;
    if (lineEnd > lines.length) throw new Error(`Pilot adapter source anchor exceeds ${anchor.path}`);
  }
  return inputDigests;
}

function blockedStages(failedStage: "contract" | "disclosure", detail: string): LifecycleStage[] {
  const failureIndex = PILOT_LIFECYCLE_STAGES.indexOf(failedStage);
  return PILOT_LIFECYCLE_STAGES.map((id, index) => {
    if (index < failureIndex) return { id, status: "passed", detail: "shadow preflight passed" };
    if (index === failureIndex) return { id, status: "failed", detail };
    if (id === "report") return { id, status: "passed", detail: "fail-closed compact report emitted" };
    return { id, status: "blocked", detail: `blocked by ${failedStage}` };
  });
}

function normalizeGateRows(rows: ValidatedArtifactDevelopmentGateReport["records"]): string[] {
  return rows.map((row) => `${row.taskId}\0${row.runIndex}\0${row.system}`).sort();
}

function buildLogicalShadowPlan(lock: ValidatedArtifactDevelopmentLock): Array<{
  taskId: string;
  runIndex: number;
  system: string;
}> {
  const rows: Array<{ taskId: string; runIndex: number; system: string }> = [];
  for (const taskId of lock.matrix.taskIds) {
    for (let runIndex = 1; runIndex <= lock.matrix.repetitions; runIndex += 1) {
      for (const system of lock.matrix.systems) rows.push({ taskId, runIndex, system });
    }
  }
  return rows;
}

function normalizeLogicalPlanRows(rows: Array<{ taskId: string; runIndex: number; system: string }>): string[] {
  return rows.map((row) => `${row.taskId}\0${row.runIndex}\0${row.system}`).sort();
}

function deriveDecision(gate: ValidatedArtifactDevelopmentGateReport) {
  const artifact = gate.systems["validated-artifact"].meanScoreIncludingMissing;
  const comparison = Math.max(
    gate.systems.original.meanScoreIncludingMissing,
    gate.systems["ir-static"].meanScoreIncludingMissing,
  );
  if (gate.gate.passed && artifact > comparison) return "quality-positive" as const;
  if (gate.gate.passed && artifact >= comparison) return "fidelity-preserving" as const;
  throw new Error("Positive pilot shadow evidence no longer supports its frozen classification");
}

async function rebuildGate(
  rootDir: string,
  adapter: PilotAdapter,
  shadow: z.infer<typeof PositiveShadowSchema>,
): Promise<{
  gate: ValidatedArtifactDevelopmentGateReport;
  expected: ValidatedArtifactDevelopmentGateReport;
}> {
  const lock = await readJson(resolveRepoPath(rootDir, shadow.lockPath)) as ValidatedArtifactDevelopmentLock;
  const registry = await readJson(resolveRepoPath(rootDir, adapter.contract.taskRegistryPath)) as {
    tasks: SkillIRBenchmarkTask[];
  };
  const [rawRows, scoredRows, expected] = await Promise.all([
    readJsonl<RawAgentRunRow>(resolveRepoPath(rootDir, shadow.rawRowsPath)),
    readJsonl<ScoredAgentRunRow>(resolveRepoPath(rootDir, shadow.scoredRowsPath)),
    readJson(resolveRepoPath(rootDir, shadow.gateReportPath)) as Promise<ValidatedArtifactDevelopmentGateReport>,
  ]);
  return {
    gate: buildValidatedArtifactDevelopmentGateReport({
      lock,
      tasks: registry.tasks.map((task) => ({
        id: task.id,
        split: task.split,
        hardGateIds: task.hardGateIds ?? [],
      })),
      rawRows,
      scoredRows,
    }),
    expected,
  };
}

export async function runPilotLifecycleShadow(
  rootDir: string,
  rawAdapter: unknown,
): Promise<PilotLifecycleShadowCaseReport> {
  const adapter = PilotAdapterSchema.parse(rawAdapter);
  const inputDigests = await verifyDeclaredInputs(rootDir, adapter);
  const contractAudit = await readJson(resolveRepoPath(rootDir, adapter.contract.audit.path));
  const contractStatus = jsonPointer(contractAudit, adapter.contract.audit.statusPointer);
  if (!isDeepStrictEqual(contractStatus, adapter.contract.audit.passValue)) {
    return {
      adapterId: adapter.adapterId,
      skillId: adapter.skillId,
      phenotype: adapter.phenotype,
      decision: adapter.shadow.expectedDecision,
      blocker: "benchmark-contract",
      stages: blockedStages("contract", "declared contract audit did not pass"),
      inputDigests,
      paidCalls: ZERO_PAID_CALLS,
      shadow: {
        adapterBuilderLoads: 0, adapterBuilderCalls: 0, logicalPlanBuilds: 0,
        planRows: 0, planParity: false, reportParity: false,
        packageCount: 0, byteParityCount: 0, coreBranchDelta: 0,
      },
      ready: false,
    };
  }

  const disclosure = await readJson(resolveRepoPath(rootDir, adapter.scorer.disclosure.path));
  const disclosureStatus = jsonPointer(disclosure, adapter.scorer.disclosure.statusPointer);
  if (!isDeepStrictEqual(disclosureStatus, adapter.scorer.disclosure.passValue)) {
    const blocker = adapter.scorer.disclosure.blockerPointer
      ? jsonPointer(disclosure, adapter.scorer.disclosure.blockerPointer)
      : undefined;
    const expectedBlocker = adapter.shadow.kind === "negative-disclosure-canary"
      ? adapter.shadow.expectedBlocker
      : "scorer-authority";
    if (blocker !== expectedBlocker) {
      throw new Error(`Disclosure blocker drift: expected ${expectedBlocker}, observed ${String(blocker)}`);
    }
    return {
      adapterId: adapter.adapterId,
      skillId: adapter.skillId,
      phenotype: adapter.phenotype,
      decision: "measurement-invalid",
      blocker: expectedBlocker,
      stages: blockedStages("disclosure", "public scorer schema disclosure failed"),
      inputDigests,
      paidCalls: ZERO_PAID_CALLS,
      shadow: {
        adapterBuilderLoads: 0, adapterBuilderCalls: 0, logicalPlanBuilds: 0,
        planRows: 0, planParity: false, reportParity: false,
        packageCount: 0, byteParityCount: 0, coreBranchDelta: 0,
      },
      ready: adapter.shadow.kind === "negative-disclosure-canary",
    };
  }
  if (adapter.shadow.kind !== "positive-parity" || adapter.artifact === undefined) {
    throw new Error("Negative disclosure canary unexpectedly passed disclosure");
  }

  const lockBytes = await readFile(resolveRepoPath(rootDir, adapter.shadow.lockPath));
  const lock = JSON.parse(lockBytes.toString("utf8")) as ValidatedArtifactDevelopmentLock;
  const qualification = await readJson(resolveRepoPath(rootDir, adapter.shadow.qualificationPath)) as {
    status?: unknown;
    lockSha256?: unknown;
  };
  if (qualification.status !== "passed" || qualification.lockSha256 !== sha256Bytes(lockBytes)) {
    throw new Error("Shadow qualification is failed or stale against the declared lock");
  }

  const taskBuilderModule = await import(pathToFileURL(
    resolveRepoPath(rootDir, adapter.contract.taskBuilder.modulePath),
  ).href);
  if (typeof taskBuilderModule[adapter.contract.taskBuilder.exportName] !== "function") {
    throw new Error(`Task builder export is not callable: ${adapter.contract.taskBuilder.exportName}`);
  }
  const plan = buildLogicalShadowPlan(lock);
  const rebuilt = await rebuildGate(rootDir, adapter, adapter.shadow);
  const planParity = isDeepStrictEqual(
    normalizeLogicalPlanRows(plan),
    normalizeGateRows(rebuilt.expected.records),
  );
  const reportParity = isDeepStrictEqual(rebuilt.gate, rebuilt.expected);
  const assembly = await runValidatedArtifactAssemblyParity({
    rootDir,
    cases: adapter.artifact.packages,
  });
  const lifecycleSource = await readFile(
    resolveRepoPath(rootDir, "src/benchmarks/skill-ir/pilot-lifecycle.ts"),
    "utf8",
  );
  const coreBranchDelta = Number(lifecycleSource.includes(adapter.skillId))
    + assembly.summary.coreBranchDelta;
  const decision = deriveDecision(rebuilt.gate);
  if (decision !== adapter.shadow.expectedDecision) {
    throw new Error(`Shadow classification drift: expected ${adapter.shadow.expectedDecision}, observed ${decision}`);
  }
  const byteParityCount = assembly.summary.byteParityCount;
  const ready = planParity
    && reportParity
    && assembly.summary.ready
    && coreBranchDelta === 0;
  const stages: LifecycleStage[] = [
      { id: "import", status: "passed", detail: "declared source, license, plugin, and runtime inputs loaded" },
      { id: "contract", status: "passed", detail: "declared public contract audit passed" },
      { id: "disclosure", status: "passed", detail: "declared scorer disclosure passed" },
      { id: "freeze", status: "passed", detail: "lock and input digests recorded without mutation" },
      { id: "qualification", status: "passed", detail: "frozen qualification matched the current lock digest" },
      { id: "calibrate", status: planParity ? "passed" : "failed", detail: "shadow plan identity compared with frozen rows" },
      { id: "base-ir-static", status: reportParity ? "passed" : "failed", detail: "frozen raw/scored evidence rebuilt through the common gate" },
      { id: "residual-admission", status: "skipped", detail: "direct deterministic artifact route has no typed residual" },
      { id: "artifact", status: assembly.summary.ready ? "passed" : "failed", detail: "packages rebuilt byte-for-byte through common assembly" },
      { id: "report", status: ready ? "passed" : "failed", detail: "compact shadow parity report assembled" },
  ];
  return {
    adapterId: adapter.adapterId,
    skillId: adapter.skillId,
    phenotype: adapter.phenotype,
    decision,
    blocker: null,
    stages,
    inputDigests,
    paidCalls: ZERO_PAID_CALLS,
    shadow: {
      adapterBuilderLoads: 1,
      adapterBuilderCalls: 0,
      logicalPlanBuilds: 1,
      planRows: plan.length,
      planParity,
      reportParity,
      packageCount: assembly.summary.caseCount,
      byteParityCount,
      coreBranchDelta,
    },
    ready,
  };
}
