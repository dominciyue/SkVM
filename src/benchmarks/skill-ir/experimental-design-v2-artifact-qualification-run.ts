import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { experimentalDesignGradeV2 } from "../../bench/evaluators/experimental-design-grade-v2";
import { writeInitialWorkdirManifest } from "../../core/workdir-manifest";
import { sha256Bytes } from "./source-fixture";
import { validateValidatedArtifactPackage } from "./validated-artifact-catalog";
import { runValidatedArtifactPlan } from "./validated-artifact-runtime";

type Task = {
  id: string;
  split: "development";
  fixtures: Record<string, string>;
  eval: Array<{
    method: "custom";
    id: string;
    name: string;
    weight: number;
    evaluatorId: string;
    payload: unknown;
  }>;
  hardGateIds: string[];
  passThreshold: number;
};

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function writeExperimentalDesignV2ArtifactQualificationReport(options: {
  rootDir: string;
  packageDir: string;
  outPath: string;
  python: string;
}): Promise<{
  schemaVersion: string;
  summary: { ready: boolean };
}> {
  const packageRecord = await validateValidatedArtifactPackage(options.packageDir);
  const registry = JSON.parse(await readFile(join(
    options.rootDir,
    "benchmarks/skill-ir/pilots/experimental-design/v2/development/tasks.json",
  ), "utf8")) as { skillId: string; tasks: Task[] };
  if (registry.skillId !== "experimental-design-v2" || registry.tasks.length !== 2
    || registry.tasks.some((task) => task.split !== "development")) {
    throw new Error("Experimental-design v2 qualification task registry mismatch");
  }
  const executionRoot = await mkdtemp(join(tmpdir(), "skvm-experimental-design-v2-qualification-"));
  try {
    const tasks = [];
    for (const task of registry.tasks) {
      const workDir = join(executionRoot, task.id);
      await mkdir(workDir, { recursive: true });
      for (const [relativePath, content] of Object.entries(task.fixtures)) {
        await writeFile(join(workDir, relativePath), content, "utf8");
      }
      const protectedPaths = ["study.json", "design-contract.json"];
      const protectedBefore = await Promise.all(protectedPaths.map(async (path) =>
        digest(await readFile(join(workDir, path)))
      ));
      const initialWorkdirManifest = await writeInitialWorkdirManifest({
        workDir,
        manifestPath: join(executionRoot, `${task.id}-initial-workdir-manifest.json`),
      });
      const runtime = await runValidatedArtifactPlan({
        package: packageRecord,
        workDir,
        env: { SKVM_PYTHON: options.python },
      });
      const criterionRows = await Promise.all(task.eval.map(async (criterion) => ({
        id: criterion.id,
        weight: criterion.weight,
        hardGate: task.hardGateIds.includes(criterion.id),
        result: await experimentalDesignGradeV2.run({
          criterion,
          runResult: { workDir, initialWorkdirManifest },
        } as never),
      })));
      const score = criterionRows.reduce(
        (sum, row) => sum + row.weight * row.result.score,
        0,
      );
      const hardGateFailures = criterionRows
        .filter((row) => row.hardGate && !row.result.pass)
        .map((row) => row.id);
      const protectedInputsPreserved = (await Promise.all(protectedPaths.map(async (path) =>
        digest(await readFile(join(workDir, path)))
      ))).every((value, index) => value === protectedBefore[index]);
      tasks.push({
        taskId: task.id,
        runtimeStatus: runtime.status,
        validationStatus: runtime.validation?.status ?? "missing",
        score,
        success: score >= task.passThreshold && hardGateFailures.length === 0,
        hardGateFailures,
        protectedInputsPreserved,
        modelGenerationTokens: runtime.modelGenerationTokens,
        modelRepairTokens: runtime.modelRepairTokens,
        packageBytes: runtime.packageBytes,
      });
    }
    const summary = {
      taskCount: tasks.length,
      runtimeCompleteCount: tasks.filter((task) => task.runtimeStatus === "complete").length,
      scorerSuccessCount: tasks.filter((task) => task.success).length,
      meanScore: tasks.reduce((sum, task) => sum + task.score, 0) / tasks.length,
      protectedInputPassCount: tasks.filter((task) => task.protectedInputsPreserved).length,
      modelGenerationTokens: tasks.reduce((sum, task) => sum + task.modelGenerationTokens, 0),
      modelRepairTokens: tasks.reduce((sum, task) => sum + task.modelRepairTokens, 0),
      ready: tasks.every((task) =>
        task.runtimeStatus === "complete"
        && task.validationStatus === "pass"
        && task.success
        && task.protectedInputsPreserved
      ),
    };
    const report = {
      schemaVersion: "experimental-design-v2-artifact-local-qualification/v1",
      catalog: packageRecord.manifest.catalog,
      skillId: packageRecord.manifest.skillId,
      packageManifest: {
        path: "package-manifest.json",
        sha256: sha256Bytes(await readFile(join(options.packageDir, "package-manifest.json"))),
      },
      taskContract: {
        path: "benchmarks/skill-ir/pilots/experimental-design/v2/development/tasks.json",
        sha256: sha256Bytes(await readFile(join(
          options.rootDir,
          "benchmarks/skill-ir/pilots/experimental-design/v2/development/tasks.json",
        ))),
      },
      tasks,
      summary,
      claimBoundary: [
        "local-deterministic-mechanism-only",
        "no-paid-model-comparison",
        "no-quality-improvement-claim",
        "no-heldout-or-cross-model-claim",
        "runtime-model-token-count-excludes-compile-cost",
      ],
    };
    await mkdir(dirname(options.outPath), { recursive: true });
    await writeFile(options.outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    return report;
  } finally {
    await rm(executionRoot, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const rootDir = resolve(import.meta.dir, "../../..");
  const python = process.env.SKVM_PYTHON?.trim();
  if (!python) throw new Error("SKVM_PYTHON is required for local qualification");
  const packageDir = resolve(
    rootDir,
    "benchmarks/skill-ir/pilots/experimental-design/v2/packages/validated-skill-artifact-v1",
  );
  const outPath = resolve(
    rootDir,
    "results/skill-ir/experimental-design-v2-artifact-local-qualification.json",
  );
  const report = await writeExperimentalDesignV2ArtifactQualificationReport({
    rootDir,
    packageDir,
    outPath,
    python,
  });
  process.stdout.write(`${JSON.stringify({ out: outPath, ready: report.summary.ready }, null, 2)}\n`);
}
