import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateValidatedArtifactPackage } from "./validated-artifact-catalog";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true }),
  ));
});

describe("experimental-design v2 artifact compile runner", () => {
  test("materializes one public-contract package and returns its compact identity", async () => {
    const module = await import("./experimental-design-v2-artifact-compile-run").catch(() => ({}));
    expect(module).toHaveProperty("writeExperimentalDesignV2ArtifactPackage");
    const writePackage = (module as {
      writeExperimentalDesignV2ArtifactPackage: (
        rootDir: string,
        outDir: string,
      ) => Promise<{ skillId: string; catalog: string; packageBytes: number }>;
    }).writeExperimentalDesignV2ArtifactPackage;
    const outDir = await mkdtemp(join(tmpdir(), "experimental-design-v2-compile-run-"));
    tempDirs.push(outDir);

    const report = await writePackage(process.cwd(), outDir);

    expect(report).toMatchObject({
      skillId: "experimental-design",
      catalog: "validated-skill-artifact/v1",
    });
    expect(report.packageBytes).toBeGreaterThan(0);
    expect((await validateValidatedArtifactPackage(outDir)).manifest.protectedInputs)
      .toEqual(["study.json", "design-contract.json"]);
  });
});
