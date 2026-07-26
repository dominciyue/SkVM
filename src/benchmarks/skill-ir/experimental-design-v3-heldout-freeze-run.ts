import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseSafeRelativePath } from "./artifact-package.ts";
import {
  createExperimentalDesignV3HeldoutFreeze,
  verifyExperimentalDesignV3HeldoutFreeze,
  type ExperimentalDesignV3HeldoutFreeze,
} from "./experimental-design-v3-heldout-freeze.ts";

export type ExperimentalDesignV3HeldoutFreezeArgs =
  | { mode: "create"; inputsCommit: string; out: string }
  | { mode: "verify"; freezePath: string };

export function parseExperimentalDesignV3HeldoutFreezeArgs(
  argv: string[],
): ExperimentalDesignV3HeldoutFreezeArgs {
  let inputsCommit: string | undefined;
  let out: string | undefined;
  let verifyOnly: string | undefined;
  for (const arg of argv) {
    if (arg.startsWith("--inputs-commit=")) {
      if (inputsCommit !== undefined) throw new Error("--inputs-commit may appear only once");
      inputsCommit = arg.slice("--inputs-commit=".length);
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
    if (inputsCommit !== undefined || out !== undefined) {
      throw new Error("--verify-only cannot be combined with --inputs-commit or --out");
    }
    return { mode: "verify", freezePath: verifyOnly };
  }
  if (!inputsCommit) throw new Error("--inputs-commit is required in create mode");
  if (!out) throw new Error("--out is required in create mode");
  return { mode: "create", inputsCommit, out };
}

function resolveRepositoryFile(rootDir: string, relativePath: string): string {
  return path.resolve(rootDir, ...parseSafeRelativePath(relativePath).split("/"));
}

export async function runExperimentalDesignV3HeldoutFreezeCommand(
  args: ExperimentalDesignV3HeldoutFreezeArgs,
  rootDir = process.cwd(),
): Promise<ExperimentalDesignV3HeldoutFreeze> {
  if (args.mode === "verify") {
    const freeze = JSON.parse(
      await readFile(resolveRepositoryFile(rootDir, args.freezePath), "utf8"),
    );
    return verifyExperimentalDesignV3HeldoutFreeze(rootDir, freeze);
  }
  const freeze = await createExperimentalDesignV3HeldoutFreeze(
    rootDir,
    args.inputsCommit,
  );
  await verifyExperimentalDesignV3HeldoutFreeze(rootDir, freeze);
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
  const args = parseExperimentalDesignV3HeldoutFreezeArgs(process.argv.slice(2));
  const freeze = await runExperimentalDesignV3HeldoutFreezeCommand(args);
  console.log(
    JSON.stringify(
      {
        benchmarkId: freeze.benchmarkId,
        mode: args.mode,
        inputsCommit: freeze.inputsCommit,
      },
      null,
      2,
    ),
  );
}
