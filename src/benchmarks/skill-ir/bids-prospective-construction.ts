import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { compileBidsValidatedArtifact } from "./bids-artifact-compiler"
import {
  buildCompilerCostEnvironmentIdentity,
  captureProspectiveCompilerCost,
  ProspectiveCompilerCostEvidenceRefSchema,
  ProspectiveCompilerCostReportSchema,
  type ProspectiveCompilerCostIdentity,
} from "./prospective-compiler-cost"

const CommitSchema = z.string().regex(/^[0-9a-f]{40}$/u)

export const BidsProspectiveConstructionMetadataSchema = z.object({
  schemaVersion: z.literal("skill-ir-bids-prospective-construction-metadata/v1"),
  constructionId: z.literal("bids-prospective-construction-2026-08-23"),
  baselineCommit: CommitSchema,
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  unautomatedConstructionSteps: z.array(z.string().min(1)).min(1),
}).strict().superRefine((metadata, context) => {
  if (Date.parse(metadata.completedAt) < Date.parse(metadata.startedAt)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["completedAt"],
      message: "completedAt must not precede startedAt",
    })
  }
})

export const BidsProspectiveConstructionReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-bids-prospective-construction-report/v1"),
  constructionId: z.literal("bids-prospective-construction-2026-08-23"),
  cost: ProspectiveCompilerCostReportSchema,
  adaptation: z.object({
    measurementStatus: z.literal("prospective-measured"),
    baselineCommit: CommitSchema,
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime(),
    humanMinutes: z.number().int().nonnegative(),
    adapterLoc: z.number().int().positive(),
    coreBranchDelta: z.number().int().nonnegative(),
    artifactKinds: z.tuple([z.literal("checks"), z.literal("schemas"), z.literal("scripts")]),
    reusedArtifactKinds: z.tuple([z.literal("checks"), z.literal("schemas"), z.literal("scripts")]),
    unautomatedConstructionSteps: z.array(z.string().min(1)).min(1),
  }).strict(),
  prePaidGate: z.object({
    status: z.literal("passed"),
    automaticCostEligible: z.literal(false),
    permitsQualificationLock: z.literal(true),
  }).strict(),
  authorizations: z.object({
    paidExecution: z.literal(false),
    heldOut: z.literal(false),
    readinessPromotion: z.literal(false),
  }).strict(),
  claimBoundary: z.literal(
    "This report proves prospective identity closure, measured compiler/package execution, package validation, and adaptation accounting. The hand-authored compiler remains mechanism-only and is not automatic compile-cost or quality evidence.",
  ),
}).strict()

export type BidsProspectiveConstructionMetadata = z.infer<
  typeof BidsProspectiveConstructionMetadataSchema
>
export type BidsProspectiveConstructionReport = z.infer<
  typeof BidsProspectiveConstructionReportSchema
>

const PILOT_DIR = "benchmarks/skill-ir/pilots/bids"
const COMMON_IDENTITY_PATHS = [
  "src/benchmarks/skill-ir/bids-artifact-runtime.ts",
  "src/benchmarks/skill-ir/bids-contract.ts",
  "src/benchmarks/skill-ir/bids-prospective-construction.ts",
  "src/benchmarks/skill-ir/bids-prospective-construction-run.ts",
  "src/benchmarks/skill-ir/prospective-compiler-cost.ts",
  "src/benchmarks/skill-ir/validated-artifact-assembly.ts",
  "src/benchmarks/skill-ir/validated-artifact-catalog.ts",
  "src/benchmarks/skill-ir/validated-artifact-runtime.ts",
  "src/benchmarks/skill-ir/source-fixture.ts",
  "src/skill-ir/schema.ts",
  "src/skill-ir/source-audit.ts",
  "src/skill-ir/validate.ts",
  "package.json",
  "bun.lock",
] as const
const CORE_PATHS = [
  "src/skill-ir",
  "src/benchmarks/skill-ir/prospective-compiler-cost.ts",
  "src/benchmarks/skill-ir/validated-artifact-assembly.ts",
  "src/benchmarks/skill-ir/validated-artifact-catalog.ts",
  "src/benchmarks/skill-ir/validated-artifact-runtime.ts",
] as const

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

async function evidenceRef(rootDir: string, relativePath: string) {
  return ProspectiveCompilerCostEvidenceRefSchema.parse({
    relativePath,
    sha256: sha256(await readFile(path.resolve(rootDir, ...relativePath.split("/")))),
  })
}

async function sourceClosure(rootDir: string) {
  const policy = JSON.parse(await readFile(path.join(
    rootDir,
    "benchmarks/skill-ir/corpus/prospective-quality-candidate.json",
  ), "utf8")) as { selectedSkillId?: unknown; source?: { closure?: unknown } }
  if (policy.selectedSkillId !== "bids" || !Array.isArray(policy.source?.closure)) {
    throw new Error("BIDS prospective candidate source closure is missing")
  }
  return Promise.all(policy.source.closure.map(async (raw) => {
    if (!raw || typeof raw !== "object") throw new Error("BIDS source closure entry is invalid")
    const entry = raw as { path?: unknown; sha256?: unknown }
    if (typeof entry.path !== "string" || typeof entry.sha256 !== "string") {
      throw new Error("BIDS source closure entry is incomplete")
    }
    const observed = await evidenceRef(rootDir, entry.path)
    if (observed.sha256 !== entry.sha256) throw new Error(`BIDS source closure digest mismatch for ${entry.path}`)
    return observed
  }))
}

async function assertBaselineCommit(rootDir: string, commit: string): Promise<void> {
  const processResult = Bun.spawn(["git", "cat-file", "-e", `${commit}^{commit}`], {
    cwd: rootDir,
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  })
  if (await processResult.exited !== 0) throw new Error(`BIDS construction baseline commit is unavailable: ${commit}`)
}

async function coreBranchDelta(rootDir: string, baselineCommit: string): Promise<number> {
  const processResult = Bun.spawn(["git", "diff", "--numstat", baselineCommit, "--", ...CORE_PATHS], {
    cwd: rootDir,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout] = await Promise.all([
    processResult.exited,
    new Response(processResult.stdout).text(),
    new Response(processResult.stderr).text(),
  ])
  if (exitCode !== 0) throw new Error("BIDS construction core delta could not be measured")
  return stdout.split(/\r?\n/u).filter(Boolean).reduce((sum, line) => {
    const [added, deleted] = line.split("\t")
    if (!/^\d+$/u.test(added ?? "") || !/^\d+$/u.test(deleted ?? "")) {
      throw new Error("BIDS construction core delta contains a binary or invalid entry")
    }
    return sum + Number(added) + Number(deleted)
  }, 0)
}

async function adapterLoc(rootDir: string): Promise<number> {
  const text = await readFile(path.join(rootDir, PILOT_DIR, "artifact-adapter.json"), "utf8")
  return text.split(/\r?\n/u).filter((line) => line.trim().length > 0).length
}

async function buildCostIdentity(
  rootDir: string,
  metadata: BidsProspectiveConstructionMetadata,
): Promise<ProspectiveCompilerCostIdentity> {
  return {
    schemaVersion: "skill-ir-prospective-compiler-cost/v1",
    experimentId: metadata.constructionId,
    skillId: "bids",
    constructionOrigin: "manual-existing",
    unautomatedConstructionSteps: metadata.unautomatedConstructionSteps,
    evidence: {
      sourceClosure: await sourceClosure(rootDir),
      taskContract: await evidenceRef(rootDir, `${PILOT_DIR}/development/tasks.json`),
      publicContract: await evidenceRef(rootDir, `${PILOT_DIR}/public-interface.json`),
      resourceContract: await evidenceRef(rootDir, `${PILOT_DIR}/resource-contract.json`),
      baseIr: await evidenceRef(rootDir, `${PILOT_DIR}/base-ir.json`),
      sourceAudit: await evidenceRef(rootDir, `${PILOT_DIR}/base-ir-source-audit.json`),
      adapter: await evidenceRef(rootDir, `${PILOT_DIR}/artifact-adapter.json`),
      compilerImplementation: await evidenceRef(rootDir, "src/benchmarks/skill-ir/bids-artifact-compiler.ts"),
      catalogRuntime: await Promise.all(COMMON_IDENTITY_PATHS.map((item) => evidenceRef(rootDir, item))),
    },
    environment: buildCompilerCostEnvironmentIdentity({
      runtime: "bun",
      runtimeVersion: Bun.version,
      platform: process.platform,
      architecture: process.arch,
    }),
  }
}

export async function buildBidsProspectiveConstructionReport(
  rawRootDir: string,
  rawMetadata: BidsProspectiveConstructionMetadata,
): Promise<BidsProspectiveConstructionReport> {
  const rootDir = path.resolve(rawRootDir)
  const metadata = BidsProspectiveConstructionMetadataSchema.parse(rawMetadata)
  await assertBaselineCommit(rootDir, metadata.baselineCommit)
  const identity = await buildCostIdentity(rootDir, metadata)
  const zeroUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
  const cost = await captureProspectiveCompilerCost({ rootDir, identity }, async (context) => {
    const packageDir = path.join(context.outRoot, "bids-audit")
    await context.measureStage("compiler-package", async () => {
      await compileBidsValidatedArtifact({
        rootDir,
        sourceFiles: identity.evidence.sourceClosure.map((entry) => ({
          path: entry.relativePath,
          sha256: entry.sha256,
        })),
        publicContract: {
          path: identity.evidence.publicContract.relativePath,
          sha256: identity.evidence.publicContract.sha256,
        },
        adapter: {
          path: identity.evidence.adapter.relativePath,
          sha256: identity.evidence.adapter.sha256,
        },
        baseIr: {
          path: identity.evidence.baseIr.relativePath,
          sha256: identity.evidence.baseIr.sha256,
        },
        sourceAudit: {
          path: identity.evidence.sourceAudit.relativePath,
          sha256: identity.evidence.sourceAudit.sha256,
        },
        resourceContract: {
          path: identity.evidence.resourceContract.relativePath,
          sha256: identity.evidence.resourceContract.sha256,
        },
        taskContract: {
          path: identity.evidence.taskContract.relativePath,
          sha256: identity.evidence.taskContract.sha256,
        },
      }, packageDir)
      return { value: undefined, modelCalls: 0, usage: zeroUsage }
    })
    return { packages: [{ id: "bids-audit", directory: packageDir }] }
  })
  if (cost.eligibility.status !== "mechanism-only") {
    throw new Error("Hand-authored BIDS compiler must remain mechanism-only")
  }
  const humanMinutes = Math.ceil(
    (Date.parse(metadata.completedAt) - Date.parse(metadata.startedAt)) / 60_000,
  )
  return BidsProspectiveConstructionReportSchema.parse({
    schemaVersion: "skill-ir-bids-prospective-construction-report/v1",
    constructionId: metadata.constructionId,
    cost,
    adaptation: {
      measurementStatus: "prospective-measured",
      baselineCommit: metadata.baselineCommit,
      startedAt: metadata.startedAt,
      completedAt: metadata.completedAt,
      humanMinutes,
      adapterLoc: await adapterLoc(rootDir),
      coreBranchDelta: await coreBranchDelta(rootDir, metadata.baselineCommit),
      artifactKinds: ["checks", "schemas", "scripts"],
      reusedArtifactKinds: ["checks", "schemas", "scripts"],
      unautomatedConstructionSteps: metadata.unautomatedConstructionSteps,
    },
    prePaidGate: { status: "passed", automaticCostEligible: false, permitsQualificationLock: true },
    authorizations: { paidExecution: false, heldOut: false, readinessPromotion: false },
    claimBoundary:
      "This report proves prospective identity closure, measured compiler/package execution, package validation, and adaptation accounting. The hand-authored compiler remains mechanism-only and is not automatic compile-cost or quality evidence.",
  })
}
