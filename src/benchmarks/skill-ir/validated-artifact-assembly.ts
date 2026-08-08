import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { SafeRelativePathSchema } from "./artifact-package";
import { sha256Bytes } from "./source-fixture";
import {
  ValidatedArtifactExecutionPlanSchema,
  ValidatedArtifactProvenanceSchema,
  ValidatedArtifactRecordSchema,
  validateValidatedArtifactPackage,
  type ValidatedArtifactExecutionPlan,
  type ValidatedArtifactPackage,
  type ValidatedArtifactRecord,
} from "./validated-artifact-catalog";

const IdentifierSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const VersionSchema = z.string().regex(/^v[1-9][0-9]*$/);
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const ArtifactLayoutRecordSchema = ValidatedArtifactRecordSchema.omit({ sha256: true });
const ProvenanceInputsSchema = ValidatedArtifactProvenanceSchema.shape.inputs;
const META_PATHS = new Set([
  "execution-plan.json",
  "package-manifest.json",
  "package-provenance.json",
]);

export const ValidatedArtifactAssemblyAdapterSchema = z.object({
  schemaVersion: z.literal("validated-artifact-assembly-adapter/v1"),
  catalog: z.literal("validated-skill-artifact/v1"),
  skillId: IdentifierSchema,
  adapterId: IdentifierSchema,
  version: VersionSchema,
  compiler: z.object({
    id: IdentifierSchema,
    version: VersionSchema,
    configSha256: Sha256Schema,
  }).strict(),
  protectedInputs: z.array(SafeRelativePathSchema).min(1),
  generatedOutputs: z.array(SafeRelativePathSchema).min(1),
  executionPlan: ValidatedArtifactExecutionPlanSchema,
  artifactLayout: z.array(ArtifactLayoutRecordSchema).min(2),
}).strict().superRefine((adapter, ctx) => {
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const [index, artifact] of adapter.artifactLayout.entries()) {
    if (ids.has(artifact.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["artifactLayout", index, "id"],
        message: `Duplicate artifact id: ${artifact.id}`,
      });
    }
    if (paths.has(artifact.path) || META_PATHS.has(artifact.path)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["artifactLayout", index, "path"],
        message: `Duplicate or reserved artifact path: ${artifact.path}`,
      });
    }
    ids.add(artifact.id);
    paths.add(artifact.path);
  }

  const coreRecords = [
    ["skill-ir", "skill-ir.json", "skill-ir"],
    ["skill-view", "skill.md", "skill-view"],
  ] as const;
  for (const [id, path, kind] of coreRecords) {
    const record = adapter.artifactLayout.find((artifact) => artifact.id === id);
    if (!record || record.path !== path || record.kind !== kind) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["artifactLayout"],
        message: `Assembly adapter requires ${id} at ${path} with kind ${kind}`,
      });
    }
  }

  for (const [index, node] of adapter.executionPlan.nodes.entries()) {
    const commandArtifact = adapter.artifactLayout.find(
      (artifact) => artifact.id === node.command.artifactId,
    );
    const expectedKind = node.kind === "validate" ? "check" : "script";
    if (!commandArtifact || commandArtifact.kind !== expectedKind) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["executionPlan", "nodes", index, "command", "artifactId"],
        message: `Execution node ${node.id} requires declared ${expectedKind} artifact ${node.command.artifactId}`,
      });
    }
    for (const [argumentIndex, argument] of node.command.args.entries()) {
      const match = /^\{artifact:([a-z][a-z0-9-]{0,63})\}$/u.exec(argument);
      if (match && !ids.has(match[1]!)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["executionPlan", "nodes", index, "command", "args", argumentIndex],
          message: `Execution node ${node.id} references undeclared artifact ${match[1]}`,
        });
      }
    }
  }
});

const ArtifactPayloadSchema = z.object({
  id: IdentifierSchema,
  bytes: z.union([
    z.string(),
    z.custom<Uint8Array<ArrayBufferLike>>((value) => value instanceof Uint8Array),
  ]),
}).strict();

export const ValidatedArtifactAssemblyInputSchema = z.object({
  adapter: ValidatedArtifactAssemblyAdapterSchema,
  provenanceInputs: ProvenanceInputsSchema,
  artifactPayloads: z.array(ArtifactPayloadSchema).min(2),
}).strict();

export type ValidatedArtifactAssemblyAdapter = z.infer<
  typeof ValidatedArtifactAssemblyAdapterSchema
>;
export type ValidatedArtifactAssemblyInput = z.input<
  typeof ValidatedArtifactAssemblyInputSchema
>;

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function ensureEmptyOutputDirectory(outDir: string): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const pending = [outDir];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        throw new Error(`Artifact output directory must not contain files: ${outDir}`);
      }
      pending.push(join(directory, entry.name));
    }
  }
}

function payloadMap(
  layout: Array<z.infer<typeof ArtifactLayoutRecordSchema>>,
  payloads: Array<z.infer<typeof ArtifactPayloadSchema>>,
): Map<string, Uint8Array> {
  const byId = new Map<string, Uint8Array>();
  for (const payload of payloads) {
    if (byId.has(payload.id)) throw new Error(`Duplicate artifact payload: ${payload.id}`);
    byId.set(
      payload.id,
      typeof payload.bytes === "string" ? Buffer.from(payload.bytes, "utf8") : payload.bytes,
    );
  }
  const layoutIds = new Set(layout.map((artifact) => artifact.id));
  const missing = layout.filter((artifact) => !byId.has(artifact.id)).map((artifact) => artifact.id);
  const extra = [...byId.keys()].filter((id) => !layoutIds.has(id));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `Artifact payload mismatch; missing=[${missing.join(", ")}], extra=[${extra.join(", ")}]`,
    );
  }
  return byId;
}

async function writeArtifact(
  outDir: string,
  record: z.infer<typeof ArtifactLayoutRecordSchema>,
  bytes: Uint8Array,
): Promise<ValidatedArtifactRecord> {
  const target = join(outDir, record.path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return { ...record, sha256: sha256Bytes(bytes) };
}

export async function assembleValidatedArtifactPackage(
  rawInput: ValidatedArtifactAssemblyInput,
  outDir: string,
): Promise<ValidatedArtifactPackage> {
  const input = ValidatedArtifactAssemblyInputSchema.parse(rawInput);
  // The schema validates the plan, while serialization preserves the caller's
  // already-validated property order so shadow migration cannot drift digests.
  const executionPlan = rawInput.adapter.executionPlan as ValidatedArtifactExecutionPlan;
  const payloads = payloadMap(input.adapter.artifactLayout, input.artifactPayloads);
  await ensureEmptyOutputDirectory(outDir);

  const artifacts: ValidatedArtifactRecord[] = [];
  for (const layoutRecord of input.adapter.artifactLayout) {
    artifacts.push(await writeArtifact(outDir, layoutRecord, payloads.get(layoutRecord.id)!));
  }

  const executionText = jsonText(executionPlan);
  await writeFile(join(outDir, "execution-plan.json"), executionText, "utf8");
  const provenance = ValidatedArtifactProvenanceSchema.parse({
    schemaVersion: "validated-skill-artifact-provenance/v1",
    catalog: input.adapter.catalog,
    skillId: input.adapter.skillId,
    constructionSplit: "development",
    compiler: input.adapter.compiler,
    inputs: input.provenanceInputs,
    forbiddenEvidenceClasses: [
      "evaluator-payload",
      "held-out",
      "runtime-output",
      "profile-feedback",
      "secret-value",
    ],
    artifacts,
  });
  const provenanceText = jsonText(provenance);
  await writeFile(join(outDir, "package-provenance.json"), provenanceText, "utf8");
  const manifest = {
    schemaVersion: "validated-skill-artifact-manifest/v1" as const,
    catalog: input.adapter.catalog,
    skillId: input.adapter.skillId,
    provenance: {
      path: "package-provenance.json",
      sha256: sha256Bytes(Buffer.from(provenanceText, "utf8")),
    },
    executionPlan: {
      path: "execution-plan.json",
      sha256: sha256Bytes(Buffer.from(executionText, "utf8")),
    },
    protectedInputs: input.adapter.protectedInputs,
    generatedOutputs: input.adapter.generatedOutputs,
    artifacts,
  };
  await writeFile(join(outDir, "package-manifest.json"), jsonText(manifest), "utf8");
  return validateValidatedArtifactPackage(outDir);
}
