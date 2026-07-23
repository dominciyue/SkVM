import { lstat, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  SafeRelativePathSchema,
  Sha256Schema,
  parseSafeRelativePath,
} from "./artifact-package";
import { sha256Bytes } from "./source-fixture";

const IdentifierSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const EnvironmentNameSchema = z.string().regex(/^[A-Z_][A-Z0-9_]*$/);
const FallbackExecutableSchema = z.string().regex(/^[A-Za-z0-9._-]+$/);
const ArgumentSchema = z.string().max(4096).superRefine((value, ctx) => {
  if (/[\u0000\r\n]/u.test(value)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Arguments cannot contain control lines" });
  }
  const placeholders = value.match(/\{[^}]+\}/gu) ?? [];
  const validPlaceholder = /^(?:\{workdir\}|\{artifact:[a-z][a-z0-9-]{0,63}\}|\{env:[A-Z_][A-Z0-9_]*\})$/u;
  if (placeholders.some((placeholder) => !validPlaceholder.test(placeholder))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Unknown execution-plan placeholder" });
  }
  if (placeholders.length > 0 && (placeholders.length !== 1 || placeholders[0] !== value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Execution-plan placeholders must occupy the complete argument",
    });
  }
});

const DigestRefSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict();

export const ValidatedArtifactRecordSchema = z.object({
  id: IdentifierSchema,
  path: SafeRelativePathSchema,
  kind: z.enum([
    "skill-ir",
    "skill-view",
    "script",
    "template",
    "schema",
    "check",
    "tool-plan",
    "validation-policy",
    "validation-notes",
  ]),
  sha256: Sha256Schema,
}).strict();

const NodeCommandSchema = z.object({
  interpreter: z.object({
    env: EnvironmentNameSchema,
    fallback: FallbackExecutableSchema,
  }).strict(),
  artifactId: IdentifierSchema,
  args: z.array(ArgumentSchema),
  envAllowlist: z.array(EnvironmentNameSchema),
}).strict().superRefine((command, ctx) => {
  if (!command.envAllowlist.includes(command.interpreter.env)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["envAllowlist"],
      message: "Interpreter environment must be included in envAllowlist",
    });
  }
  if (new Set(command.envAllowlist).size !== command.envAllowlist.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["envAllowlist"],
      message: "Environment allowlist entries must be unique",
    });
  }
  for (const [index, argument] of command.args.entries()) {
    const match = /^\{env:([A-Z_][A-Z0-9_]*)\}$/u.exec(argument);
    if (match && !command.envAllowlist.includes(match[1]!)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["args", index],
        message: `Environment placeholder is not allowlisted: ${match[1]}`,
      });
    }
  }
});

const ExecutionNodeBaseSchema = z.object({
  id: IdentifierSchema,
  dependsOn: z.array(IdentifierSchema),
  command: NodeCommandSchema,
  timeoutMs: z.number().int().min(1).max(300_000),
});

export const ValidatedArtifactExecutionNodeSchema = z.discriminatedUnion("kind", [
  ExecutionNodeBaseSchema.extend({ kind: z.literal("process") }).strict(),
  ExecutionNodeBaseSchema.extend({ kind: z.literal("validate") }).strict(),
]);

export const ValidatedArtifactExecutionPlanSchema = z.object({
  schemaVersion: z.literal("skill-artifact-execution-plan/v1"),
  entrypoint: IdentifierSchema,
  nodes: z.array(ValidatedArtifactExecutionNodeSchema).min(1),
}).strict().superRefine((plan, ctx) => {
  const ids = new Set<string>();
  for (const [index, node] of plan.nodes.entries()) {
    if (ids.has(node.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nodes", index, "id"],
        message: `Duplicate execution node id: ${node.id}`,
      });
    }
    ids.add(node.id);
  }
  if (!ids.has(plan.entrypoint)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["entrypoint"],
      message: `Unknown execution entrypoint: ${plan.entrypoint}`,
    });
  }
  for (const [index, node] of plan.nodes.entries()) {
    if (new Set(node.dependsOn).size !== node.dependsOn.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nodes", index, "dependsOn"],
        message: "Execution dependencies must be unique",
      });
    }
    for (const dependency of node.dependsOn) {
      if (!ids.has(dependency) || dependency === node.id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nodes", index, "dependsOn"],
          message: `Unknown or self execution dependency: ${dependency}`,
        });
      }
    }
  }

  const nodesById = new Map(plan.nodes.map((node) => [node.id, node]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    const node = nodesById.get(id);
    if (node && node.dependsOn.some((dependency) => !visit(dependency))) return false;
    visiting.delete(id);
    visited.add(id);
    return true;
  };
  for (const node of plan.nodes) {
    if (!visit(node.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Execution plan contains a cycle" });
      break;
    }
  }
});

export const ValidatedArtifactManifestSchema = z.object({
  schemaVersion: z.literal("validated-skill-artifact-manifest/v1"),
  catalog: z.literal("validated-skill-artifact/v1"),
  skillId: IdentifierSchema,
  provenance: DigestRefSchema,
  executionPlan: DigestRefSchema,
  protectedInputs: z.array(SafeRelativePathSchema).min(1),
  generatedOutputs: z.array(SafeRelativePathSchema).min(1),
  artifacts: z.array(ValidatedArtifactRecordSchema).min(1),
}).strict().superRefine((manifest, ctx) => {
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const [index, artifact] of manifest.artifacts.entries()) {
    if (ids.has(artifact.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["artifacts", index, "id"],
        message: `Duplicate artifact id: ${artifact.id}`,
      });
    }
    if (paths.has(artifact.path)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["artifacts", index, "path"],
        message: `Duplicate artifact path: ${artifact.path}`,
      });
    }
    ids.add(artifact.id);
    paths.add(artifact.path);
  }
  const protectedSet = new Set(manifest.protectedInputs);
  if (manifest.generatedOutputs.some((path) => protectedSet.has(path))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["generatedOutputs"],
      message: "Generated outputs cannot also be protected inputs",
    });
  }
});

export const ValidatedArtifactProvenanceSchema = z.object({
  schemaVersion: z.literal("validated-skill-artifact-provenance/v1"),
  catalog: z.literal("validated-skill-artifact/v1"),
  skillId: IdentifierSchema,
  constructionSplit: z.literal("development"),
  compiler: z.object({
    id: IdentifierSchema,
    version: z.string().regex(/^v[1-9][0-9]*$/),
    configSha256: Sha256Schema,
  }).strict(),
  inputs: z.object({
    sourceClosure: z.array(DigestRefSchema).min(1),
    baseIr: DigestRefSchema,
    sourceAudit: DigestRefSchema,
    resourceContract: DigestRefSchema,
    taskContract: z.object({
      taskIds: z.array(IdentifierSchema).min(1),
      promptDigest: Sha256Schema,
    }).strict(),
  }).strict(),
  forbiddenEvidenceClasses: z.tuple([
    z.literal("evaluator-payload"),
    z.literal("held-out"),
    z.literal("runtime-output"),
    z.literal("profile-feedback"),
    z.literal("secret-value"),
  ]),
  artifacts: z.array(ValidatedArtifactRecordSchema).min(1),
}).strict();

export type ValidatedArtifactRecord = z.infer<typeof ValidatedArtifactRecordSchema>;
export type ValidatedArtifactExecutionPlan = z.infer<typeof ValidatedArtifactExecutionPlanSchema>;
export type ValidatedArtifactManifest = z.infer<typeof ValidatedArtifactManifestSchema>;
export type ValidatedArtifactProvenance = z.infer<typeof ValidatedArtifactProvenanceSchema>;

export type ValidatedArtifactPackage = {
  packageDir: string;
  manifest: ValidatedArtifactManifest;
  provenance: ValidatedArtifactProvenance;
  executionPlan: ValidatedArtifactExecutionPlan;
  packageBytes: number;
};

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function verifyDigest(packageDir: string, ref: { path: string; sha256: string }): Promise<number> {
  const bytes = await readFile(join(packageDir, parseSafeRelativePath(ref.path)));
  const actual = sha256Bytes(bytes);
  if (actual !== ref.sha256) {
    throw new Error(`Artifact digest mismatch for ${ref.path}: expected ${ref.sha256}, got ${actual}`);
  }
  return bytes.byteLength;
}

async function listPackageFiles(root: string, current = ""): Promise<string[]> {
  const directory = join(root, current);
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relativePath = current ? `${current}/${entry.name}` : entry.name;
    const info = await lstat(join(root, relativePath));
    if (info.isSymbolicLink()) {
      throw new Error(`Artifact package cannot contain symbolic links: ${relativePath}`);
    }
    if (info.isDirectory()) {
      files.push(...await listPackageFiles(root, relativePath));
    } else if (info.isFile()) {
      files.push(relativePath);
    } else {
      throw new Error(`Artifact package contains an unsupported file: ${relativePath}`);
    }
  }
  return files.sort();
}

function stableRecords(records: ValidatedArtifactRecord[]): string {
  return JSON.stringify([...records].sort((a, b) => a.id.localeCompare(b.id)));
}

export async function validateValidatedArtifactPackage(
  packageDir: string,
): Promise<ValidatedArtifactPackage> {
  const manifest = ValidatedArtifactManifestSchema.parse(
    await readJson(join(packageDir, "package-manifest.json")),
  );
  const provenance = ValidatedArtifactProvenanceSchema.parse(
    await readJson(join(packageDir, manifest.provenance.path)),
  );
  const executionPlan = ValidatedArtifactExecutionPlanSchema.parse(
    await readJson(join(packageDir, manifest.executionPlan.path)),
  );

  if (manifest.skillId !== provenance.skillId || manifest.catalog !== provenance.catalog) {
    throw new Error("Artifact manifest/provenance identity mismatch");
  }
  if (stableRecords(manifest.artifacts) !== stableRecords(provenance.artifacts)) {
    throw new Error("Artifact manifest/provenance record mismatch");
  }

  const artifactsById = new Map(manifest.artifacts.map((artifact) => [artifact.id, artifact]));
  for (const node of executionPlan.nodes) {
    const artifact = artifactsById.get(node.command.artifactId);
    if (!artifact) {
      throw new Error(`Execution node ${node.id} references undeclared artifact ${node.command.artifactId}`);
    }
    const expectedKind = node.kind === "validate" ? "check" : "script";
    if (artifact.kind !== expectedKind) {
      throw new Error(
        `Execution node ${node.id} requires ${expectedKind} artifact, got ${artifact.kind}`,
      );
    }
    for (const argument of node.command.args) {
      const match = /^\{artifact:([a-z][a-z0-9-]{0,63})\}$/u.exec(argument);
      if (match && !artifactsById.has(match[1]!)) {
        throw new Error(
          `Execution node ${node.id} references undeclared argument artifact ${match[1]}`,
        );
      }
    }
  }

  let packageBytes = await verifyDigest(packageDir, manifest.provenance);
  packageBytes += await verifyDigest(packageDir, manifest.executionPlan);
  for (const artifact of manifest.artifacts) {
    packageBytes += await verifyDigest(packageDir, artifact);
  }
  const manifestBytes = await readFile(join(packageDir, "package-manifest.json"));
  packageBytes += manifestBytes.byteLength;

  const declared = new Set([
    "package-manifest.json",
    manifest.provenance.path,
    manifest.executionPlan.path,
    ...manifest.artifacts.map((artifact) => artifact.path),
  ]);
  const actual = await listPackageFiles(packageDir);
  const undeclared = actual.filter((path) => !declared.has(path));
  const missing = [...declared].filter((path) => !actual.includes(path));
  if (undeclared.length > 0) {
    throw new Error(`Artifact package contains undeclared file(s): ${undeclared.join(", ")}`);
  }
  if (missing.length > 0) {
    throw new Error(`Artifact package is missing declared file(s): ${missing.join(", ")}`);
  }

  return { packageDir, manifest, provenance, executionPlan, packageBytes };
}
