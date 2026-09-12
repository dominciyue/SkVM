import { createHash } from "node:crypto"
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { basename, dirname, isAbsolute, join, relative, resolve, sep, toNamespacedPath } from "node:path"
import { fileURLToPath } from "node:url"
import { z } from "zod"
import {
  SafeRelativePathSchema,
  Sha256Schema,
  parseSafeRelativePath,
} from "../benchmarks/skill-ir/artifact-package.ts"
import { API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID_V2 } from "../skill-ir/api-tester-production-contract-v2.ts"
import { OptimizeSubmissionSchema } from "./types.ts"

export const TRACE_GUIDED_SKILL_PACKAGE_SCHEMA_VERSION =
  "skvm-trace-guided-skill-package/v1" as const

const DigestRefSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
  bytes: z.number().int().nonnegative(),
}).strict()

const ExcludedProposalFileSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: Sha256Schema.optional(),
  reason: z.enum([
    "undeclared-round-only-file",
    "undeclared-modification-reverted",
    "undeclared-deletion-restored",
  ]),
}).strict()

export const TraceGuidedSkillPackageManifestSchema = z.object({
  schemaVersion: z.literal(TRACE_GUIDED_SKILL_PACKAGE_SCHEMA_VERSION),
  identity: z.literal("trace-guided-api-tester-partial-solidification-development-v1"),
  packageUsable: z.literal(true),
  solidificationApplied: z.literal(true),
  documentChangesApplied: z.boolean(),
  effect: z.literal("not-measured"),
  proposal: z.object({
    proposalId: z.string().min(1),
    bestRound: z.number().int().positive(),
    meta: DigestRefSchema,
    submission: DigestRefSchema,
    originalSkillSha256: Sha256Schema,
    optimizedSkillSha256: Sha256Schema,
    packagedSkillSha256: Sha256Schema,
  }).strict(),
  supportContract: z.object({
    id: z.literal(API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID_V2),
    unchanged: z.literal(true),
    reference: DigestRefSchema,
  }).strict(),
  entrypoints: z.object({
    skill: z.literal("SKILL.md"),
    apiTaskSolidifier: z.literal("scripts/api-task-solidify.js"),
  }).strict(),
  runtime: z.object({
    packageRunner: z.literal("Bun >= 1.3.14"),
    generatedArtifactRunner: z.literal("Node.js >= 20"),
    networkRequired: z.literal(false),
    packageInstallRequired: z.literal(false),
  }).strict(),
  residualDuties: z.array(z.string().min(1)).min(1),
  excludedProposalFiles: z.array(ExcludedProposalFileSchema),
  files: z.array(DigestRefSchema).min(3),
  claimBoundary: z.string().min(1),
}).strict().superRefine((manifest, context) => {
  const paths = manifest.files.map((file) => file.path)
  if (new Set(paths).size !== paths.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Package file paths must be unique" })
  }
  for (const required of [
    manifest.entrypoints.skill,
    manifest.entrypoints.apiTaskSolidifier,
    manifest.supportContract.reference.path,
  ]) {
    if (!paths.includes(required)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `Package manifest omits required path: ${required}` })
    }
  }
})

export type TraceGuidedSkillPackageManifest = z.infer<typeof TraceGuidedSkillPackageManifestSchema>

export interface TraceGuidedSkillPackage {
  packageDir: string
  manifest: TraceGuidedSkillPackageManifest
}

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function portable(path: string): string {
  return path.replaceAll("\\", "/")
}

function isWithin(parent: string, candidate: string): boolean {
  const result = relative(resolve(parent), resolve(candidate))
  return result === "" || (!result.startsWith(`..${sep}`) && result !== ".." && !isAbsolute(result))
}

function packagePath(value: string): string {
  const safe = parseSafeRelativePath(portable(value))
  for (const segment of safe.split("/")) {
    const stem = segment.replace(/[. ]+$/u, "").split(".")[0]?.toUpperCase()
    if (stem && /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/u.test(stem)) {
      throw new Error(`Reserved portable package path is forbidden: ${safe}`)
    }
  }
  return safe
}

async function ensureEmptyDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true })
  const stat = await lstat(directory)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Package output must be a non-symlink directory: ${directory}`)
  if ((await readdir(directory)).length > 0) throw new Error(`Package output must be empty: ${directory}`)
}

async function listFiles(root: string, current = ""): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(join(root, current), { withFileTypes: true })) {
    const local = packagePath(current ? `${current}/${entry.name}` : entry.name)
    const absolute = join(root, local)
    const stat = await lstat(absolute)
    if (stat.isSymbolicLink()) throw new Error(`Symbolic links are forbidden in a skill package: ${local}`)
    if (stat.isDirectory()) files.push(...await listFiles(root, local))
    else if (stat.isFile()) files.push(local)
    else throw new Error(`Unsupported package entry: ${local}`)
  }
  return files.sort()
}

async function listSourceFiles(root: string, current = ""): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(toNamespacedPath(join(root, current)), { withFileTypes: true })) {
    const local = parseSafeRelativePath(portable(current ? `${current}/${entry.name}` : entry.name))
    const absolute = toNamespacedPath(join(root, local))
    const stat = await lstat(absolute)
    if (stat.isSymbolicLink()) throw new Error(`Symbolic links are forbidden in a proposal snapshot: ${local}`)
    if (stat.isDirectory()) files.push(...await listSourceFiles(root, local))
    else if (stat.isFile()) files.push(local)
    else throw new Error(`Unsupported proposal entry: ${local}`)
  }
  return files.sort()
}

function readSourceFile(root: string, path: string): Promise<Buffer> {
  return readFile(toNamespacedPath(join(root, parseSafeRelativePath(path))))
}

async function digestRef(root: string, path: string): Promise<z.infer<typeof DigestRefSchema>> {
  const safe = packagePath(path)
  const bytes = await readFile(join(root, safe))
  return { path: safe, sha256: sha256(bytes), bytes: bytes.byteLength }
}

async function writePackageFile(root: string, path: string, bytes: Uint8Array | string): Promise<void> {
  const safe = packagePath(path)
  const target = resolve(root, safe)
  if (!isWithin(root, target)) throw new Error(`Package path escapes output root: ${path}`)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, bytes)
}

async function differs(left: string, right: string): Promise<boolean> {
  const [leftBytes, rightBytes] = await Promise.all([readFile(left), readFile(right)])
  return !leftBytes.equals(rightBytes)
}

const SOLIDIFICATION_SECTION = `

## Bounded deterministic fast path

When a task supplies an ordinary-input binding with schema version
\`skill-ir-api-tester-production-binding/v2\` and its OpenAPI document is within
\`${API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID_V2}\`, run:

\`bun scripts/api-task-solidify.js --binding <binding.json> --workdir <task-workdir> --out-dir <new-empty-output-dir> --node <node-executable>\`

The helper constructs the requested plan and report, then runs a separate
public-contract checker. Read its JSON result and the generated report. Do not
repeat work proved by the checker, but continue the residual workflow for live
API interaction, credentials, unsupported schema features, server state, or
any task duty outside the bounded contract.

Exit code 2 with \`status: unsupported\` is a normal not-applicable result: do
not claim an artifact passed, and continue the residual workflow using the
general process above. Exit code 1 is an implementation or binding failure;
preserve the error and do not treat it as an unsupported contract.
`

const SUPPORT_CONTRACT_REFERENCE = `# API Tester bounded solidification

This helper reuses the unchanged \`${API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID_V2}\`
implementation. It accepts a v2 binding path, a task work directory containing
the referenced JSON or YAML OpenAPI input, a new empty output directory, and a
Node.js executable. It generates a plan/report and independently checks their
input binding, operation coverage, schema-derived cases, array encoding,
security/response obligations and report grounding.

The helper is offline and deterministic. It does not call an API, validate
server behavior, obtain credentials, repair missing references, guess response
statuses, or prove duties outside the support contract. An unsupported result
requires the agent to continue the original workflow; local artifact success
does not prove a complete document or real API behavior.
`

export async function buildTraceGuidedApiTesterPackage(options: {
  proposalDir: string
  packageDir: string
  runnerEntrypoint?: string
}): Promise<TraceGuidedSkillPackage> {
  const proposalDir = resolve(options.proposalDir)
  const packageDir = resolve(options.packageDir)
  if (isWithin(proposalDir, packageDir) || isWithin(packageDir, proposalDir)) {
    throw new Error("Proposal and package directories must not overlap")
  }
  await ensureEmptyDirectory(packageDir)

  const metaPath = join(proposalDir, "meta.json")
  const metaBytes = await readFile(metaPath)
  const meta = z.object({ bestRound: z.number().int().positive() }).passthrough()
    .parse(JSON.parse(metaBytes.toString("utf8")))
  const originalDir = join(proposalDir, "original")
  const roundDir = join(proposalDir, `round-${meta.bestRound}`)
  const submissionPath = join(proposalDir, `round-${meta.bestRound}-optimizer`, "submission.json")
  const submissionBytes = await readFile(submissionPath)
  const submission = OptimizeSubmissionSchema.parse(JSON.parse(submissionBytes.toString("utf8")))
  const declared = new Set((submission.changedFiles ?? []).map(packagePath))
  const [originalFiles, roundFiles] = await Promise.all([
    listSourceFiles(originalDir),
    listSourceFiles(roundDir),
  ])
  const originalSet = new Set(originalFiles)
  const roundSet = new Set(roundFiles)
  const excludedProposalFiles: TraceGuidedSkillPackageManifest["excludedProposalFiles"] = []

  for (const path of roundFiles) {
    if (originalSet.has(path) || declared.has(path)) continue
    excludedProposalFiles.push({
      path,
      sha256: sha256(await readSourceFile(roundDir, path)),
      reason: "undeclared-round-only-file",
    })
  }
  for (const path of originalFiles) {
    if (declared.has(path)) continue
    if (!roundSet.has(path)) {
      excludedProposalFiles.push({ path, reason: "undeclared-deletion-restored" })
    } else if (await differs(toNamespacedPath(join(originalDir, path)), toNamespacedPath(join(roundDir, path)))) {
      excludedProposalFiles.push({
        path,
        sha256: sha256(await readSourceFile(roundDir, path)),
        reason: "undeclared-modification-reverted",
      })
    }
  }
  for (const path of declared) {
    if (!originalSet.has(path) && !roundSet.has(path)) {
      throw new Error(`Declared proposal path is absent from original and selected round: ${path}`)
    }
  }

  const copied = new Set<string>()
  for (const path of originalFiles) {
    if (declared.has(path) && !roundSet.has(path)) continue
    const source = declared.has(path) ? join(roundDir, path) : join(originalDir, path)
    await writePackageFile(packageDir, path, await readFile(toNamespacedPath(source)))
    copied.add(path)
  }
  for (const path of declared) {
    if (!originalSet.has(path) && roundSet.has(path)) {
      await writePackageFile(packageDir, path, await readSourceFile(roundDir, path))
      copied.add(path)
    }
  }
  if (!copied.has("SKILL.md")) throw new Error("Selected proposal does not produce SKILL.md")

  const optimizedSkillBytes = await readFile(join(packageDir, "SKILL.md"))
  await writePackageFile(packageDir, "SKILL.md", `${optimizedSkillBytes.toString("utf8").trimEnd()}${SOLIDIFICATION_SECTION}`)
  await writePackageFile(packageDir, "references/api-tester-solidification-v2.md", SUPPORT_CONTRACT_REFERENCE)

  const runnerEntrypoint = resolve(options.runnerEntrypoint
    ?? fileURLToPath(new URL("./api-task-solidification-run.ts", import.meta.url)))
  const build = await Bun.build({
    entrypoints: [runnerEntrypoint],
    target: "bun",
    format: "esm",
    minify: false,
    sourcemap: "none",
    packages: "bundle",
  })
  if (!build.success || build.outputs.length !== 1) {
    throw new Error(`Failed to bundle API task solidifier: ${build.logs.map(String).join("; ")}`)
  }
  const runnerOutput = build.outputs[0]
  if (!runnerOutput) throw new Error("API task solidifier bundle output is missing")
  await writePackageFile(
    packageDir,
    "scripts/api-task-solidify.js",
    new Uint8Array(await runnerOutput.arrayBuffer()),
  )

  const originalSkill = await readFile(join(originalDir, "SKILL.md"))
  const selectedSkill = await readFile(join(roundDir, "SKILL.md"))
  const preliminaryFiles = await listFiles(packageDir)
  const files = await Promise.all(preliminaryFiles.map((path) => digestRef(packageDir, path)))
  const manifest = TraceGuidedSkillPackageManifestSchema.parse({
    schemaVersion: TRACE_GUIDED_SKILL_PACKAGE_SCHEMA_VERSION,
    identity: "trace-guided-api-tester-partial-solidification-development-v1",
    packageUsable: true,
    solidificationApplied: true,
    documentChangesApplied: sha256(originalSkill) !== sha256(selectedSkill),
    effect: "not-measured",
    proposal: {
      proposalId: basename(proposalDir),
      bestRound: meta.bestRound,
      meta: { path: "meta.json", sha256: sha256(metaBytes), bytes: metaBytes.byteLength },
      submission: {
        path: `round-${meta.bestRound}-optimizer/submission.json`,
        sha256: sha256(submissionBytes),
        bytes: submissionBytes.byteLength,
      },
      originalSkillSha256: sha256(originalSkill),
      optimizedSkillSha256: sha256(selectedSkill),
      packagedSkillSha256: sha256(await readFile(join(packageDir, "SKILL.md"))),
    },
    supportContract: {
      id: API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID_V2,
      unchanged: true,
      reference: await digestRef(packageDir, "references/api-tester-solidification-v2.md"),
    },
    entrypoints: {
      skill: "SKILL.md",
      apiTaskSolidifier: "scripts/api-task-solidify.js",
    },
    runtime: {
      packageRunner: "Bun >= 1.3.14",
      generatedArtifactRunner: "Node.js >= 20",
      networkRequired: false,
      packageInstallRequired: false,
    },
    residualDuties: [
      "live API calls and server-state validation",
      "credentials and secret handling",
      "unsupported OpenAPI syntax or semantics",
      "business response assertions without public evidence",
      "task duties outside the bounded artifact contract",
    ],
    excludedProposalFiles: excludedProposalFiles.sort((left, right) => left.path.localeCompare(right.path)),
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
    claimBoundary: "Development-only partial solidification. A checked local artifact is not a complete-document result, real API verification, readiness decision, human-savings claim, or prospective evaluation.",
  })
  await writeFile(join(packageDir, "package-manifest.json"), jsonText(manifest), "utf8")
  return verifyTraceGuidedSkillPackage(packageDir)
}

export async function verifyTraceGuidedSkillPackage(packageDir: string): Promise<TraceGuidedSkillPackage> {
  const root = resolve(packageDir)
  const stat = await lstat(root)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Skill package must be a non-symlink directory")
  const manifest = TraceGuidedSkillPackageManifestSchema.parse(
    JSON.parse(await readFile(join(root, "package-manifest.json"), "utf8")),
  )
  const actual = await listFiles(root)
  const expected = new Set(["package-manifest.json", ...manifest.files.map((file) => file.path)])
  const missing = [...expected].filter((path) => !actual.includes(path))
  const extra = actual.filter((path) => !expected.has(path))
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(`Trace-guided skill package closure mismatch: missing=${missing.join(",")} extra=${extra.join(",")}`)
  }
  for (const ref of manifest.files) {
    const actualRef = await digestRef(root, ref.path)
    if (actualRef.sha256 !== ref.sha256 || actualRef.bytes !== ref.bytes) {
      throw new Error(`Trace-guided skill package digest mismatch: ${ref.path}`)
    }
  }
  const skillBytes = await readFile(join(root, manifest.entrypoints.skill))
  if (sha256(skillBytes) !== manifest.proposal.packagedSkillSha256) {
    throw new Error("Trace-guided skill package SKILL.md binding mismatch")
  }
  return { packageDir: root, manifest }
}
