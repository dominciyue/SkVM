#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";
import {
  PUBLIC_SKILL_CORPUS_PROTOCOL_PATH,
  PublicSkillCorpusProtocolSchema,
  buildPublicSkillMetadataSelection,
  verifyPublicSkillCorpusProtocolFiles,
} from "./public-skill-responsibility-corpus";

export type PublicSkillCorpusCommand =
  | {
    mode: "verify-protocol";
    rootDir: string;
    protocolPath: string;
  }
  | {
    mode: "select-metadata";
    rootDir: string;
    protocolPath: string;
    discoveryPath: string;
    outputPath: string;
    selectedAt: string;
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

function repositoryRelativePath(value: string, option: string): string {
  const portable = value.replaceAll("\\", "/");
  if (isAbsolute(value) || portable.startsWith("/") || portable.split("/").includes("..")) {
    throw new Error(`--${option} must be a repository-relative contained path`);
  }
  return value;
}

function assertNoUnknown(values: Map<string, string>): void {
  if (values.size > 0) throw new Error(`unknown argument: --${values.keys().next().value}`);
}

export function parsePublicSkillCorpusCommand(argv: string[]): PublicSkillCorpusCommand {
  const values = optionMap(argv);
  const mode = z.enum(["verify-protocol", "select-metadata"]).parse(take(values, "mode"));
  const rootDir = take(values, "root");
  const protocolPath = repositoryRelativePath(take(values, "protocol"), "protocol");
  if (protocolPath !== PUBLIC_SKILL_CORPUS_PROTOCOL_PATH) {
    throw new Error(`--protocol must be ${PUBLIC_SKILL_CORPUS_PROTOCOL_PATH}`);
  }
  if (mode === "verify-protocol") {
    assertNoUnknown(values);
    return { mode, rootDir, protocolPath };
  }
  const discoveryPath = repositoryRelativePath(take(values, "discovery"), "discovery");
  const outputPath = repositoryRelativePath(take(values, "out"), "out");
  const selectedAt = z.string().datetime().parse(take(values, "selected-at"));
  assertNoUnknown(values);
  return { mode, rootDir, protocolPath, discoveryPath, outputPath, selectedAt };
}

function contained(rootDir: string, path: string): string {
  const root = resolve(rootDir);
  const target = resolve(root, path);
  const back = relative(root, target);
  if (back === "" || back.startsWith("..") || isAbsolute(back)) {
    throw new Error(`path escapes repository root: ${path}`);
  }
  return target;
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function runPublicSkillCorpusCommand(command: PublicSkillCorpusCommand): Promise<unknown> {
  const rootDir = resolve(command.rootDir);
  if (command.mode === "verify-protocol") {
    return verifyPublicSkillCorpusProtocolFiles({ rootDir, protocolPath: command.protocolPath });
  }

  const protocolBytes = await readFile(contained(rootDir, command.protocolPath));
  const protocol = PublicSkillCorpusProtocolSchema.parse(JSON.parse(protocolBytes.toString("utf8")));
  const discoveryBytes = await readFile(contained(rootDir, command.discoveryPath));
  const discovery = JSON.parse(discoveryBytes.toString("utf8"));
  const q1Registry = JSON.parse(await readFile(contained(rootDir, protocol.exclusions.q1Registry.path), "utf8"));
  const selection = buildPublicSkillMetadataSelection({
    protocol,
    protocolSha256: sha256(protocolBytes),
    discovery,
    discoveryPath: command.discoveryPath,
    discoverySha256: sha256(discoveryBytes),
    q1Registry,
    selectedAt: command.selectedAt,
  });
  const outputPath = contained(rootDir, command.outputPath);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(selection, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return selection;
}

async function main(): Promise<void> {
  const command = parsePublicSkillCorpusCommand(Bun.argv.slice(2));
  const result = await runPublicSkillCorpusCommand(command);
  if (command.mode === "verify-protocol") {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  const selection = result as Awaited<ReturnType<typeof buildPublicSkillMetadataSelection>>;
  process.stdout.write(`${JSON.stringify({
    status: selection.status,
    selectedSkills: selection.totals.selectedSkills,
    selectedRepositories: selection.totals.selectedRepositories,
    bodyExposures: selection.totals.bodyExposures,
  })}\n`);
}

if (import.meta.main) {
  await main();
}
