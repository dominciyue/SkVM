import { readdir, readFile } from "node:fs/promises";
import { isAbsolute, posix, relative, resolve, win32 } from "node:path";
import { z } from "zod";
import { sha256Bytes } from "./source-fixture";

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

export function parseSafeRelativePath(value: string): string {
  if (value.length === 0 || isAbsolute(value) || win32.isAbsolute(value)) {
    throw new Error(`Artifact path must be relative: ${value}`);
  }
  if (value.includes("\\")) {
    throw new Error(`Artifact path must use normalized POSIX separators: ${value}`);
  }
  const normalized = posix.normalize(value);
  if (normalized !== value) {
    throw new Error(`Artifact path must be normalized: ${value}`);
  }
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`Artifact path escapes its root: ${value}`);
  }
  return normalized;
}

const SafeRelativePathSchema = z.string().transform((value, ctx) => {
  try {
    return parseSafeRelativePath(value);
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: error instanceof Error ? error.message : String(error),
    });
    return z.NEVER;
  }
});

export const RuntimeValidationCodeSchema = z.enum([
  "MISSING_FILE",
  "INVALID_JSON",
  "MISSING_FIELD",
  "EXTRA_FIELD",
  "TYPE_MISMATCH",
  "UNFILLED_TEMPLATE",
  "SECRET_PATTERN_PRESENT",
  "PROTECTED_FILE_MUTATED",
]);

export const RuntimeExpectedTypeSchema = z.enum([
  "object",
  "array",
  "string",
  "number",
  "boolean",
  "integer",
]);

const RuntimeValidationErrorSchema = z.object({
  code: RuntimeValidationCodeSchema,
  relativePath: SafeRelativePathSchema.optional(),
  jsonPointer: z.string().regex(/^\/(?:[^~\/]|~[01])*(?:\/(?:[^~\/]|~[01])*)*$/).optional(),
  missingField: z.string().regex(/^[A-Za-z_][A-Za-z0-9_.-]*$/).optional(),
  expectedType: RuntimeExpectedTypeSchema.optional(),
}).strict();

export const RuntimeValidationReportSchema = z.object({
  schemaVersion: z.literal("runtime-validation-report/v1"),
  status: z.enum(["pass", "fail"]),
  repairEligible: z.boolean(),
  errors: z.array(RuntimeValidationErrorSchema),
}).strict().superRefine((report, ctx) => {
  if (report.status === "pass" && (report.repairEligible || report.errors.length > 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Passing validation cannot include repair errors" });
  }
  if (report.status === "fail" && report.errors.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Failing validation requires at least one error" });
  }
});

const ArtifactRecordSchema = z.object({
  path: SafeRelativePathSchema,
  kind: z.enum([
    "skill-ir",
    "skill-view",
    "contract",
    "template",
    "checker",
    "validation-policy",
  ]),
  sha256: Sha256Schema,
  targetPath: SafeRelativePathSchema.optional(),
}).strict();

const DigestRefSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict();

export const ArtifactPackageManifestSchema = z.object({
  schemaVersion: z.literal("skill-ir-artifact-package-manifest/v1"),
  catalog: z.literal("executable-artifact/v1"),
  skillId: z.string().min(1),
  provenance: DigestRefSchema,
  contract: DigestRefSchema,
  checker: z.object({
    path: SafeRelativePathSchema,
    timeoutMs: z.number().int().min(1).max(30_000),
  }).strict(),
  generatedOutputs: z.array(SafeRelativePathSchema).min(1),
  artifacts: z.array(ArtifactRecordSchema).min(1),
}).strict();

export const ArtifactPackageProvenanceSchema = z.object({
  schemaVersion: z.literal("skill-ir-artifact-package-provenance/v1"),
  catalog: z.literal("executable-artifact/v1"),
  skillId: z.string().min(1),
  constructionSplit: z.literal("development"),
  source: DigestRefSchema,
  baseIr: DigestRefSchema,
  repairEvidence: DigestRefSchema,
  taskContract: z.object({
    taskIds: z.array(z.string().min(1)).min(1),
    promptDigest: Sha256Schema,
    sha256: Sha256Schema,
  }).strict(),
  compiler: z.object({
    id: z.string().min(1),
    version: z.string().min(1),
    configSha256: Sha256Schema,
  }).strict(),
  predecessors: z.array(DigestRefSchema),
  scope: z.object({
    model: z.string().min(1),
    modelFamily: z.string().min(1),
    adapter: z.string().min(1),
    adapterVersion: z.string().min(1),
    environment: z.string().min(1),
    context: z.string().min(1),
  }).strict(),
  artifacts: z.array(ArtifactRecordSchema).min(1),
}).strict();

export type RuntimeValidationReport = z.infer<typeof RuntimeValidationReportSchema>;
export type ArtifactPackageManifest = z.infer<typeof ArtifactPackageManifestSchema>;
export type ArtifactPackageProvenance = z.infer<typeof ArtifactPackageProvenanceSchema>;
export type ArtifactRecord = z.infer<typeof ArtifactRecordSchema>;

export type ValidatedArtifactPackage = {
  packageDir: string;
  manifest: ArtifactPackageManifest;
  provenance: ArtifactPackageProvenance;
};

async function listFiles(root: string, directory = root): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(root, absolute));
    } else if (entry.isFile()) {
      files.push(relative(root, absolute).replaceAll("\\", "/"));
    } else {
      throw new Error(`Unsupported package entry type: ${relative(root, absolute)}`);
    }
  }
  return files.sort();
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function verifyDigest(root: string, ref: { path: string; sha256: string }): Promise<void> {
  const bytes = await readFile(resolve(root, parseSafeRelativePath(ref.path)));
  const actual = sha256Bytes(bytes);
  if (actual !== ref.sha256) {
    throw new Error(`Artifact digest mismatch for ${ref.path}: expected ${ref.sha256}, got ${actual}`);
  }
}

function stableArtifactIdentity(artifacts: ArtifactRecord[]): string {
  return JSON.stringify(
    artifacts
      .map((artifact) => ({ ...artifact }))
      .sort((left, right) => left.path.localeCompare(right.path)),
  );
}

export async function validateArtifactPackage(opts: {
  packageDir: string;
  expectedCatalog?: "executable-artifact/v1";
}): Promise<ValidatedArtifactPackage> {
  const packageDir = resolve(opts.packageDir);
  const manifest = ArtifactPackageManifestSchema.parse(
    await readJson(resolve(packageDir, "package-manifest.json")),
  );
  if (opts.expectedCatalog && manifest.catalog !== opts.expectedCatalog) {
    throw new Error(`Artifact catalog mismatch: expected ${opts.expectedCatalog}, got ${manifest.catalog}`);
  }

  await verifyDigest(packageDir, manifest.provenance);
  const provenance = ArtifactPackageProvenanceSchema.parse(
    await readJson(resolve(packageDir, manifest.provenance.path)),
  );
  if (manifest.skillId !== provenance.skillId) {
    throw new Error(`Artifact package skill identity mismatch: ${manifest.skillId} != ${provenance.skillId}`);
  }
  if (manifest.catalog !== provenance.catalog) {
    throw new Error(`Artifact package catalog mismatch: ${manifest.catalog} != ${provenance.catalog}`);
  }
  if (stableArtifactIdentity(manifest.artifacts) !== stableArtifactIdentity(provenance.artifacts)) {
    throw new Error("Artifact manifest/provenance artifact identity mismatch");
  }

  const paths = new Set<string>();
  for (const artifact of manifest.artifacts) {
    if (paths.has(artifact.path)) {
      throw new Error(`Duplicate artifact path: ${artifact.path}`);
    }
    paths.add(artifact.path);
    await verifyDigest(packageDir, artifact);
  }
  const contract = manifest.artifacts.find((artifact) => artifact.path === manifest.contract.path);
  if (!contract || contract.kind !== "contract" || contract.sha256 !== manifest.contract.sha256) {
    throw new Error("Manifest contract reference does not identify the declared contract artifact");
  }
  const checker = manifest.artifacts.find((artifact) => artifact.path === manifest.checker.path);
  if (!checker || checker.kind !== "checker") {
    throw new Error("Manifest checker reference does not identify the declared checker artifact");
  }
  for (const output of manifest.generatedOutputs) {
    parseSafeRelativePath(output);
  }

  const allowed = new Set(["package-manifest.json", manifest.provenance.path, ...paths]);
  for (const file of await listFiles(packageDir)) {
    if (!allowed.has(file)) {
      throw new Error(`Undeclared package file: ${file}`);
    }
  }

  return { packageDir, manifest, provenance };
}
