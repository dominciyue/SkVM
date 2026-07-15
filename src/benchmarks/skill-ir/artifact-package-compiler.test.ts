import { afterEach, describe, expect, test } from "bun:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  compileEnvManagerArtifactPackage,
  extractEnvManagerTaskContract,
} from "./artifact-package-compiler";
import { validateArtifactPackage } from "./artifact-package";

const projectRoot = join(import.meta.dir, "../../..");
const baseIrPath = join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/base-ir.json");
const taskSetPath = join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/tasks.json");
const sourcePath = join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/source/SKILL.md");
const repairEvidencePath = join(
  projectRoot,
  "results/skill-ir/env-manager-dual-overlay-v2-2026-07-16/repair-evidence.json",
);
const predecessorPaths = [
  join(projectRoot, "results/skill-ir/env-manager-dual-overlay-v1-2026-07-16/provenance.json"),
  join(projectRoot, "results/skill-ir/env-manager-dual-overlay-v2-2026-07-16/provenance.json"),
];
const tempDirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "skill-ir-artifact-compiler-"));
  tempDirs.push(dir);
  return dir;
}

async function packageFiles(root: string): Promise<Record<string, string>> {
  const glob = new Bun.Glob("**/*");
  const files: Record<string, string> = {};
  for await (const relativePath of glob.scan({ cwd: root, onlyFiles: true })) {
    files[relativePath.replaceAll("\\", "/")] = await readFile(join(root, relativePath), "utf8");
  }
  return files;
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe("env-manager executable artifact compiler", () => {
  test("extracts one consistent contract from development prompt projections", async () => {
    const taskSet = JSON.parse(await readFile(taskSetPath, "utf8")) as {
      tasks: Array<{ id: string; split: string; prompt: string; eval?: unknown; hardGateIds?: unknown }>;
    };
    const result = extractEnvManagerTaskContract(
      taskSet.tasks.map(({ id, split, prompt }) => ({ id, split, prompt })),
    );

    expect(result.taskIds).toEqual([
      "env-manager-node-audit-dev-001",
      "env-manager-vite-audit-dev-002",
    ]);
    expect(result.contract).toEqual({
      schemaVersion: "env-manager-task-contract/v1",
      generatedFiles: [".env.example", ".env.schema.json", "env-report.json"],
      reportFields: [
        "definedAndUsed",
        "definedUnconfirmedUnused",
        "usedUndefined",
        "hardcodedSecrets",
        "exposureRisks",
      ],
      schemaRoot: "variables",
      allowedRuleFields: [
        "type",
        "required",
        "minimum",
        "maximum",
        "format",
        "minLength",
        "sensitive",
      ],
      syntheticSecretPrefix: "TEST_ONLY_",
      preserveExistingFiles: true,
    });
    expect(result.promptDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  test("rejects inconsistent development task contracts", () => {
    expect(() => extractEnvManagerTaskContract([
      {
        id: "dev-1",
        split: "development",
        prompt: "Preserve existing files. Treat TEST_ONLY_ as synthetic. Create .env.example, .env.schema.json, and env-report.json. Report arrays definedAndUsed, definedUnconfirmedUnused, usedUndefined, hardcodedSecrets, exposureRisks. Schema top-level variables with type, required, minimum, maximum, format, minLength, sensitive.",
      },
      {
        id: "dev-2",
        split: "development",
        prompt: "Preserve existing files. Treat TEST_ONLY_ as synthetic. Create .env.example and env-report.json only.",
      },
    ])).toThrow("task contract");
  });

  test("emits deterministic provenance-bound files without evaluator or held-out canaries", async () => {
    const fixtureRoot = await tempDir();
    const copiedTasks = join(fixtureRoot, "tasks.json");
    const taskSet = JSON.parse(await readFile(taskSetPath, "utf8")) as {
      tasks: Array<Record<string, unknown> & { split: string }>;
    };
    taskSet.tasks = taskSet.tasks.map((task) => ({
      ...task,
      eval: [{ id: "GOLD_CRITERION_CANARY", payload: { values: ["TEST_ONLY_GOLD_SECRET_CANARY"] } }],
      hardGateIds: ["GOLD_HARD_GATE_CANARY"],
      ...(task.split === "held-out" ? { prompt: `${String(task.prompt)} HELD_OUT_PROMPT_CANARY` } : {}),
    }));
    await writeFile(copiedTasks, `${JSON.stringify(taskSet, null, 2)}\n`, "utf8");

    const outA = join(fixtureRoot, "package-a");
    const outB = join(fixtureRoot, "package-b");
    const common = {
      rootDir: projectRoot,
      baseIrPath,
      repairEvidencePath,
      taskSetPath: copiedTasks,
      sourcePath,
      predecessorPaths,
      scope: {
        model: "xty/gpt-4.1-mini",
        modelFamily: "gpt",
        adapter: "bare-agent",
        adapterVersion: "workspace-executable-artifact-v1",
        environment: "windows",
        context: "clean",
      },
    } as const;
    await compileEnvManagerArtifactPackage({ ...common, outDir: outA });
    await compileEnvManagerArtifactPackage({ ...common, outDir: outB });

    const filesA = await packageFiles(outA);
    const filesB = await packageFiles(outB);
    expect(filesA).toEqual(filesB);
    expect(Object.keys(filesA).sort()).toEqual([
      "artifacts/checks/validate-output.ts",
      "artifacts/contracts/env-manager-output-contract.json",
      "artifacts/templates/env-report.template.json",
      "artifacts/templates/env-schema.template.json",
      "package-manifest.json",
      "package-provenance.json",
      "skill-ir.json",
      "skill.md",
      "validation-policy.json",
    ]);
    const serialized = JSON.stringify(filesA);
    for (const canary of [
      "GOLD_CRITERION_CANARY",
      "GOLD_HARD_GATE_CANARY",
      "TEST_ONLY_GOLD_SECRET_CANARY",
      "HELD_OUT_PROMPT_CANARY",
      '"payload"',
      '"expected"',
    ]) {
      expect(serialized).not.toContain(canary);
    }
    expect(filesA["artifacts/templates/env-report.template.json"]).toContain("__SKVM_REQUIRED__");
    expect(filesA["artifacts/templates/env-schema.template.json"]).toContain("__SKVM_REQUIRED__");
    expect(filesA["artifacts/checks/validate-output.ts"]).toContain("runtime-validation-report/v1");
    expect(filesA["package-provenance.json"]).toContain("skill-ir-artifact-package-provenance/v1");
    await expect(validateArtifactPackage({ packageDir: outA })).resolves.toMatchObject({
      manifest: { catalog: "executable-artifact/v1", skillId: "env-manager" },
    });
  });

  test("requires the approved dual-source repair kinds", async () => {
    const fixtureRoot = await tempDir();
    const evidence = JSON.parse(await readFile(repairEvidencePath, "utf8")) as {
      repairs: Array<{ kind: string }>;
    };
    evidence.repairs = evidence.repairs.filter((repair) => repair.kind !== "json-schema-contract");
    const evidencePath = join(fixtureRoot, "repair-evidence.json");
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

    await expect(compileEnvManagerArtifactPackage({
      rootDir: projectRoot,
      baseIrPath,
      repairEvidencePath: evidencePath,
      taskSetPath,
      sourcePath,
      predecessorPaths,
      outDir: join(fixtureRoot, "package"),
      scope: {
        model: "xty/gpt-4.1-mini",
        modelFamily: "gpt",
        adapter: "bare-agent",
        adapterVersion: "workspace-executable-artifact-v1",
        environment: "windows",
        context: "clean",
      },
    })).rejects.toThrow("json-schema-contract");
  });

  test("does not mutate any compiler input", async () => {
    const fixtureRoot = await tempDir();
    const copiedBase = join(fixtureRoot, "base-ir.json");
    await cp(baseIrPath, copiedBase);
    const before = await readFile(copiedBase, "utf8");
    await compileEnvManagerArtifactPackage({
      rootDir: projectRoot,
      baseIrPath: copiedBase,
      repairEvidencePath,
      taskSetPath,
      sourcePath,
      predecessorPaths,
      outDir: join(fixtureRoot, "package"),
      scope: {
        model: "xty/gpt-4.1-mini",
        modelFamily: "gpt",
        adapter: "bare-agent",
        adapterVersion: "workspace-executable-artifact-v1",
        environment: "windows",
        context: "clean",
      },
    });
    expect(await readFile(copiedBase, "utf8")).toBe(before);
  });
});
