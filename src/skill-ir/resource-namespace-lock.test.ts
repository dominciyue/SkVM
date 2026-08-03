import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { expect, test } from "bun:test"
import { sha256Bytes } from "../benchmarks/skill-ir/source-fixture.ts"
import { loadSkill } from "../core/skill-loader.ts"
import { compileNamespacedSkillResources } from "./resource-namespace.ts"
import {
  NamespacedResourceDevelopmentLockSchema,
  validateNamespacedResourceDevelopmentLock,
} from "./resource-namespace-lock.ts"

async function makeFixture(): Promise<{ rootDir: string; lock: Record<string, unknown> }> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "skvm-resource-lock-"))
  const cases = [] as Array<{
    skillId: string
    packageId: string
    source: { path: string; sha256: string }
    expected: {
      sourceDigest: string
      closureDigest: string
      namespaceRoot: string
      resourceFiles: number
      rewriteCount: number
    }
  }>
  const reportCases = [] as Array<Record<string, unknown>>

  for (const [index, skillId] of ["fixture-a", "fixture-b"].entries()) {
    const skillDir = path.join(rootDir, "skills", skillId)
    await mkdir(path.join(skillDir, "scripts"), { recursive: true })
    await writeFile(path.join(skillDir, "SKILL.md"), `# ${skillId}\nRun scripts/run.py\n`, "utf8")
    await writeFile(path.join(skillDir, "scripts", "run.py"), `print(${index})\n`, "utf8")

    const skill = await loadSkill(skillDir)
    const compiled = await compileNamespacedSkillResources(skill, { packageId: skillId })
    const rewriteCount = compiled.rewrites.reduce((sum, rewrite) => sum + rewrite.occurrences, 0)
    cases.push({
      skillId,
      packageId: skillId,
      source: {
        path: `skills/${skillId}/SKILL.md`,
        sha256: compiled.sourceDigest,
      },
      expected: {
        sourceDigest: compiled.sourceDigest,
        closureDigest: compiled.closureDigest,
        namespaceRoot: compiled.namespaceRoot,
        resourceFiles: compiled.resources.length,
        rewriteCount,
      },
    })
    reportCases.push({
      skillId,
      status: "passed",
      packageStatus: "ready",
      sourceDigest: compiled.sourceDigest,
      closureDigest: compiled.closureDigest,
      namespaceRoot: compiled.namespaceRoot,
      resourceFiles: compiled.resources.length,
      rewriteCount,
      unresolvedReferences: [],
      rootResourcePathsPresent: [],
      integrity: "passed",
    })
  }

  const reportPath = "results/resource-canary.json"
  const report = {
    schemaVersion: "skill-ir-namespaced-resource-canary/v1",
    status: "passed",
    cases: reportCases,
    claimBoundary: "Local resource namespace compatibility only",
  }
  await mkdir(path.dirname(path.join(rootDir, reportPath)), { recursive: true })
  const reportBytes = Buffer.from(`${JSON.stringify(report)}\n`, "utf8")
  await writeFile(path.join(rootDir, reportPath), reportBytes)

  const frozenImplementations = [] as Array<{ path: string; sha256: string }>
  for (const fileName of ["compiler.ts", "loader.ts", "canary.ts"]) {
    const filePath = `src/${fileName}`
    const bytes = Buffer.from(`// ${fileName}\n`, "utf8")
    await mkdir(path.join(rootDir, "src"), { recursive: true })
    await writeFile(path.join(rootDir, filePath), bytes)
    frozenImplementations.push({ path: filePath, sha256: sha256Bytes(bytes) })
  }

  const lock = {
    schemaVersion: "skill-ir-namespaced-resource-development-lock/v1",
    status: "preregistered",
    experimentId: "fixture-namespaced-resource-compatibility-v1",
    methodEvidence: true,
    corpus: "pilot",
    phase: "compatibility-canary",
    cases,
    canaryReport: { path: reportPath, sha256: sha256Bytes(reportBytes) },
    frozenImplementations,
    runtime: { pythonCommand: "python", syntaxOnly: true, networkAllowed: false, writesAllowed: false },
    promotionBoundary: {
      optimizedOnly: true,
      exactOriginalUnchanged: true,
      entersMainClaim: false,
      permitsPaidExecution: false,
      permitsHeldOut: false,
      permitsPgo: false,
      permitsScorerRetuning: false,
      permitsPackageRecompile: false,
    },
    prohibited: ["paid execution", "held-out execution", "PGO", "scorer retuning"],
  }
  return { rootDir, lock }
}

test("namespaced resource lock accepts a compatibility-only boundary", async () => {
  const { rootDir, lock } = await makeFixture()
  const parsed = NamespacedResourceDevelopmentLockSchema.parse(lock)
  const result = await validateNamespacedResourceDevelopmentLock(parsed, rootDir)
  expect(result.packages).toHaveLength(2)
  expect(result.report.status).toBe("passed")
})

test("namespaced resource lock rejects closure drift", async () => {
  const { rootDir, lock } = await makeFixture()
  const firstCase = (lock.cases as Array<Record<string, unknown>>)[0]!
  const expected = firstCase.expected as Record<string, unknown>
  expected.closureDigest = "0".repeat(64)
  const reportPath = path.join(rootDir, "results", "resource-canary.json")
  const report = JSON.parse(await readFile(reportPath, "utf8")) as { cases: Array<Record<string, unknown>> }
  report.cases[0]!.closureDigest = "0".repeat(64)
  const reportBytes = Buffer.from(`${JSON.stringify(report)}\n`, "utf8")
  await writeFile(reportPath, reportBytes)
  ;(lock.canaryReport as { sha256: string }).sha256 = sha256Bytes(reportBytes)
  await expect(validateNamespacedResourceDevelopmentLock(lock, rootDir)).rejects.toThrow(
    "resource development package identity mismatch",
  )
})

test("namespaced resource lock rejects a canary report mutation", async () => {
  const { rootDir, lock } = await makeFixture()
  const reportPath = path.join(rootDir, "results", "resource-canary.json")
  const report = JSON.parse(await readFile(reportPath, "utf8")) as { status: string }
  report.status = "failed"
  await writeFile(reportPath, `${JSON.stringify(report)}\n`, "utf8")
  await expect(validateNamespacedResourceDevelopmentLock(lock, rootDir)).rejects.toThrow(
    "resource development lock digest mismatch",
  )
})
