import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { auditSourcePackageContamination, type ProvenanceFileRecord } from "./source-package-contamination-audit.ts"

const PORTFOLIO_PATH = "benchmarks/skill-ir/corpus/method-portfolio.json"
const PILOT_PATH = "benchmarks/skill-ir/corpus/corpora/pilot.json"

interface PortfolioRegistry {
  cases: Array<{ skillId: string }>
}

interface PilotRegistry {
  skills: Array<{
    id: string
    sourcePath: string
    tasksPath: string
    sourceFiles: ProvenanceFileRecord[]
  }>
}

interface TaskRegistry {
  tasks: Array<{
    split: string
    fixtures?: Record<string, string>
  }>
}

interface MeasurementValidity {
  calibrationId?: string
  confirmedSemanticObservations?: Array<{
    code?: string
    publicContract?: string
    observedFailure?: string
  }>
}

export interface SourcePackagePortfolioAuditReport {
  schemaVersion: "skill-ir-source-package-portfolio-audit/v1"
  status: "diagnostic"
  counts: {
    cases: number
    resourceBearingCases: number
    skillResourceFiles: number
    casesWithScripts: number
    pathCollisions: number
    confirmedOutputContaminationObservations: number
  }
  cases: Array<{
    skillId: string
    developmentTasks: number
    taskFixtureFiles: number
    skillResourceFiles: number
    resourceKinds: string[]
    hasExecutableResources: boolean
    namespaceStatus: "clear" | "exposure" | "risk" | "contaminated"
    collisions: Array<{ path: string; sameDigest: boolean }>
  }>
  observations: Array<{
    evidencePath: string
    calibrationId: string
    code: string
    publicContract: string
    observedFailure: string
  }>
  decision: string
  claimBoundary: string
}

function fromRoot(rootDir: string, relativePath: string): string {
  return path.join(rootDir, ...relativePath.split("/"))
}

async function readJson<T>(rootDir: string, relativePath: string): Promise<T> {
  return JSON.parse(await readFile(fromRoot(rootDir, relativePath), "utf8")) as T
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex")
}

function resourceKind(relativePath: string): string {
  const normalized = relativePath.replaceAll("\\", "/")
  const topLevel = normalized.split("/", 1)[0]!
  if (/^licen[sc]e(?:\.|$)/iu.test(topLevel)) return "license"
  if (topLevel === "scripts") return "scripts"
  if (topLevel === "references") return "references"
  if (topLevel === "agents") return "agent-metadata"
  if (topLevel.startsWith(".")) return "configuration"
  return "other"
}

function executableResource(relativePath: string): boolean {
  const normalized = relativePath.replaceAll("\\", "/")
  return normalized.startsWith("scripts/") || /\.(?:py|js|mjs|cjs|sh|ps1|bat|cmd)$/iu.test(normalized)
}

function sourceResources(skill: PilotRegistry["skills"][number]): ProvenanceFileRecord[] {
  const sourceDir = path.posix.dirname(skill.sourcePath)
  return skill.sourceFiles
    .map((entry) => ({
      path: path.posix.relative(sourceDir, entry.path.replaceAll("\\", "/")),
      sha256: entry.sha256,
    }))
    .filter((entry) => entry.path !== "SKILL.md")
}

async function knownObservations(rootDir: string, observationPaths: readonly string[]) {
  const observations: SourcePackagePortfolioAuditReport["observations"] = []
  for (const evidencePath of observationPaths) {
    const document = await readJson<MeasurementValidity>(rootDir, evidencePath)
    for (const observation of document.confirmedSemanticObservations ?? []) {
      if (observation.code !== "skill-package-reference-contamination") continue
      observations.push({
        evidencePath,
        calibrationId: document.calibrationId ?? "unknown",
        code: observation.code,
        publicContract: observation.publicContract ?? "",
        observedFailure: observation.observedFailure ?? "",
      })
    }
  }
  return observations
}

export async function buildSourcePackagePortfolioAudit(input: {
  rootDir: string
  observationPaths?: readonly string[]
}): Promise<SourcePackagePortfolioAuditReport> {
  const rootDir = path.resolve(input.rootDir)
  const portfolio = await readJson<PortfolioRegistry>(rootDir, PORTFOLIO_PATH)
  const pilot = await readJson<PilotRegistry>(rootDir, PILOT_PATH)

  const cases = [] as SourcePackagePortfolioAuditReport["cases"]
  for (const portfolioCase of portfolio.cases) {
    const skill = pilot.skills.find((entry) => entry.id === portfolioCase.skillId)
    if (!skill) throw new Error(`Pilot registry is missing method case ${portfolioCase.skillId}`)
    const tasks = await readJson<TaskRegistry>(rootDir, skill.tasksPath)
    const developmentTasks = tasks.tasks.filter((task) => task.split === "development")
    const taskFileMap = new Map<string, string>()
    for (const task of developmentTasks) {
      for (const [relativePath, content] of Object.entries(task.fixtures ?? {})) {
        taskFileMap.set(relativePath.replaceAll("\\", "/"), sha256Text(content))
      }
    }
    const skillFiles = sourceResources(skill)
    const audit = auditSourcePackageContamination({
      taskFiles: [...taskFileMap].map(([relativePath, sha256]) => ({ path: relativePath, sha256 })),
      skillFiles,
      outputs: [],
      allowedOutputResourceRefs: [],
    })
    cases.push({
      skillId: skill.id,
      developmentTasks: developmentTasks.length,
      taskFixtureFiles: taskFileMap.size,
      skillResourceFiles: skillFiles.length,
      resourceKinds: [...new Set(skillFiles.map((entry) => resourceKind(entry.path)))].sort(),
      hasExecutableResources: skillFiles.some((entry) => executableResource(entry.path)),
      namespaceStatus: audit.status,
      collisions: audit.collisions,
    })
  }

  const observations = await knownObservations(rootDir, input.observationPaths ?? [])
  return {
    schemaVersion: "skill-ir-source-package-portfolio-audit/v1",
    status: "diagnostic",
    counts: {
      cases: cases.length,
      resourceBearingCases: cases.filter((entry) => entry.skillResourceFiles > 0).length,
      skillResourceFiles: cases.reduce((total, entry) => total + entry.skillResourceFiles, 0),
      casesWithScripts: cases.filter((entry) => entry.hasExecutableResources).length,
      pathCollisions: cases.reduce((total, entry) => total + entry.collisions.length, 0),
      confirmedOutputContaminationObservations: observations.length,
    },
    cases,
    observations,
    decision: "Keep flat bundle runtime frozen; design an explicit resource namespace only after compatibility requirements are derived from script-bearing cases.",
    claimBoundary: "Static development-fixture paths plus previously frozen measurement observations; no held-out content, model rerun, skill optimization, or token claim.",
  }
}
