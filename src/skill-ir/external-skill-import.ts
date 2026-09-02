import { lstat, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, posix, relative, resolve } from "node:path";
import { z } from "zod";
import { sha256Bytes } from "../benchmarks/skill-ir/source-fixture";
import { VerifiedArtifactWorkflowConfigSchema, type VerifiedArtifactWorkflowConfig } from "./verified-artifact-product";

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const CommitSchema = z.string().regex(/^[0-9a-f]{40}$/u);
const IdentifierSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u);

/** POSIX relative paths are the portable path ABI used inside an import bundle. */
export const ExternalSkillImportRelativePathSchema = z.string().min(1).max(240).refine((value) => {
  if (value.includes("\\") || value.includes("\0") || isAbsolute(value)) return false;
  const parts = value.split("/");
  return parts.every((part) => part.length > 0 && part !== "." && part !== "..");
}, { message: "path must be a contained POSIX-style relative path" });

const ImportRoleSchema = z.enum([
  "source-skill", "source-closure", "license", "task-description", "automatic-plan",
  "review-patch", "review-dependency", "checker", "checker-dependency", "evidence",
]);

const ImportFileSchema = z.object({
  id: IdentifierSchema,
  root: z.enum(["source", "asset"]),
  inputPath: ExternalSkillImportRelativePathSchema,
  targetPath: ExternalSkillImportRelativePathSchema,
  role: ImportRoleSchema,
}).strict();

const CostValueSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("measured"), value: z.number().nonnegative() }).strict(),
  z.object({ status: z.literal("missing"), value: z.null(), reason: z.string().min(1) }).strict(),
]);

const OriginalRuntimeSchema = z.union([
  z.object({
    status: z.literal("measured"), samples: z.number().int().positive(), aggregateModelTokens: z.number().nonnegative(),
    aggregateDurationMs: z.number().nonnegative().nullable(), durationMissingReason: z.string().min(1).optional(),
    evidenceFileId: IdentifierSchema,
  }).strict().superRefine((value, context) => {
    if (value.aggregateDurationMs === null && !value.durationMissingReason) context.addIssue({ code: "custom", path: ["durationMissingReason"], message: "missing duration requires a reason" });
  }),
  z.object({ status: z.literal("missing"), reason: z.string().min(1) }).strict(),
]);

const QualitySchema = z.union([
  z.object({ mode: z.literal("user-accepted") }).strict(),
  z.object({
    mode: z.literal("machine-checked"), checkerFileId: IdentifierSchema,
    researchDisposition: z.enum(["not-eligible", "eligible-for-authority-review"]),
    researchIneligibilityReason: z.string().min(1).optional(),
  }).strict().superRefine((value, context) => {
    if (value.researchDisposition === "not-eligible" && !value.researchIneligibilityReason) context.addIssue({ code: "custom", path: ["researchIneligibilityReason"], message: "ineligibility requires a reason" });
  }),
]);

const ReferencesSchema = z.object({
  sourceSkillId: IdentifierSchema, licenseFileId: IdentifierSchema, taskDescriptionFileId: IdentifierSchema,
  automaticPlanFileId: IdentifierSchema, reviewPatchFileId: IdentifierSchema,
  reviewDependencyIds: z.array(IdentifierSchema).max(32), checkerFileId: IdentifierSchema.nullable(),
  checkerDependencyIds: z.array(IdentifierSchema).max(32), evidenceFileIds: z.array(IdentifierSchema).max(32),
}).strict();

const AuthoringSchema = z.object({
  measurementStartedAt: z.string().datetime(), measurementCompletedAt: z.string().datetime(), humanMinutes: z.number().int().min(0).max(240),
}).strict().superRefine((value, context) => {
  if (Date.parse(value.measurementCompletedAt) < Date.parse(value.measurementStartedAt)) context.addIssue({ code: "custom", message: "measurement completion precedes start" });
});

export const ExternalSkillImportRecipeSchema = z.object({
  schemaVersion: z.literal("skill-ir-external-skill-import-recipe/v1"), importId: IdentifierSchema, workflowId: IdentifierSchema,
  provenance: z.object({ repository: z.string().url(), commit: CommitSchema, upstreamPath: ExternalSkillImportRelativePathSchema, licenseExpression: z.string().min(1).max(200) }).strict(),
  files: z.array(ImportFileSchema).min(2).max(128), references: ReferencesSchema, taskDescriptionAuthoring: AuthoringSchema,
  review: z.object({ publicInterfacePath: ExternalSkillImportRelativePathSchema, coreBranchDelta: z.literal(0), physicalLoc: z.number().int().positive(), humanMinutes: z.number().nonnegative().nullable(), humanMinutesMissingReason: z.string().min(1).optional() }).strict().superRefine((value, context) => {
    if (value.humanMinutes === null && !value.humanMinutesMissingReason) context.addIssue({ code: "custom", path: ["humanMinutesMissingReason"], message: "missing review minutes require a reason" });
  }),
  production: z.object({ oneTimeModelTokens: CostValueSchema, originalRuntime: OriginalRuntimeSchema }).strict(), quality: QualitySchema,
}).strict().superRefine((recipe, context) => {
  const ids = recipe.files.map((file) => file.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", path: ["files"], message: "file ids must be unique" });
  const targets = recipe.files.map((file) => file.targetPath);
  if (new Set(targets).size !== targets.length) context.addIssue({ code: "custom", path: ["files"], message: "bundle target paths must be unique" });
  const inputs = recipe.files.map((file) => file.root + ":" + file.inputPath);
  if (new Set(inputs).size !== inputs.length) context.addIssue({ code: "custom", path: ["files"], message: "input paths must be unique within each root" });
  const byId = new Map(recipe.files.map((file) => [file.id, file]));
  const role = (id: string, expected: z.infer<typeof ImportRoleSchema>, path: (string | number)[]) => {
    const file = byId.get(id);
    if (!file) context.addIssue({ code: "custom", path, message: "unknown file reference: " + id });
    else if (file.role !== expected) context.addIssue({ code: "custom", path, message: "file " + id + " must have role " + expected });
  };
  role(recipe.references.sourceSkillId, "source-skill", ["references", "sourceSkillId"]);
  role(recipe.references.licenseFileId, "license", ["references", "licenseFileId"]);
  role(recipe.references.taskDescriptionFileId, "task-description", ["references", "taskDescriptionFileId"]);
  role(recipe.references.automaticPlanFileId, "automatic-plan", ["references", "automaticPlanFileId"]);
  role(recipe.references.reviewPatchFileId, "review-patch", ["references", "reviewPatchFileId"]);
  recipe.references.reviewDependencyIds.forEach((id, index) => role(id, "review-dependency", ["references", "reviewDependencyIds", index]));
  if (recipe.references.checkerFileId !== null) role(recipe.references.checkerFileId, "checker", ["references", "checkerFileId"]);
  recipe.references.checkerDependencyIds.forEach((id, index) => role(id, "checker-dependency", ["references", "checkerDependencyIds", index]));
  recipe.references.evidenceFileIds.forEach((id, index) => role(id, "evidence", ["references", "evidenceFileIds", index]));
  if (recipe.quality.mode === "machine-checked") role(recipe.quality.checkerFileId, "checker", ["quality", "checkerFileId"]);
  if (recipe.production.originalRuntime.status === "measured") role(recipe.production.originalRuntime.evidenceFileId, "evidence", ["production", "originalRuntime", "evidenceFileId"]);
  if (recipe.quality.mode === "machine-checked" && recipe.references.checkerFileId !== recipe.quality.checkerFileId) {
    context.addIssue({ code: "custom", path: ["references", "checkerFileId"], message: "machine-checked quality must use the declared checker entry" });
  }
  if (recipe.quality.mode === "user-accepted" && (recipe.references.checkerFileId !== null || recipe.references.checkerDependencyIds.length > 0)) {
    context.addIssue({ code: "custom", path: ["references", "checkerFileId"], message: "user-accepted quality cannot declare a checker closure" });
  }
  if (recipe.production.originalRuntime.status === "measured" && !recipe.references.evidenceFileIds.includes(recipe.production.originalRuntime.evidenceFileId)) {
    context.addIssue({ code: "custom", path: ["references", "evidenceFileIds"], message: "measured runtime evidence must be listed in the evidence closure" });
  }
  for (const [name, values] of Object.entries({
    reviewDependencyIds: recipe.references.reviewDependencyIds,
    checkerDependencyIds: recipe.references.checkerDependencyIds,
    evidenceFileIds: recipe.references.evidenceFileIds,
  })) {
    if (new Set(values).size !== values.length) context.addIssue({ code: "custom", path: ["references", name], message: name + " must not contain duplicates" });
  }
  const requiredIds = new Set([
    recipe.references.sourceSkillId, recipe.references.licenseFileId, recipe.references.taskDescriptionFileId, recipe.references.automaticPlanFileId, recipe.references.reviewPatchFileId,
    ...recipe.references.reviewDependencyIds, ...recipe.references.checkerDependencyIds, ...recipe.references.evidenceFileIds,
    ...(recipe.references.checkerFileId ? [recipe.references.checkerFileId] : []), ...(recipe.quality.mode === "machine-checked" ? [recipe.quality.checkerFileId] : []),
    ...(recipe.production.originalRuntime.status === "measured" ? [recipe.production.originalRuntime.evidenceFileId] : []),
  ]);
  for (const file of recipe.files) if (!requiredIds.has(file.id) && file.role !== "source-closure") context.addIssue({ code: "custom", path: ["files"], message: "unreferenced import file: " + file.id });
});

export type ExternalSkillImportRecipe = z.infer<typeof ExternalSkillImportRecipeSchema>;
export type ExternalSkillImportFile = ExternalSkillImportRecipe["files"][number];

const ManifestFileSchema = z.object({ id: IdentifierSchema, role: ImportRoleSchema, path: ExternalSkillImportRelativePathSchema, bytes: z.number().int().nonnegative(), sha256: Sha256Schema }).strict();
export const ExternalSkillImportManifestSchema = z.object({
  schemaVersion: z.literal("skill-ir-external-skill-import-manifest/v1"), importId: IdentifierSchema, workflowId: IdentifierSchema,
  provenance: z.object({ repository: z.string().url(), commit: CommitSchema, upstreamPath: ExternalSkillImportRelativePathSchema, licenseExpression: z.string().min(1).max(200) }).strict(),
  files: z.array(ManifestFileSchema).min(2).max(256), workflowConfig: z.object({ path: z.literal("workflow-config.json"), bytes: z.number().int().nonnegative(), sha256: Sha256Schema }).strict(), closureSha256: Sha256Schema,
  accounting: z.object({ networkAccesses: z.literal(0), modelCalls: z.literal(0), apiCalls: z.literal(0), paidCalls: z.literal(0), heldOutAccesses: z.literal(0) }).strict(),
  runtime: z.literal("existing-skvm-product-cli-required"), automaticDiscovery: z.literal(false), costRecomputed: z.literal(false),
}).strict().superRefine((manifest, context) => {
  const ids = manifest.files.map((file) => file.id); const paths = manifest.files.map((file) => file.path);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", path: ["files"], message: "manifest file ids must be unique" });
  if (new Set(paths).size !== paths.length) context.addIssue({ code: "custom", path: ["files"], message: "manifest paths must be unique" });
  for (const role of ["source-skill", "license", "task-description", "automatic-plan", "review-patch"] as const) {
    if (manifest.files.filter((file) => file.role === role).length !== 1) context.addIssue({ code: "custom", path: ["files"], message: "manifest requires exactly one " + role + " file" });
  }
  if (manifest.files.filter((file) => file.role === "checker").length > 1) context.addIssue({ code: "custom", path: ["files"], message: "manifest allows at most one checker entry" });
});
export type ExternalSkillImportManifest = z.infer<typeof ExternalSkillImportManifestSchema>;

export function assertContainedImportPath(value: string): string {
  const parsed = ExternalSkillImportRelativePathSchema.parse(value); const normalized = posix.normalize(parsed);
  if (normalized !== parsed || normalized.startsWith("../") || normalized === "..") throw new Error("path escapes import root: " + value);
  return parsed;
}

export type ExternalSkillImportOptions = { recipe: ExternalSkillImportRecipe | unknown; sourceRoot: string; assetRoot: string; out: string };
export type ExternalSkillImportResult = { bundleDir: string; manifest: ExternalSkillImportManifest; workflowConfig: VerifiedArtifactWorkflowConfig };
type DigestRecord = { path: string; bytes: number; sha256: string };

function jsonText(value: unknown): string { return JSON.stringify(value, null, 2) + "\n"; }

async function assertRegularDirectory(path: string, label: string): Promise<void> {
  const info = await lstat(path).catch(() => undefined);
  if (!info || !info.isDirectory() || info.isSymbolicLink()) throw new Error(label + " must be a regular directory");
}

async function assertRegularFile(root: string, relativePath: string, label: string): Promise<string> {
  const safe = assertContainedImportPath(relativePath); const absolute = resolve(root, safe); const rootResolved = resolve(root);
  const fromRoot = relative(rootResolved, absolute);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) throw new Error(label + " escapes root: " + relativePath);
  let cursor = rootResolved;
  for (const segment of safe.split("/")) {
    cursor = join(cursor, segment); const info = await lstat(cursor).catch(() => undefined);
    if (!info) throw new Error("missing declared input: " + relativePath);
    if (info.isSymbolicLink()) throw new Error("symbolic link is forbidden: " + relativePath);
  }
  const info = await lstat(absolute); if (!info.isFile() || info.isSymbolicLink()) throw new Error("declared input must be a regular file: " + relativePath);
  return absolute;
}

function targetFor(file: ExternalSkillImportFile): string {
  const target = assertContainedImportPath(file.targetPath);
  if (file.role.startsWith("source") || file.role === "license") { if (!target.startsWith("source/")) throw new Error("source file target must be under source/: " + target); }
  else if (!target.startsWith("recipe/")) throw new Error("asset file target must be under recipe/: " + target);
  return target;
}

function fileById(recipe: ExternalSkillImportRecipe, id: string): ExternalSkillImportFile {
  const file = recipe.files.find((candidate) => candidate.id === id); if (!file) throw new Error("unknown import file: " + id); return file;
}

function sourceRef(recipe: ExternalSkillImportRecipe, id: string, digests: Map<string, DigestRecord>) {
  const file = fileById(recipe, id); const record = digests.get(file.id)!; return { path: targetFor(file), sha256: record.sha256 };
}

function auditStaticImports(files: Array<{ path: string; role: string; bytes: Buffer }>): void {
  const declared = new Set(files.map((file) => file.path));
  for (const file of files) {
    const text = file.bytes.toString("utf8");
    if (/import\s*\(|require\s*\(/u.test(text)) throw new Error("dynamic import is forbidden: " + file.path);
    const imports: string[] = [];
    for (const line of text.split("\n")) {
      const match = line.match(/(?:from|import)\s*["']([^"']+)["']/u);
      if (match) imports.push(match[1]!);
    }
    for (const imported of imports) {
      if (imported.startsWith("node:") || imported === "zod") continue;
      if (!imported.startsWith(".")) throw new Error("undeclared external import " + imported + " in " + file.path);
      const base = posix.normalize(posix.join(posix.dirname(file.path), imported));
      const candidates = [base, base + ".ts", base + ".tsx", base + ".js", base + ".mjs", base + "/index.ts", base + "/index.js"];
      if (base.startsWith("../") || base === "..") throw new Error("local import escapes bundle: " + imported + " in " + file.path);
      if (!candidates.some((candidate) => declared.has(candidate))) throw new Error("undeclared local import " + imported + " in " + file.path);
    }
  }
}

function verifyWorkflowReferences(manifest: ExternalSkillImportManifest, config: VerifiedArtifactWorkflowConfig): void {
  const rolesByPath = new Map(manifest.files.map((file) => [file.path, file.role]));
  const requireRole = (path: string, role: ExternalSkillImportFile["role"]) => {
    if (rolesByPath.get(path) !== role) throw new Error("workflow reference does not match manifest role: " + path + " expected " + role);
  };
  requireRole(config.source.path, "source-skill");
  requireRole(config.taskDescription.path, "task-description");
  requireRole(config.review.automaticPlan.path, "automatic-plan");
  requireRole(config.review.patch.path, "review-patch");
  for (const dependency of config.review.dependencies) requireRole(dependency.source.path, "review-dependency");
  if (config.production.originalRuntime.status === "measured") requireRole(config.production.originalRuntime.evidence.path, "evidence");
  if (config.quality.mode === "machine-checked") requireRole(config.quality.checker.path, "checker");
}

function assertCompactEvidence(file: ExternalSkillImportFile, bytes: Buffer): void {
  if (file.role !== "evidence") return;
  const lowerPath = file.inputPath.toLowerCase();
  if (!file.targetPath.toLowerCase().endsWith(".json") || /(?:raw|model-run|workdir)/u.test(lowerPath) || /(?:raw|model-run|workdir)/u.test(file.targetPath.toLowerCase())) throw new Error("evidence must be a compact JSON file: " + file.inputPath);
  const text = bytes.toString("utf8"); if (/(?:raw[-_ ]?runs?|model[-_ ]?(?:run|output)|workdir|observation)/iu.test(text)) throw new Error("evidence contains forbidden raw/model/workdir content: " + file.inputPath);
  JSON.parse(text);
}

async function enumerateFiles(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(prefix ? join(root, prefix) : root, { withFileTypes: true }); const files: string[] = [];
  for (const entry of entries) {
    const path = prefix ? prefix + "/" + entry.name : entry.name; const info = await lstat(join(root, path));
    if (info.isSymbolicLink()) throw new Error("symbolic link is forbidden in bundle: " + path);
    if (info.isDirectory()) files.push(...await enumerateFiles(root, path)); else if (info.isFile()) files.push(path); else throw new Error("special filesystem entry is forbidden in bundle: " + path);
  }
  return files.sort((a, b) => a.localeCompare(b, "en"));
}

async function closureDigest(root: string, excluded: string[] = []): Promise<string> {
  const excludedSet = new Set(excluded); const records: Array<{ path: string; sha256: string }> = [];
  for (const path of await enumerateFiles(root)) if (!excludedSet.has(path)) records.push({ path, sha256: sha256Bytes(await readFile(join(root, path))) });
  return sha256Bytes(Buffer.from(JSON.stringify(records), "utf8"));
}

export async function verifyExternalSkillImportBundle(bundleDir: string): Promise<ExternalSkillImportManifest> {
  const root = resolve(bundleDir); await assertRegularDirectory(root, "bundle");
  const manifest = ExternalSkillImportManifestSchema.parse(JSON.parse(await readFile(join(root, "import-manifest.json"), "utf8")));
  const expected = new Set(["workflow-config.json", "import-manifest.json", ...manifest.files.map((file) => file.path)]); const actual = new Set(await enumerateFiles(root));
  if (actual.size !== expected.size || [...actual].some((path) => !expected.has(path))) throw new Error("bundle closure contains missing or extra files");
  const stagedFiles: Array<{ path: string; role: string; bytes: Buffer }> = [];
  for (const file of manifest.files) {
    const bytes = await readFile(join(root, file.path));
    if (bytes.byteLength !== file.bytes || sha256Bytes(bytes) !== file.sha256) throw new Error("bundle file digest mismatch: " + file.path);
    const inputLikeFile = { id: file.id, root: file.role.startsWith("source") || file.role === "license" ? "source" as const : "asset" as const, inputPath: file.path, targetPath: file.path, role: file.role };
    assertCompactEvidence(inputLikeFile, bytes);
    stagedFiles.push({ path: file.path, role: file.role, bytes });
  }
  const configBytes = await readFile(join(root, "workflow-config.json")); if (configBytes.byteLength !== manifest.workflowConfig.bytes || sha256Bytes(configBytes) !== manifest.workflowConfig.sha256) throw new Error("workflow config digest mismatch");
  const config = VerifiedArtifactWorkflowConfigSchema.parse(JSON.parse(configBytes.toString("utf8")));
  verifyWorkflowReferences(manifest, config);
  auditStaticImports(stagedFiles.filter((file) => file.role === "review-patch" || file.role === "review-dependency"));
  auditStaticImports(stagedFiles.filter((file) => file.role === "checker" || file.role === "checker-dependency"));
  if (await closureDigest(root, ["import-manifest.json"]) !== manifest.closureSha256) throw new Error("bundle closure digest mismatch");
  return manifest;
}

export async function importExternalSkill(options: ExternalSkillImportOptions): Promise<ExternalSkillImportResult> {
  const recipe = ExternalSkillImportRecipeSchema.parse(options.recipe); const sourceRoot = resolve(options.sourceRoot); const assetRoot = resolve(options.assetRoot); const out = resolve(options.out);
  await assertRegularDirectory(sourceRoot, "source-root"); await assertRegularDirectory(assetRoot, "asset-root");
  if (await lstat(out).then(() => true).catch(() => false)) throw new Error("output bundle already exists: " + out);
  const staged = await mkdtempSibling(out); const digests = new Map<string, DigestRecord>(); const stagedFiles: Array<{ path: string; role: string; bytes: Buffer }> = [];
  try {
    for (const file of recipe.files) {
      const input = await assertRegularFile(file.root === "source" ? sourceRoot : assetRoot, file.inputPath, file.id); const bytes = await readFile(input); assertCompactEvidence(file, bytes);
      const target = targetFor(file); const targetAbsolute = join(staged, target); await mkdir(dirname(targetAbsolute), { recursive: true }); await writeFile(targetAbsolute, bytes);
      digests.set(file.id, { path: target, bytes: bytes.byteLength, sha256: sha256Bytes(bytes) }); stagedFiles.push({ path: target, role: file.role, bytes });
    }
    auditStaticImports(stagedFiles.filter((file) => file.role === "review-patch" || file.role === "review-dependency"));
    auditStaticImports(stagedFiles.filter((file) => file.role === "checker" || file.role === "checker-dependency"));
    const sourceFile = fileById(recipe, recipe.references.sourceSkillId); const taskFile = fileById(recipe, recipe.references.taskDescriptionFileId); const planFile = fileById(recipe, recipe.references.automaticPlanFileId); const patchFile = fileById(recipe, recipe.references.reviewPatchFileId);
    const config = VerifiedArtifactWorkflowConfigSchema.parse({
      schemaVersion: "skill-ir-verified-artifact-workflow-config/v1", workflowId: recipe.workflowId,
      source: { path: targetFor(sourceFile), sha256: digests.get(sourceFile.id)!.sha256, repository: recipe.provenance.repository, commit: recipe.provenance.commit, upstreamPath: recipe.provenance.upstreamPath },
      taskDescription: { path: targetFor(taskFile), sha256: digests.get(taskFile.id)!.sha256, authoring: recipe.taskDescriptionAuthoring },
      review: { automaticPlan: sourceRef(recipe, planFile.id, digests), patch: sourceRef(recipe, patchFile.id, digests), publicInterfacePath: recipe.review.publicInterfacePath, coreBranchDelta: 0, physicalLoc: recipe.review.physicalLoc, humanMinutes: recipe.review.humanMinutes, ...(recipe.review.humanMinutes === null ? { humanMinutesMissingReason: recipe.review.humanMinutesMissingReason } : {}), packaging: "digest-bound-bundle", dependencies: recipe.references.reviewDependencyIds.map((id) => ({ source: sourceRef(recipe, id, digests) })) },
      production: { oneTimeModelTokens: recipe.production.oneTimeModelTokens, originalRuntime: recipe.production.originalRuntime.status === "measured" ? { status: "measured", samples: recipe.production.originalRuntime.samples, aggregateModelTokens: recipe.production.originalRuntime.aggregateModelTokens, aggregateDurationMs: recipe.production.originalRuntime.aggregateDurationMs, ...(recipe.production.originalRuntime.durationMissingReason ? { durationMissingReason: recipe.production.originalRuntime.durationMissingReason } : {}), evidence: sourceRef(recipe, recipe.production.originalRuntime.evidenceFileId, digests) } : recipe.production.originalRuntime },
      quality: recipe.quality.mode === "machine-checked" ? { mode: "machine-checked", checker: sourceRef(recipe, recipe.quality.checkerFileId, digests), researchDisposition: recipe.quality.researchDisposition, ...(recipe.quality.researchIneligibilityReason ? { researchIneligibilityReason: recipe.quality.researchIneligibilityReason } : {}) } : { mode: "user-accepted" },
    });
    const configText = jsonText(config); await writeFile(join(staged, "workflow-config.json"), configText, "utf8"); const configRecord = { path: "workflow-config.json" as const, bytes: Buffer.byteLength(configText), sha256: sha256Bytes(Buffer.from(configText, "utf8")) };
    const manifestFiles = recipe.files.map((file) => { const record = digests.get(file.id)!; return { id: file.id, role: file.role, path: record.path, bytes: record.bytes, sha256: record.sha256 }; });
    const manifest = ExternalSkillImportManifestSchema.parse({ schemaVersion: "skill-ir-external-skill-import-manifest/v1", importId: recipe.importId, workflowId: recipe.workflowId, provenance: recipe.provenance, files: manifestFiles, workflowConfig: configRecord, closureSha256: await closureDigest(staged), accounting: { networkAccesses: 0, modelCalls: 0, apiCalls: 0, paidCalls: 0, heldOutAccesses: 0 }, runtime: "existing-skvm-product-cli-required", automaticDiscovery: false, costRecomputed: false });
    await writeFile(join(staged, "import-manifest.json"), jsonText(manifest), "utf8"); await verifyExternalSkillImportBundle(staged); await rename(staged, out); return { bundleDir: out, manifest, workflowConfig: config };
  } catch (error) { await rm(staged, { recursive: true, force: true }); throw error; }
}

async function mkdtempSibling(out: string): Promise<string> {
  const parent = dirname(out); await mkdir(parent, { recursive: true }); const base = out + ".staging-" + process.pid + "-" + Date.now() + "-";
  for (let attempt = 0; attempt < 10; attempt += 1) { const candidate = base + attempt; try { await mkdir(candidate); return candidate; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; } }
  throw new Error("unable to allocate staging directory");
}
