#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import {
  ApiTesterOperationProspectivePreSourceFreezeSchema,
  verifyApiTesterOperationProspectivePreSourceFreezeGit,
  verifyApiTesterOperationProspectivePreSourceFreezeLocal,
} from "./api-tester-operation-prospective";
import {
  acquireApiTesterOperationProspectiveSources,
  verifyApiTesterOperationProspectiveSourceArchive,
} from "./api-tester-operation-prospective-source";

export const API_TESTER_OPERATION_PROSPECTIVE_SOURCE_PRE_FREEZE_PATH =
  "benchmarks/skill-ir/pilots/api-tester/operation-prospective-001/pre-source-freeze-revision-001.json" as const;
export const API_TESTER_OPERATION_PROSPECTIVE_SOURCE_OUTPUT_DIR =
  "results/skill-ir/api-tester-operation-prospective-001/source-selection" as const;

const ModeSchema = z.enum(["acquire", "verify"]);
const CommitSchema = z.string().regex(/^[0-9a-f]{40}$/u);
const DateTimeSchema = z.string().datetime();

export type ApiTesterOperationProspectiveSourceCommand = {
  mode: z.infer<typeof ModeSchema>;
  rootDir: string;
  freezePath: typeof API_TESTER_OPERATION_PROSPECTIVE_SOURCE_PRE_FREEZE_PATH;
  freezeCommit: string;
  outputDir: typeof API_TESTER_OPERATION_PROSPECTIVE_SOURCE_OUTPUT_DIR;
  selectedAt?: string;
  nodeExecutable: string;
  gitExecutable: string;
};

function optionMap(argv: string[]): Map<string, string> {
  const values = new Map<string, string>();
  for (const raw of argv) {
    const match = /^--([a-z][a-z0-9-]*)=(.+)$/u.exec(raw);
    if (!match) throw new Error(`invalid argument: ${raw}`);
    if (values.has(match[1]!)) throw new Error(`duplicate argument: --${match[1]}`);
    values.set(match[1]!, match[2]!);
  }
  return values;
}

function take(values: Map<string, string>, key: string, required = true): string | undefined {
  const value = values.get(key);
  values.delete(key);
  if (required && !value) throw new Error(`--${key} is required`);
  return value;
}

export function parseApiTesterOperationProspectiveSourceCommand(
  argv: string[],
): ApiTesterOperationProspectiveSourceCommand {
  const values = optionMap(argv);
  const mode = ModeSchema.parse(take(values, "mode"));
  const rootDir = take(values, "root")!;
  const freezePath = take(values, "freeze")!;
  if (freezePath !== API_TESTER_OPERATION_PROSPECTIVE_SOURCE_PRE_FREEZE_PATH) {
    throw new Error(`--freeze must be ${API_TESTER_OPERATION_PROSPECTIVE_SOURCE_PRE_FREEZE_PATH}`);
  }
  const freezeCommit = CommitSchema.parse(take(values, "freeze-commit"));
  const outputDir = take(values, "out")!;
  if (outputDir !== API_TESTER_OPERATION_PROSPECTIVE_SOURCE_OUTPUT_DIR) {
    throw new Error(`--out must be ${API_TESTER_OPERATION_PROSPECTIVE_SOURCE_OUTPUT_DIR}`);
  }
  const selectedAtValue = take(values, "selected-at", mode === "acquire");
  if (mode === "verify" && selectedAtValue !== undefined) throw new Error("--selected-at is only valid in acquire mode");
  const selectedAt = selectedAtValue === undefined ? undefined : DateTimeSchema.parse(selectedAtValue);
  const nodeExecutable = take(values, "node")!;
  const gitExecutable = take(values, "git")!;
  if (values.size > 0) throw new Error(`unknown argument: --${values.keys().next().value}`);
  return {
    mode,
    rootDir,
    freezePath: API_TESTER_OPERATION_PROSPECTIVE_SOURCE_PRE_FREEZE_PATH,
    freezeCommit,
    outputDir: API_TESTER_OPERATION_PROSPECTIVE_SOURCE_OUTPUT_DIR,
    selectedAt,
    nodeExecutable,
    gitExecutable,
  };
}

function nodeVersion(nodeExecutable: string): string {
  const child = spawnSync(nodeExecutable, ["--version"], { encoding: "utf8" });
  if (child.status !== 0) throw new Error(`node version check failed: ${child.stderr?.trim() ?? "unknown"}`);
  return child.stdout.trim();
}

export async function runApiTesterOperationProspectiveSourceCommand(
  command: ApiTesterOperationProspectiveSourceCommand,
) {
  const rootDir = resolve(command.rootDir);
  const freeze = ApiTesterOperationProspectivePreSourceFreezeSchema.parse(
    JSON.parse(await readFile(resolve(rootDir, command.freezePath), "utf8")),
  );
  const runtimeNodeVersion = nodeVersion(command.nodeExecutable);
  await verifyApiTesterOperationProspectivePreSourceFreezeLocal({
    rootDir,
    freeze,
    bunVersion: Bun.version,
    nodeVersion: runtimeNodeVersion,
  });
  const remoteFreeze = await verifyApiTesterOperationProspectivePreSourceFreezeGit({
    rootDir,
    freezePath: command.freezePath,
    freezeCommit: command.freezeCommit,
    bunVersion: Bun.version,
    nodeVersion: runtimeNodeVersion,
    nodeExecutable: command.nodeExecutable,
    gitExecutable: command.gitExecutable,
  });
  if (command.mode === "acquire") {
    await acquireApiTesterOperationProspectiveSources({
      rootDir,
      outputDir: command.outputDir,
      preSourceFreezePath: command.freezePath,
      preSourceFreezeCommit: command.freezeCommit,
      selectedAt: command.selectedAt!,
    });
  }
  const archive = await verifyApiTesterOperationProspectiveSourceArchive({
    rootDir,
    outputDir: command.outputDir,
  });
  return { ...archive, preSourceFreezeStatus: remoteFreeze.status };
}

async function main(): Promise<void> {
  const result = await runApiTesterOperationProspectiveSourceCommand(
    parseApiTesterOperationProspectiveSourceCommand(Bun.argv.slice(2)),
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
