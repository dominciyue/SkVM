import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

export type CorpusId = "calibration" | "pilot";

export type CorpusRegistry = {
  schemaVersion: "skill-ir-corpus-registry/v1";
  corpora: Record<CorpusId, { manifestPath: string; role: string }>;
};

export function loadCorpusRegistry(rootDir = process.cwd()): CorpusRegistry {
  return JSON.parse(
    readFileSync(join(rootDir, "benchmarks/skill-ir/corpus/manifest.json"), "utf8"),
  ) as CorpusRegistry;
}

export function resolveCorpusManifestPath(corpus: string | undefined, rootDir = process.cwd()): string {
  if (!corpus) {
    throw new Error("--corpus is required; choose calibration or pilot");
  }

  const registry = loadCorpusRegistry(rootDir);
  const entry = registry.corpora[corpus as CorpusId];
  if (!entry) {
    throw new Error(`Unknown Skill IR corpus: ${corpus}`);
  }

  return isAbsolute(entry.manifestPath) ? entry.manifestPath : join(rootDir, entry.manifestPath);
}
