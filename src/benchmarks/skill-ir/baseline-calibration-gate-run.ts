import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { evaluateBaselineCalibrationGate } from "./baseline-calibration-gate";
import { readAndValidateBaselineCalibrationLock } from "./baseline-calibration";
import {
  assertBaselineProbeEvidence,
  BaselineCalibrationRouteProbeResultSchema,
} from "./baseline-calibration-run";
import type { ResourceProbeResult } from "./resource-contract";
import { sha256Bytes } from "./source-fixture";
import type { ScoredAgentRunRow } from "./scoring";

const ResourceProbeResultSchema = z.object({
  schemaVersion: z.literal("skill-ir-resource-probe-result/v1"),
  methodEvidence: z.literal(false),
  status: z.enum(["ok", "failed", "unavailable"]),
  executableSource: z.enum(["env", "fallback"]),
  requiredModules: z.array(z.string()),
  exitCode: z.number().int().nullable(),
  stderrClass: z.enum(["none", "probe-nonzero", "marker-missing", "spawn-failed"]),
  durationMs: z.number().nonnegative(),
}).strict();

export type BaselineCalibrationGateArgs = {
  rootDir: string;
  lockPath: string;
  rawPath: string;
  scoredPath: string;
  resourcePath: string;
  routePath: string;
  outPath: string;
};

function resolveFromRoot(rootDir: string, value: string): string {
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(rootDir, value);
}

function parseJsonl<T>(bytes: Buffer): T[] {
  return bytes.toString("utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

export async function runBaselineCalibrationGateFile(
  args: BaselineCalibrationGateArgs,
) {
  const rootDir = path.resolve(args.rootDir);
  const resolved = {
    lock: resolveFromRoot(rootDir, args.lockPath),
    raw: resolveFromRoot(rootDir, args.rawPath),
    scored: resolveFromRoot(rootDir, args.scoredPath),
    resource: resolveFromRoot(rootDir, args.resourcePath),
    route: resolveFromRoot(rootDir, args.routePath),
    out: resolveFromRoot(rootDir, args.outPath),
  };
  const [lockBytes, rawBytes, scoredBytes, resourceBytes, routeBytes] =
    await Promise.all([
      readFile(resolved.lock),
      readFile(resolved.raw),
      readFile(resolved.scored),
      readFile(resolved.resource),
      readFile(resolved.route),
    ]);
  const lockDigest = sha256Bytes(lockBytes);
  const lock = await readAndValidateBaselineCalibrationLock({
    rootDir,
    lockPath: resolved.lock,
  });
  const resource = ResourceProbeResultSchema.parse(
    JSON.parse(resourceBytes.toString("utf8")),
  ) as ResourceProbeResult;
  const route = BaselineCalibrationRouteProbeResultSchema.parse(
    JSON.parse(routeBytes.toString("utf8")),
  );
  assertBaselineProbeEvidence(lock, lockDigest, resource, route);
  const gate = evaluateBaselineCalibrationGate(
    parseJsonl<ScoredAgentRunRow>(scoredBytes),
    lock,
  );
  const report = {
    ...gate,
    evidence: {
      lockSha256: lockDigest,
      rawSha256: sha256Bytes(rawBytes),
      scoredSha256: sha256Bytes(scoredBytes),
      resourceProbeSha256: sha256Bytes(resourceBytes),
      routeProbeSha256: sha256Bytes(routeBytes),
    },
  };
  await mkdir(path.dirname(resolved.out), { recursive: true });
  await writeFile(resolved.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

export function parseBaselineCalibrationGateArgs(
  argv: string[],
): BaselineCalibrationGateArgs {
  let rootDir = process.cwd();
  const values: Partial<Omit<BaselineCalibrationGateArgs, "rootDir">> = {};
  for (const arg of argv) {
    if (arg.startsWith("--root-dir=")) {
      rootDir = path.resolve(arg.slice("--root-dir=".length));
    } else if (arg.startsWith("--lock=")) {
      values.lockPath = arg.slice("--lock=".length);
    } else if (arg.startsWith("--raw=")) {
      values.rawPath = arg.slice("--raw=".length);
    } else if (arg.startsWith("--scored=")) {
      values.scoredPath = arg.slice("--scored=".length);
    } else if (arg.startsWith("--resource=")) {
      values.resourcePath = arg.slice("--resource=".length);
    } else if (arg.startsWith("--route=")) {
      values.routePath = arg.slice("--route=".length);
    } else if (arg.startsWith("--out=")) {
      values.outPath = arg.slice("--out=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  for (const key of [
    "lockPath",
    "rawPath",
    "scoredPath",
    "resourcePath",
    "routePath",
    "outPath",
  ] as const) {
    if (!values[key]) {
      throw new Error(`--${key.replace("Path", "")} is required`);
    }
  }
  return {
    rootDir,
    ...(values as Omit<BaselineCalibrationGateArgs, "rootDir">),
  };
}

if (import.meta.main) {
  runBaselineCalibrationGateFile(
    parseBaselineCalibrationGateArgs(process.argv.slice(2)),
  ).then((report) => {
    console.log(JSON.stringify({
      calibrationId: report.calibrationId,
      passed: report.passed,
      counts: report.counts,
    }, null, 2));
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
