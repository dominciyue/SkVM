import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateValidatedArtifactPackage } from "./validated-artifact-catalog";

const rootDir = process.cwd();
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function packageText(root: string): Promise<string> {
  const files: string[] = [];
  const walk = async (current = "") => {
    for (const entry of await readdir(join(root, current), { withFileTypes: true })) {
      const path = current ? `${current}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path);
      else files.push(path);
    }
  };
  await walk();
  return (await Promise.all(files.sort().map(async (path) =>
    `${path}\n${await readFile(join(root, path), "utf8")}`))).join("\n---FILE---\n");
}

describe("Env Manager v3 validated artifact compiler", () => {
  test("compiles Node and Vite variants through the shared validated artifact catalog", async () => {
    const compiler = await import("./env-manager-v3-artifact-compiler");
    for (const variantId of ["node", "vite"] as const) {
      const outDir = await tempDir(`env-manager-v3-${variantId}-`);
      await compiler.compileEnvManagerV3ValidatedArtifact(
        await compiler.loadEnvManagerV3ArtifactCompilerInput(rootDir, variantId),
        outDir,
      );
      const validated = await validateValidatedArtifactPackage(outDir);
      expect(validated.manifest).toMatchObject({
        catalog: "validated-skill-artifact/v1",
        skillId: "env-manager-v3",
        generatedOutputs: [".env.example", ".env.schema.json", "env-report.json"],
      });
      expect(validated.executionPlan.nodes.map((node) => node.kind)).toEqual(["process", "validate"]);
      expect(validated.provenance.forbiddenEvidenceClasses).toEqual([
        "evaluator-payload", "held-out", "runtime-output", "profile-feedback", "secret-value",
      ]);
    }
  });

  test("is deterministic and excludes non-contract task fields", async () => {
    const compiler = await import("./env-manager-v3-artifact-compiler");
    const first = await tempDir("env-manager-v3-artifact-first-");
    const second = await tempDir("env-manager-v3-artifact-second-");
    const input = await compiler.loadEnvManagerV3ArtifactCompilerInput(rootDir, "node");
    const poisoned = {
      ...input,
      taskContract: {
        ...input.taskContract,
        evaluatorPayload: "EVALUATOR_CANARY_48271",
        heldout: "HELDOUT_CANARY_48271",
        runtimeOutput: "RUNTIME_CANARY_48271",
        secret: "SECRET_CANARY_48271",
      },
    };

    await compiler.compileEnvManagerV3ValidatedArtifact(poisoned, first);
    await compiler.compileEnvManagerV3ValidatedArtifact(poisoned, second);
    const text = await packageText(first);
    expect(text).toBe(await packageText(second));
    for (const canary of ["EVALUATOR_CANARY_48271", "HELDOUT_CANARY_48271", "RUNTIME_CANARY_48271", "SECRET_CANARY_48271"]) {
      expect(text).not.toContain(canary);
    }
  });
});
