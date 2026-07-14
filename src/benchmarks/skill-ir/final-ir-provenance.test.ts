import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildFinalIRProvenance, validateFinalIRProvenanceRecord } from "./final-ir-provenance";
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
    const rootDir = await mkdtemp(join(tmpdir(), "skill-ir-provenance-"));
    tempDirs.push(rootDir);
    const artifactRoot = join(rootDir, "artifacts");
    const manifestPath = join(rootDir, "pilot.json");
    const resultsPath = join(rootDir, "development.jsonl");
    const baseIRPath = join(rootDir, "env-manager.json");
    await mkdir(join(artifactRoot, "overlay"), { recursive: true });
    await mkdir(join(artifactRoot, "final-ir"), { recursive: true });
    await writeFile(manifestPath, "{}\n", "utf8");
    await writeFile(resultsPath, "{}\n", "utf8");
    await writeFile(baseIRPath, "{}\n", "utf8");
    await writeFile(join(artifactRoot, "overlay", "env-manager.json"), "{}\n", "utf8");
    await writeFile(join(artifactRoot, "final-ir", "env-manager.json"), "{}\n", "utf8");

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
    expect(record.results.sha256).toBe(sha256Bytes(Buffer.from("{}\n")));
    expect(record.skills[0]?.finalIR.path).toBe("final-ir/env-manager.json");
    expect(record.skills[0]?.overlay.path).toBe("overlay/env-manager.json");
  });
});
