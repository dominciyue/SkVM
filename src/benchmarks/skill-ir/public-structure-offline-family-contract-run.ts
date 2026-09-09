#!/usr/bin/env bun
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { z } from "zod";
import { buildPublicStructureOfflineFamilyReport } from "./public-structure-offline-family-contract";

export type PublicStructureOfflineFamilyCommand = {
  rootDir: string;
  outputPath: string;
  completedAt: string;
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

function take(values: Map<string, string>, key: string): string {
  const value = values.get(key);
  values.delete(key);
  if (!value) throw new Error(`--${key} is required`);
  return value;
}

function parseOutputPath(value: string): string {
  const portable = value.replaceAll("\\", "/");
  if (isAbsolute(value) || portable.startsWith("/") || portable.split("/").includes("..")) {
    throw new Error("--out must be a repository-relative contained output path");
  }
  return value;
}

export function parsePublicStructureOfflineFamilyCommand(argv: string[]): PublicStructureOfflineFamilyCommand {
  const values = optionMap(argv);
  const command = {
    rootDir: take(values, "root"),
    outputPath: parseOutputPath(take(values, "out")),
    completedAt: z.string().datetime().parse(take(values, "completed-at")),
  };
  if (values.size > 0) throw new Error(`unknown argument: --${values.keys().next().value}`);
  return command;
}

async function main(): Promise<void> {
  const command = parsePublicStructureOfflineFamilyCommand(Bun.argv.slice(2));
  const rootDir = resolve(command.rootDir);
  const report = await buildPublicStructureOfflineFamilyReport({ rootDir, completedAt: command.completedAt });
  const outputPath = resolve(rootDir, command.outputPath);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  process.stdout.write(`${JSON.stringify({
    status: report.status,
    criteria: report.verification.criteria,
    counterexamples: report.verification.counterexamples,
    prospectiveResultsUsed: report.accounting.prospectiveResultsUsed,
  })}\n`);
}

if (import.meta.main) {
  await main();
}
