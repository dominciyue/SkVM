import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { readAndValidateCapabilityDiagnosticLock } from "./capability-diagnostic";
import {
  auditScoredRows,
  compareCapabilityAudits,
  type FailureAuditRecord,
} from "./failure-audit";
import type { ScoredAgentRunRow } from "./scoring";

export type FailureAuditRunArgs = {
  rootDir: string;
  lockPath: string;
  outDir: string;
  strongScoredPaths: string[];
};

async function readJsonl(path: string): Promise<ScoredAgentRunRow[]> {
  const text = await readFile(path, "utf8");
  return text.split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as ScoredAgentRunRow);
}

function classificationCounts(rows: FailureAuditRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.classification] = (counts[row.classification] ?? 0) + 1;
  return counts;
}

async function writeJsonl(path: string, rows: FailureAuditRecord[]): Promise<void> {
  await writeFile(path, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""), "utf8");
}

export async function writeFailureAuditOutputs(opts: {
  outDir: string;
  miniRows: ScoredAgentRunRow[];
  strongRows?: ScoredAgentRunRow[];
}): Promise<{
  miniAuditPath: string;
  strongAuditPath?: string;
  comparisonPath?: string;
  summaryPath: string;
}> {
  const outDir = resolve(opts.outDir);
  await mkdir(outDir, { recursive: true });
  const miniAudit = auditScoredRows(opts.miniRows);
  const miniAuditPath = join(outDir, "mini-failure-audit.jsonl");
  await writeJsonl(miniAuditPath, miniAudit);

  let strongAuditPath: string | undefined;
  let comparisonPath: string | undefined;
  let strongAudit: FailureAuditRecord[] | undefined;
  if (opts.strongRows) {
    strongAudit = auditScoredRows(opts.strongRows);
    strongAuditPath = join(outDir, "gpt41-failure-audit.jsonl");
    comparisonPath = join(outDir, "capability-comparison.json");
    await writeJsonl(strongAuditPath, strongAudit);
    await writeFile(
      comparisonPath,
      `${JSON.stringify(compareCapabilityAudits(miniAudit, strongAudit), null, 2)}\n`,
      "utf8",
    );
  }

  const summaryPath = join(outDir, "failure-audit-summary.json");
  await writeFile(
    summaryPath,
    `${JSON.stringify({
      schemaVersion: "skill-ir-failure-audit-summary/v1",
      mini: { rows: miniAudit.length, classifications: classificationCounts(miniAudit) },
      ...(strongAudit
        ? { strong: { rows: strongAudit.length, classifications: classificationCounts(strongAudit) } }
        : {}),
      causalClaimAvailable: false,
    }, null, 2)}\n`,
    "utf8",
  );
  return {
    miniAuditPath,
    ...(strongAuditPath ? { strongAuditPath } : {}),
    ...(comparisonPath ? { comparisonPath } : {}),
    summaryPath,
  };
}

export function parseFailureAuditRunArgs(argv: string[]): FailureAuditRunArgs {
  let rootDir = process.cwd();
  let lockPath: string | undefined;
  let outDir: string | undefined;
  const strongScoredPaths: string[] = [];
  for (const arg of argv) {
    if (arg.startsWith("--root-dir=")) rootDir = arg.slice("--root-dir=".length);
    else if (arg.startsWith("--lock=")) lockPath = arg.slice("--lock=".length);
    else if (arg.startsWith("--out-dir=")) outDir = arg.slice("--out-dir=".length);
    else if (arg.startsWith("--strong-scored=")) {
      strongScoredPaths.push(arg.slice("--strong-scored=".length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!lockPath) throw new Error("--lock is required");
  if (!outDir) throw new Error("--out-dir is required");
  if (strongScoredPaths.length !== 0 && strongScoredPaths.length !== 3) {
    throw new Error("Provide either zero or exactly three --strong-scored paths");
  }
  return { rootDir, lockPath, outDir, strongScoredPaths };
}

export async function runFailureAudit(args: FailureAuditRunArgs): Promise<{
  miniRows: number;
  strongRows: number;
  miniAuditPath: string;
  strongAuditPath?: string;
  comparisonPath?: string;
  summaryPath: string;
}> {
  const rootDir = resolve(args.rootDir);
  const lockPath = isAbsolute(args.lockPath) ? resolve(args.lockPath) : resolve(rootDir, args.lockPath);
  const lock = await readAndValidateCapabilityDiagnosticLock({ rootDir, lockPath });
  const miniPaths = Object.values(lock.historicalMiniResults).map((path) => resolve(rootDir, path));
  const miniRows = (await Promise.all(miniPaths.map(readJsonl))).flat();
  if (miniRows.length !== lock.matrix.totalRows) {
    throw new Error(`Historical mini row mismatch: expected ${lock.matrix.totalRows}, got ${miniRows.length}`);
  }
  if (miniRows.some((row) => row.model !== lock.model.historicalRoute || row.taskSplit !== "development")) {
    throw new Error("Historical mini rows drift from the diagnostic identity");
  }

  const strongRows = args.strongScoredPaths.length
    ? (await Promise.all(args.strongScoredPaths.map((path) => readJsonl(
        isAbsolute(path) ? resolve(path) : resolve(rootDir, path),
      )))).flat()
    : undefined;
  if (strongRows && strongRows.length !== lock.matrix.totalRows) {
    throw new Error(`GPT-4.1 row mismatch: expected ${lock.matrix.totalRows}, got ${strongRows.length}`);
  }
  if (strongRows?.some((row) => row.model !== lock.model.diagnosticRoute || row.taskSplit !== "development")) {
    throw new Error("GPT-4.1 rows drift from the diagnostic identity");
  }

  const output = await writeFailureAuditOutputs({
    outDir: isAbsolute(args.outDir) ? args.outDir : resolve(rootDir, args.outDir),
    miniRows,
    ...(strongRows ? { strongRows } : {}),
  });
  return {
    miniRows: miniRows.length,
    strongRows: strongRows?.length ?? 0,
    ...output,
  };
}

if (import.meta.main) {
  runFailureAudit(parseFailureAuditRunArgs(process.argv.slice(2)))
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
