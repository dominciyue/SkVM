import { mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { loadSkill } from "../../core/skill-loader.ts"
import {
  compileNamespacedSkillResources,
  materializeNamespacedSkillResources,
  verifyNamespacedSkillResources,
  type NamespacedSkillResourcePackage,
} from "../../skill-ir/resource-namespace.ts"

export type NamespacedResourceAgentView = {
  caseId: string
  system: "ir-namespaced-resource-dev"
  runIndex: number
  caseDir: string
  skillPath: string
  workDir: string
  manifestPath: string
  namespaceRoot: string
  sourceDigest: string
  closureDigest: string
}

function resolveWithin(rootDir: string, relativePath: string): string {
  const root = path.resolve(rootDir)
  const absolute = path.resolve(root, ...relativePath.replaceAll("\\", "/").split("/"))
  const relative = path.relative(root, absolute)
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`namespaced resource runner path escapes repository root: ${relativePath}`)
  }
  return absolute
}

export async function materializeNamespacedResourceAgentView(opts: {
  rootDir: string
  outDir: string
  caseId: string
  runIndex: number
  sourcePath: string
  package: NamespacedSkillResourcePackage
}): Promise<NamespacedResourceAgentView> {
  if (!Number.isInteger(opts.runIndex) || opts.runIndex < 1) {
    throw new Error("namespaced resource runner requires a positive run index")
  }
  if (opts.package.status !== "ready") {
    throw new Error("namespaced resource runner cannot materialize a blocked package")
  }

  const skill = await loadSkill(resolveWithin(opts.rootDir, opts.sourcePath))
  const recompiled = await compileNamespacedSkillResources(skill, { packageId: opts.package.skillId })
  if (
    recompiled.status !== "ready"
    || recompiled.sourceDigest !== opts.package.sourceDigest
    || recompiled.closureDigest !== opts.package.closureDigest
    || recompiled.namespaceRoot !== opts.package.namespaceRoot
    || recompiled.compiledSkillContent !== opts.package.compiledSkillContent
  ) {
    throw new Error(`namespaced resource runner package drift: ${opts.package.skillId}`)
  }

  const safeCaseId = opts.caseId.replace(/[^a-zA-Z0-9._-]+/gu, "__")
  const caseDir = path.join(opts.outDir, safeCaseId, "ir-namespaced-resource-dev", `run-${opts.runIndex}`)
  const skillDir = path.join(caseDir, "skill")
  const workDir = path.join(caseDir, "workdir")
  await rm(path.resolve(caseDir), { recursive: true, force: true })
  await Promise.all([mkdir(skillDir, { recursive: true }), mkdir(workDir, { recursive: true })])

  const manifest = await materializeNamespacedSkillResources({ package: opts.package, skill, workDir })
  const skillPath = path.join(skillDir, "SKILL.md")
  await writeFile(skillPath, opts.package.compiledSkillContent, "utf8")
  await verifyNamespacedSkillResources({ workDir, manifest })
  return {
    caseId: opts.caseId,
    system: "ir-namespaced-resource-dev",
    runIndex: opts.runIndex,
    caseDir,
    skillPath,
    workDir,
    manifestPath: path.join(workDir, ".skvm", "skill-resource-manifest.json"),
    namespaceRoot: opts.package.namespaceRoot,
    sourceDigest: opts.package.sourceDigest,
    closureDigest: opts.package.closureDigest,
  }
}
