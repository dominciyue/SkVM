import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadCorpusRegistry, resolveCorpusManifestPath } from "./corpus-registry";

const rootDir = path.resolve(import.meta.dir, "../../..");

describe("skill-ir corpus registry", () => {
  test("resolves explicit calibration and pilot corpus manifests", () => {
    const registry = loadCorpusRegistry();

    expect(Object.keys(registry.corpora).sort()).toEqual(["calibration", "pilot"]);
    expect(resolveCorpusManifestPath("calibration").replaceAll("\\", "/")).toEndWith(
      "benchmarks/skill-ir/corpus/corpora/calibration.json",
    );
    expect(resolveCorpusManifestPath("pilot").replaceAll("\\", "/")).toEndWith(
      "benchmarks/skill-ir/corpus/corpora/pilot.json",
    );
  });

  test("rejects missing and unknown corpus ids", () => {
    expect(() => resolveCorpusManifestPath(undefined)).toThrow("--corpus is required");
    expect(() => resolveCorpusManifestPath("unknown")).toThrow("Unknown Skill IR corpus: unknown");
  });

  test("uses method portfolio roles instead of treating API Tester as untouched replication", () => {
    const manifest = JSON.parse(readFileSync(
      path.join(rootDir, "benchmarks/skill-ir/corpus/corpora/pilot.json"),
      "utf8",
    )) as {
      scopeCounts: Record<string, number>;
      skills: Array<Record<string, unknown>>;
    };
    const apiTester = manifest.skills.find((skill) => skill.id === "api-tester");

    expect(manifest.scopeCounts).toEqual({
      methodDevelopmentStartMinimum: 6,
      untouchedReplicationMinimum: 1,
      untouchedReplicationTarget: 2,
    });
    expect(apiTester).toMatchObject({
      portfolioRole: "prospective-method-development",
      depth: "schema-derived-artifact-development",
      status: "runnable",
      evidenceWeight: "support-real",
      irPath: "benchmarks/skill-ir/pilots/api-tester/base-ir.json",
      sourceAuditPath: "benchmarks/skill-ir/pilots/api-tester/base-ir-source-audit.json",
    });
    expect(apiTester?.wave).toBeUndefined();

    const intake = JSON.parse(readFileSync(
      path.join(rootDir, "benchmarks/skill-ir/corpus/real-skill-intake.json"),
      "utf8",
    )) as { candidates: Array<Record<string, unknown>> };
    expect(intake.candidates.find((candidate) => candidate.id === "api-tester")).toMatchObject({
      status: "prospective-method-development",
      evidenceWeight: "support-real",
    });
  });

  test("exposes zh-code-reviewer only through the audited tasks-authored calibration lifecycle", () => {
    const manifest = JSON.parse(readFileSync(
      path.join(rootDir, "benchmarks/skill-ir/corpus/corpora/pilot.json"),
      "utf8",
    )) as { skills: Array<Record<string, unknown>> };
    const reviewer = manifest.skills.find((skill) => skill.id === "zh-code-reviewer");

    expect(reviewer).toMatchObject({
      portfolioRole: "method-development",
      depth: "benchmark-contract-qualified",
      status: "tasks-authored",
      tasksPath: "benchmarks/skill-ir/pilots/zh-code-reviewer/development/tasks.json",
      benchmarkContractAuditPath: "results/skill-ir/benchmark-contract-audit/zh-code-reviewer.json",
      evidenceWeight: "support-real",
    });
    expect(reviewer?.irPath).toBeUndefined();
  });
});
