import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { SkillIRSchema } from "../../skill-ir/schema";
import { SkillIRSourceAuditSchema, verifySkillIRSourceAudit } from "../../skill-ir/source-audit";
import {
  DualSourceRepairMappingCatalogSchema,
  buildDualSourceRepairAdmission,
  type DualSourceRepairEvidenceV2,
} from "./repair-evidence";
import { buildStaticDevelopmentV2GateReport } from "./static-development-gate-v2";
import {
  StaticDevelopmentV2LockSchema,
  readAndValidateStaticDevelopmentV2Lock,
  type StaticDevelopmentV2Lock,
} from "./static-development-v2";
import {
  selectMatchedExecutionBlocks,
  type ExecutionEnvelope,
} from "./execution-resilience";
import type { ScoredAgentRunRow } from "./scoring";
import { sha256Bytes } from "./source-fixture";

export type DualSourceResidualAdmissionRunArgs = {
  rootDir: string;
  lockPath: string;
  gatePath: string;
  envelopesPath: string;
  scoredPath: string;
  mappingCatalogPath: string;
  outPath: string;
};

function resolveFromRoot(rootDir: string, value: string): string {
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(rootDir, value);
}

function repositoryRelative(rootDir: string, value: string): string {
  const relative = path.relative(rootDir, value).replaceAll("\\", "/");
  if (relative === ".." || relative.startsWith("../") || path.isAbsolute(relative)) {
    throw new Error(`Dual-source admission input escapes repository root: ${value}`);
  }
  return relative;
}

function parseJsonl<T>(bytes: Buffer): T[] {
  return bytes.toString("utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalJson(nested)]),
  );
}

function sameGate(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right));
}

export async function runDualSourceResidualAdmission(
  args: DualSourceResidualAdmissionRunArgs,
): Promise<DualSourceRepairEvidenceV2> {
  const rootDir = path.resolve(args.rootDir);
  const absolute = {
    lock: resolveFromRoot(rootDir, args.lockPath),
    gate: resolveFromRoot(rootDir, args.gatePath),
    envelopes: resolveFromRoot(rootDir, args.envelopesPath),
    scored: resolveFromRoot(rootDir, args.scoredPath),
    mappingCatalog: resolveFromRoot(rootDir, args.mappingCatalogPath),
    out: resolveFromRoot(rootDir, args.outPath),
  };
  const [lockBytes, gateBytes, envelopeBytes, scoredBytes, catalogBytes] = await Promise.all([
    readFile(absolute.lock), readFile(absolute.gate), readFile(absolute.envelopes),
    readFile(absolute.scored), readFile(absolute.mappingCatalog),
  ]);
  const catalog = DualSourceRepairMappingCatalogSchema.parse(JSON.parse(catalogBytes.toString("utf8")));
  let lock: StaticDevelopmentV2Lock;
  if (catalog.scope === "prospective-development") {
    lock = await readAndValidateStaticDevelopmentV2Lock({ rootDir, lockPath: absolute.lock });
  } else {
    lock = StaticDevelopmentV2LockSchema.parse(JSON.parse(lockBytes.toString("utf8")));
    for (const frozen of Object.values(lock.frozenInputs)) {
      const bytes = await readFile(resolveFromRoot(rootDir, frozen.path));
      if (sha256Bytes(bytes) !== frozen.sha256) {
        throw new Error(`Historical dual-source admission frozen input digest mismatch for ${frozen.path}`);
      }
    }
  }
  const [baseIRBytes, sourceAuditBytes, taskBytes] = await Promise.all([
    readFile(resolveFromRoot(rootDir, lock.frozenInputs.baseIr.path)),
    readFile(resolveFromRoot(rootDir, lock.frozenInputs.sourceAudit.path)),
    readFile(resolveFromRoot(rootDir, lock.frozenInputs.tasks.path)),
  ]);
  const baseIR = SkillIRSchema.parse(JSON.parse(baseIRBytes.toString("utf8")));
  if (baseIR.profile.length !== 0) throw new Error("Dual-source admission requires profile-empty base IR");
  const sourceAudit = SkillIRSourceAuditSchema.parse(JSON.parse(sourceAuditBytes.toString("utf8")));
  const auditReport = await verifySkillIRSourceAudit(baseIR, sourceAudit, rootDir);
  if (auditReport.errors.length > 0 || auditReport.warnings.length > 0) {
    throw new Error(`Dual-source admission source audit failed: ${[...auditReport.errors, ...auditReport.warnings].join("; ")}`);
  }
  const taskSet = JSON.parse(taskBytes.toString("utf8")) as {
    tasks: Array<{ id: string; split: string; hardGateIds?: string[] }>;
  };
  const envelopes = parseJsonl<ExecutionEnvelope>(envelopeBytes);
  const scoredRows = parseJsonl<ScoredAgentRunRow>(scoredBytes);
  const recomputedGate = buildStaticDevelopmentV2GateReport({
    lock,
    tasks: taskSet.tasks.filter((task) => lock.matrix.taskIds.includes(task.id))
      .map((task) => ({ id: task.id, split: task.split, hardGateIds: task.hardGateIds ?? [] })),
    envelopes,
    scoredRows,
  });
  const recordedGate = JSON.parse(gateBytes.toString("utf8"));
  if (!sameGate(recordedGate, recomputedGate)) {
    throw new Error("Recorded static gate does not match recomputed gate");
  }
  const selection = selectMatchedExecutionBlocks({
    taskIds: lock.matrix.taskIds,
    systems: lock.matrix.systems,
    targetBlocksPerTask: lock.matrix.targetBlocksPerTask,
    reserveBlocksPerTask: lock.matrix.reserveBlocksPerTask,
    envelopes,
  });
  const selectedBlocks = new Set(selection.selectedBlocks.map((block) => `${block.taskId}\0${block.candidateBlock}`));
  const selectedDualSourceRows = scoredRows.filter((row) =>
    (row.system === "original" || row.system === "ir-static")
    && selectedBlocks.has(`${row.task}\0${row.runIndex}`));
  const digestRef = (absolutePath: string, bytes: Uint8Array) => ({
    path: repositoryRelative(rootDir, absolutePath),
    sha256: sha256Bytes(bytes),
  });
  const report = buildDualSourceRepairAdmission({
    skillId: lock.skillId,
    experimentId: lock.experimentId,
    staticGate: recomputedGate,
    bindings: {
      staticLock: digestRef(absolute.lock, lockBytes),
      staticGate: digestRef(absolute.gate, gateBytes),
      executionEnvelopes: digestRef(absolute.envelopes, envelopeBytes),
      scoredResults: digestRef(absolute.scored, scoredBytes),
      baseIR: digestRef(resolveFromRoot(rootDir, lock.frozenInputs.baseIr.path), baseIRBytes),
      sourceAudit: digestRef(resolveFromRoot(rootDir, lock.frozenInputs.sourceAudit.path), sourceAuditBytes),
      mappingCatalog: digestRef(absolute.mappingCatalog, catalogBytes),
    },
    sourceAuditTargetRefs: sourceAudit.mappings.map((mapping) => mapping.targetRef),
    catalog,
    rows: selectedDualSourceRows,
  });
  await mkdir(path.dirname(absolute.out), { recursive: true });
  await writeFile(absolute.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

function parseArgs(argv: string[]): DualSourceResidualAdmissionRunArgs {
  let rootDir = process.cwd();
  const values: Partial<Omit<DualSourceResidualAdmissionRunArgs, "rootDir">> = {};
  for (const arg of argv) {
    if (arg.startsWith("--root-dir=")) rootDir = path.resolve(arg.slice("--root-dir=".length));
    else if (arg.startsWith("--lock=")) values.lockPath = arg.slice("--lock=".length);
    else if (arg.startsWith("--gate=")) values.gatePath = arg.slice("--gate=".length);
    else if (arg.startsWith("--envelopes=")) values.envelopesPath = arg.slice("--envelopes=".length);
    else if (arg.startsWith("--scored=")) values.scoredPath = arg.slice("--scored=".length);
    else if (arg.startsWith("--mapping-catalog=")) values.mappingCatalogPath = arg.slice("--mapping-catalog=".length);
    else if (arg.startsWith("--out=")) values.outPath = arg.slice("--out=".length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  for (const key of ["lockPath", "gatePath", "envelopesPath", "scoredPath", "mappingCatalogPath", "outPath"] as const) {
    if (!values[key]) throw new Error(`Missing ${key}`);
  }
  return { rootDir, ...(values as Omit<DualSourceResidualAdmissionRunArgs, "rootDir">) };
}

if (import.meta.main) {
  runDualSourceResidualAdmission(parseArgs(process.argv.slice(2)))
    .then((report) => console.log(JSON.stringify({
      skillId: report.skillId,
      experimentId: report.experimentId,
      status: report.admission.status,
      repairs: report.repairs.length,
    }, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
