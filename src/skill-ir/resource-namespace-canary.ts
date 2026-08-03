import { lstat, mkdtemp, rm } from "node:fs/promises"
import { spawnSync } from "node:child_process"
import { tmpdir } from "node:os"
import path from "node:path"
import { loadSkill } from "../core/skill-loader.ts"
import {
  compileNamespacedSkillResources,
  materializeNamespacedSkillResources,
  verifyNamespacedSkillResources,
  type NamespacedSkillResourcePackage,
} from "./resource-namespace.ts"

const CASES = [
  {
    skillId: "law-to-markdown",
    sourcePath: "benchmarks/skill-ir/pilots/law-to-markdown/source/SKILL.md",
  },
  {
    skillId: "experimental-design",
    sourcePath: "benchmarks/skill-ir/pilots/experimental-design/source/SKILL.md",
  },
] as const

export interface NamespacedResourceCanaryReport {
  schemaVersion: "skill-ir-namespaced-resource-canary/v1"
  status: "passed" | "failed"
  cases: Array<{
    skillId: string
    status: "passed" | "failed"
    packageStatus: NamespacedSkillResourcePackage["status"]
    resourceFiles: number
    rewriteCount: number
    unresolvedReferences: string[]
    rootResourcePathsPresent: string[]
    integrity: "passed" | "failed"
    pythonSyntaxChecks: Array<{ path: string; status: "passed" | "failed"; detail?: string }>
    failure?: string
  }>
  claimBoundary: string
}

async function present(pathname: string): Promise<boolean> {
  try {
    await lstat(pathname)
    return true
  } catch {
    return false
  }
}

function pythonSyntaxCheck(absolutePath: string, relativePath: string) {
  const result = spawnSync("python", [
    "-c",
    "from pathlib import Path; import sys; compile(Path(sys.argv[1]).read_text(encoding='utf-8'), sys.argv[1], 'exec')",
    absolutePath,
  ], { encoding: "utf8" })
  return result.status === 0
    ? { path: relativePath, status: "passed" as const }
    : { path: relativePath, status: "failed" as const, detail: (result.stderr || result.error?.message || "python failed").trim() }
}

export async function buildNamespacedResourceCanary(rootDir: string): Promise<NamespacedResourceCanaryReport> {
  const cases: NamespacedResourceCanaryReport["cases"] = []
  for (const entry of CASES) {
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), "skvm-resource-canary-"))
    try {
      const skill = await loadSkill(path.join(rootDir, ...entry.sourcePath.split("/")))
      const compiled = await compileNamespacedSkillResources(skill, { packageId: entry.skillId })
      const pythonSyntaxChecks: NamespacedResourceCanaryReport["cases"][number]["pythonSyntaxChecks"] = []
      const rootResourcePaths = [...new Set(skill.bundleFiles.map((resource) => resource.split("/")[0]!))]
      const rootResourcePathsPresent: string[] = []
      if (compiled.status === "ready") {
        const manifest = await materializeNamespacedSkillResources({ package: compiled, skill, workDir: temporaryRoot })
        const integrity = await verifyNamespacedSkillResources({ workDir: temporaryRoot, manifest })
          .then(() => "passed" as const)
          .catch(() => "failed" as const)
        for (const resource of rootResourcePaths) {
          if (await present(path.join(temporaryRoot, resource))) rootResourcePathsPresent.push(resource)
        }
        for (const resource of compiled.resources.filter((resource) => resource.sourcePath.endsWith(".py"))) {
          pythonSyntaxChecks.push(pythonSyntaxCheck(
            path.join(temporaryRoot, ...resource.targetPath.split("/")),
            resource.targetPath,
          ))
        }
        const passed = integrity === "passed"
          && rootResourcePathsPresent.length === 0
          && pythonSyntaxChecks.every((check) => check.status === "passed")
        cases.push({
          skillId: entry.skillId,
          status: passed ? "passed" : "failed",
          packageStatus: compiled.status,
          resourceFiles: compiled.resources.length,
          rewriteCount: compiled.rewrites.length,
          unresolvedReferences: compiled.unresolvedReferences,
          rootResourcePathsPresent,
          integrity,
          pythonSyntaxChecks,
          ...(passed ? {} : { failure: "namespace, integrity, or script syntax canary failed" }),
        })
      } else {
        cases.push({
          skillId: entry.skillId,
          status: "failed",
          packageStatus: compiled.status,
          resourceFiles: compiled.resources.length,
          rewriteCount: compiled.rewrites.length,
          unresolvedReferences: compiled.unresolvedReferences,
          rootResourcePathsPresent,
          integrity: "failed",
          pythonSyntaxChecks,
          failure: "compiler returned blocked package",
        })
      }
    } catch (error) {
      cases.push({
        skillId: entry.skillId,
        status: "failed",
        packageStatus: "blocked",
        resourceFiles: 0,
        rewriteCount: 0,
        unresolvedReferences: [],
        rootResourcePathsPresent: [],
        integrity: "failed",
        pythonSyntaxChecks: [],
        failure: error instanceof Error ? error.message : String(error),
      })
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true })
    }
  }
  return {
    schemaVersion: "skill-ir-namespaced-resource-canary/v1",
    status: cases.every((entry) => entry.status === "passed") ? "passed" : "failed",
    cases,
    claimBoundary: "Local resource namespace compatibility only; no model quality, optimization, held-out, or Token claim.",
  }
}
