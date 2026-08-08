import { describe, expect, test } from "bun:test";

const rootDir = process.cwd();

async function parityModule() {
  return import("./validated-artifact-assembly-parity").catch(() => ({}));
}

describe("validated artifact assembly parity", () => {
  test("reports byte parity across two distinct skill phenotypes", async () => {
    const module = await parityModule();
    expect(module).toHaveProperty("runValidatedArtifactAssemblyParity");
    const run = (module as {
      runValidatedArtifactAssemblyParity: (input: unknown) => Promise<{
        schemaVersion: string;
        summary: Record<string, unknown>;
        cases: Array<Record<string, unknown>>;
      }>;
    }).runValidatedArtifactAssemblyParity;

    const report = await run({
      rootDir,
      cases: [
        {
          caseId: "api-tester-openapi-yaml",
          phenotype: "schema-derived-tool-generation",
          packagePath: "benchmarks/skill-ir/pilots/api-tester/packages/validated-skill-artifact-v1/openapi-yaml",
        },
        {
          caseId: "experimental-design-v1-mechanism",
          phenotype: "deterministic-design-generation",
          packagePath: "benchmarks/skill-ir/pilots/experimental-design/packages/validated-skill-artifact-v1",
        },
      ],
    });

    expect(report.schemaVersion).toBe("validated-artifact-assembly-parity/v1");
    expect(report.summary).toEqual({
      caseCount: 2,
      phenotypeCount: 2,
      byteParityCount: 2,
      catalogValidCount: 2,
      coreBranchDelta: 0,
      ready: true,
    });
    expect(report.cases.map((entry) => entry.skillId)).toEqual([
      "api-tester",
      "experimental-design",
    ]);
    expect(report.cases.every((entry) => entry.byteParity === true)).toBe(true);
  });
});
