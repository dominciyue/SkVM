import { mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { z } from "zod"
import { SkillIRSchema } from "../../skill-ir/schema"
import { SkillIRSourceAuditSchema, verifySkillIRSourceAudit } from "../../skill-ir/source-audit"
import { validateSkillIR } from "../../skill-ir/validate"
import { parseSafeRelativePath } from "./artifact-package"
import { BidsTaskSetSchema, loadBidsSourceRules } from "./bids-contract"
import { ResourceContractSchema } from "./resource-contract"
import { sha256Bytes } from "./source-fixture"
import {
  assembleValidatedArtifactPackage,
  type ValidatedArtifactAssemblyAdapter,
} from "./validated-artifact-assembly"

const DigestRefSchema = z.object({
  path: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/u),
}).strict()

export const BidsArtifactAdapterSchema = z.object({
  schemaVersion: z.literal("skill-ir-bids-artifact-adapter/v1"),
  catalog: z.literal("validated-skill-artifact/v1"),
  adapterId: z.literal("bids-source-derived-audit"),
  version: z.literal("v1"),
  interfacePath: z.literal("bids-audit-interface.json"),
  protectedInputs: z.tuple([
    z.literal("dataset-manifest.json"),
    z.literal("bids-audit-interface.json"),
  ]),
  outputs: z.tuple([z.literal("bids-audit.json")]),
  sourceRules: z.object({
    schema: z.literal("references/bids_schema.json"),
    metadata: z.literal("references/metadata_fields.md"),
  }).strict(),
  resourcePolicy: z.object({
    network: z.literal("forbidden"),
    packageInstall: z.literal("forbidden"),
    shell: z.literal(false),
  }).strict(),
}).strict()

const CompilerInputSchema = z.object({
  rootDir: z.string().min(1),
  sourceFiles: z.array(DigestRefSchema).min(8),
  publicContract: DigestRefSchema,
  adapter: DigestRefSchema,
  baseIr: DigestRefSchema,
  sourceAudit: DigestRefSchema,
  resourceContract: DigestRefSchema,
  taskContract: DigestRefSchema,
}).strict()

export type BidsArtifactCompilerInput = z.infer<typeof CompilerInputSchema>

const PILOT_DIR = "benchmarks/skill-ir/pilots/bids"
const SOURCE_CLOSURE = [
  `${PILOT_DIR}/source/LICENSE.repository.md`,
  `${PILOT_DIR}/source/SKILL.md`,
  `${PILOT_DIR}/source/references/beps.yml`,
  `${PILOT_DIR}/source/references/bids_schema.json`,
  `${PILOT_DIR}/source/references/bids_specification.md`,
  `${PILOT_DIR}/source/references/conversion_tools.md`,
  `${PILOT_DIR}/source/references/metadata_fields.md`,
  `${PILOT_DIR}/source/scripts/update_schema.py`,
] as const

async function digestRef(rootDir: string, relativePath: string) {
  const safe = parseSafeRelativePath(relativePath)
  return { path: safe, sha256: sha256Bytes(await readFile(path.join(rootDir, safe))) }
}

async function verifiedBytes(rootDir: string, ref: { path: string; sha256: string }): Promise<Buffer> {
  const safe = parseSafeRelativePath(ref.path)
  const bytes = await readFile(path.join(rootDir, safe))
  if (sha256Bytes(bytes) !== ref.sha256) throw new Error(`BIDS compiler digest mismatch for ${safe}`)
  return bytes
}

async function bundleRuntime(rootDir: string, config: unknown): Promise<Uint8Array> {
  const temporary = await mkdtemp(path.join(tmpdir(), "skvm-bids-runtime-bundle-"))
  try {
    const built = await Bun.build({
      entrypoints: [path.join(rootDir, "src/benchmarks/skill-ir/bids-artifact-runtime.ts")],
      root: rootDir,
      outdir: temporary,
      target: "node",
      format: "esm",
      sourcemap: "none",
      minify: { identifiers: false, syntax: true, whitespace: true },
      define: { __BIDS_RUNTIME_CONFIG__: JSON.stringify(config) },
    })
    if (!built.success || built.outputs.length !== 1) {
      throw new Error(`BIDS runtime bundle failed: ${built.logs.map(String).join("; ")}`)
    }
    return new Uint8Array(await built.outputs[0]!.arrayBuffer())
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

export async function loadBidsArtifactCompilerInput(rootDir: string): Promise<BidsArtifactCompilerInput> {
  return CompilerInputSchema.parse({
    rootDir,
    sourceFiles: await Promise.all(SOURCE_CLOSURE.map((relativePath) => digestRef(rootDir, relativePath))),
    publicContract: await digestRef(rootDir, `${PILOT_DIR}/public-interface.json`),
    adapter: await digestRef(rootDir, `${PILOT_DIR}/artifact-adapter.json`),
    baseIr: await digestRef(rootDir, `${PILOT_DIR}/base-ir.json`),
    sourceAudit: await digestRef(rootDir, `${PILOT_DIR}/base-ir-source-audit.json`),
    resourceContract: await digestRef(rootDir, `${PILOT_DIR}/resource-contract.json`),
    taskContract: await digestRef(rootDir, `${PILOT_DIR}/development/tasks.json`),
  })
}

export async function compileBidsValidatedArtifact(
  rawInput: BidsArtifactCompilerInput,
  outDir: string,
): Promise<void> {
  const input = CompilerInputSchema.parse(rawInput)
  const [sourceBytes, publicBytes, adapterBytes, baseIrBytes, sourceAuditBytes, resourceBytes, tasksBytes] = await Promise.all([
    Promise.all(input.sourceFiles.map((ref) => verifiedBytes(input.rootDir, ref))),
    verifiedBytes(input.rootDir, input.publicContract),
    verifiedBytes(input.rootDir, input.adapter),
    verifiedBytes(input.rootDir, input.baseIr),
    verifiedBytes(input.rootDir, input.sourceAudit),
    verifiedBytes(input.rootDir, input.resourceContract),
    verifiedBytes(input.rootDir, input.taskContract),
  ])
  const ir = SkillIRSchema.parse(JSON.parse(baseIrBytes.toString("utf8")))
  if (ir.id !== "bids" || ir.profile.length !== 0) throw new Error("BIDS compiler requires the profile-empty BIDS IR")
  const validation = validateSkillIR(ir)
  if (validation.errors.length > 0 || validation.warnings.length > 0) {
    throw new Error(`BIDS base IR validation failed: ${[...validation.errors, ...validation.warnings].join("; ")}`)
  }
  const sourceAudit = SkillIRSourceAuditSchema.parse(JSON.parse(sourceAuditBytes.toString("utf8")))
  const auditReport = await verifySkillIRSourceAudit(ir, sourceAudit, input.rootDir)
  if (auditReport.errors.length > 0 || auditReport.warnings.length > 0) {
    throw new Error(`BIDS source audit failed: ${[...auditReport.errors, ...auditReport.warnings].join("; ")}`)
  }
  const adapter = BidsArtifactAdapterSchema.parse(JSON.parse(adapterBytes.toString("utf8")))
  const resource = ResourceContractSchema.parse(JSON.parse(resourceBytes.toString("utf8")))
  const tasks = BidsTaskSetSchema.parse(JSON.parse(tasksBytes.toString("utf8")))
  const publicContract = JSON.parse(publicBytes.toString("utf8")) as {
    protectedInputs?: unknown
    outputs?: unknown
  }
  if (JSON.stringify(publicContract.protectedInputs) !== JSON.stringify(adapter.protectedInputs)
    || JSON.stringify(publicContract.outputs) !== JSON.stringify(adapter.outputs)) {
    throw new Error("BIDS adapter and public output contract drift")
  }
  const sourceRules = await loadBidsSourceRules(input.rootDir)
  const runtime = await bundleRuntime(input.rootDir, {
    protectedInputs: adapter.protectedInputs,
    outputs: adapter.outputs,
    sourceRules,
  })
  const executionPlan: ValidatedArtifactAssemblyAdapter["executionPlan"] = {
    schemaVersion: "skill-artifact-execution-plan/v1",
    entrypoint: "validate-bids-audit",
    nodes: [
      {
        id: "generate-bids-audit",
        kind: "process",
        dependsOn: [],
        command: {
          interpreter: { env: resource.interpreter.env, fallback: resource.interpreter.fallbackCommand },
          artifactId: "bids-audit-runtime",
          args: ["generate", "--workdir", "{workdir}"],
          envAllowlist: [resource.interpreter.env],
        },
        timeoutMs: 30_000,
      },
      {
        id: "validate-bids-audit",
        kind: "validate",
        dependsOn: ["generate-bids-audit"],
        command: {
          interpreter: { env: resource.interpreter.env, fallback: resource.interpreter.fallbackCommand },
          artifactId: "bids-audit-check",
          args: ["validate", "--workdir", "{workdir}"],
          envAllowlist: [resource.interpreter.env],
        },
        timeoutMs: 30_000,
      },
    ],
  }
  const compilerConfig = {
    adapter,
    sourceRules,
    resource: { interpreter: resource.interpreter, network: resource.network, packageInstall: resource.packageInstall },
  }
  const assemblyAdapter: ValidatedArtifactAssemblyAdapter = {
    schemaVersion: "validated-artifact-assembly-adapter/v1",
    catalog: "validated-skill-artifact/v1",
    skillId: "bids",
    adapterId: adapter.adapterId,
    version: adapter.version,
    compiler: {
      id: "bids-artifact-compiler",
      version: "v1",
      configSha256: sha256Bytes(Buffer.from(JSON.stringify(compilerConfig), "utf8")),
    },
    protectedInputs: adapter.protectedInputs,
    generatedOutputs: adapter.outputs,
    executionPlan,
    artifactLayout: [
      { id: "skill-ir", path: "skill-ir.json", kind: "skill-ir" },
      { id: "skill-view", path: "skill.md", kind: "skill-view" },
      { id: "bids-audit-runtime", path: "artifacts/scripts/bids-audit.mjs", kind: "script" },
      { id: "bids-audit-check", path: "artifacts/checks/bids-audit-check.mjs", kind: "check" },
      { id: "bids-audit-interface", path: "artifacts/schemas/bids-audit-interface.json", kind: "schema" },
      { id: "bids-validation-policy", path: "validation-policy.json", kind: "validation-policy" },
      { id: "bids-validation-notes", path: "validation-notes.json", kind: "validation-notes" },
    ],
  }
  const promptProjection = tasks.tasks.map((task) => ({ id: task.id, prompt: task.prompt }))
    .sort((left, right) => left.id.localeCompare(right.id))
  const skillSource = sourceBytes[input.sourceFiles.findIndex((ref) => ref.path.endsWith("/source/SKILL.md"))]
  if (!skillSource) throw new Error("BIDS source closure is missing SKILL.md")
  await assembleValidatedArtifactPackage({
    adapter: assemblyAdapter,
    provenanceInputs: {
      sourceClosure: input.sourceFiles.map((ref) => ({ path: parseSafeRelativePath(ref.path), sha256: ref.sha256 })),
      baseIr: { path: parseSafeRelativePath(input.baseIr.path), sha256: input.baseIr.sha256 },
      sourceAudit: { path: parseSafeRelativePath(input.sourceAudit.path), sha256: input.sourceAudit.sha256 },
      resourceContract: { path: parseSafeRelativePath(input.resourceContract.path), sha256: input.resourceContract.sha256 },
      taskContract: {
        taskIds: promptProjection.map((task) => task.id),
        promptDigest: sha256Bytes(Buffer.from(JSON.stringify(promptProjection), "utf8")),
      },
    },
    artifactPayloads: [
      { id: "skill-ir", bytes: baseIrBytes },
      { id: "skill-view", bytes: `# BIDS - Compiled Artifact View\n\nDeterministic audit from source-bound entity ordering and metadata inheritance. Network and package installation are forbidden.\n\n${skillSource.toString("utf8").split(/\r?\n/u).find((line) => line.startsWith("# ")) ?? ""}\n` },
      { id: "bids-audit-runtime", bytes: runtime },
      { id: "bids-audit-check", bytes: runtime },
      { id: "bids-audit-interface", bytes: publicBytes },
      { id: "bids-validation-policy", bytes: `${JSON.stringify({ schemaVersion: "bids-artifact-validation-policy/v1", protectedInputs: adapter.protectedInputs, generatedOutputs: adapter.outputs, scorerAuthority: "skill-ir-bids", sourceRules: adapter.sourceRules }, null, 2)}\n` },
      { id: "bids-validation-notes", bytes: `${JSON.stringify({ schemaVersion: "skill-artifact-validation-notes/v1", status: "candidate", developmentGatePassed: false, heldOutExecutionAllowed: false, entersMainClaim: false, modelGenerationTokens: 0 }, null, 2)}\n` },
    ],
  }, outDir)
  if ((await readdir(outDir)).length === 0) throw new Error("BIDS artifact package was not created")
}
