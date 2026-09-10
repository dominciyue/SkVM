#!/usr/bin/env bun
import { PUBLIC_SKILL_CORPUS_PROTOCOL_PATH } from "./public-skill-responsibility-corpus";
import { discoverPublicSkillMetadata } from "./public-skill-responsibility-corpus-discovery";
import { normalizeRepositoryRelativePath } from "./public-skill-responsibility-corpus-paths";

export type PublicSkillMetadataDiscoveryCommand = {
  rootDir: string;
  protocolPath: string;
  outputDir: string;
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

function repositoryRelative(value: string, option: string): string {
  return normalizeRepositoryRelativePath(value, `--${option}`);
}

export function parsePublicSkillMetadataDiscoveryCommand(argv: string[]): PublicSkillMetadataDiscoveryCommand {
  const values = optionMap(argv);
  const rootDir = take(values, "root");
  const protocolPath = repositoryRelative(take(values, "protocol"), "protocol");
  if (protocolPath !== PUBLIC_SKILL_CORPUS_PROTOCOL_PATH) {
    throw new Error(`--protocol must be ${PUBLIC_SKILL_CORPUS_PROTOCOL_PATH}`);
  }
  const outputDir = repositoryRelative(take(values, "out-dir"), "out-dir");
  if (values.size > 0) throw new Error(`unknown argument: --${values.keys().next().value}`);
  return { rootDir, protocolPath, outputDir };
}

export async function runPublicSkillMetadataDiscoveryCommand(command: PublicSkillMetadataDiscoveryCommand) {
  return discoverPublicSkillMetadata({
    ...command,
    retrievedAt: new Date().toISOString(),
  });
}

async function main(): Promise<void> {
  const discovery = await runPublicSkillMetadataDiscoveryCommand(
    parsePublicSkillMetadataDiscoveryCommand(Bun.argv.slice(2)),
  );
  process.stdout.write(`${JSON.stringify({
    status: discovery.status,
    metadataRequests: discovery.accounting.metadataRequests,
    repositoriesInspected: discovery.accounting.repositoriesInspected,
    publicSkillBodyRequests: discovery.accounting.skillBodyRequests,
  })}\n`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
