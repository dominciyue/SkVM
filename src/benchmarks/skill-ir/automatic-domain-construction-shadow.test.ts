import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { sha256Bytes } from "./source-fixture";
import { constructDomainSkillCandidates } from "./automatic-domain-construction";
import {
  DomainAutomaticConstructionShadowCatalogSchema,
  runDomainAutomaticConstructionShadow,
} from "./automatic-domain-construction-shadow";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("automatic domain construction shadow", () => {
  test("accepts the checked-in seven-case catalog and keeps generation inputs public-only", async () => {
    const catalog = DomainAutomaticConstructionShadowCatalogSchema.parse(JSON.parse(
      await readFile(join(process.cwd(), "benchmarks/skill-ir/corpus/automatic-domain-construction-shadow-v1.json"), "utf8"),
    ));
    expect(catalog.cases).toHaveLength(7);
    expect(catalog.cases.every((entry) => entry.generationInput.taskDescription.path.includes("task-descriptions/"))).toBe(true);
    expect(catalog.cases.flatMap((entry) => entry.generationInput.taskDescription.path).some((path) => /held.?out|scorer|gold/iu.test(path))).toBe(false);
  });

  test("freezes generation before oracle reads and reports case-derived semantic gaps", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "skill-ir-domain-shadow-"));
    temporaryDirectories.push(rootDir);
    const sourceText = `---
name: review-helper
description: Review a source file and report grounded findings
---
# Review helper
## Workflow
1. Read the source file.
2. Report findings.
## Rules
- Never modify the reviewed source.
`;
    const description = {
      schemaVersion: "skill-ir-task-description/v1" as const,
      descriptionId: "review-task",
      taskKind: "analysis-report" as const,
      inputs: [{ id: "source", path: "src/main.ts", format: "source-file" as const, access: "read-only" as const, required: true }],
      outputs: [{
        id: "review",
        path: "review.json",
        format: "json" as const,
        required: true,
        structure: { kind: "json-object" as const, requiredFields: ["findings"], allowAdditionalFields: false },
      }],
      passCriteria: [
        { id: "source-stable", predicate: "input-integrity" as const, targetRefs: ["source"], statement: "The reviewed source remains unchanged." },
        { id: "findings-grounded", predicate: "source-grounding" as const, targetRefs: ["source", "review"], statement: "Every finding cites an observable source location." },
      ],
    };
    const descriptionText = `${JSON.stringify(description, null, 2)}\n`;
    await writeFile(join(rootDir, "SKILL.md"), sourceText, "utf8");
    await writeFile(join(rootDir, "task-description.json"), descriptionText, "utf8");
    const generationInput = {
      schemaVersion: "skill-ir-domain-automatic-construction-input/v1" as const,
      source: {
        path: "SKILL.md",
        sha256: sha256Bytes(Buffer.from(sourceText)),
        repository: "https://example.invalid/review",
        commit: "0123456789abcdef0123456789abcdef01234567",
        upstreamPath: "skills/review/SKILL.md",
      },
      taskDescription: {
        path: "task-description.json",
        sha256: sha256Bytes(Buffer.from(descriptionText)),
        authoring: {
          measurementStartedAt: "2026-08-24T06:22:53.702Z",
          measurementCompletedAt: "2026-08-24T06:24:53.702Z",
          humanMinutes: 2,
        },
      },
    };
    const manual = await constructDomainSkillCandidates(rootDir, generationInput);
    const manualContractText = `${JSON.stringify(manual.contract, null, 2)}\n`;
    const manualIrText = `${JSON.stringify(manual.baseIr, null, 2)}\n`;
    await writeFile(join(rootDir, "manual-contract.json"), manualContractText, "utf8");
    await writeFile(join(rootDir, "manual-ir.json"), manualIrText, "utf8");
    const catalog = DomainAutomaticConstructionShadowCatalogSchema.parse({
      schemaVersion: "skill-ir-domain-automatic-construction-shadow-catalog/v1",
      catalogId: "test-domain-shadow",
      measurementStartedAt: "2026-08-24T06:22:53.702Z",
      cases: [{
        caseId: "review-helper",
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
    const report = await runDomainAutomaticConstructionShadow(rootDir, catalog, outDir, {
      measurementCompletedAt: "2026-08-24T06:30:53.702Z",
    });

    expect(report.summary).toMatchObject({
      caseCount: 1,
      paidCalls: 0,
      heldOutAccesses: 0,
      declarations: { withinLimit: 1, heavy: 0, humanMinutesTotal: 2 },
      generated: { contracts: 1, baseIrs: 1, validationPlans: 1, packageCandidates: 1 },
      semanticAccounting: {
        genericDeterministicPredicates: 1,
        domainRuntimeRequiredPredicates: 1,
        casesStillRequiringHuman: 1,
      },
    });
    expect(report.implementation.map((entry) => entry.path)).toEqual([
      "src/benchmarks/skill-ir/automatic-construction.ts",
      "src/benchmarks/skill-ir/automatic-domain-construction.ts",
      "src/benchmarks/skill-ir/automatic-domain-construction-shadow.ts",
      "src/benchmarks/skill-ir/automatic-domain-construction-shadow-run.ts",
    ]);
    expect(report.cases[0]).toMatchObject({
      caseId: "review-helper",
      generationReadPaths: ["SKILL.md", "task-description.json"],
      shadowReadPaths: ["manual-contract.json", "manual-ir.json"],
      adaptation: {
        declarationStatus: "within-limit",
        declarationHumanMinutes: 2,
        adapterLoc: 0,
        coreBranchDelta: 0,
      },
      semanticParity: "not-established",
    });
    expect(report.cases[0]?.semanticGap).toEqual([
      {
        id: "runtime-findings-grounded",
        kind: "domain-runtime",
        targetRefs: ["source", "review"],
        reason: "findings-grounded requires a domain runtime implementation: Every finding cites an observable source location.",
      },
      {
        id: "package-review",
        kind: "artifact-compiler",
        targetRefs: ["review"],
        reason: "no qualified compiler emits review.json and binds its domain-runtime validation",
      },
    ]);
    expect(report.cases[0]?.manualComparison).toMatchObject({
      contract: { status: "compared", declaredPathMatches: 2 },
      baseIr: { status: "compared", inputIdMatches: 1, outputIdMatches: 1, checkIdMatches: 2 },
      semanticParity: "not-established",
    });
    expect(report.cases[0]?.eligibility).toEqual({
      contract: false,
      baseIr: false,
      validationPlan: false,
      packageCandidate: false,
    });
    expect(JSON.parse(await readFile(join(outDir, "report.json"), "utf8"))).toEqual(report);
    expect(JSON.parse(await readFile(join(outDir, "candidates/review-helper/result.json"), "utf8")))
      .toMatchObject({ schemaVersion: "skill-ir-domain-automatic-construction-result/v1" });
  });

  test("rejects shadow paths in generation inputs and fails closed on oracle drift", async () => {
    const badInput = {
      schemaVersion: "skill-ir-domain-automatic-construction-input/v1",
      source: {
        path: "SKILL.md",
        sha256: "0".repeat(64),
        repository: "https://example.invalid/bad",
        commit: "0".repeat(40),
        upstreamPath: "SKILL.md",
      },
      taskDescription: {
        path: "description.json",
        sha256: "0".repeat(64),
        authoring: {
          measurementStartedAt: "2026-08-24T06:22:53.702Z",
          measurementCompletedAt: "2026-08-24T06:23:53.702Z",
          humanMinutes: 1,
        },
      },
      manualBaseIrPath: "manual/base-ir.json",
    };
    expect(() => DomainAutomaticConstructionShadowCatalogSchema.parse({
      schemaVersion: "skill-ir-domain-automatic-construction-shadow-catalog/v1",
      catalogId: "bad-domain-shadow",
      measurementStartedAt: "2026-08-24T06:22:53.702Z",
      cases: [{
        caseId: "bad-case",
        methodSequence: 1,
        generationInput: badInput,
        shadowOracles: { contractPaths: [], baseIrPaths: [], validationPlanPaths: [], packageManifestPaths: [] },
      }],
    })).toThrow();

    const rootDir = await mkdtemp(join(tmpdir(), "skill-ir-domain-shadow-drift-"));
    temporaryDirectories.push(rootDir);
    await writeFile(join(rootDir, "SKILL.md"), "---\nname: drift\ndescription: Drift\n---\n# Drift\n## Workflow\n1. Report.\n", "utf8");
    await writeFile(join(rootDir, "description.json"), `${JSON.stringify({
      schemaVersion: "skill-ir-task-description/v1",
      descriptionId: "drift-task",
      taskKind: "analysis-report",
      inputs: [{ id: "input", path: "input.txt", format: "text", access: "read-only", required: true }],
      outputs: [{ id: "report", path: "report.json", format: "json", required: true, structure: { kind: "opaque" } }],
      passCriteria: [{ id: "output-present", predicate: "output-presence", targetRefs: ["report"], statement: "The report exists." }],
    }, null, 2)}\n`, "utf8");
    await writeFile(join(rootDir, "manual.json"), "{}\n", "utf8");
    const sourceText = await readFile(join(rootDir, "SKILL.md"));
    const descriptionText = await readFile(join(rootDir, "description.json"));
    const catalog = DomainAutomaticConstructionShadowCatalogSchema.parse({
      schemaVersion: "skill-ir-domain-automatic-construction-shadow-catalog/v1",
      catalogId: "drift-domain-shadow",
      measurementStartedAt: "2026-08-24T06:22:53.702Z",
      cases: [{
        caseId: "drift-case",
        methodSequence: 1,
        generationInput: {
          schemaVersion: "skill-ir-domain-automatic-construction-input/v1",
          source: { path: "SKILL.md", sha256: sha256Bytes(sourceText), repository: "https://example.invalid/drift", commit: "0".repeat(40), upstreamPath: "SKILL.md" },
          taskDescription: {
            path: "description.json",
            sha256: sha256Bytes(descriptionText),
            authoring: { measurementStartedAt: "2026-08-24T06:22:53.702Z", measurementCompletedAt: "2026-08-24T06:23:53.702Z", humanMinutes: 1 },
          },
        },
        shadowOracles: {
          contractPaths: [{ path: "manual.json", sha256: "0".repeat(64) }],
          baseIrPaths: [], validationPlanPaths: [], packageManifestPaths: [],
        },
      }],
    });
    await expect(runDomainAutomaticConstructionShadow(rootDir, catalog, join(rootDir, "out"), {
      measurementCompletedAt: "2026-08-24T06:30:53.702Z",
    })).rejects.toThrow("shadow oracle digest mismatch");
  });
});
