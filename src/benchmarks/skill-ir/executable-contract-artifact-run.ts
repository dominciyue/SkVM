import { resolve } from "node:path";
import { validateArtifactPackage } from "./artifact-package";
import { compileEnvManagerContractRepairArtifactPackage } from "./executable-contract-artifact-compiler";

type Args = {
  rootDir: string;
  outDir?: string;
  baseIr?: string;
  tasks?: string;
  source?: string;
  coverageAudit?: string;
  replayFreeze?: string;
  replaySummary?: string;
  verifyOnly?: string;
};

export function parseExecutableContractArtifactRunArgs(argv: string[]): Args {
  const args: Args = { rootDir: process.cwd() };
  for (const arg of argv) {
    const [flag, ...valueParts] = arg.split("=");
    const value = valueParts.join("=");
    if (!value) throw new Error(`Expected --flag=value argument: ${arg}`);
    if (flag === "--root-dir") args.rootDir = value;
    else if (flag === "--out-dir") args.outDir = value;
    else if (flag === "--base-ir") args.baseIr = value;
    else if (flag === "--tasks") args.tasks = value;
    else if (flag === "--source") args.source = value;
    else if (flag === "--coverage-audit") args.coverageAudit = value;
    else if (flag === "--replay-freeze") args.replayFreeze = value;
    else if (flag === "--replay-summary") args.replaySummary = value;
    else if (flag === "--verify-only") args.verifyOnly = value;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function fromRoot(rootDir: string, path: string): string {
  return resolve(rootDir, path);
}

async function main(): Promise<void> {
  const args = parseExecutableContractArtifactRunArgs(process.argv.slice(2));
  if (args.verifyOnly) {
    const validated = await validateArtifactPackage({
      packageDir: fromRoot(args.rootDir, args.verifyOnly),
      expectedCatalog: "executable-contract-repair-artifact/v4",
    });
    console.log(JSON.stringify({
      verified: true,
      skillId: validated.manifest.skillId,
      catalog: validated.manifest.catalog,
    }, null, 2));
    return;
  }
  if (!args.outDir || !args.baseIr || !args.tasks || !args.source || !args.coverageAudit
    || !args.replayFreeze || !args.replaySummary) {
    throw new Error(
      "Compilation requires --out-dir, --base-ir, --tasks, --source, --coverage-audit, --replay-freeze, and --replay-summary",
    );
  }
  const result = await compileEnvManagerContractRepairArtifactPackage({
    rootDir: resolve(args.rootDir),
    outDir: fromRoot(args.rootDir, args.outDir),
    baseIrPath: fromRoot(args.rootDir, args.baseIr),
    taskSetPath: fromRoot(args.rootDir, args.tasks),
    sourcePath: fromRoot(args.rootDir, args.source),
    coverageAuditPath: fromRoot(args.rootDir, args.coverageAudit),
    replayFreezePath: fromRoot(args.rootDir, args.replayFreeze),
    replaySummaryPath: fromRoot(args.rootDir, args.replaySummary),
  });
  console.log(JSON.stringify({
    outDir: args.outDir,
    catalog: result.manifest.catalog,
    artifacts: result.manifest.artifacts.length,
  }, null, 2));
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
