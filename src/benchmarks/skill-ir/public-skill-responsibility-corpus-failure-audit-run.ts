#!/usr/bin/env bun
import {
  createPublicSkillMetadataFailureAudit,
  verifyPublicSkillMetadataFailureAuditFiles,
} from "./public-skill-responsibility-corpus-failure-audit";
import { normalizeRepositoryRelativePath } from "./public-skill-responsibility-corpus-paths";

export type PublicSkillMetadataFailureAuditCommand = {
  mode: "create";
  rootDir: string;
  outputDir: string;
  auditPath: string;
} | {
  mode: "verify";
  rootDir: string;
  auditPath: string;
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

export function parsePublicSkillMetadataFailureAuditCommand(argv: string[]): PublicSkillMetadataFailureAuditCommand {
  const values = optionMap(argv);
  const mode = take(values, "mode");
  if (mode !== "create" && mode !== "verify") throw new Error("--mode must be create or verify");
  const rootDir = take(values, "root");
  const auditPath = normalizeRepositoryRelativePath(take(values, "audit"), "--audit");
  if (mode === "verify") {
    if (values.size > 0) throw new Error(`unknown argument: --${values.keys().next().value}`);
    return { mode, rootDir, auditPath };
  }
  const outputDir = normalizeRepositoryRelativePath(take(values, "output-dir"), "--output-dir");
  if (values.size > 0) throw new Error(`unknown argument: --${values.keys().next().value}`);
  return { mode, rootDir, outputDir, auditPath };
}

export async function runPublicSkillMetadataFailureAuditCommand(command: PublicSkillMetadataFailureAuditCommand) {
  if (command.mode === "verify") return verifyPublicSkillMetadataFailureAuditFiles(command);
  return createPublicSkillMetadataFailureAudit(command);
}

async function main(): Promise<void> {
  const result = await runPublicSkillMetadataFailureAuditCommand(
    parsePublicSkillMetadataFailureAuditCommand(Bun.argv.slice(2)),
  );
  const summary = result.status === "metadata-failure-audit-complete"
    ? {
        metadataRequestsAttempted: result.accounting.metadataRequestsAttempted,
        archivedSuccessfulResponses: result.accounting.archivedSuccessfulResponses,
        publicSkillBodyRequests: result.accounting.publicSkillBodyRequests,
      }
    : {
        metadataRequestsAttempted: result.metadataRequestsAttempted,
        archivedSuccessfulResponses: result.archivedSuccessfulResponses,
        publicSkillBodyRequests: result.publicSkillBodyRequests,
      };
  process.stdout.write(`${JSON.stringify({
    status: result.status,
    ...summary,
  })}\n`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
