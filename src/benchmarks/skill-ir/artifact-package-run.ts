import { resolve } from "node:path";
import { compileEnvManagerArtifactPackage } from "./artifact-package-compiler";
import { validateArtifactPackage } from "./artifact-package";

type Args = {
  rootDir: string;
  outDir?: string;
  baseIr?: string;
  repairEvidence?: string;
  tasks?: string;
  source?: string;
  predecessors: string[];
  verifyOnly?: string;
};

export function parseArtifactPackageRunArgs(argv: string[]): Args {
  const args: Args = { rootDir: process.cwd(), predecessors: [] };
  for (const arg of argv) {
    const [flag, value] = arg.split("=", 2);
    if (!value) throw new Error(`Expected --flag=value argument: ${arg}`);
    if (flag === "--root-dir") args.rootDir = value;
    else if (flag === "--out-dir") args.outDir = value;
    else if (flag === "--base-ir") args.baseIr = value;
    else if (flag === "--repair-evidence") args.repairEvidence = value;
    else if (flag === "--tasks") args.tasks = value;
    else if (flag === "--source") args.source = value;
    else if (flag === "--predecessor") args.predecessors = value.split(",").filter(Boolean);
    else if (flag === "--verify-only") args.verifyOnly = value;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function fromRoot(rootDir: string, path: string): string {
  return resolve(rootDir, path);
}

async function main(): Promise<void> {
  const args = parseArtifactPackageRunArgs(process.argv.slice(2));
  if (args.verifyOnly) {
    const validated = await validateArtifactPackage({ packageDir: fromRoot(args.rootDir, args.verifyOnly) });
    console.log(JSON.stringify({ verified: true, skillId: validated.manifest.skillId, catalog: validated.manifest.catalog }, null, 2));
    return;
  }
  if (!args.outDir || !args.baseIr || !args.repairEvidence || !args.tasks || !args.source) {
    throw new Error("Compilation requires --out-dir, --base-ir, --repair-evidence, --tasks, and --source");
  }
  const result = await compileEnvManagerArtifactPackage({
    rootDir: resolve(args.rootDir),
    outDir: fromRoot(args.rootDir, args.outDir),
    baseIrPath: fromRoot(args.rootDir, args.baseIr),
    repairEvidencePath: fromRoot(args.rootDir, args.repairEvidence),
    taskSetPath: fromRoot(args.rootDir, args.tasks),
    sourcePath: fromRoot(args.rootDir, args.source),
    predecessorPaths: args.predecessors.map((path) => fromRoot(args.rootDir, path)),
    scope: {
      model: "xty/gpt-4.1-mini",
      modelFamily: "gpt",
      adapter: "bare-agent",
      adapterVersion: "workspace-executable-artifact-v1",
      environment: "windows",
      context: "clean",
    },
  });
  console.log(JSON.stringify({ outDir: args.outDir, catalog: result.manifest.catalog, artifacts: result.manifest.artifacts.length }, null, 2));
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
