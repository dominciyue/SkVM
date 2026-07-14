import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildFinalIRProvenance,
  validateConstructionConfigsMatchRows,
  validateFinalIRProvenanceRecord,
} from "./final-ir-provenance";
import type { ScoredAgentRunRow } from "./scoring";
import { sha256Bytes } from "./source-fixture";

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
  return { rootDir, artifactRoot, manifestPath, resultsPath, baseIRPath };
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
