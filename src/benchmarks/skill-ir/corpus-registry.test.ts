import { describe, expect, test } from "bun:test";
import { loadCorpusRegistry, resolveCorpusManifestPath } from "./corpus-registry";

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
});
