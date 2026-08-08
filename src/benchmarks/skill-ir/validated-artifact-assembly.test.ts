import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ValidatedArtifactExecutionPlan,
  ValidatedArtifactManifest,
  ValidatedArtifactProvenance,
} from "./validated-artifact-catalog";

const rootDir = process.cwd();
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

async function shadowInput(packageDir: string) {
  const [manifest, provenance, executionPlan] = await Promise.all([
    readFile(join(packageDir, "package-manifest.json"), "utf8").then(JSON.parse) as Promise<ValidatedArtifactManifest>,
    readFile(join(packageDir, "package-provenance.json"), "utf8").then(JSON.parse) as Promise<ValidatedArtifactProvenance>,
    readFile(join(packageDir, "execution-plan.json"), "utf8").then(JSON.parse) as Promise<ValidatedArtifactExecutionPlan>,
  ]);
  return {
    adapter: {
      schemaVersion: "validated-artifact-assembly-adapter/v1" as const,
      catalog: "validated-skill-artifact/v1" as const,
      skillId: manifest.skillId,
      adapterId: `${manifest.skillId}-shadow-assembly`,
      version: "v1",
      compiler: provenance.compiler,
      protectedInputs: manifest.protectedInputs,
      generatedOutputs: manifest.generatedOutputs,
      executionPlan,
      artifactLayout: manifest.artifacts.map(({ id, path, kind }) => ({ id, path, kind })),
    },
    provenanceInputs: provenance.inputs,
    artifactPayloads: await Promise.all(manifest.artifacts.map(async ({ id, path }) => ({
      id,
      bytes: await readFile(join(packageDir, path)),
    }))),
  };
}

async function assemblyModule() {
  return import("./validated-artifact-assembly").catch(() => ({}));
}

describe("validated artifact assembly adapter", () => {
  test("rebuilds two frozen skill phenotypes byte-for-byte through one skill-neutral path", async () => {
    const module = await assemblyModule();
    expect(module).toHaveProperty("assembleValidatedArtifactPackage");
    const assemble = (module as {
      assembleValidatedArtifactPackage: (input: unknown, outDir: string) => Promise<unknown>;
    }).assembleValidatedArtifactPackage;
    const packageDirs = [
      "benchmarks/skill-ir/pilots/api-tester/packages/validated-skill-artifact-v1/openapi-yaml",
      "benchmarks/skill-ir/pilots/experimental-design/packages/validated-skill-artifact-v1",
    ];

    for (const relativePackageDir of packageDirs) {
      const frozenPackageDir = join(rootDir, relativePackageDir);
      const outDir = await tempDir("validated-artifact-shadow-");
      await assemble(await shadowInput(frozenPackageDir), outDir);
      expect(await packageText(outDir)).toBe(await packageText(frozenPackageDir));
    }
  });

  test("fails closed for invalid layouts, payloads, or dangling artifact declarations", async () => {
    const module = await assemblyModule();
    expect(module).toHaveProperty("assembleValidatedArtifactPackage");
    const assemble = (module as {
      assembleValidatedArtifactPackage: (input: unknown, outDir: string) => Promise<unknown>;
    }).assembleValidatedArtifactPackage;
    const packageDir = join(
      rootDir,
      "benchmarks/skill-ir/pilots/experimental-design/packages/validated-skill-artifact-v1",
    );
    const valid = await shadowInput(packageDir);

    await expect(assemble({
      ...valid,
      artifactPayloads: valid.artifactPayloads.slice(1),
    }, await tempDir("validated-artifact-missing-"))).rejects.toThrow(/payload/i);
    await expect(assemble({
      ...valid,
      artifactPayloads: [...valid.artifactPayloads, { id: "unexpected", bytes: Buffer.from("x") }],
    }, await tempDir("validated-artifact-extra-"))).rejects.toThrow(/payload/i);
    await expect(assemble({
      ...valid,
      artifactPayloads: [...valid.artifactPayloads, valid.artifactPayloads[0]],
    }, await tempDir("validated-artifact-duplicate-payload-"))).rejects.toThrow(/duplicate artifact payload/i);
    await expect(assemble({
      ...valid,
      adapter: {
        ...valid.adapter,
        artifactLayout: valid.adapter.artifactLayout.map((artifact, index) => index === 1
          ? { ...artifact, id: valid.adapter.artifactLayout[0]!.id }
          : artifact),
      },
    }, await tempDir("validated-artifact-duplicate-id-"))).rejects.toThrow(/duplicate artifact id/i);
    await expect(assemble({
      ...valid,
      adapter: {
        ...valid.adapter,
        artifactLayout: valid.adapter.artifactLayout.map((artifact, index) => index === 1
          ? { ...artifact, path: valid.adapter.artifactLayout[0]!.path }
          : artifact),
      },
    }, await tempDir("validated-artifact-duplicate-path-"))).rejects.toThrow(/artifact path/i);
    await expect(assemble({
      ...valid,
      adapter: {
        ...valid.adapter,
        artifactLayout: valid.adapter.artifactLayout.map((artifact, index) => index === 2
          ? { ...artifact, path: "../escape.py" }
          : artifact),
      },
    }, await tempDir("validated-artifact-path-escape-"))).rejects.toThrow();
    await expect(assemble({
      ...valid,
      adapter: {
        ...valid.adapter,
        executionPlan: {
          ...valid.adapter.executionPlan,
          nodes: valid.adapter.executionPlan.nodes.map((node, index) => index === 0
            ? { ...node, command: { ...node.command, artifactId: "missing-artifact" } }
            : node),
        },
      },
    }, await tempDir("validated-artifact-dangling-"))).rejects.toThrow(/artifact/i);
  });
});
