import { afterEach, describe, expect, test } from "bun:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  VerifiedArtifactCollectionPlanSchema,
  executeVerifiedArtifactCollectionPlan,
} from "./verified-artifact-collection-plan";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function wrapper(basePlan: unknown, steps: unknown[]) {
  return {
    schemaVersion: "skill-ir-verified-artifact-collection-plan/v1",
    planId: "collection-plan-test",
    basePlan,
    steps,
    audit: {
      paidCalls: 0,
      retries: 0,
      heldOutAccesses: 0,
      evaluatorPayloadAccesses: 0,
      skillSpecificBranches: 0,
    },
  };
}

function packageInventoryPlan() {
  return {
    schemaVersion: "skill-ir-restricted-domain-plan/v1",
    planId: "package-inventory-base",
    steps: [
      { id: "manifest", op: "read-json", path: "package.json" },
      { id: "name", op: "json-pointer", source: "manifest", pointer: "/name" },
      { id: "production-map", op: "json-pointer", source: "manifest", pointer: "/dependencies" },
      { id: "development-map", op: "json-pointer", source: "manifest", pointer: "/devDependencies" },
      {
        id: "write-inventory",
        op: "write-json",
        path: "package-inventory.json",
        fields: [
          { key: "packageName", value: { kind: "ref", ref: "name" } },
          { key: "productionDependencies", value: { kind: "ref", ref: "production-map" } },
          { key: "developmentDependencies", value: { kind: "ref", ref: "development-map" } },
          { key: "allDependencies", value: { kind: "literal", value: "review-required" } },
          { key: "counts", value: { kind: "literal", value: "review-required" } },
        ],
      },
    ],
    audit: { paidCalls: 1, retries: 0, heldOutAccesses: 0, evaluatorPayloadAccesses: 0, skillSpecificBranches: 0 },
  };
}

describe("verified artifact collection plan", () => {
  test("runs both narrow primitives on the real package-inventory workdir and preserves its input", async () => {
    const rootDir = resolve(import.meta.dir, "../..");
    const workDir = await mkdtemp(join(tmpdir(), "skvm-collection-package-"));
    temporaryDirectories.push(workDir);
    await cp(
      join(rootDir, "benchmarks/skill-ir/pilots/package-inventory-probe/public-workdir/package.json"),
      join(workDir, "package.json"),
    );
    const before = await readFile(join(workDir, "package.json"));
    const plan = wrapper(packageInventoryPlan(), [
      {
        id: "enumerate-production",
        op: "enumerate-json-object-keys",
        source: { path: "package-inventory.json", pointer: "/productionDependencies" },
        target: { path: "package-inventory.json", pointer: "/productionDependencies" },
      },
      {
        id: "enumerate-development",
        op: "enumerate-json-object-keys",
        source: { path: "package-inventory.json", pointer: "/developmentDependencies" },
        target: { path: "package-inventory.json", pointer: "/developmentDependencies" },
      },
      {
        id: "sort-production",
        op: "sort-and-deduplicate-strings",
        sources: [{ path: "package-inventory.json", pointer: "/productionDependencies" }],
        target: { path: "package-inventory.json", pointer: "/productionDependencies" },
      },
      {
        id: "sort-development",
        op: "sort-and-deduplicate-strings",
        sources: [{ path: "package-inventory.json", pointer: "/developmentDependencies" }],
        target: { path: "package-inventory.json", pointer: "/developmentDependencies" },
      },
      {
        id: "merge-dependencies",
        op: "sort-and-deduplicate-strings",
        sources: [
          { path: "package-inventory.json", pointer: "/productionDependencies" },
          { path: "package-inventory.json", pointer: "/developmentDependencies" },
        ],
        target: { path: "package-inventory.json", pointer: "/allDependencies" },
      },
    ]);

    const result = await executeVerifiedArtifactCollectionPlan({
      plan,
      workDir,
      taskDescription: {
        inputs: [{ path: "package.json", access: "read-only" }],
        outputs: [{ path: "package-inventory.json" }],
      },
    });

    expect(result).toEqual({ executedSteps: 5, writtenPaths: ["package-inventory.json"] });
    expect(JSON.parse(await readFile(join(workDir, "package-inventory.json"), "utf8"))).toEqual({
      packageName: "controlled-package-inventory",
      productionDependencies: ["alpha-lib", "zeta-lib"],
      developmentDependencies: ["alpha-lib", "beta-tool"],
      allDependencies: ["alpha-lib", "beta-tool", "zeta-lib"],
      counts: "review-required",
    });
    expect(await readFile(join(workDir, "package.json"))).toEqual(before);
  });

  test("reuses object enumeration on the API Tester adapter without a case branch", async () => {
    const rootDir = resolve(import.meta.dir, "../..");
    const workDir = await mkdtemp(join(tmpdir(), "skvm-collection-api-"));
    temporaryDirectories.push(workDir);
    await cp(
      join(rootDir, "benchmarks/skill-ir/pilots/api-tester/artifact-adapter.json"),
      join(workDir, "artifact-adapter.json"),
    );
    const plan = wrapper({
      schemaVersion: "skill-ir-restricted-domain-plan/v1",
      planId: "api-tester-output-keys",
      steps: [
        { id: "adapter", op: "read-json", path: "artifact-adapter.json" },
        { id: "outputs", op: "json-pointer", source: "adapter", pointer: "/outputs" },
        {
          id: "write-summary",
          op: "write-json",
          path: "api-output-keys.json",
          fields: [
            { key: "outputMap", value: { kind: "ref", ref: "outputs" } },
            { key: "outputKeys", value: { kind: "literal", value: "review-required" } },
          ],
        },
      ],
      audit: { paidCalls: 1, retries: 0, heldOutAccesses: 0, evaluatorPayloadAccesses: 0, skillSpecificBranches: 0 },
    }, [
      {
        id: "enumerate-output-keys",
        op: "enumerate-json-object-keys",
        source: { path: "api-output-keys.json", pointer: "/outputMap" },
        target: { path: "api-output-keys.json", pointer: "/outputKeys" },
      },
      {
        id: "sort-output-keys",
        op: "sort-and-deduplicate-strings",
        sources: [{ path: "api-output-keys.json", pointer: "/outputKeys" }],
        target: { path: "api-output-keys.json", pointer: "/outputKeys" },
      },
    ]);

    await executeVerifiedArtifactCollectionPlan({
      plan,
      workDir,
      taskDescription: {
        inputs: [{ path: "artifact-adapter.json", access: "read-only" }],
        outputs: [{ path: "api-output-keys.json" }],
      },
    });
    expect(JSON.parse(await readFile(join(workDir, "api-output-keys.json"), "utf8")).outputKeys).toEqual([
      "generator",
      "plan",
      "report",
    ]);
  });

  test("fails closed for unknown operations, undeclared paths, wrong value types, and count", async () => {
    const basePlan = packageInventoryPlan();
    expect(() => VerifiedArtifactCollectionPlanSchema.parse(wrapper(basePlan, [{
      id: "count",
      op: "derive-cross-field-counts",
      source: { path: "package-inventory.json", pointer: "" },
      target: { path: "package-inventory.json", pointer: "/counts" },
    }]))).toThrow();

    const workDir = await mkdtemp(join(tmpdir(), "skvm-collection-negative-"));
    temporaryDirectories.push(workDir);
    await writeFile(join(workDir, "package.json"), JSON.stringify({
      name: "negative",
      dependencies: ["not-an-object"],
      devDependencies: {},
    }), "utf8");
    await expect(executeVerifiedArtifactCollectionPlan({
      plan: wrapper(basePlan, [{
        id: "enumerate",
        op: "enumerate-json-object-keys",
        source: { path: "package-inventory.json", pointer: "/productionDependencies" },
        target: { path: "package-inventory.json", pointer: "/productionDependencies" },
      }]),
      workDir,
      taskDescription: {
        inputs: [{ path: "package.json", access: "read-only" }],
        outputs: [{ path: "package-inventory.json" }],
      },
    })).rejects.toThrow("must be a JSON object");

    expect(() => VerifiedArtifactCollectionPlanSchema.parse(wrapper(basePlan, [{
      id: "escape",
      op: "sort-and-deduplicate-strings",
      sources: [{ path: "../secret.json", pointer: "" }],
      target: { path: "package-inventory.json", pointer: "/allDependencies" },
    }]))).toThrow();
  });
});
