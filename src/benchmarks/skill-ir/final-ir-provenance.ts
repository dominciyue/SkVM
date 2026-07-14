import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import { z } from "zod";
import type { CorpusId } from "./corpus-registry";
import { sha256Bytes } from "./source-fixture";

const DigestPathSchema = z.object({
  path: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/i),
});

export const FinalIRProvenanceSchema = z.object({
  schemaVersion: z.literal("skill-ir-final-provenance/v1"),
  corpus: z.enum(["calibration", "pilot"]),
  sourceSystem: z.literal("original"),
  taskSplit: z.string().min(1),
  manifest: DigestPathSchema,
  results: DigestPathSchema,
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

export async function buildFinalIRProvenance(opts: {
  rootDir: string;
  artifactRoot: string;
  corpus: CorpusId;
  manifestPath: string;
  resultsPath: string;
  skills: { skillId: string; sourceSha256: string; baseIRPath: string; annotationCount: number }[];
}): Promise<FinalIRProvenance> {
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
  if ((await digestFile(resolveRecordedPath(opts.rootDir, record.results.path))) !== record.results.sha256) {
    throw new Error("Final IR provenance results digest mismatch");
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
