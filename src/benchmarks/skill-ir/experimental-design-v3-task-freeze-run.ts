import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseSafeRelativePath } from "./artifact-package.ts";
import {
  createExperimentalDesignV3TaskSplitFreeze,
  verifyExperimentalDesignV3TaskSplitFreeze,
  type ExperimentalDesignV3TaskSplitFreeze,
} from "./experimental-design-v3-task-freeze.ts";

export type ExperimentalDesignV3TaskSplitFreezeArgs =
  | {
      mode: "create";
      taskCommit: string;
      out: string;
    }
  | {
      mode: "verify";
      freezePath: string;
    };

export function parseExperimentalDesignV3TaskSplitFreezeArgs(
  argv: string[],
): ExperimentalDesignV3TaskSplitFreezeArgs {
  let taskCommit: string | undefined;
  let out: string | undefined;
  let verifyOnly: string | undefined;

  for (const arg of argv) {
    if (arg.startsWith("--task-commit=")) {
      if (taskCommit !== undefined) throw new Error("--task-commit may appear only once");
      taskCommit = arg.slice("--task-commit=".length);
    } else if (arg.startsWith("--out=")) {
      if (out !== undefined) throw new Error("--out may appear only once");
      out = parseSafeRelativePath(arg.slice("--out=".length));
    } else if (arg.startsWith("--verify-only=")) {
      if (verifyOnly !== undefined) throw new Error("--verify-only may appear only once");
      verifyOnly = parseSafeRelativePath(arg.slice("--verify-only=".length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (verifyOnly !== undefined) {
    if (taskCommit !== undefined || out !== undefined) {
      throw new Error("--verify-only cannot be combined with --task-commit or --out");
    }
    return { mode: "verify", freezePath: verifyOnly };
  }
  if (!taskCommit) throw new Error("--task-commit is required in create mode");
  if (!out) throw new Error("--out is required in create mode");
  return { mode: "create", taskCommit, out };
}

function resolveRepositoryFile(rootDir: string, relativePath: string): string {
  return path.resolve(rootDir, ...parseSafeRelativePath(relativePath).split("/"));
}

export async function runExperimentalDesignV3TaskSplitFreezeCommand(
  args: ExperimentalDesignV3TaskSplitFreezeArgs,
  rootDir = process.cwd(),
): Promise<ExperimentalDesignV3TaskSplitFreeze> {
  if (args.mode === "verify") {
    const freeze = JSON.parse(
      await readFile(resolveRepositoryFile(rootDir, args.freezePath), "utf8"),
    );
    return verifyExperimentalDesignV3TaskSplitFreeze(rootDir, freeze);
  }

  const freeze = await createExperimentalDesignV3TaskSplitFreeze(
    rootDir,
    args.taskCommit,
  );
  await verifyExperimentalDesignV3TaskSplitFreeze(rootDir, freeze);
  const outPath = resolveRepositoryFile(rootDir, args.out);
  const temporaryPath = `${outPath}.tmp-${process.pid}`;
  await mkdir(path.dirname(outPath), { recursive: true });
  try {
    await writeFile(temporaryPath, `${JSON.stringify(freeze, null, 2)}\n`, "utf8");
    await rename(temporaryPath, outPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
  return freeze;
}

if (import.meta.main) {
  const args = parseExperimentalDesignV3TaskSplitFreezeArgs(process.argv.slice(2));
  const freeze = await runExperimentalDesignV3TaskSplitFreezeCommand(args);
  console.log(
    JSON.stringify(
      {
        benchmarkId: freeze.benchmarkId,
        mode: args.mode,
        taskCommit: freeze.taskCommit,
      },
      null,
      2,
    ),
  );
}
