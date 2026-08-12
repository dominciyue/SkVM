import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runResourceProbeFile } from "./resource-contract-run";
import { runCommandWithTimeout, classifyProbeExecution } from "./route-probe";
import { sha256Bytes } from "./source-fixture";
import {
  buildStaticDevelopmentV2Plan,
  readAndValidateStaticDevelopmentV2Lock,
} from "./static-development-v2";
import {
  executeStaticDevelopmentV2Plan,
  selectRawRowsForScoring,
} from "./static-development-v2-run";
import { scoreRealAgentRuns } from "./score-real-agent-runs";
import { buildStaticDevelopmentV2GateReport } from "./static-development-gate-v2";
import type { ScoredAgentRunRow } from "./scoring";

type Phase = "plan" | "qualification" | "execute";

function parseArgs(argv: string[]) {
  const args: { rootDir: string; lock?: string; outDir?: string; phase?: Phase } = { rootDir: process.cwd() };
  for (const arg of argv) {
    if (arg.startsWith("--root-dir=")) args.rootDir = arg.slice("--root-dir=".length);
    else if (arg.startsWith("--lock=")) args.lock = arg.slice("--lock=".length);
    else if (arg.startsWith("--out-dir=")) args.outDir = arg.slice("--out-dir=".length);
    else if (arg.startsWith("--phase=")) {
      const phase = arg.slice("--phase=".length);
      if (phase !== "plan" && phase !== "qualification" && phase !== "execute") throw new Error("invalid phase");
      args.phase = phase;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.lock || !args.outDir || !args.phase) throw new Error("--lock, --out-dir, and --phase are required");
  return { rootDir: path.resolve(args.rootDir), lock: args.lock, outDir: path.resolve(args.rootDir, args.outDir), phase: args.phase };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const lockPath = path.isAbsolute(args.lock) ? args.lock : path.resolve(args.rootDir, args.lock);
  const lockSha256 = sha256Bytes(await readFile(lockPath));
  const lock = await readAndValidateStaticDevelopmentV2Lock({ rootDir: args.rootDir, lockPath });
  const plan = await buildStaticDevelopmentV2Plan({ rootDir: args.rootDir, lock, outDir: path.join(args.outDir, "run") });
  await mkdir(args.outDir, { recursive: true });
  await writeFile(path.join(args.outDir, "plan.json"), `${JSON.stringify({
    ...plan,
    runArgs: Object.fromEntries(Object.entries(plan.runArgs).map(([key, value]) => [key, value instanceof Set ? [...value] : value])),
  }, null, 2)}\n`, "utf8");
  if (args.phase === "plan") return { phase: args.phase, rows: plan.plan.length };

  const resource = await runResourceProbeFile({
    rootDir: args.rootDir,
    contract: lock.frozenInputs.resourceContract.path,
    out: path.relative(args.rootDir, path.join(args.outDir, "resource-probe.json")).replaceAll("\\", "/"),
  });
  if (resource.status !== "ok") throw new Error("Static development v2 resource probe failed");
  if (!process.env[lock.runtime.apiKeyEnv]?.trim()) throw new Error(`Missing ${lock.runtime.apiKeyEnv}`);
  if (args.phase === "qualification") {
    const entry = plan.plan.find((row) => row.system === "original" && row.runIndex === 1);
    if (!entry) throw new Error("Static development v2 qualification row missing");
    const execution = await runCommandWithTimeout(entry.command, lock.runtime.routeProbeTimeoutMs);
    const qualification = {
      schemaVersion: "skill-ir-static-development-qualification/v2",
      experimentId: lock.experimentId,
      lockSha256,
      status: classifyProbeExecution(execution),
      timedOut: execution.timedOut,
      exitCode: execution.exitCode,
      durationMs: execution.durationMs,
    };
    await writeFile(path.join(args.outDir, "qualification.json"), `${JSON.stringify(qualification, null, 2)}\n`, "utf8");
    if (qualification.status !== "ok") throw new Error(`Static development v2 qualification failed: ${qualification.status}`);
    return { phase: args.phase, qualification };
  }

  const qualification = JSON.parse(await readFile(path.join(args.outDir, "qualification.json"), "utf8")) as {
    experimentId?: string; lockSha256?: string; status?: string;
  };
  if (qualification.experimentId !== lock.experimentId || qualification.lockSha256 !== lockSha256 || qualification.status !== "ok") {
    throw new Error("Static development v2 qualification identity mismatch");
  }
  const execution = await executeStaticDevelopmentV2Plan({ plan });
  const scoringRows = selectRawRowsForScoring({
    rawRows: execution.rawRows as Array<Record<string, unknown>>,
    selectedBlocks: execution.selection.selectedBlocks,
    envelopes: execution.envelopes,
  });
  const scoringRawPath = path.join(plan.runArgs.outDir, "selected-raw-runs.jsonl");
  await writeFile(scoringRawPath, scoringRows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
  const scoredPath = path.join(plan.runArgs.outDir, "scored-runs.jsonl");
  await scoreRealAgentRuns({
    raw: scoringRawPath,
    tasks: lock.frozenInputs.tasks.path,
    corpus: lock.corpus,
    rootDir: args.rootDir,
    out: scoredPath,
  });
  const scoredRows = (await readFile(scoredPath, "utf8")).split(/\r?\n/).filter(Boolean)
    .map((line) => JSON.parse(line) as ScoredAgentRunRow);
  const taskSet = JSON.parse(await readFile(path.resolve(args.rootDir, lock.frozenInputs.tasks.path), "utf8")) as {
    tasks: Array<{ id: string; split: string; hardGateIds?: string[] }>;
  };
  const gate = buildStaticDevelopmentV2GateReport({
    lock,
    tasks: taskSet.tasks
      .filter((task) => lock.matrix.taskIds.includes(task.id))
      .map((task) => ({ id: task.id, split: task.split, hardGateIds: task.hardGateIds ?? [] })),
    envelopes: execution.envelopes,
    scoredRows,
  });
  const gatePath = path.join(args.outDir, "gate-report.json");
  await writeFile(gatePath, `${JSON.stringify(gate, null, 2)}\n`, "utf8");
  return {
    phase: args.phase,
    selection: execution.selection,
    rawPath: execution.rawPath,
    envelopePath: execution.envelopePath,
    scoringRawPath,
    scoredPath,
    gatePath,
    passed: gate.passed,
  };
}

if (import.meta.main) {
  main().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
