import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { parseSafeRelativePath } from "./artifact-package";
import { sha256Bytes } from "./source-fixture";
import { assembleValidatedArtifactPackage } from "./validated-artifact-assembly";
import {
  validateValidatedArtifactPackage,
  type ValidatedArtifactExecutionPlan,
  type ValidatedArtifactManifest,
  type ValidatedArtifactProvenance,
} from "./validated-artifact-catalog";

const ParityCaseSchema = z.object({
  caseId: z.string().regex(/^[a-z][a-z0-9-]{0,95}$/),
  phenotype: z.string().regex(/^[a-z][a-z0-9-]{0,95}$/),
  packagePath: z.string().transform((value, ctx) => {
    try {
      return parseSafeRelativePath(value);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : String(error),
      });
      return z.NEVER;
    }
  }),
}).strict();

const ParityInputSchema = z.object({
  rootDir: z.string().min(1),
  cases: z.array(ParityCaseSchema).min(2),
}).strict().superRefine((input, ctx) => {
  if (new Set(input.cases.map((entry) => entry.caseId)).size !== input.cases.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Parity case ids must be unique" });
  }
});

export type ValidatedArtifactAssemblyParityInput = z.input<typeof ParityInputSchema>;

export type ValidatedArtifactAssemblyParityReport = {
  schemaVersion: "validated-artifact-assembly-parity/v1";
  catalog: "validated-skill-artifact/v1";
  cases: Array<{
    caseId: string;
    skillId: string;
    phenotype: string;
    packagePath: string;
    artifactCount: number;
    fileCount: number;
    packageBytes: number;
    byteParity: boolean;
    catalogValid: true;
  }>;
  summary: {
    caseCount: number;
    phenotypeCount: number;
    byteParityCount: number;
    catalogValidCount: number;
    coreBranchDelta: number;
    ready: boolean;
  };
};

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function listFiles(root: string, current = ""): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(join(root, current), { withFileTypes: true })) {
    const relativePath = current ? `${current}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(root, relativePath));
    else if (entry.isFile()) files.push(relativePath);
    else throw new Error(`Parity package contains unsupported entry: ${relativePath}`);
  }
  return files.sort();
}

async function fileDigests(root: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const relativePath of await listFiles(root)) {
    result.set(relativePath, sha256Bytes(await readFile(join(root, relativePath))));
  }
  return result;
}

function mapsEqual(left: Map<string, string>, right: Map<string, string>): boolean {
  return left.size === right.size
    && [...left].every(([path, digest]) => right.get(path) === digest);
}

export async function runValidatedArtifactAssemblyParity(
  rawInput: ValidatedArtifactAssemblyParityInput,
): Promise<ValidatedArtifactAssemblyParityReport> {
  const input = ParityInputSchema.parse(rawInput);
  const assemblySource = await readFile(
    join(input.rootDir, "src/benchmarks/skill-ir/validated-artifact-assembly.ts"),
    "utf8",
  );
  const cases: ValidatedArtifactAssemblyParityReport["cases"] = [];
  const observedSkillIds: string[] = [];

  for (const entry of input.cases) {
    const packageDir = join(input.rootDir, entry.packagePath);
    const sourcePackage = await validateValidatedArtifactPackage(packageDir);
    const [manifest, provenance, executionPlan] = await Promise.all([
      readJson<ValidatedArtifactManifest>(join(packageDir, "package-manifest.json")),
      readJson<ValidatedArtifactProvenance>(join(packageDir, "package-provenance.json")),
      readJson<ValidatedArtifactExecutionPlan>(join(packageDir, "execution-plan.json")),
    ]);
    observedSkillIds.push(manifest.skillId);
    const shadowDir = await mkdtemp(join(tmpdir(), "skvm-artifact-assembly-parity-"));
    try {
      await assembleValidatedArtifactPackage({
        adapter: {
          schemaVersion: "validated-artifact-assembly-adapter/v1",
          catalog: "validated-skill-artifact/v1",
          skillId: manifest.skillId,
          adapterId: `${entry.caseId}-assembly`,
          version: "v1",
          compiler: provenance.compiler,
          protectedInputs: manifest.protectedInputs,
          generatedOutputs: manifest.generatedOutputs,
          executionPlan,
          artifactLayout: manifest.artifacts.map(({ id, path, kind }) => ({ id, path, kind })),
        },
        provenanceInputs: provenance.inputs,
        artifactPayloads: await Promise.all(manifest.artifacts.map(async ({ id, path }) => ({
          id,
          bytes: await readFile(join(packageDir, path)),
        }))),
      }, shadowDir);
      const [sourceDigests, shadowDigests] = await Promise.all([
        fileDigests(packageDir),
        fileDigests(shadowDir),
      ]);
      cases.push({
        caseId: entry.caseId,
        skillId: manifest.skillId,
        phenotype: entry.phenotype,
        packagePath: entry.packagePath,
        artifactCount: manifest.artifacts.length,
        fileCount: sourceDigests.size,
        packageBytes: sourcePackage.packageBytes,
        byteParity: mapsEqual(sourceDigests, shadowDigests),
        catalogValid: true,
      });
    } finally {
      await rm(shadowDir, { recursive: true, force: true });
    }
  }

  const coreBranchDelta = observedSkillIds.filter((skillId) => assemblySource.includes(skillId)).length;
  const summary = {
    caseCount: cases.length,
    phenotypeCount: new Set(cases.map((entry) => entry.phenotype)).size,
    byteParityCount: cases.filter((entry) => entry.byteParity).length,
    catalogValidCount: cases.filter((entry) => entry.catalogValid).length,
    coreBranchDelta,
    ready: cases.every((entry) => entry.byteParity && entry.catalogValid) && coreBranchDelta === 0,
  };
  return {
    schemaVersion: "validated-artifact-assembly-parity/v1",
    catalog: "validated-skill-artifact/v1",
    cases,
    summary,
  };
}
