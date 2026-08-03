import { lstat, readFile } from "node:fs/promises"
import path from "node:path"
import {
  NamespacedSkillResourceManifestSchema,
  verifyNamespacedSkillResources,
} from "../../skill-ir/resource-namespace.ts"
import type { ScoredAgentRunRow } from "./scoring.ts"

type BenchmarkAuditStatus = "passed" | "failed"

export type NamespacedResourceAuditCorpusEntry = {
  skillId: string
  sourcePath: string
  benchmarkAuditStatus: BenchmarkAuditStatus
  benchmarkAuditIssues: string[]
}

export type NamespacedResourceAuditRawRow = {
  caseId: string
  system: string
  task: string
  runIndex: number
  runStatus: string
  workDir?: string
  skillPath?: string
  taskPath?: string
}

export type NamespacedResourceAuditTaskOutput = {
  taskId: string
  outputPaths: string[]
}

export type NamespacedResourceSemanticFailureAuditInput = {
  rootDir: string
  corpus: NamespacedResourceAuditCorpusEntry[]
  rawRows: NamespacedResourceAuditRawRow[]
  scoredRows: ScoredAgentRunRow[]
  taskOutputs: NamespacedResourceAuditTaskOutput[]
}

export type NamespacedResourceSemanticFailureAuditReport = {
  schemaVersion: "skill-ir-namespaced-resource-semantic-failure-audit/v1"
  status: "completed"
  counts: {
    rawRows: number
    scoredRows: number
    optimizedRows: number
    namespaceActiveRows: number
    optimizedRowsWithProducedOutputs: number
    contractSensitiveRows: number
    sourceRewriteOnlyRows: number
    infrastructureRows: number
  }
  rows: Array<{
    key: string
    skillId: string
    task: string
    namespace: "active" | "missing" | "not-applicable"
    producedOutputs: "all-public-outputs" | "missing-public-outputs" | "not-checked"
    scored: "success" | "failure" | "not-scored"
    contractSensitivity: "supported" | "not-supported" | "unknown"
    view: "source-rewrite-only" | "compiled-view" | "not-checked"
  }>
  findings: Array<{
    code:
      | "NAMESPACE_ACTIVE"
      | "NAMESPACE_MISSING"
      | "PUBLIC_OUTPUTS_PRESENT"
      | "PUBLIC_OUTPUTS_MISSING"
      | "BENCHMARK_CONTRACT_SENSITIVE"
      | "SOURCE_REWRITE_ONLY_VIEW"
      | "INFRASTRUCTURE_ROW"
    skillId: string
    task: string
  }>
  attribution: {
    namespaceMechanism: "supported" | "not-supported" | "inconclusive"
    modelExecution: "supported" | "not-supported" | "inconclusive"
    benchmarkContract: "supported" | "not-supported" | "inconclusive"
    remainingWorkflowGap: "supported" | "not-supported" | "inconclusive"
  }
  nextAction: string
  claimBoundary: string
}

function keyOf(row: { caseId: string; system: string; runIndex?: number }): string {
  return `${row.caseId}|${row.system}|${row.runIndex ?? 0}`
}

function resolveWithin(rootDir: string, relativePath: string): string {
  const root = path.resolve(rootDir)
  const candidate = path.resolve(root, relativePath)
  const relative = path.relative(root, candidate)
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`semantic audit path escapes root: ${relativePath}`)
  }
  return candidate
}

async function isRegularFile(rootDir: string, relativePath: string): Promise<boolean> {
  try {
    const info = await lstat(resolveWithin(rootDir, relativePath))
    return info.isFile() && !info.isSymbolicLink()
  } catch {
    return false
  }
}

async function readText(rootDir: string, relativePath: string): Promise<string | undefined> {
  if (!await isRegularFile(rootDir, relativePath)) return undefined
  return await readFile(resolveWithin(rootDir, relativePath), "utf8")
}

async function namespaceActive(rootDir: string, workDir: string): Promise<boolean> {
  const manifestPath = path.posix.join(workDir.replaceAll("\\", "/"), ".skvm/skill-resource-manifest.json")
  const text = await readText(rootDir, manifestPath)
  if (!text) return false
  try {
    const manifest = NamespacedSkillResourceManifestSchema.parse(JSON.parse(text))
    await verifyNamespacedSkillResources({ workDir: resolveWithin(rootDir, workDir), manifest })
    return true
  } catch {
    return false
  }
}

async function producedOutputs(
  rootDir: string,
  workDir: string,
  task: string,
  taskOutputs: NamespacedResourceAuditTaskOutput[],
): Promise<boolean | undefined> {
  const expected = taskOutputs.find((entry) => entry.taskId === task)?.outputPaths ?? []
  if (expected.length === 0) return undefined
  const work = workDir.replaceAll("\\", "/")
  return (await Promise.all(expected.map((relativePath) => isRegularFile(rootDir, path.posix.join(work, relativePath))))).every(Boolean)
}

async function isSourceRewriteOnlyView(
  rootDir: string,
  sourcePath: string | undefined,
  skillPath: string | undefined,
): Promise<boolean> {
  if (!sourcePath || !skillPath) return false
  const [source, compiled] = await Promise.all([
    readText(rootDir, sourcePath),
    readText(rootDir, skillPath),
  ])
  if (source === undefined || compiled === undefined) return false
  if (compiled.includes("Compiled Artifact View") || compiled.includes("Executable Artifacts")) return false
  const restored = compiled.replace(/\.skvm\/skill-resources\/[A-Za-z0-9._-]+-[a-f0-9]{12}\//gu, "")
  return restored.includes(source.trim()) || restored.trim() === source.trim()
}

function contractSensitivity(entry: NamespacedResourceAuditCorpusEntry | undefined): "supported" | "not-supported" | "unknown" {
  if (!entry) return "unknown"
  return entry.benchmarkAuditStatus === "failed"
    && entry.benchmarkAuditIssues.some((issue) => issue === "EXACT_CONTRACT_NOT_PUBLIC" || issue === "CANARY_OUTCOME_MISMATCH")
    ? "supported"
    : entry.benchmarkAuditStatus === "passed" ? "not-supported" : "unknown"
}

export async function auditNamespacedResourceSemanticFailures(
  input: NamespacedResourceSemanticFailureAuditInput,
): Promise<NamespacedResourceSemanticFailureAuditReport> {
  const normalizedRawRows = input.rawRows.map((row) => ({
    ...row,
    task: row.task || row.caseId.split(":").at(-1) || "unknown-task",
    ...(row.workDir && path.isAbsolute(row.workDir)
      ? { workDir: path.relative(input.rootDir, row.workDir).replaceAll(path.sep, "/") }
      : {}),
    ...(row.skillPath && path.isAbsolute(row.skillPath)
      ? { skillPath: path.relative(input.rootDir, row.skillPath).replaceAll(path.sep, "/") }
      : {}),
  }))
  const corpusBySkill = new Map(input.corpus.map((entry) => [entry.skillId, entry]))
  const scoredByKey = new Map(input.scoredRows.map((row) => [keyOf(row), row]))
  const optimizedRows = normalizedRawRows.filter((row) => row.system === "optimized")
  const rows: NamespacedResourceSemanticFailureAuditReport["rows"] = []
  const findings: NamespacedResourceSemanticFailureAuditReport["findings"] = []

  for (const raw of optimizedRows) {
    const key = keyOf(raw)
    const scored = scoredByKey.get(key)
    const skillId = raw.caseId.split(":")[0] ?? "unknown"
    const corpusEntry = corpusBySkill.get(skillId)
    const namespace = raw.workDir && await namespaceActive(input.rootDir, raw.workDir) ? "active" : "missing"
    const outputs = raw.workDir ? await producedOutputs(input.rootDir, raw.workDir, raw.task, input.taskOutputs) : undefined
    const contract = contractSensitivity(corpusEntry)
    const view = await isSourceRewriteOnlyView(input.rootDir, corpusEntry?.sourcePath, raw.skillPath)
      ? "source-rewrite-only"
      : raw.skillPath ? "compiled-view" : "not-checked"
    const scoredState = scored ? (scored.success ? "success" : "failure") : "not-scored"
    rows.push({
      key,
      skillId,
      task: raw.task,
      namespace,
      producedOutputs: outputs === undefined ? "not-checked" : outputs ? "all-public-outputs" : "missing-public-outputs",
      scored: scoredState,
      contractSensitivity: scored?.success ? "not-supported" : contract,
      view,
    })
    if (namespace === "active") findings.push({ code: "NAMESPACE_ACTIVE", skillId, task: raw.task })
    else findings.push({ code: "NAMESPACE_MISSING", skillId, task: raw.task })
    if (outputs === true) findings.push({ code: "PUBLIC_OUTPUTS_PRESENT", skillId, task: raw.task })
    else if (outputs === false) findings.push({ code: "PUBLIC_OUTPUTS_MISSING", skillId, task: raw.task })
    if (contract === "supported" && scored?.success === false) {
      findings.push({ code: "BENCHMARK_CONTRACT_SENSITIVE", skillId, task: raw.task })
    }
    if (view === "source-rewrite-only") findings.push({ code: "SOURCE_REWRITE_ONLY_VIEW", skillId, task: raw.task })
    if (raw.runStatus !== "ok") findings.push({ code: "INFRASTRUCTURE_ROW", skillId, task: raw.task })
  }

  const namespaceActiveRows = rows.filter((row) => row.namespace === "active").length
  const producedRows = rows.filter((row) => row.producedOutputs === "all-public-outputs").length
  const contractSensitiveRows = rows.filter((row) => row.contractSensitivity === "supported").length
  const sourceRewriteRows = rows.filter((row) => row.view === "source-rewrite-only").length
  const infrastructureRows = rows.filter((row) => row.namespace === "missing").length
  return {
    schemaVersion: "skill-ir-namespaced-resource-semantic-failure-audit/v1",
    status: "completed",
    counts: {
      rawRows: normalizedRawRows.length,
      scoredRows: input.scoredRows.length,
      optimizedRows: optimizedRows.length,
      namespaceActiveRows,
      optimizedRowsWithProducedOutputs: producedRows,
      contractSensitiveRows,
      sourceRewriteOnlyRows: sourceRewriteRows,
      infrastructureRows,
    },
    rows,
    findings,
    attribution: {
      namespaceMechanism: optimizedRows.length > 0 && namespaceActiveRows === optimizedRows.length ? "supported" : "inconclusive",
      modelExecution: optimizedRows.length > 0 && producedRows > 0 ? "supported" : "inconclusive",
      benchmarkContract: contractSensitiveRows > 0 ? "supported" : "inconclusive",
      remainingWorkflowGap: optimizedRows.length > 0 && producedRows === optimizedRows.length && sourceRewriteRows > 0
        ? "supported"
        : "inconclusive",
    },
    nextAction: "Do not rerun paid development on this v1 matrix. Replace the source-rewrite-only optimized view with a deterministic artifact compiler and rerun only after a public-contract benchmark lock passes.",
    claimBoundary: "Diagnostic evidence only; this report cannot promote an IR, package, benchmark, or Token claim.",
  }
}

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`
  return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length)
}

async function readJsonl<T>(filePath: string): Promise<T[]> {
  return (await readFile(filePath, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T)
}

if (import.meta.main) {
  const rootDir = path.resolve(parseArg("root-dir") ?? process.cwd())
  const rawPath = path.resolve(parseArg("raw") ?? "results/skill-ir/namespaced-resource-quality-development-v1-r2/raw-runs.jsonl")
  const scoredPath = path.resolve(parseArg("scored") ?? "results/skill-ir/namespaced-resource-quality-development-v1-r2/scored.jsonl")
  const outPath = path.resolve(parseArg("out") ?? "results/skill-ir/namespaced-resource-quality-development-v1-r2/semantic-failure-audit.json")
  const corpus = JSON.parse(await readFile(path.join(rootDir, "benchmarks/skill-ir/corpus/corpora/pilot.json"), "utf8")) as {
    skills: Array<{ id: string; sourcePath?: string; benchmarkContractAuditPath?: string }>
  }
  const corpusEntries: NamespacedResourceAuditCorpusEntry[] = []
  for (const skill of corpus.skills.filter((entry) => entry.id === "law-to-markdown" || entry.id === "experimental-design")) {
    const auditPath = `results/skill-ir/benchmark-contract-audit/${skill.id}.json`
    const fallbackAuditPath = skill.benchmarkContractAuditPath ?? `benchmarks/skill-ir/pilots/${skill.id}/benchmark-contract-audit.json`
    const resolvedAuditPath = await isRegularFile(rootDir, auditPath) ? auditPath : fallbackAuditPath
    const audit = JSON.parse(await readFile(path.join(rootDir, resolvedAuditPath), "utf8")) as { status?: BenchmarkAuditStatus; issues?: Array<{ code?: string }> }
    corpusEntries.push({
      skillId: skill.id,
      sourcePath: skill.sourcePath!,
      benchmarkAuditStatus: audit.status ?? "failed",
      benchmarkAuditIssues: (audit.issues ?? []).map((issue) => issue.code ?? "unknown"),
    })
  }
  const rawRows = await readJsonl<NamespacedResourceAuditRawRow>(rawPath)
  const scoredRows = await readJsonl<ScoredAgentRunRow>(scoredPath)
  const taskOutputs: NamespacedResourceAuditTaskOutput[] = [
    { taskId: "law-to-markdown-statute-dev-001", outputPaths: ["markdown/document/document+审核报告.md", "markdown/document/document+最终成果.md"] },
    { taskId: "law-to-markdown-standard-dev-002", outputPaths: ["markdown/document/document+审核报告.md"] },
    { taskId: "experimental-design-stratified-dev-001", outputPaths: ["design/design-plan.json", "design/allocation.csv", "design/design-report.md"] },
    { taskId: "experimental-design-cluster-dev-002", outputPaths: ["design/design-plan.json", "design/allocation.csv", "design/design-report.md"] },
  ]
  const report = await auditNamespacedResourceSemanticFailures({ rootDir, corpus: corpusEntries, rawRows, scoredRows, taskOutputs })
  const { mkdir, writeFile } = await import("node:fs/promises")
  await mkdir(path.dirname(outPath), { recursive: true })
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  console.log(JSON.stringify({ status: report.status, out: outPath, counts: report.counts }, null, 2))
}
