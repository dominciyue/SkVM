import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildDualSourceFinalIRProvenance,
  buildDualSourceFinalIRProvenanceV3,
  buildFinalIRProvenance,
  FinalIRProvenanceSchema,
  assertFinalIRProvenanceUse,
  readAndValidateFinalIRProvenance,
  validateConstructionConfigsMatchRows,
  validateFinalIRProvenanceRecord,
  type FinalIRProvenanceV2,
} from "./final-ir-provenance";
import type { ScoredAgentRunRow } from "./scoring";
import { sha256Bytes } from "./source-fixture";
import {
  DualSourceRepairEvidenceV2Schema,
  type DualSourceRepairEvidenceV2,
} from "./repair-evidence";

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

const validRecord = {
  schemaVersion: "skill-ir-final-provenance/v1" as const,
  corpus: "pilot" as const,
  sourceSystem: "original" as const,
  taskSplit: "development" as const,
  manifest: { path: "benchmarks/skill-ir/corpus/corpora/pilot.json", sha256: "a".repeat(64) },
  results: { path: "results/development.jsonl", sha256: "b".repeat(64) },
  constructionConfigs: [{ status: "legacy-unidentified" as const }],
  skills: [
    {
      skillId: "env-manager",
      sourceSha256: "c".repeat(64),
      baseIR: { path: "benchmarks/skill-ir/pilots/env-manager/ir.json", sha256: "d".repeat(64) },
      overlay: { path: "overlay/env-manager.json", sha256: "e".repeat(64) },
      finalIR: { path: "final-ir/env-manager.json", sha256: "f".repeat(64) },
      annotationCount: 2,
    },
  ],
};

const validDualSourceRecord: FinalIRProvenanceV2 = {
  schemaVersion: "skill-ir-final-provenance/v2" as const,
  corpus: "pilot" as const,
  sourceSystems: ["original", "ir-static"],
  evidencePolicy: "dual-source-residual/v1" as const,
  lineageCatalog: "env-manager/v1" as const,
  repairCatalog: "typed-output-repair/v1" as const,
  taskSplit: "development" as const,
  manifest: { path: "benchmarks/skill-ir/corpus/corpora/pilot.json", sha256: "a".repeat(64) },
  results: { path: "results/development.jsonl", sha256: "b".repeat(64) },
  repairEvidence: { path: "repair-evidence.json", sha256: "1".repeat(64) },
  constructionConfigs: [{ status: "legacy-unidentified" as const }],
  skills: validRecord.skills,
};

function scoredRow(overrides: Partial<ScoredAgentRunRow> = {}): ScoredAgentRunRow {
  return {
    caseId: "env-manager:skvm:windows:clean:env-manager-dev-001",
    system: "original",
    skill: "env-manager",
    agent: "skvm",
    environment: "windows",
    context: "clean",
    task: "env-manager-dev-001",
    taskSplit: "development",
    success: false,
    ruleViolations: 1,
    stepCoverage: 1,
    latencyMs: 1200,
    successSource: "deterministic-evaluator",
    failedCriteria: ["Environment is configured."],
    ...overrides,
  };
}

async function provenanceFixture(scoredRows: ScoredAgentRunRow[] = []) {
  const rootDir = await mkdtemp(join(tmpdir(), "skill-ir-provenance-"));
  tempDirs.push(rootDir);
  const artifactRoot = join(rootDir, "artifacts");
  const manifestPath = join(rootDir, "pilot.json");
  const resultsPath = join(rootDir, "development.jsonl");
  const baseIRPath = join(rootDir, "env-manager.json");
  await mkdir(join(artifactRoot, "overlay"), { recursive: true });
  await mkdir(join(artifactRoot, "final-ir"), { recursive: true });
  await writeFile(manifestPath, "{}\n", "utf8");
  await writeFile(
    resultsPath,
    scoredRows.map((row) => JSON.stringify(row)).join("\n") + (scoredRows.length > 0 ? "\n" : ""),
    "utf8",
  );
  await writeFile(baseIRPath, "{}\n", "utf8");
  await writeFile(join(artifactRoot, "overlay", "env-manager.json"), "{}\n", "utf8");
  await writeFile(join(artifactRoot, "final-ir", "env-manager.json"), "{}\n", "utf8");
  const repairEvidencePath = join(artifactRoot, "repair-evidence.json");
  await writeFile(repairEvidencePath, '{"schemaVersion":"skill-ir-repair-evidence/v1"}\n', "utf8");
  return { rootDir, artifactRoot, manifestPath, resultsPath, baseIRPath, repairEvidencePath };
}

async function buildFixtureProvenance(scoredRows: ScoredAgentRunRow[]) {
  const paths = await provenanceFixture(scoredRows);
  return buildFinalIRProvenance({
    ...paths,
    corpus: "pilot",
    skills: [
      {
        skillId: "env-manager",
        sourceSha256: "c".repeat(64),
        baseIRPath: paths.baseIRPath,
        annotationCount: 1,
      },
    ],
  });
}

describe("final IR provenance", () => {
  test("builds provenance v3 from eligible repair evidence whose transitive bindings validate", async () => {
    const identity = {
      model: "xty/gpt-4.1-mini", modelFamily: "gpt", adapter: "bare-agent",
      adapterVersion: "workspace-static-v1", panelConfigId: "env-manager-static-v1", runIndex: 1,
    };
    const rows = [
      scoredRow({ ...identity, system: "original" }),
      scoredRow({ ...identity, system: "ir-static" }),
    ];
    const paths = await provenanceFixture(rows);
    const bindingPaths = {
      staticLock: join(paths.rootDir, "static-lock.json"),
      staticGate: join(paths.rootDir, "static-gate.json"),
      executionEnvelopes: join(paths.rootDir, "execution-envelopes.jsonl"),
      scoredResults: paths.resultsPath,
      baseIR: paths.baseIRPath,
      sourceAudit: join(paths.rootDir, "source-audit.json"),
      mappingCatalog: join(paths.rootDir, "mapping-catalog.json"),
    };
    for (const [name, filePath] of Object.entries(bindingPaths)) {
      if (name !== "scoredResults" && name !== "baseIR") await writeFile(filePath, `${name}\n`, "utf8");
    }
    const bindings = Object.fromEntries(await Promise.all(Object.entries(bindingPaths).map(async ([name, filePath]) => [
      name,
      { path: filePath.slice(paths.rootDir.length + 1), sha256: sha256Bytes(await Bun.file(filePath).bytes()) },
    ])));
    const evidence = DualSourceRepairEvidenceV2Schema.parse({
      schemaVersion: "skill-ir-repair-evidence/v2", policyVersion: "dual-source-residual/v2",
      skillId: "env-manager", experimentId: "env-manager-static-v1", catalogId: "public-residuals",
      catalogScope: "prospective-development", repairCatalog: "typed-output-repair/v1",
      sourceSystems: ["original", "ir-static"], stability: { minDistinctTasks: 2, minRepetitionsPerTask: 2 },
      bindings, admission: { status: "eligible", reasons: [] }, records: ["one", "two"].flatMap((taskId) => [1, 2].map((runIndex) => ({
        evidenceId: `${taskId}-${runIndex}`, taskId, runIndex, criterionId: "schema-contract", lineage: "reproduced",
        repairKind: "json-schema-contract", targetRef: "rule-json-schema-contract",
      }))), repairs: [{
        id: "repair-one", kind: "json-schema-contract", targetRef: "rule-json-schema-contract",
        distinctTaskCount: 2, observationCount: 4, minRepetitionsPerTask: 2,
        taskIds: ["one", "two"], evidenceIds: ["one-1", "one-2", "two-1", "two-2"],
      }],
      resolvedCriteria: [], regressions: [], unstableCriteria: [], unmappedCriteria: [],
    });
    await writeFile(paths.repairEvidencePath, `${JSON.stringify(evidence)}\n`, "utf8");

    const record = await buildDualSourceFinalIRProvenanceV3({
      ...paths,
      corpus: "pilot",
      repairCatalog: "typed-output-repair/v1",
      skills: [{ skillId: "env-manager", sourceSha256: "c".repeat(64), baseIRPath: paths.baseIRPath, annotationCount: 1 }],
    });

    expect(record).toMatchObject({
      schemaVersion: "skill-ir-final-provenance/v3",
      evidencePolicy: "dual-source-residual/v2",
      experimentId: "env-manager-static-v1",
      catalogId: "public-residuals",
    });
    expect(record.repairEvidence.sha256).toBe(sha256Bytes(await Bun.file(paths.repairEvidencePath).bytes()));

    const provenancePath = join(paths.artifactRoot, "provenance.json");
    const readOptions = {
      rootDir: paths.rootDir,
      corpus: "pilot" as const,
      manifestPath: paths.manifestPath,
      irOverrideDir: join(paths.artifactRoot, "final-ir"),
      skills: [{ skillId: "env-manager", sourceSha256: "c".repeat(64), baseIRPath: paths.baseIRPath }],
    };
    await writeFile(provenancePath, `${JSON.stringify(record)}\n`, "utf8");
    await expect(readAndValidateFinalIRProvenance(readOptions)).resolves.toEqual(record);

    const mismatches: Array<[
      (candidate: DualSourceRepairEvidenceV2) => void,
      string,
    ]> = [
      [(candidate) => { candidate.catalogScope = "analysis-only"; }, "prospective scope"],
      [(candidate) => { candidate.skillId = "another-skill"; }, "skill mismatch"],
      [(candidate) => { candidate.experimentId = "another-experiment"; }, "experiment mismatch"],
      [(candidate) => { candidate.catalogId = "another-catalog"; }, "catalog mismatch"],
      [(candidate) => { candidate.repairCatalog = "typed-output-repair/v2"; }, "repair catalog mismatch"],
      [(candidate) => { candidate.bindings.staticLock.path = "alternate-lock.json"; }, "staticLock binding path mismatch"],
      [(candidate) => { candidate.bindings.scoredResults.path = "alternate-results.jsonl"; }, "results binding mismatch"],
      [(candidate) => { candidate.bindings.baseIR.path = "alternate-base-ir.json"; }, "base IR binding mismatch"],
    ];
    for (const [mutate, message] of mismatches) {
      const candidate = structuredClone(evidence);
      mutate(candidate);
      const evidenceBytes = Buffer.from(`${JSON.stringify(candidate)}\n`, "utf8");
      await writeFile(paths.repairEvidencePath, evidenceBytes);
      await writeFile(provenancePath, `${JSON.stringify({
        ...record,
        repairEvidence: { ...record.repairEvidence, sha256: sha256Bytes(evidenceBytes) },
      })}\n`, "utf8");
      await expect(readAndValidateFinalIRProvenance(readOptions)).rejects.toThrow(message);
    }
  });

  test("rejects v3 provenance when repair evidence is stopped or a transitive digest drifts", async () => {
    const identity = {
      model: "xty/gpt-4.1-mini", modelFamily: "gpt", adapter: "bare-agent",
      adapterVersion: "workspace-static-v1", panelConfigId: "env-manager-static-v1", runIndex: 1,
    };
    const paths = await provenanceFixture([
      scoredRow({ ...identity, system: "original" }), scoredRow({ ...identity, system: "ir-static" }),
    ]);
    const stoppedEvidence = DualSourceRepairEvidenceV2Schema.parse({
      schemaVersion: "skill-ir-repair-evidence/v2", policyVersion: "dual-source-residual/v2",
      skillId: "env-manager", experimentId: "env-manager-static-v1", catalogId: "public-residuals",
      catalogScope: "prospective-development", repairCatalog: "typed-output-repair/v1",
      sourceSystems: ["original", "ir-static"], stability: { minDistinctTasks: 2, minRepetitionsPerTask: 2 },
      bindings: Object.fromEntries([
        "staticLock", "staticGate", "executionEnvelopes", "scoredResults", "baseIR", "sourceAudit", "mappingCatalog",
      ].map((name) => [name, { path: "development.jsonl", sha256: sha256Bytes(Buffer.from("drift")) }])),
      admission: { status: "no-reproducible-residual", reasons: ["none"] }, records: [], repairs: [],
      resolvedCriteria: [], regressions: [], unstableCriteria: [], unmappedCriteria: [],
    });
    await writeFile(paths.repairEvidencePath, `${JSON.stringify(stoppedEvidence)}\n`, "utf8");

    await expect(buildDualSourceFinalIRProvenanceV3({
      ...paths, corpus: "pilot", repairCatalog: "typed-output-repair/v1",
      skills: [{ skillId: "env-manager", sourceSha256: "c".repeat(64), baseIRPath: paths.baseIRPath, annotationCount: 1 }],
    })).rejects.toThrow("eligible");
    const eligibleEvidence = DualSourceRepairEvidenceV2Schema.parse({
      ...stoppedEvidence,
      admission: { status: "eligible", reasons: [] },
      records: ["one", "two"].flatMap((taskId) => [1, 2].map((runIndex) => ({
        evidenceId: `${taskId}-${runIndex}`, taskId, runIndex, criterionId: "schema-contract",
        lineage: "reproduced", repairKind: "json-schema-contract", targetRef: "rule-json-schema-contract",
      }))),
      repairs: [{
        id: "repair-one", kind: "json-schema-contract", targetRef: "rule-json-schema-contract",
        distinctTaskCount: 2, observationCount: 4, minRepetitionsPerTask: 2,
        taskIds: ["one", "two"], evidenceIds: ["one-1", "one-2", "two-1", "two-2"],
      }],
    });
    await writeFile(paths.repairEvidencePath, `${JSON.stringify(eligibleEvidence)}\n`, "utf8");
    await expect(buildDualSourceFinalIRProvenanceV3({
      ...paths, corpus: "pilot", repairCatalog: "typed-output-repair/v1",
      skills: [{ skillId: "env-manager", sourceSha256: "c".repeat(64), baseIRPath: paths.baseIRPath, annotationCount: 1 }],
    })).rejects.toThrow("binding digest mismatch");
  });

  test("accepts dual-source development provenance with explicit policy catalogs", () => {
    expect(validateFinalIRProvenanceRecord(validDualSourceRecord, {
      corpus: "pilot",
      skillIds: ["env-manager"],
    })).toEqual(validDualSourceRecord);
  });

  test("allows v3 only for development validation until a promotion contract exists", () => {
    const v3 = FinalIRProvenanceSchema.parse({
      schemaVersion: "skill-ir-final-provenance/v3",
      corpus: "pilot",
      sourceSystems: ["original", "ir-static"],
      evidencePolicy: "dual-source-residual/v2",
      experimentId: "env-manager-static-v1",
      catalogId: "public-residuals",
      repairCatalog: "typed-output-repair/v1",
      taskSplit: "development",
      manifest: validDualSourceRecord.manifest,
      results: validDualSourceRecord.results,
      repairEvidence: validDualSourceRecord.repairEvidence,
      constructionConfigs: validDualSourceRecord.constructionConfigs,
      skills: validDualSourceRecord.skills,
      evidenceBindings: Object.fromEntries([
        "staticLock", "staticGate", "executionEnvelopes", "scoredResults", "baseIR", "sourceAudit", "mappingCatalog",
      ].map((name) => [name, { path: `${name}.json`, sha256: "1".repeat(64) }])),
    });

    expect(() => assertFinalIRProvenanceUse(v3, "development-validation")).not.toThrow();
    expect(() => assertFinalIRProvenanceUse(v3, "held-out-consumption"))
      .toThrow("development-only");
    expect(() => assertFinalIRProvenanceUse(validDualSourceRecord, "held-out-consumption")).not.toThrow();
  });

  test("rejects absolute paths in the v3 provenance contract", () => {
    expect(() => FinalIRProvenanceSchema.parse({
      schemaVersion: "skill-ir-final-provenance/v3",
      corpus: "pilot",
      sourceSystems: ["original", "ir-static"],
      evidencePolicy: "dual-source-residual/v2",
      experimentId: "env-manager-static-v1",
      catalogId: "public-residuals",
      repairCatalog: "typed-output-repair/v1",
      taskSplit: "development",
      manifest: { ...validDualSourceRecord.manifest, path: "C:/private/pilot.json" },
      results: validDualSourceRecord.results,
      repairEvidence: validDualSourceRecord.repairEvidence,
      constructionConfigs: validDualSourceRecord.constructionConfigs,
      skills: validDualSourceRecord.skills,
      evidenceBindings: Object.fromEntries([
        "staticLock", "staticGate", "executionEnvelopes", "scoredResults", "baseIR", "sourceAudit", "mappingCatalog",
      ].map((name) => [name, { path: `${name}.json`, sha256: "1".repeat(64) }])),
    })).toThrow("repository-relative");

    expect(FinalIRProvenanceSchema.parse({
      ...validRecord,
      manifest: { ...validRecord.manifest, path: "C:/archived/pilot.json" },
    }).schemaVersion).toBe("skill-ir-final-provenance/v1");
  });

  test("accepts development provenance for the selected corpus and skill", () => {
    expect(
      validateFinalIRProvenanceRecord(validRecord, { corpus: "pilot", skillIds: ["env-manager"] }),
    ).toEqual(validRecord);
  });

  test("rejects corpus mismatch, non-development evidence, and missing skills", () => {
    expect(() =>
      validateFinalIRProvenanceRecord(validRecord, { corpus: "calibration", skillIds: ["env-manager"] }),
    ).toThrow("corpus mismatch");
    expect(() =>
      validateFinalIRProvenanceRecord(
        { ...validRecord, taskSplit: "held-out" },
        { corpus: "pilot", skillIds: ["env-manager"] },
      ),
    ).toThrow("development evidence");
    expect(() =>
      validateFinalIRProvenanceRecord(validRecord, { corpus: "pilot", skillIds: ["law-to-markdown"] }),
    ).toThrow("missing skill law-to-markdown");
  });

  test("rejects PGO consumption when a selected skill has no profile repair", () => {
    expect(() =>
      validateFinalIRProvenanceRecord(
        {
          ...validRecord,
          skills: [{ ...validRecord.skills[0]!, annotationCount: 0 }],
        },
        { corpus: "pilot", skillIds: ["env-manager"] },
      ),
    ).toThrow("no profile annotations");
  });

  test("builds digests for development results, base IR, overlay, and final IR", async () => {
    const legacyRows = [scoredRow()];
    const { rootDir, artifactRoot, manifestPath, resultsPath, baseIRPath } = await provenanceFixture(legacyRows);

    const record = await buildFinalIRProvenance({
      rootDir,
      artifactRoot,
      corpus: "pilot",
      manifestPath,
      resultsPath,
      skills: [
        {
          skillId: "env-manager",
          sourceSha256: "c".repeat(64),
          baseIRPath,
          annotationCount: 1,
        },
      ],
    });

    expect(record.taskSplit).toBe("development");
    expect(record.sourceSystem).toBe("original");
    expect(record.results.sha256).toBe(
      sha256Bytes(Buffer.from(`${JSON.stringify(legacyRows[0])}\n`)),
    );
    expect(record.skills[0]?.finalIR.path).toBe("final-ir/env-manager.json");
    expect(record.skills[0]?.overlay.path).toBe("overlay/env-manager.json");
    expect(record.constructionConfigs).toEqual([{ status: "legacy-unidentified" }]);
  });

  test("builds provenance v2 for paired original and ir-static evidence", async () => {
    const identity = {
      model: "xty/gpt-4.1-mini",
      modelFamily: "gpt",
      adapter: "bare-agent",
      adapterVersion: "workspace-static-v1",
      panelConfigId: "env-manager-static-v1",
      runIndex: 1,
    };
    const rows = [
      scoredRow({ ...identity, system: "original" }),
      scoredRow({ ...identity, system: "ir-static" }),
    ];
    const paths = await provenanceFixture(rows);

    const record = await buildDualSourceFinalIRProvenance({
      ...paths,
      corpus: "pilot",
      lineageCatalog: "env-manager/v1",
      skills: [{
        skillId: "env-manager",
        sourceSha256: "c".repeat(64),
        baseIRPath: paths.baseIRPath,
        annotationCount: 2,
      }],
    });

    expect(record).toMatchObject({
      schemaVersion: "skill-ir-final-provenance/v2",
      sourceSystems: ["original", "ir-static"],
      evidencePolicy: "dual-source-residual/v1",
      lineageCatalog: "env-manager/v1",
      repairCatalog: "typed-output-repair/v1",
      taskSplit: "development",
    });
    expect(record.repairEvidence.path).toBe("repair-evidence.json");
    expect(record.repairEvidence.sha256).toBe(
      sha256Bytes(Buffer.from('{"schemaVersion":"skill-ir-repair-evidence/v1"}\n')),
    );
    expect(record.constructionConfigs).toEqual([{
      model: identity.model,
      modelFamily: identity.modelFamily,
      adapter: identity.adapter,
      adapterVersion: identity.adapterVersion,
      panelConfigId: identity.panelConfigId,
      runIndices: [1],
    }]);
  });

  test("rejects dual-source provenance construction when one paired system is missing", async () => {
    const row = scoredRow({
      model: "xty/gpt-4.1-mini",
      modelFamily: "gpt",
      adapter: "bare-agent",
      adapterVersion: "workspace-static-v1",
      panelConfigId: "env-manager-static-v1",
      runIndex: 1,
      system: "original",
    });
    const paths = await provenanceFixture([row]);

    await expect(buildDualSourceFinalIRProvenance({
      ...paths,
      corpus: "pilot",
      lineageCatalog: "env-manager/v1",
      skills: [{
        skillId: "env-manager",
        sourceSha256: "c".repeat(64),
        baseIRPath: paths.baseIRPath,
        annotationCount: 1,
      }],
    })).rejects.toThrow("paired original and ir-static");
  });

  test("parses archived v1 provenance without construction configs as legacy unidentified", () => {
    const { constructionConfigs: _constructionConfigs, ...archivedRecord } = validRecord;

    expect(
      validateFinalIRProvenanceRecord(archivedRecord, { corpus: "pilot", skillIds: ["env-manager"] })
        .constructionConfigs,
    ).toEqual([{ status: "legacy-unidentified" }]);
  });

  test("requires identified construction configs to have exactly the planned shape", () => {
    const identifiedConfig = {
      model: "xty/gpt-4.1-mini",
      modelFamily: "gpt",
      adapter: "bare-agent",
      adapterVersion: "workspace-2026-07-15",
      panelConfigId: "pilot-v1",
      runIndices: [1],
    };

    expect(() =>
      validateFinalIRProvenanceRecord(
        { ...validRecord, constructionConfigs: [{ ...identifiedConfig, unexpected: true }] },
        { corpus: "pilot", skillIds: ["env-manager"] },
      ),
    ).toThrow();
    expect(() =>
      validateFinalIRProvenanceRecord(
        { ...validRecord, constructionConfigs: [{ ...identifiedConfig, runIndices: [0] }] },
        { corpus: "pilot", skillIds: ["env-manager"] },
      ),
    ).toThrow();
  });

  test("rejects unsorted or duplicate identified construction configs", () => {
    const gptConfig = {
      model: "xty/gpt-4.1-mini",
      modelFamily: "gpt",
      adapter: "bare-agent",
      adapterVersion: "workspace-2026-07-15",
      panelConfigId: "pilot-v1",
      runIndices: [1],
    };
    const geminiConfig = {
      ...gptConfig,
      model: "a/gemini-2.5-flash",
      modelFamily: "gemini",
    };

    expect(() =>
      validateFinalIRProvenanceRecord(
        { ...validRecord, constructionConfigs: [gptConfig, geminiConfig] },
        { corpus: "pilot", skillIds: ["env-manager"] },
      ),
    ).toThrow("sorted and deduplicated");
    expect(() =>
      validateFinalIRProvenanceRecord(
        { ...validRecord, constructionConfigs: [gptConfig, { ...gptConfig, runIndices: [2] }] },
        { corpus: "pilot", skillIds: ["env-manager"] },
      ),
    ).toThrow("sorted and deduplicated");
  });

  test("builds sorted deduplicated configs only from original development rows", async () => {
    const gptIdentity = {
      model: "xty/gpt-4.1-mini",
      modelFamily: "gpt",
      adapter: "bare-agent",
      adapterVersion: "workspace-2026-07-15",
      panelConfigId: "pilot-b",
    };
    const geminiIdentity = {
      model: "a/gemini-2.5-flash",
      modelFamily: "gemini",
      adapter: "bare-agent",
      adapterVersion: "workspace-2026-07-15",
      panelConfigId: "pilot-a",
    };
    const infraIdentity = {
      model: "z/qwen3",
      modelFamily: "qwen",
      adapter: "bare-agent",
      adapterVersion: "workspace-2026-07-15",
      panelConfigId: "pilot-c",
    };

    const record = await buildFixtureProvenance([
      scoredRow({ ...gptIdentity, runIndex: 3 }),
      scoredRow({ ...gptIdentity, runIndex: 1, success: true, failedCriteria: [] }),
      scoredRow({ ...geminiIdentity, runIndex: 2 }),
      scoredRow({ ...infraIdentity, runIndex: 1, failureType: "infrastructure" }),
      scoredRow({ ...gptIdentity, runIndex: 9, system: "ir-static" }),
      scoredRow({ ...gptIdentity, runIndex: 8, taskSplit: "held-out" }),
    ]);

    expect(record.constructionConfigs).toEqual([
      { ...geminiIdentity, runIndices: [2] },
      { ...gptIdentity, runIndices: [1, 3] },
      { ...infraIdentity, runIndices: [1] },
    ]);
  });

  test("uses one typed marker when every relevant row is fully legacy", async () => {
    const record = await buildFixtureProvenance([
      scoredRow(),
      scoredRow({
        caseId: "env-manager:skvm:windows:clean:env-manager-dev-002",
        task: "env-manager-dev-002",
        success: true,
        failedCriteria: [],
      }),
      scoredRow({ system: "ir-static", model: "ignored-partial" }),
    ]);

    expect(record.constructionConfigs).toEqual([{ status: "legacy-unidentified" }]);
  });

  test("rejects mixed legacy and identified construction rows", async () => {
    await expect(
      buildFixtureProvenance([
        scoredRow(),
        scoredRow({
          model: "xty/gpt-4.1-mini",
          modelFamily: "gpt",
          adapter: "bare-agent",
          adapterVersion: "workspace-2026-07-15",
          runIndex: 1,
          panelConfigId: "pilot-v1",
        }),
      ]),
    ).rejects.toThrow("mixes legacy and identified");
  });

  test("rejects partial construction row identity", async () => {
    await expect(
      buildFixtureProvenance([scoredRow({ model: "xty/gpt-4.1-mini" })]),
    ).rejects.toThrow("partial run identity");
  });

  test("rejects duplicate construction evidence identities", async () => {
    const row = scoredRow({
      model: "xty/gpt-4.1-mini",
      modelFamily: "gpt",
      adapter: "bare-agent",
      adapterVersion: "workspace-2026-07-15",
      runIndex: 1,
      panelConfigId: "pilot-v1",
    });

    await expect(buildFixtureProvenance([row, { ...row }])).rejects.toThrow(
      "duplicate construction evidence",
    );
  });

  test("detects a removed constructionConfigs field against identified result rows", () => {
    const identifiedRow = scoredRow({
      model: "xty/gpt-4.1-mini",
      modelFamily: "gpt",
      adapter: "bare-agent",
      adapterVersion: "workspace-2026-07-15",
      runIndex: 1,
      panelConfigId: "pilot-v1",
    });
    const { constructionConfigs: _constructionConfigs, ...withoutConfigs } = validRecord;
    const migrated = validateFinalIRProvenanceRecord(withoutConfigs, {
      corpus: "pilot",
      skillIds: ["env-manager"],
    });

    expect(() => validateConstructionConfigsMatchRows(migrated, [identifiedRow])).toThrow(
      "do not match hashed results",
    );
  });
});
