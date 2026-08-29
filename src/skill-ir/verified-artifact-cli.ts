import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { z } from "zod";
import {
  VerifiedArtifactWorkflowConfigSchema,
  runVerifiedArtifactWorkflow,
  type UserAcceptance,
} from "./verified-artifact-product";

export type VerifiedArtifactCliArguments = {
  rootDir: string;
  configPath: string;
  workDir: string;
  outDir: string;
  acceptance?: UserAcceptance;
};

function portable(path: string): string {
  return path.replaceAll("\\", "/");
}

function flagValue(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return args.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function absolute(rootDir: string, value: string): string {
  return portable(isAbsolute(value) ? resolve(value) : resolve(rootDir, value));
}

export function parseVerifiedArtifactCliArguments(
  args: string[],
  cwd = process.cwd(),
): VerifiedArtifactCliArguments {
  const known = new Set([
    "--accept",
    "--root",
    "--config",
    "--workdir",
    "--out",
    "--accepted-at",
    "--human-minutes",
    "--note",
  ]);
  for (const argument of args) {
    const name = argument.includes("=") ? argument.slice(0, argument.indexOf("=")) : argument;
    if (!known.has(name)) throw new Error(`unknown verified-artifact option: ${name}`);
  }
  const rootDir = absolute(cwd, flagValue(args, "root") ?? cwd);
  const config = flagValue(args, "config");
  const workdir = flagValue(args, "workdir");
  const out = flagValue(args, "out");
  if (!config || !workdir || !out) {
    throw new Error("--config=<path>, --workdir=<path>, and --out=<path> are required");
  }
  const accept = args.includes("--accept");
  let acceptance: UserAcceptance | undefined;
  if (accept) {
    const acceptedAt = flagValue(args, "accepted-at");
    const note = flagValue(args, "note");
    const humanMinutes = Number(flagValue(args, "human-minutes"));
    if (!acceptedAt || !note || !Number.isFinite(humanMinutes) || humanMinutes <= 0) {
      throw new Error("--accept requires --accepted-at, --note, and positive --human-minutes");
    }
    acceptance = {
      decision: "accepted",
      acceptedAt: z.string().datetime().parse(acceptedAt),
      humanMinutes,
      note,
    };
  } else if (flagValue(args, "accepted-at") || flagValue(args, "human-minutes") || flagValue(args, "note")) {
    throw new Error("acceptance fields require --accept");
  }
  return {
    rootDir,
    configPath: absolute(rootDir, config),
    workDir: absolute(rootDir, workdir),
    outDir: absolute(rootDir, out),
    ...(acceptance ? { acceptance } : {}),
  };
}

export function requireUserAcceptance(args: VerifiedArtifactCliArguments): UserAcceptance {
  if (!args.acceptance) {
    throw new Error("B-default requires --accept with a post-preview, per-artifact acceptance record");
  }
  return args.acceptance;
}

export async function runVerifiedArtifactCli(args: string[], cwd = process.cwd()) {
  const parsed = parseVerifiedArtifactCliArguments(args, cwd);
  const config = VerifiedArtifactWorkflowConfigSchema.parse(
    JSON.parse(await readFile(parsed.configPath, "utf8")),
  );
  const acceptance = config.quality.mode === "user-accepted"
    ? requireUserAcceptance(parsed)
    : undefined;
  if (config.quality.mode === "machine-checked" && parsed.acceptance) {
    throw new Error("machine-checked mode does not accept a user-acceptance override");
  }
  return runVerifiedArtifactWorkflow({
    rootDir: parsed.rootDir,
    workDir: parsed.workDir,
    outDir: parsed.outDir,
    config,
    ...(acceptance ? { accept: async () => acceptance } : {}),
  });
}

if (import.meta.main) {
  runVerifiedArtifactCli(process.argv.slice(2)).then((result) => {
    process.stdout.write(`${JSON.stringify({
      status: "complete",
      workflowId: result.cost.workflowId,
      qualityEvidence: result.cost.qualityEvidence,
      claim: result.cost.claim,
      breakEven: result.cost.breakEven,
      totalCostBreakEven: result.cost.totalCostBreakEven,
      artifact: result.artifact,
      stageOrder: result.stageOrder,
    }, null, 2)}\n`);
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
