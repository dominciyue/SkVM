import { afterEach, describe, expect, test } from "bun:test";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runVerifiedArtifactCli } from "./verified-artifact-cli";
import { validateVerifiedArtifactProduct } from "./verified-artifact-product";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("verified artifact product collection plan", () => {
  test("uses the additive runner in a full package-inventory product chain", async () => {
    const rootDir = resolve(import.meta.dir, "../..");
    const runRoot = await mkdtemp(join(tmpdir(), "skvm-product-collection-"));
    temporaryDirectories.push(runRoot);
    const workDir = join(runRoot, "workdir");
    const outDir = join(runRoot, "product");
    await cp(
      join(rootDir, "benchmarks/skill-ir/pilots/package-inventory-probe/public-workdir"),
      workDir,
      { recursive: true },
    );
    const packageBefore = await readFile(join(workDir, "package.json"));
    const interfaceBefore = await readFile(join(workDir, "package-inventory-interface.json"));

    const product = await runVerifiedArtifactCli([
      `--root=${rootDir}`,
      "--config=benchmarks/skill-ir/pilots/package-inventory-probe/verified-artifact-product-e2-collection.json",
      `--workdir=${workDir}`,
      `--out=${outDir}`,
      "--accept",
      "--accepted-at=2026-08-29T10:00:00.000Z",
      "--human-minutes=1",
      "--note=Development-only acceptance of the exact controlled fixture output; no research parity claim.",
    ], rootDir);

    expect(product.cost).toMatchObject({
      qualityEvidence: "user-accepted",
      claim: "token-economics-not-computable",
      researchEligibility: "not-eligible",
    });
    expect(await validateVerifiedArtifactProduct(outDir)).toMatchObject({
      qualityEvidence: { qualityEvidence: "user-accepted" },
    });
    expect(JSON.parse(await readFile(join(workDir, "package-inventory.json"), "utf8"))).toEqual({
      packageName: "controlled-package-inventory",
      productionDependencies: ["alpha-lib", "zeta-lib"],
      developmentDependencies: ["alpha-lib", "beta-tool"],
      allDependencies: ["alpha-lib", "beta-tool", "zeta-lib"],
      counts: { production: 2, development: 2, unique: 3 },
    });
    expect(JSON.parse(await readFile(join(outDir, "artifact/artifacts/automatic-plan.json"), "utf8"))).toMatchObject({
      schemaVersion: "skill-ir-verified-artifact-collection-plan/v1",
      audit: { paidCalls: 0, skillSpecificBranches: 0 },
    });
    expect(await readFile(join(workDir, "package.json"))).toEqual(packageBefore);
    expect(await readFile(join(workDir, "package-inventory-interface.json"))).toEqual(interfaceBefore);
  });
});
