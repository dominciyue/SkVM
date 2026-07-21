import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  buildEnvManagerContractCoverageAudit,
} from "./contract-coverage";
import { sha256Bytes } from "./source-fixture";

type Args = {
  runtimeCodes: string[];
  failedCriteria: string[];
  tasks: string;
  out: string;
};

export function parseContractCoverageArgs(argv: string[]): Args {
  const args: Args = {
    runtimeCodes: [],
    failedCriteria: [],
    tasks: "benchmarks/skill-ir/pilots/env-manager/tasks.json",
    out: "contract-coverage-audit.json",
  };
  for (const arg of argv) {
    if (arg.startsWith("--runtime-codes=")) {
      args.runtimeCodes = arg.slice("--runtime-codes=".length).split(",").filter(Boolean);
    } else if (arg.startsWith("--failed-criteria=")) {
      args.failedCriteria = arg.slice("--failed-criteria=".length).split(",").filter(Boolean);
    } else if (arg.startsWith("--out=")) {
      args.out = arg.slice("--out=".length);
    } else if (arg.startsWith("--tasks=")) {
      args.tasks = arg.slice("--tasks=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseContractCoverageArgs(process.argv.slice(2));
  const taskBytes = await readFile(args.tasks);
  const taskSet = JSON.parse(taskBytes.toString("utf8")) as {
    tasks?: Array<{ split?: string; eval?: Array<{ id?: string }> }>;
  };
  const developmentTasks = (taskSet.tasks ?? []).filter((task) => task.split === "development");
  if (developmentTasks.length === 0) throw new Error("Coverage audit requires development tasks");
  const criterionIds = developmentTasks.flatMap((task) => (task.eval ?? [])
    .map((criterion) => criterion.id)
    .filter((id): id is string => Boolean(id)));
  for (const task of developmentTasks) {
    buildEnvManagerContractCoverageAudit({
      criterionIds: (task.eval ?? []).map((criterion) => criterion.id).filter(
        (id): id is string => Boolean(id),
      ),
      observedRuntimeCodes: [],
      observedFailedCriteria: [],
    });
  }
  const audit = buildEnvManagerContractCoverageAudit({
    criterionIds: [...new Set(criterionIds)],
    observedRuntimeCodes: args.runtimeCodes,
    observedFailedCriteria: args.failedCriteria,
  });
  await mkdir(dirname(args.out), { recursive: true });
  const output = {
    ...audit,
    provenance: {
      tasksPath: args.tasks,
      tasksSha256: sha256Bytes(taskBytes),
    },
  };
  await writeFile(args.out, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ criteria: audit.criteria.length, out: args.out }, null, 2));
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
