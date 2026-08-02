import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { apiTesterGrade } from "../../bench/evaluators/api-tester-grade";
import { writeInitialWorkdirManifest } from "../../core/workdir-manifest";
import {
  compileApiTesterValidatedArtifact,
  loadApiTesterArtifactCompilerInput,
} from "./api-tester-artifact-compiler";
import { ResourceContractSchema, runResourceProbe } from "./resource-contract";
import { validateValidatedArtifactPackage } from "./validated-artifact-catalog";
import { runValidatedArtifactPlan } from "./validated-artifact-runtime";

const rootDir = process.cwd();
const pilotDir = "benchmarks/skill-ir/pilots/api-tester";
const tempDirs: string[] = [];

type Task = {
  id: string;
  fixtures: Record<string, string>;
  eval: Array<{ id: string; weight: number; payload: unknown }>;
  hardGateIds: string[];
  passThreshold: number;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function materialize(task: Task, workDir: string): Promise<void> {
  for (const [relativePath, content] of Object.entries(task.fixtures)) {
    await mkdir(dirname(join(workDir, relativePath)), { recursive: true });
    await writeFile(join(workDir, relativePath), content, "utf8");
  }
}

async function score(task: Task, workDir: string, initialWorkdirManifest: unknown) {
  const rows = await Promise.all(task.eval.map(async (criterion) => ({
    criterion,
    result: await apiTesterGrade.run({
      criterion: { ...criterion, method: "custom", name: criterion.id, evaluatorId: "skill-ir-api-tester" },
      runResult: { workDir, initialWorkdirManifest },
    } as never),
  })));
  const evaluatorScore = rows.reduce((sum, row) => sum + row.criterion.weight * row.result.score, 0);
  const hardGateFailures = rows
    .filter((row) => task.hardGateIds.includes(row.criterion.id) && !row.result.pass)
    .map((row) => row.criterion.id);
  return {
    evaluatorScore,
    hardGateFailures,
    success: evaluatorScore >= task.passThreshold && hardGateFailures.length === 0,
  };
}

function openApiPath(task: Task): "api/openapi.yaml" | "api/openapi.json" {
  const path = Object.keys(task.fixtures).find((candidate) => /openapi\.(?:yaml|json)$/u.test(candidate));
  if (path !== "api/openapi.yaml" && path !== "api/openapi.json") throw new Error("unsupported API fixture");
  return path;
}

describe("API Tester validated artifact activation", () => {
  test("executes both development variants and reaches deterministic scorer success", async () => {
    const resource = ResourceContractSchema.parse(JSON.parse(await readFile(
      join(rootDir, pilotDir, "resource-contract.json"), "utf8",
    )));
    const node = process.env.SKVM_NODE ?? process.env.SKVM_NODE_BINARY ?? "node";
    expect((await runResourceProbe(resource, { env: { SKVM_NODE: node } })).status).toBe("ok");
    const registry = JSON.parse(await readFile(
      join(rootDir, pilotDir, "development/tasks.json"), "utf8",
    )) as { tasks: Task[] };
    expect(registry.tasks).toHaveLength(2);

    for (const task of registry.tasks) {
      const inputPath = openApiPath(task);
      const variantId = inputPath.endsWith(".yaml") ? "openapi-yaml" : "openapi-json";
      const packageDir = await tempDir(`api-tester-package-${variantId}-`);
      await compileApiTesterValidatedArtifact(
        await loadApiTesterArtifactCompilerInput(rootDir, variantId),
        packageDir,
      );
      const artifactPackage = await validateValidatedArtifactPackage(packageDir);
      const workDir = await tempDir(`api-tester-work-${variantId}-`);
      await materialize(task, workDir);
      const manifestPath = join(await tempDir("api-tester-manifest-"), "initial.json");
      const manifest = await writeInitialWorkdirManifest({ workDir, manifestPath });
      const protectedBefore = await Promise.all(artifactPackage.manifest.protectedInputs.map(async (path) =>
        [path, sha256(await readFile(join(workDir, path)))] as const));

      const runtime = await runValidatedArtifactPlan({
        package: artifactPackage,
        workDir,
        env: { SKVM_NODE: node },
      });
      const scored = await score(task, workDir, manifest);

      expect(runtime.status).toBe("complete");
      expect(runtime.validation?.status).toBe("pass");
      expect(runtime.modelGenerationTokens).toBe(0);
      expect(runtime.modelRepairTokens).toBe(0);
      expect(scored).toEqual({ evaluatorScore: 1, hardGateFailures: [], success: true });
      for (const [path, digest] of protectedBefore) {
        expect(sha256(await readFile(join(workDir, path)))).toBe(digest);
      }
    }
  }, 180_000);

  test("removing public schema evidence removes its generated witness", async () => {
    const registry = JSON.parse(await readFile(
      join(rootDir, pilotDir, "development/tasks.json"), "utf8",
    )) as { tasks: Task[] };
    const task = registry.tasks.find((candidate) => openApiPath(candidate).endsWith(".yaml"))!;
    const packageDir = await tempDir("api-tester-reverse-package-");
    await compileApiTesterValidatedArtifact(
      await loadApiTesterArtifactCompilerInput(rootDir, "openapi-yaml"),
      packageDir,
    );
    const artifactPackage = await validateValidatedArtifactPackage(packageDir);
    const node = process.env.SKVM_NODE ?? process.env.SKVM_NODE_BINARY ?? "node";

    const run = async (openapi: string) => {
      const workDir = await tempDir("api-tester-reverse-work-");
      await materialize({ ...task, fixtures: { ...task.fixtures, "api/openapi.yaml": openapi } }, workDir);
      expect((await runValidatedArtifactPlan({ package: artifactPackage, workDir, env: { SKVM_NODE: node } })).status)
        .toBe("complete");
      return JSON.parse(await readFile(join(workDir, "generated/api-test-plan.json"), "utf8")) as {
        endpoints: Array<{ cases: unknown[] }>;
      };
    };

    const original = task.fixtures["api/openapi.yaml"]!;
    const changed = parseYaml(original) as {
      paths: Record<string, { post: { requestBody: { content: Record<string, { schema: { properties: Record<string, Record<string, unknown>> } }> } } }>;
    };
    delete changed.paths["/users"]!.post.requestBody.content["application/json"]!.schema.properties.name!.minLength;
    const before = await run(original);
    const after = await run(stringifyYaml(changed));
    const count = (value: typeof before) => value.endpoints.reduce((sum, endpoint) => sum + endpoint.cases.length, 0);

    expect(count(after)).toBe(count(before) - 1);
  }, 120_000);
});
