import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import { z } from "zod";
import type { CorpusId } from "./corpus-registry";
import type { ScoredAgentRunRow } from "./scoring";
import { sha256Bytes } from "./source-fixture";

const DigestPathSchema = z.object({
  path: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/i),
});

type ConstructionConfigDimensions = {
  model: string;
  modelFamily: string;
  adapter: string;
  adapterVersion: string;
  panelConfigId: string;
};

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareConstructionConfigDimensions(
  left: ConstructionConfigDimensions,
  right: ConstructionConfigDimensions,
): number {
  return (
    compareStrings(left.model, right.model) ||
    compareStrings(left.modelFamily, right.modelFamily) ||
    compareStrings(left.adapter, right.adapter) ||
    compareStrings(left.adapterVersion, right.adapterVersion) ||
    compareStrings(left.panelConfigId, right.panelConfigId)
  );
}

const LegacyConstructionConfigSchema = z.object({
  status: z.literal("legacy-unidentified"),
}).strict();

const IdentifiedConstructionConfigBaseSchema = z.object({
  model: z.string().min(1),
  modelFamily: z.string().min(1),
  adapter: z.string().min(1),
  adapterVersion: z.string().min(1),
  panelConfigId: z.string().min(1),
}).strict();

const IdentifiedConstructionConfigSchema = IdentifiedConstructionConfigBaseSchema.extend({
  runIndices: z.array(z.number().int().positive()).min(1),
}).strict().superRefine((config, ctx) => {
  for (let index = 1; index < config.runIndices.length; index += 1) {
    if (config.runIndices[index - 1]! >= config.runIndices[index]!) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "construction config runIndices must be sorted and deduplicated",
        path: ["runIndices"],
      });
      return;
    }
  }
});

const ConstructionConfigSchema = z.union([
  LegacyConstructionConfigSchema,
  IdentifiedConstructionConfigSchema,
]);

const ConstructionConfigsSchema = z.array(ConstructionConfigSchema).min(1).superRefine((configs, ctx) => {
  const legacyCount = configs.filter((config) => "status" in config).length;
  if (legacyCount > 0 && (legacyCount !== 1 || configs.length !== 1)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "legacy-unidentified must be the only construction config",
    });
  }
  if (legacyCount === 0) {
    for (let index = 1; index < configs.length; index += 1) {
      const previous = configs[index - 1]!;
      const current = configs[index]!;
      if ("status" in previous || "status" in current) {
        continue;
      }
      if (compareConstructionConfigDimensions(previous, current) >= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "construction configs must be sorted and deduplicated",
        });
        return;
      }
    }
  }
}).default([{ status: "legacy-unidentified" }]);

export const FinalIRProvenanceSchema = z.object({
  schemaVersion: z.literal("skill-ir-final-provenance/v1"),
  corpus: z.enum(["calibration", "pilot"]),
  sourceSystem: z.literal("original"),
  taskSplit: z.string().min(1),
  manifest: DigestPathSchema,
  results: DigestPathSchema,
  constructionConfigs: ConstructionConfigsSchema,
  skills: z.array(
    z.object({
      skillId: z.string().min(1),
      sourceSha256: z.string().regex(/^[0-9a-f]{64}$/i),
      baseIR: DigestPathSchema,
      overlay: DigestPathSchema,
      finalIR: DigestPathSchema,
      annotationCount: z.number().int().nonnegative(),
    }),
  ),
});

export type FinalIRProvenance = z.infer<typeof FinalIRProvenanceSchema>;
export type ConstructionConfig = z.infer<typeof ConstructionConfigSchema>;

export function validateFinalIRProvenanceRecord(
  candidate: unknown,
  expected: { corpus: CorpusId; skillIds: string[] },
): FinalIRProvenance {
  const record = FinalIRProvenanceSchema.parse(candidate);
  if (record.corpus !== expected.corpus) {
    throw new Error(`Final IR provenance corpus mismatch: expected ${expected.corpus}, got ${record.corpus}`);
  }
  if (record.taskSplit !== "development") {
    throw new Error(`Final IR provenance must use development evidence, got ${record.taskSplit}`);
  }

  const recordedSkills = new Set(record.skills.map((skill) => skill.skillId));
  const recordBySkill = new Map(record.skills.map((skill) => [skill.skillId, skill]));
  for (const skillId of expected.skillIds) {
    if (!recordedSkills.has(skillId)) {
      throw new Error(`Final IR provenance is missing skill ${skillId}`);
    }
    if (recordBySkill.get(skillId)!.annotationCount === 0) {
      throw new Error(`Final IR provenance has no profile annotations for ${skillId}`);
    }
  }
  return record;
}

async function digestFile(path: string): Promise<string> {
  return sha256Bytes(await readFile(path));
}

function portableRelative(baseDir: string, path: string): string {
  return relative(baseDir, path).replaceAll("\\", "/");
}

const IDENTITY_FIELDS = [
  "model",
  "modelFamily",
  "adapter",
  "adapterVersion",
  "runIndex",
  "panelConfigId",
] as const;

type IdentifiedConstructionConfig = z.infer<typeof IdentifiedConstructionConfigSchema>;

function deriveConstructionConfigs(rows: ScoredAgentRunRow[]): ConstructionConfig[] {
  const relevantRows = rows.filter((row) => row.system === "original" && row.taskSplit === "development");
  const identifiedRows: { config: Omit<IdentifiedConstructionConfig, "runIndices">; runIndex: number }[] = [];
  const evidenceKeys = new Set<string>();
  let legacyRowCount = 0;

  for (const row of relevantRows) {
    const presentCount = IDENTITY_FIELDS.filter((field) => row[field] !== undefined).length;
    if (presentCount === 0) {
      const evidenceKey = JSON.stringify([row.caseId, row.system, "legacy"]);
      if (evidenceKeys.has(evidenceKey)) {
        throw new Error(`Construction results contain duplicate construction evidence for ${row.caseId}`);
      }
      evidenceKeys.add(evidenceKey);
      legacyRowCount += 1;
      continue;
    }
    if (presentCount !== IDENTITY_FIELDS.length) {
      throw new Error(`Construction evidence row ${row.caseId} has partial run identity`);
    }

    const parsed = IdentifiedConstructionConfigBaseSchema.extend({
      runIndex: z.number().int().positive(),
    }).parse({
      model: row.model,
      modelFamily: row.modelFamily,
      adapter: row.adapter,
      adapterVersion: row.adapterVersion,
      panelConfigId: row.panelConfigId,
      runIndex: row.runIndex,
    });
    const { runIndex, ...config } = parsed;
    const evidenceKey = JSON.stringify([
      row.caseId,
      row.system,
      config.model,
      config.modelFamily,
      config.adapter,
      config.adapterVersion,
      config.panelConfigId,
      runIndex,
    ]);
    if (evidenceKeys.has(evidenceKey)) {
      throw new Error(`Construction results contain duplicate construction evidence for ${row.caseId}`);
    }
    evidenceKeys.add(evidenceKey);
    identifiedRows.push({ config, runIndex });
  }

  if (legacyRowCount > 0 && identifiedRows.length > 0) {
    throw new Error("Construction evidence mixes legacy and identified rows");
  }
  if (identifiedRows.length === 0) {
    return [{ status: "legacy-unidentified" }];
  }

  const grouped = new Map<string, { config: Omit<IdentifiedConstructionConfig, "runIndices">; runIndices: Set<number> }>();
  for (const row of identifiedRows) {
    const key = JSON.stringify([
      row.config.model,
      row.config.modelFamily,
      row.config.adapter,
      row.config.adapterVersion,
      row.config.panelConfigId,
    ]);
    const existing = grouped.get(key) ?? { config: row.config, runIndices: new Set<number>() };
    existing.runIndices.add(row.runIndex);
    grouped.set(key, existing);
  }

  return [...grouped.values()]
    .sort((left, right) => compareConstructionConfigDimensions(left.config, right.config))
    .map(({ config, runIndices }) => ({
      ...config,
      runIndices: [...runIndices].sort((left, right) => left - right),
    }));
}

async function readScoredRows(path: string): Promise<ScoredAgentRunRow[]> {
  const text = await readFile(path, "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as ScoredAgentRunRow);
}

export function validateConstructionConfigsMatchRows(
  record: FinalIRProvenance,
  rows: ScoredAgentRunRow[],
): void {
  const expected = deriveConstructionConfigs(rows);
  if (JSON.stringify(record.constructionConfigs) !== JSON.stringify(expected)) {
    throw new Error("Final IR provenance construction configs do not match hashed results");
  }
}

export async function buildFinalIRProvenance(opts: {
  rootDir: string;
  artifactRoot: string;
  corpus: CorpusId;
  manifestPath: string;
  resultsPath: string;
  skills: { skillId: string; sourceSha256: string; baseIRPath: string; annotationCount: number }[];
}): Promise<FinalIRProvenance> {
  const scoredRows = await readScoredRows(opts.resultsPath);
  const skills = await Promise.all(
    opts.skills.map(async (skill) => {
      const overlayPath = join(opts.artifactRoot, "overlay", `${skill.skillId}.json`);
      const finalIRPath = join(opts.artifactRoot, "final-ir", `${skill.skillId}.json`);
      return {
        skillId: skill.skillId,
        sourceSha256: skill.sourceSha256,
        baseIR: {
          path: portableRelative(opts.rootDir, skill.baseIRPath),
          sha256: await digestFile(skill.baseIRPath),
        },
        overlay: {
          path: portableRelative(opts.artifactRoot, overlayPath),
          sha256: await digestFile(overlayPath),
        },
        finalIR: {
          path: portableRelative(opts.artifactRoot, finalIRPath),
          sha256: await digestFile(finalIRPath),
        },
        annotationCount: skill.annotationCount,
      };
    }),
  );

  return FinalIRProvenanceSchema.parse({
    schemaVersion: "skill-ir-final-provenance/v1",
    corpus: opts.corpus,
    sourceSystem: "original",
    taskSplit: "development",
    manifest: {
      path: portableRelative(opts.rootDir, opts.manifestPath),
      sha256: await digestFile(opts.manifestPath),
    },
    results: {
      path: portableRelative(opts.rootDir, opts.resultsPath),
      sha256: await digestFile(opts.resultsPath),
    },
    constructionConfigs: deriveConstructionConfigs(scoredRows),
    skills,
  });
}

function resolveRecordedPath(baseDir: string, path: string): string {
  return isAbsolute(path) ? path : join(baseDir, path);
}

export async function readAndValidateFinalIRProvenance(opts: {
  rootDir: string;
  corpus: CorpusId;
  manifestPath: string;
  irOverrideDir: string;
  skills: { skillId: string; sourceSha256: string; baseIRPath: string }[];
}): Promise<FinalIRProvenance> {
  const artifactRoot = dirname(opts.irOverrideDir);
  const provenancePath = join(artifactRoot, "provenance.json");
  let candidate: unknown;
  try {
    candidate = JSON.parse(await readFile(provenancePath, "utf8"));
  } catch (error) {
    throw new Error(`Final IR provenance.json is required at ${provenancePath}: ${String(error)}`);
  }

  const record = validateFinalIRProvenanceRecord(candidate, {
    corpus: opts.corpus,
    skillIds: opts.skills.map((skill) => skill.skillId),
  });

  if ((await digestFile(opts.manifestPath)) !== record.manifest.sha256) {
    throw new Error("Final IR provenance manifest digest mismatch");
  }
  const resultsPath = resolveRecordedPath(opts.rootDir, record.results.path);
  if ((await digestFile(resultsPath)) !== record.results.sha256) {
    throw new Error("Final IR provenance results digest mismatch");
  }
  validateConstructionConfigsMatchRows(record, await readScoredRows(resultsPath));

  const recordBySkill = new Map(record.skills.map((skill) => [skill.skillId, skill]));
  for (const expected of opts.skills) {
    const skill = recordBySkill.get(expected.skillId)!;
    if (skill.sourceSha256 !== expected.sourceSha256) {
      throw new Error(`Final IR provenance source digest mismatch for ${expected.skillId}`);
    }
    if ((await digestFile(expected.baseIRPath)) !== skill.baseIR.sha256) {
      throw new Error(`Final IR provenance base IR digest mismatch for ${expected.skillId}`);
    }
    if ((await digestFile(resolveRecordedPath(artifactRoot, skill.overlay.path))) !== skill.overlay.sha256) {
      throw new Error(`Final IR provenance overlay digest mismatch for ${expected.skillId}`);
    }
    if ((await digestFile(join(opts.irOverrideDir, `${expected.skillId}.json`))) !== skill.finalIR.sha256) {
      throw new Error(`Final IR provenance final IR digest mismatch for ${expected.skillId}`);
    }
  }
  return record;
}
