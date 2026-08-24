import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { sha256Bytes } from "./source-fixture";
import { constructSkillCandidates } from "./automatic-construction";
import {
  AutomaticConstructionShadowCatalogSchema,
  runAutomaticConstructionShadow,
} from "./automatic-construction-shadow";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("automatic construction shadow", () => {
  test("freezes candidates before reading manual oracles and reports an honest non-executable gap", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "skill-ir-auto-shadow-"));
    temporaryDirectories.push(rootDir);
    const sourceText = `---
name: sample-helper
description: Generate a report from observable facts
---
# Sample helper
## Workflow
1. Read the workspace.
2. Generate the report.
## Output
- report.json
## Rules
- Never modify inputs.
`;
    const sourcePath = "source.md";
    const sourceSha256 = sha256Bytes(Buffer.from(sourceText, "utf8"));
    await writeFile(join(rootDir, sourcePath), sourceText, "utf8");
    const generationInput = {
      schemaVersion: "skill-ir-automatic-construction-input/v1" as const,
      source: {
        path: sourcePath,
        sha256: sourceSha256,
        repository: "https://example.invalid/sample",
        commit: "0123456789abcdef0123456789abcdef01234567",
        upstreamPath: "skills/sample-helper/SKILL.md",
      },
    };
    const manual = await constructSkillCandidates(rootDir, generationInput);
    const manualIrText = `${JSON.stringify(manual.baseIr, null, 2)}\n`;
    const manualContractText = "{}\n";
    await writeFile(join(rootDir, "manual-ir.json"), manualIrText, "utf8");
    await writeFile(join(rootDir, "manual-contract.json"), manualContractText, "utf8");

    const catalog = AutomaticConstructionShadowCatalogSchema.parse({
      schemaVersion: "skill-ir-automatic-construction-shadow-catalog/v1",
      catalogId: "test-shadow",
      measurementStartedAt: "2026-08-24T05:11:30.000Z",
      cases: [{
        caseId: "sample-helper",
        methodSequence: 1,
        generationInput,
        shadowOracles: {
          contractPaths: [{ path: "manual-contract.json", sha256: sha256Bytes(Buffer.from(manualContractText)) }],
          baseIrPaths: [{ path: "manual-ir.json", sha256: sha256Bytes(Buffer.from(manualIrText)) }],
          validationPlanPaths: [],
          packageManifestPaths: [],
        },
      }],
    });
    const outDir = join(rootDir, "out");
    const report = await runAutomaticConstructionShadow(rootDir, catalog, outDir, {
      measurementStartedAt: "2026-08-24T05:11:30.000Z",
      measurementCompletedAt: "2026-08-24T05:12:00.000Z",
    });

    expect(report.summary).toMatchObject({
      caseCount: 1,
      paidCalls: 0,
      heldOutAccesses: 0,
      generated: { contracts: 1, baseIrs: 1, validationPlans: 1, packageCandidates: 1 },
      portfolioEligible: { contracts: 0, baseIrs: 0, validationPlans: 0, packageCandidates: 0 },
      adaptationMeasurement: {
        sharedCoreHumanMinutes: 1,
        caseSpecificHumanMinutesTotal: 0,
        caseSpecificAdapterLocTotal: 0,
      },
    });
    expect(report.catalogSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(report.implementation.map((entry) => entry.path)).toEqual([
      "src/benchmarks/skill-ir/automatic-construction.ts",
      "src/benchmarks/skill-ir/automatic-construction-shadow.ts",
      "src/benchmarks/skill-ir/automatic-construction-shadow-run.ts",
    ]);
    expect(report.cases[0]).toMatchObject({
      caseId: "sample-helper",
      generationReadPaths: ["source.md"],
      shadowReadPaths: ["manual-contract.json", "manual-ir.json"],
      adaptation: { adapterLoc: 0, humanMinutes: 0, coreBranchDelta: 0 },
      packageGap: {
        status: "semantic-review-required",
        reason: "automatic package is deliberately non-executable until a domain compiler and runtime checker are qualified",
      },
    });
    expect(report.cases[0]?.shadow.baseIr).toMatchObject({
      status: "compared",
      manualCount: 1,
      schemaValidCount: 1,
      semanticParity: "not-established",
    });
    expect(report.cases[0]?.baseIrComparison).toEqual({
      automatic: { steps: 2, rules: 1, outputs: 1 },
      manual: { steps: 2, rules: 1, outputs: 1 },
      exactSourceRuleMatches: 1,
      semanticParity: "not-established",
    });
    const persisted = JSON.parse(await readFile(join(outDir, "report.json"), "utf8"));
    expect(persisted).toEqual(report);
    expect(JSON.parse(await readFile(join(outDir, "candidates/sample-helper/result.json"), "utf8")))
      .toMatchObject({ schemaVersion: "skill-ir-automatic-construction-result/v1" });
  });

  test("rejects an oracle path from generation inputs", () => {
    expect(() => AutomaticConstructionShadowCatalogSchema.parse({
      schemaVersion: "skill-ir-automatic-construction-shadow-catalog/v1",
      catalogId: "bad-shadow",
      measurementStartedAt: "2026-08-24T05:11:30.000Z",
      cases: [{
        caseId: "sample-helper",
        methodSequence: 1,
        generationInput: {
          schemaVersion: "skill-ir-automatic-construction-input/v1",
          source: {
            path: "source.md",
            sha256: "0".repeat(64),
            repository: "https://example.invalid/sample",
            commit: "0".repeat(40),
            upstreamPath: "SKILL.md",
          },
          baseIrPath: "manual-ir.json",
        },
        shadowOracles: {
          contractPaths: [], baseIrPaths: [], validationPlanPaths: [], packageManifestPaths: [],
        },
      }],
    })).toThrow();
  });

  test("fails closed when a pinned manual oracle drifts", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "skill-ir-auto-shadow-drift-"));
    temporaryDirectories.push(rootDir);
    const sourceText = "---\nname: drift-helper\ndescription: Report facts\n---\n# Drift\n## Workflow\n1. Report facts.\n";
    await writeFile(join(rootDir, "SKILL.md"), sourceText, "utf8");
    await writeFile(join(rootDir, "manual.json"), "{}\n", "utf8");
    const catalog = AutomaticConstructionShadowCatalogSchema.parse({
      schemaVersion: "skill-ir-automatic-construction-shadow-catalog/v1",
      catalogId: "drift-shadow",
      measurementStartedAt: "2026-08-24T05:11:30.000Z",
      cases: [{
        caseId: "drift-helper",
        methodSequence: 1,
        generationInput: {
          schemaVersion: "skill-ir-automatic-construction-input/v1",
          source: {
            path: "SKILL.md",
            sha256: sha256Bytes(Buffer.from(sourceText)),
            repository: "https://example.invalid/drift",
            commit: "0".repeat(40),
            upstreamPath: "SKILL.md",
          },
        },
        shadowOracles: {
          contractPaths: [{ path: "manual.json", sha256: "0".repeat(64) }],
          baseIrPaths: [], validationPlanPaths: [], packageManifestPaths: [],
        },
      }],
    });
    await expect(runAutomaticConstructionShadow(rootDir, catalog, join(rootDir, "out"), {
      measurementStartedAt: catalog.measurementStartedAt,
      measurementCompletedAt: "2026-08-24T05:12:00.000Z",
    })).rejects.toThrow("shadow oracle digest mismatch");
  });
});
