#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { z } from "zod";
import {
  ApiTesterOperationProspectivePreSourceFreezeSchema,
  ApiTesterOperationProspectiveExperimentLockSchema,
  buildApiTesterOperationProspectiveExperimentLockFromFiles,
  buildApiTesterOperationProspectivePreSourceFreeze,
  compareApiTesterOperationProspectiveReproduction,
  runApiTesterOperationProspectiveFirstRun,
  runApiTesterOperationSyntheticValidation,
  verifyApiTesterOperationSyntheticValidation,
  verifyApiTesterOperationProspectiveExperimentLockGit,
  verifyApiTesterOperationProspectivePreSourceFreezeGitArchive,
  verifyApiTesterOperationProspectivePreSourceFreezeLocal,
  verifyApiTesterOperationProspectivePreSourceFreezeGit,
  verifyApiTesterOperationProspectiveRunOutput,
} from "./api-tester-operation-prospective";

const CommitSchema = z.string().regex(/^[0-9a-f]{40}$/u);
const DateTimeSchema = z.string().datetime();
const ModeSchema = z.enum([
  "validate-synthetic",
  "verify-synthetic",
  "create-pre-source-freeze",
  "verify-pre-source-freeze",
  "create-lock",
  "verify-lock",
  "execute",
  "verify-first-run",
  "reproduce",
]);

type Common = { mode: z.infer<typeof ModeSchema>; rootDir: string; nodeExecutable: string; gitExecutable: string };
export type ApiTesterOperationProspectiveCommand = Common & {
  outputPath?: string;
  outputRoot?: string;
  freezePath?: string;
  lockPath?: string;
  selectionPath?: string;
  predictionsPath?: string;
  syntheticValidationPath?: string;
  executionCommit?: string;
  frozenAt?: string;
  startedAt?: string;
  firstRunReportPath?: string;
  freezeCommit?: string;
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

function take(values: Map<string, string>, key: string, required = false): string | undefined {
  const value = values.get(key);
  values.delete(key);
  if (required && !value) throw new Error(`--${key} is required`);
  return value;
}

export function parseApiTesterOperationProspectiveCommand(argv: string[]): ApiTesterOperationProspectiveCommand {
  const values = optionMap(argv);
  const mode = ModeSchema.parse(take(values, "mode", true));
  const rootDir = take(values, "root", true)!;
  const nodeExecutable = take(values, "node", mode === "create-lock" || mode === "verify-lock" ? false : true) ?? "node";
  const gitExecutable = take(values, "git", mode === "validate-synthetic" || mode === "verify-synthetic" ? false : true) ?? "git";
  const command: ApiTesterOperationProspectiveCommand = { mode, rootDir, nodeExecutable, gitExecutable };

  if (mode === "validate-synthetic") {
    command.outputRoot = take(values, "out", true);
    command.startedAt = DateTimeSchema.parse(take(values, "completed-at", true));
  } else if (mode === "verify-synthetic") {
    command.outputRoot = take(values, "out", true);
  } else if (mode === "create-pre-source-freeze") {
    command.outputPath = take(values, "out", true);
    command.executionCommit = CommitSchema.parse(take(values, "execution-commit", true));
    command.frozenAt = DateTimeSchema.parse(take(values, "frozen-at", true));
    command.syntheticValidationPath = take(values, "synthetic-validation", true);
  } else if (mode === "verify-pre-source-freeze") {
    command.freezePath = take(values, "freeze", true);
    command.freezeCommit = CommitSchema.parse(take(values, "freeze-commit", true));
  } else if (mode === "create-lock") {
    command.freezePath = take(values, "freeze", true);
    command.freezeCommit = CommitSchema.parse(take(values, "freeze-commit", true));
    command.selectionPath = take(values, "selection", true);
    command.predictionsPath = take(values, "predictions", true);
    command.outputPath = take(values, "out", true);
    command.executionCommit = CommitSchema.parse(take(values, "selection-commit", true));
    command.frozenAt = DateTimeSchema.parse(take(values, "frozen-at", true));
  } else if (mode === "verify-lock") {
    command.freezePath = take(values, "freeze", true);
    command.freezeCommit = CommitSchema.parse(take(values, "freeze-commit", true));
    command.lockPath = take(values, "lock", true);
    command.executionCommit = CommitSchema.parse(take(values, "execution-commit", true));
  } else if (mode === "execute" || mode === "reproduce") {
    command.freezePath = take(values, "freeze", true);
    command.freezeCommit = CommitSchema.parse(take(values, "freeze-commit", true));
    command.lockPath = take(values, "lock", true);
    command.executionCommit = CommitSchema.parse(take(values, "execution-commit", true));
    command.outputRoot = take(values, "out", true);
    command.startedAt = DateTimeSchema.parse(take(values, "started-at", true));
    if (mode === "reproduce") command.firstRunReportPath = take(values, "first-run-report", true);
  } else {
    command.lockPath = take(values, "lock", true);
    command.freezePath = take(values, "freeze", true);
    command.freezeCommit = CommitSchema.parse(take(values, "freeze-commit", true));
    command.executionCommit = CommitSchema.parse(take(values, "execution-commit", true));
    command.outputRoot = take(values, "out", true);
  }
  if (values.size > 0) throw new Error(`unknown argument: --${values.keys().next().value}`);
  return command;
}

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function nodeVersion(nodeExecutable: string): string {
  const child = spawnSync(nodeExecutable, ["--version"], { encoding: "utf8" });
  if (child.status !== 0) throw new Error(`node version check failed: ${child.stderr?.trim() ?? "unknown"}`);
  return child.stdout.trim();
}

async function main(): Promise<void> {
  const command = parseApiTesterOperationProspectiveCommand(Bun.argv.slice(2));
  const rootDir = resolve(command.rootDir);
  if (command.mode === "validate-synthetic") {
    const report = await runApiTesterOperationSyntheticValidation({
      rootDir,
      outRoot: command.outputRoot!,
      nodeExecutable: command.nodeExecutable,
      completedAt: command.startedAt!,
    });
    process.stdout.write(`${JSON.stringify({ status: report.status, syntheticDocuments: report.totals.syntheticDocuments, verified: report.totals.verified, prospectiveRuns: report.accounting.prospectiveRuns })}\n`);
    return;
  }
  if (command.mode === "verify-synthetic") {
    const result = await verifyApiTesterOperationSyntheticValidation({
      rootDir,
      outRoot: command.outputRoot!,
      nodeExecutable: command.nodeExecutable,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (command.mode === "create-pre-source-freeze") {
    const validationBytes = await readFile(resolve(rootDir, command.syntheticValidationPath!));
    const freeze = await buildApiTesterOperationProspectivePreSourceFreeze({
      rootDir,
      executionCommit: command.executionCommit!,
      frozenAt: command.frozenAt!,
      bunVersion: Bun.version,
      nodeVersion: nodeVersion(command.nodeExecutable),
      syntheticValidation: {
        path: command.syntheticValidationPath!,
        sha256: createHash("sha256").update(validationBytes).digest("hex"),
      },
    });
    await verifyApiTesterOperationProspectivePreSourceFreezeGitArchive({
      rootDir,
      freeze,
      nodeExecutable: command.nodeExecutable,
      gitExecutable: command.gitExecutable,
    });
    const output = resolve(rootDir, command.outputPath!);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, jsonText(freeze), { encoding: "utf8", flag: "wx" });
    process.stdout.write(`${JSON.stringify({ status: freeze.status, executionCommit: freeze.executionCommit, syntheticDocuments: freeze.synthetics.length, prospectiveRuns: freeze.sourceState.prospectiveRuns })}\n`);
    return;
  }
  if (command.mode === "verify-pre-source-freeze") {
    const freeze = ApiTesterOperationProspectivePreSourceFreezeSchema.parse(JSON.parse(await readFile(resolve(rootDir, command.freezePath!), "utf8")));
    await verifyApiTesterOperationProspectivePreSourceFreezeLocal({ rootDir, freeze, bunVersion: Bun.version, nodeVersion: nodeVersion(command.nodeExecutable) });
    const result = await verifyApiTesterOperationProspectivePreSourceFreezeGit({
      rootDir,
      freezePath: command.freezePath!,
      freezeCommit: command.freezeCommit!,
      bunVersion: Bun.version,
      nodeVersion: nodeVersion(command.nodeExecutable),
      nodeExecutable: command.nodeExecutable,
      gitExecutable: command.gitExecutable,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (command.mode === "create-lock") {
    const lock = await buildApiTesterOperationProspectiveExperimentLockFromFiles({
      rootDir,
      preSourceFreezePath: command.freezePath!,
      preSourceFreezeCommit: command.freezeCommit!,
      selectionPath: command.selectionPath!,
      predictionsPath: command.predictionsPath!,
      selectionCommit: command.executionCommit!,
      frozenAt: command.frozenAt!,
    });
    const output = resolve(rootDir, command.outputPath!);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, jsonText(lock), { encoding: "utf8", flag: "wx" });
    process.stdout.write(`${JSON.stringify({ status: lock.status, rows: lock.rows.length, prospectiveRuns: lock.accounting.prospectiveRuns })}\n`);
    return;
  }
  if (command.mode === "verify-lock") {
    const result = await verifyApiTesterOperationProspectiveExperimentLockGit({
      rootDir,
      lockPath: command.lockPath!,
      executionCommit: command.executionCommit!,
      freezePath: command.freezePath!,
      freezeCommit: command.freezeCommit!,
      bunVersion: Bun.version,
      nodeVersion: nodeVersion(command.nodeExecutable),
      nodeExecutable: command.nodeExecutable,
      gitExecutable: command.gitExecutable,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (command.mode === "execute" || command.mode === "reproduce") {
    const report = await runApiTesterOperationProspectiveFirstRun({
      rootDir,
      freezePath: command.freezePath!,
      freezeCommit: command.freezeCommit!,
      lockPath: command.lockPath!,
      executionCommit: command.executionCommit!,
      outRoot: command.outputRoot!,
      nodeExecutable: command.nodeExecutable,
      gitExecutable: command.gitExecutable,
      runKind: command.mode === "execute" ? "first-run" : "reproduction",
      startedAt: command.startedAt!,
    });
    const lock = ApiTesterOperationProspectiveExperimentLockSchema.parse(JSON.parse(await readFile(resolve(rootDir, command.lockPath!), "utf8")));
    const verified = await verifyApiTesterOperationProspectiveRunOutput({ rootDir, lock, outRoot: command.outputRoot!, nodeExecutable: command.nodeExecutable, expectedRunKind: report.runKind });
    const comparison = command.mode === "reproduce"
      ? compareApiTesterOperationProspectiveReproduction(JSON.parse(await readFile(resolve(rootDir, command.firstRunReportPath!), "utf8")), report)
      : null;
    process.stdout.write(`${JSON.stringify({ status: verified.status, runKind: report.runKind, rows: verified.rows, infrastructureFailedDocuments: verified.infrastructureFailedDocuments, comparison })}\n`);
    return;
  }
  if (command.mode === "verify-first-run") {
    const lock = ApiTesterOperationProspectiveExperimentLockSchema.parse(JSON.parse(await readFile(resolve(rootDir, command.lockPath!), "utf8")));
    await verifyApiTesterOperationProspectiveExperimentLockGit({
      rootDir,
      lockPath: command.lockPath!,
      executionCommit: command.executionCommit!,
      freezePath: command.freezePath!,
      freezeCommit: command.freezeCommit!,
      bunVersion: Bun.version,
      nodeVersion: nodeVersion(command.nodeExecutable),
      nodeExecutable: command.nodeExecutable,
      gitExecutable: command.gitExecutable,
    });
    const result = await verifyApiTesterOperationProspectiveRunOutput({ rootDir, lock, outRoot: command.outputRoot!, nodeExecutable: command.nodeExecutable, expectedRunKind: "first-run" });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  throw new Error(`unsupported mode: ${command.mode}`);
}

if (import.meta.main) {
  await main();
}
