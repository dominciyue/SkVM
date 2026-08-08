import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateValidatedArtifactPackage } from "./validated-artifact-catalog";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true }),
  ));
});

async function tempDir(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(directory);
  return directory;
}

async function packageText(root: string): Promise<string> {
  const files: string[] = [];
  const walk = async (current = "") => {
    for (const entry of await readdir(join(root, current), { withFileTypes: true })) {
      const relativePath = current ? `${current}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(relativePath);
      else files.push(relativePath);
    }
  };
  await walk();
  return (await Promise.all(files.sort().map(async (relativePath) =>
    `${relativePath}\n${await readFile(join(root, relativePath), "utf8")}`
  ))).join("\n---FILE---\n");
}

async function compilerModule() {
  return import("./experimental-design-v2-artifact-compiler").catch(() => ({}));
}

describe("experimental-design v2 validated artifact compiler", () => {
  test("uses the common assembly contract and only public v2 semantics", async () => {
    const module = await compilerModule();
    expect(module).toHaveProperty("compileExperimentalDesignV2Artifact");
    expect(module).toHaveProperty("loadExperimentalDesignV2ArtifactCompilerInput");
    const compiler = module as {
      compileExperimentalDesignV2Artifact: (input: unknown, outDir: string) => Promise<void>;
      loadExperimentalDesignV2ArtifactCompilerInput: (rootDir: string) => Promise<unknown>;
    };
    const outDir = await tempDir("experimental-design-v2-package-");
    await compiler.compileExperimentalDesignV2Artifact(
      await compiler.loadExperimentalDesignV2ArtifactCompilerInput(process.cwd()),
      outDir,
    );
    const validated = await validateValidatedArtifactPackage(outDir);
    const packageSource = await packageText(outDir);

    expect(validated.manifest.catalog).toBe("validated-skill-artifact/v1");
    expect(validated.manifest.skillId).toBe("experimental-design");
    expect(validated.manifest.protectedInputs).toEqual(["study.json", "design-contract.json"]);
    expect(validated.provenance.inputs.sourceClosure.map((entry) => entry.path))
      .toContain("benchmarks/skill-ir/pilots/experimental-design/v2/public-contract.json");
    expect(await readFile(
      join(process.cwd(), "src/benchmarks/skill-ir/experimental-design-v2-artifact-compiler.ts"),
      "utf8",
    )).toContain("assembleValidatedArtifactPackage");
    for (const privateToken of [
      "xorshift32-fisher-yates-v1",
      '"cluster-randomized",\n      "stratified-block"',
      "EVALUATOR_CANARY",
      "HELDOUT_CANARY",
    ]) {
      expect(packageSource).not.toContain(privateToken);
    }
  });

  test("is byte-for-byte deterministic", async () => {
    const module = await compilerModule();
    expect(module).toHaveProperty("compileExperimentalDesignV2Artifact");
    const compiler = module as {
      compileExperimentalDesignV2Artifact: (input: unknown, outDir: string) => Promise<void>;
      loadExperimentalDesignV2ArtifactCompilerInput: (rootDir: string) => Promise<unknown>;
    };
    const [first, second] = await Promise.all([
      tempDir("experimental-design-v2-first-"),
      tempDir("experimental-design-v2-second-"),
    ]);
    const input = await compiler.loadExperimentalDesignV2ArtifactCompilerInput(process.cwd());
    await compiler.compileExperimentalDesignV2Artifact(input, first);
    await compiler.compileExperimentalDesignV2Artifact(input, second);
    expect(await packageText(first)).toBe(await packageText(second));
  });
});
