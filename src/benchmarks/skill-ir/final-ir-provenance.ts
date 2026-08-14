import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import { z } from "zod";
import type { CorpusId } from "./corpus-registry";
import type { ScoredAgentRunRow } from "./scoring";
import { DualSourceRepairEvidenceV2Schema } from "./repair-evidence";
import { sha256Bytes } from "./source-fixture";

const DigestPathSchema = z.object({
  path: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/i),
});

const PortableDigestPathSchema = z.object({
  path: z.string().min(1).refine((value) => {
    if (value.includes("\\") || value.startsWith("/") || /^[A-Za-z]:/.test(value)) return false;
    return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
  }, "provenance path must be repository-relative or artifact-relative"),
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

const FinalIRSkillProvenanceSchema = z.object({
  skillId: z.string().min(1),
  sourceSha256: z.string().regex(/^[0-9a-f]{64}$/i),
  baseIR: DigestPathSchema,
  overlay: DigestPathSchema,
  finalIR: DigestPathSchema,
  annotationCount: z.number().int().nonnegative(),
});

const FinalIRSkillProvenanceV3Schema = z.object({
  skillId: z.string().min(1),
  sourceSha256: z.string().regex(/^[0-9a-f]{64}$/i),
  baseIR: PortableDigestPathSchema,
  overlay: PortableDigestPathSchema,
  finalIR: PortableDigestPathSchema,
  annotationCount: z.number().int().nonnegative(),
});

const FinalIRProvenanceV1Schema = z.object({
  schemaVersion: z.literal("skill-ir-final-provenance/v1"),
  corpus: z.enum(["calibration", "pilot"]),
  sourceSystem: z.literal("original"),
  taskSplit: z.string().min(1),
  manifest: DigestPathSchema,
  results: DigestPathSchema,
  constructionConfigs: ConstructionConfigsSchema,
  skills: z.array(FinalIRSkillProvenanceSchema),
});

const FinalIRProvenanceV2Schema = z.object({
  schemaVersion: z.literal("skill-ir-final-provenance/v2"),
  corpus: z.literal("pilot"),
  sourceSystems: z.tuple([z.literal("original"), z.literal("ir-static")]),
  evidencePolicy: z.literal("dual-source-residual/v1"),
  lineageCatalog: z.literal("env-manager/v1"),
  repairCatalog: z.enum(["typed-output-repair/v1", "typed-output-repair/v2"]),
  taskSplit: z.literal("development"),
  manifest: DigestPathSchema,
  results: DigestPathSchema,
  repairEvidence: DigestPathSchema,
  constructionConfigs: ConstructionConfigsSchema,
  skills: z.array(FinalIRSkillProvenanceSchema),
});

const FinalIRProvenanceV3Schema = z.object({
  schemaVersion: z.literal("skill-ir-final-provenance/v3"),
  corpus: z.literal("pilot"),
  sourceSystems: z.tuple([z.literal("original"), z.literal("ir-static")]),
  evidencePolicy: z.literal("dual-source-residual/v2"),
  experimentId: z.string().min(1),
  catalogId: z.string().min(1),
  repairCatalog: z.enum(["typed-output-repair/v1", "typed-output-repair/v2", "typed-output-repair/v3"]),
  taskSplit: z.literal("development"),
  manifest: PortableDigestPathSchema,
  results: PortableDigestPathSchema,
  repairEvidence: PortableDigestPathSchema,
  constructionConfigs: ConstructionConfigsSchema,
  skills: z.array(FinalIRSkillProvenanceV3Schema),
  evidenceBindings: z.object({
    staticLock: PortableDigestPathSchema,
    staticGate: PortableDigestPathSchema,
    executionEnvelopes: PortableDigestPathSchema,
    scoredResults: PortableDigestPathSchema,
    baseIR: PortableDigestPathSchema,
    sourceAudit: PortableDigestPathSchema,
    mappingCatalog: PortableDigestPathSchema,
  }).strict(),
});

export const FinalIRProvenanceSchema = z.discriminatedUnion("schemaVersion", [
  FinalIRProvenanceV1Schema,
  FinalIRProvenanceV2Schema,
  FinalIRProvenanceV3Schema,
]);

export type FinalIRProvenance = z.infer<typeof FinalIRProvenanceSchema>;
export type FinalIRProvenanceV1 = z.infer<typeof FinalIRProvenanceV1Schema>;
export type FinalIRProvenanceV2 = z.infer<typeof FinalIRProvenanceV2Schema>;
export type FinalIRProvenanceV3 = z.infer<typeof FinalIRProvenanceV3Schema>;
export type ConstructionConfig = z.infer<typeof ConstructionConfigSchema>;

export function assertFinalIRProvenanceUse(
  record: FinalIRProvenance,
  use: "development-validation" | "held-out-consumption",
): void {
  if (use === "held-out-consumption" && record.schemaVersion === "skill-ir-final-provenance/v3") {
    throw new Error(
      "Final IR provenance v3 is development-only until a separate promotion contract authorizes held-out consumption",
    );
  }
}

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

function deriveConstructionConfigs(
  rows: ScoredAgentRunRow[],
  sourceSystems: Array<"original" | "ir-static"> = ["original"],
): ConstructionConfig[] {
  const relevantRows = rows.filter(
    (row) => sourceSystems.includes(row.system as "original" | "ir-static") && row.taskSplit === "development",
  );
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
  const expected = deriveConstructionConfigs(
    rows,
    record.schemaVersion === "skill-ir-final-provenance/v2"
      || record.schemaVersion === "skill-ir-final-provenance/v3"
      ? ["original", "ir-static"] : ["original"],
  );
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
}): Promise<FinalIRProvenanceV1> {
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

  return FinalIRProvenanceV1Schema.parse({
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

function assertDualSourcePairs(rows: ScoredAgentRunRow[]): void {
  const relevantRows = rows.filter(
    (row) => (row.system === "original" || row.system === "ir-static") && row.taskSplit === "development",
  );
  const pairs = new Map<string, Set<string>>();
  for (const row of relevantRows) {
    const identity = IDENTITY_FIELDS.map((field) => row[field]);
    const presentCount = identity.filter((value) => value !== undefined).length;
    if (presentCount !== 0 && presentCount !== IDENTITY_FIELDS.length) {
      throw new Error(`Construction evidence row ${row.caseId} has partial run identity`);
    }
    const key = JSON.stringify([row.caseId, ...identity]);
    const systems = pairs.get(key) ?? new Set<string>();
    if (systems.has(row.system)) {
      throw new Error(`Construction results contain duplicate construction evidence for ${row.caseId}`);
    }
    systems.add(row.system);
    pairs.set(key, systems);
  }
  if (
    pairs.size === 0 ||
    [...pairs.values()].some((systems) => !systems.has("original") || !systems.has("ir-static"))
  ) {
    throw new Error("Dual-source provenance requires paired original and ir-static construction rows");
  }
}

export async function buildDualSourceFinalIRProvenance(opts: {
  rootDir: string;
  artifactRoot: string;
  corpus: "pilot";
  manifestPath: string;
  resultsPath: string;
  repairEvidencePath: string;
  lineageCatalog: "env-manager/v1";
  repairCatalog?: "typed-output-repair/v1" | "typed-output-repair/v2";
  skills: { skillId: string; sourceSha256: string; baseIRPath: string; annotationCount: number }[];
}): Promise<FinalIRProvenanceV2> {
  const scoredRows = await readScoredRows(opts.resultsPath);
  assertDualSourcePairs(scoredRows);
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

  return FinalIRProvenanceV2Schema.parse({
    schemaVersion: "skill-ir-final-provenance/v2",
    corpus: opts.corpus,
    sourceSystems: ["original", "ir-static"],
    evidencePolicy: "dual-source-residual/v1",
    lineageCatalog: opts.lineageCatalog,
    repairCatalog: opts.repairCatalog ?? "typed-output-repair/v1",
    taskSplit: "development",
    manifest: {
      path: portableRelative(opts.rootDir, opts.manifestPath),
      sha256: await digestFile(opts.manifestPath),
    },
    results: {
      path: portableRelative(opts.rootDir, opts.resultsPath),
      sha256: await digestFile(opts.resultsPath),
    },
    repairEvidence: {
      path: portableRelative(opts.artifactRoot, opts.repairEvidencePath),
      sha256: await digestFile(opts.repairEvidencePath),
    },
    constructionConfigs: deriveConstructionConfigs(scoredRows, ["original", "ir-static"]),
    skills,
  });
}

export async function buildDualSourceFinalIRProvenanceV3(opts: {
  rootDir: string;
  artifactRoot: string;
  corpus: "pilot";
  manifestPath: string;
  resultsPath: string;
  repairEvidencePath: string;
  repairCatalog?: "typed-output-repair/v1" | "typed-output-repair/v2" | "typed-output-repair/v3";
  skills: { skillId: string; sourceSha256: string; baseIRPath: string; annotationCount: number }[];
}): Promise<FinalIRProvenanceV3> {
  const [scoredRows, evidenceBytes] = await Promise.all([
    readScoredRows(opts.resultsPath),
    readFile(opts.repairEvidencePath),
  ]);
  assertDualSourcePairs(scoredRows);
  const evidence = DualSourceRepairEvidenceV2Schema.parse(JSON.parse(evidenceBytes.toString("utf8")));
  if (evidence.admission.status !== "eligible" || evidence.repairs.length === 0) {
    throw new Error(`Final IR provenance v3 requires eligible repair evidence, got ${evidence.admission.status}`);
  }
  if (evidence.catalogScope !== "prospective-development") {
    throw new Error("Final IR provenance v3 requires a prospective-development catalog");
  }
  if (opts.repairCatalog && opts.repairCatalog !== evidence.repairCatalog) {
    throw new Error("Final IR provenance v3 repair catalog mismatch");
  }
  if (opts.skills.length !== 1 || opts.skills[0]!.skillId !== evidence.skillId) {
    throw new Error("Final IR provenance v3 repair evidence skill mismatch");
  }
  const bindings = Object.entries(evidence.bindings) as Array<[
    keyof typeof evidence.bindings,
    (typeof evidence.bindings)[keyof typeof evidence.bindings],
  ]>;
  for (const [name, binding] of bindings) {
    const recordedPath = resolveRecordedPath(opts.rootDir, binding.path);
    if ((await digestFile(recordedPath)) !== binding.sha256) {
      throw new Error(`Final IR provenance v3 ${name} binding digest mismatch`);
    }
  }
  if (evidence.bindings.scoredResults.sha256 !== await digestFile(opts.resultsPath)) {
    throw new Error("Final IR provenance v3 scored results binding mismatch");
  }
  if (evidence.bindings.scoredResults.path !== portableRelative(opts.rootDir, opts.resultsPath)) {
    throw new Error("Final IR provenance v3 scored results binding path mismatch");
  }
  if (evidence.bindings.baseIR.sha256 !== await digestFile(opts.skills[0]!.baseIRPath)) {
    throw new Error("Final IR provenance v3 base IR binding mismatch");
  }
  if (evidence.bindings.baseIR.path !== portableRelative(opts.rootDir, opts.skills[0]!.baseIRPath)) {
    throw new Error("Final IR provenance v3 base IR binding path mismatch");
  }
  const skills = await Promise.all(opts.skills.map(async (skill) => {
    const overlayPath = join(opts.artifactRoot, "overlay", `${skill.skillId}.json`);
    const finalIRPath = join(opts.artifactRoot, "final-ir", `${skill.skillId}.json`);
    return {
      skillId: skill.skillId,
      sourceSha256: skill.sourceSha256,
      baseIR: { path: portableRelative(opts.rootDir, skill.baseIRPath), sha256: await digestFile(skill.baseIRPath) },
      overlay: { path: portableRelative(opts.artifactRoot, overlayPath), sha256: await digestFile(overlayPath) },
      finalIR: { path: portableRelative(opts.artifactRoot, finalIRPath), sha256: await digestFile(finalIRPath) },
      annotationCount: skill.annotationCount,
    };
  }));
  return FinalIRProvenanceV3Schema.parse({
    schemaVersion: "skill-ir-final-provenance/v3",
    corpus: opts.corpus,
    sourceSystems: ["original", "ir-static"],
    evidencePolicy: "dual-source-residual/v2",
    experimentId: evidence.experimentId,
    catalogId: evidence.catalogId,
    repairCatalog: evidence.repairCatalog,
    taskSplit: "development",
    manifest: { path: portableRelative(opts.rootDir, opts.manifestPath), sha256: await digestFile(opts.manifestPath) },
    results: { path: portableRelative(opts.rootDir, opts.resultsPath), sha256: await digestFile(opts.resultsPath) },
    repairEvidence: {
      path: portableRelative(opts.artifactRoot, opts.repairEvidencePath),
      sha256: sha256Bytes(evidenceBytes),
    },
    evidenceBindings: evidence.bindings,
    constructionConfigs: deriveConstructionConfigs(scoredRows, ["original", "ir-static"]),
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
  if (record.schemaVersion === "skill-ir-final-provenance/v2"
    || record.schemaVersion === "skill-ir-final-provenance/v3") {
    const repairEvidencePath = resolveRecordedPath(artifactRoot, record.repairEvidence.path);
    if ((await digestFile(repairEvidencePath)) !== record.repairEvidence.sha256) {
      throw new Error("Final IR provenance repair evidence digest mismatch");
    }
    if (record.schemaVersion === "skill-ir-final-provenance/v3") {
      const evidence = DualSourceRepairEvidenceV2Schema.parse(JSON.parse(await readFile(repairEvidencePath, "utf8")));
      if (evidence.admission.status !== "eligible" || evidence.repairs.length === 0) {
        throw new Error("Final IR provenance v3 repair evidence is not eligible");
      }
      if (evidence.catalogScope !== "prospective-development") {
        throw new Error("Final IR provenance v3 requires prospective-development repair evidence");
      }
      const selectedSkill = record.skills[0];
      if (record.skills.length !== 1 || !selectedSkill || evidence.skillId !== selectedSkill.skillId) {
        throw new Error("Final IR provenance v3 repair evidence skill mismatch");
      }
      if (evidence.experimentId !== record.experimentId) {
        throw new Error("Final IR provenance v3 repair evidence experiment mismatch");
      }
      if (evidence.catalogId !== record.catalogId) {
        throw new Error("Final IR provenance v3 repair evidence catalog mismatch");
      }
      if (evidence.repairCatalog !== record.repairCatalog) {
        throw new Error("Final IR provenance v3 repair catalog mismatch");
      }
      if (evidence.bindings.scoredResults.path !== record.results.path
        || evidence.bindings.scoredResults.sha256 !== record.results.sha256) {
        throw new Error("Final IR provenance v3 results binding mismatch");
      }
      if (evidence.bindings.baseIR.path !== selectedSkill.baseIR.path
        || evidence.bindings.baseIR.sha256 !== selectedSkill.baseIR.sha256) {
        throw new Error("Final IR provenance v3 base IR binding mismatch");
      }
      for (const [name, binding] of Object.entries(evidence.bindings)) {
        const provenanceBinding = record.evidenceBindings[name as keyof typeof record.evidenceBindings];
        if (binding.path !== provenanceBinding.path || binding.sha256 !== provenanceBinding.sha256) {
          throw new Error(`Final IR provenance v3 ${name} binding path mismatch`);
        }
        const bindingPath = resolveRecordedPath(opts.rootDir, binding.path);
        if ((await digestFile(bindingPath)) !== binding.sha256) {
          throw new Error(`Final IR provenance v3 ${name} binding digest mismatch`);
        }
      }
    }
  }

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
