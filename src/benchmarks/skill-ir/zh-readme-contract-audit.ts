import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { z } from "zod"
import { ZhReadmeGradePayloadSchema, zhReadmeGrade } from "../../bench/evaluators/zh-readme-grade.ts"
import { EvalCriterionSchema, type RunResult } from "../../core/types.ts"
import { writeInitialWorkdirManifest } from "../../core/workdir-manifest.ts"
import { ZhReadmeTaskSetSchema, type ZhReadmeTaskSet } from "./zh-readme-contract.ts"
import { deriveZhReadmeFacts, type ZhReadmeConfirmedFacts } from "./zh-readme-oracle.ts"
import { sha256Bytes } from "./source-fixture.ts"

const DEVELOPMENT_PATH = "benchmarks/skill-ir/pilots/zh-readme/development/tasks.json"
const INTERFACE_PATH = "benchmarks/skill-ir/pilots/zh-readme/readme-interface.json"
const SPLIT_FREEZE_PATH = "benchmarks/skill-ir/pilots/zh-readme/task-split-freeze.json"
const PROVENANCE_PATH = "benchmarks/skill-ir/pilots/zh-readme/source-oracle-provenance.json"
const CONTRACT_PATH = "src/benchmarks/skill-ir/zh-readme-contract.ts"
const ORACLE_PATH = "src/benchmarks/skill-ir/zh-readme-oracle.ts"
const EVALUATOR_PATH = "src/bench/evaluators/zh-readme-grade.ts"
const AUDIT_PATH = "src/benchmarks/skill-ir/zh-readme-contract-audit.ts"

const CASE_IDS = [
  "positive-primary",
  "positive-reordered",
  "missing-command",
  "fabricated-command",
  "fabricated-link",
  "fabricated-path",
  "wrong-license",
  "english-only",
  "source-modified",
  "unexpected-file",
] as const

type Task = ZhReadmeTaskSet["tasks"][number]
type CaseId = (typeof CASE_IDS)[number]
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)

const ProvenanceSchema = z.object({
  schemaVersion: z.literal("skill-ir-zh-readme-source-oracle-provenance/v1"),
  skillId: z.literal("zh-readme"),
  claims: z.array(z.object({
    claimId: z.enum(["repository-fact-grounding", "manifest-command-derivation", "output-and-no-fabrication"]),
    path: z.string().min(1),
    sha256: Sha256Schema,
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    anchorSha256: Sha256Schema,
  }).strict()).length(3),
  runtimeReadable: z.literal(false),
  taskVisible: z.literal(false),
}).strict()

export const ZhReadmeContractAuditReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-zh-readme-contract-audit/v1"),
  auditId: z.literal("zh-readme-development-v1"),
  status: z.enum(["passed", "failed"]),
  inputs: z.object({
    developmentTasksSha256: Sha256Schema,
    publicInterfaceSha256: Sha256Schema,
    taskSplitFreezeSha256: Sha256Schema,
    sourceProvenanceSha256: Sha256Schema,
    contractImplementationSha256: Sha256Schema,
    oracleImplementationSha256: Sha256Schema,
    evaluatorImplementationSha256: Sha256Schema,
    auditImplementationSha256: Sha256Schema,
  }).strict(),
  counts: z.object({ tasks: z.number().int().nonnegative(), cases: z.number().int().nonnegative(), matched: z.number().int().nonnegative() }).strict(),
  cases: z.array(z.object({
    taskId: z.string().min(1),
    caseId: z.enum(CASE_IDS),
    expectedPass: z.boolean(),
    observedPass: z.boolean(),
    status: z.enum(["matched", "mismatched"]),
    criteria: z.array(z.object({
      criterionId: z.string().min(1), pass: z.boolean(), score: z.number().min(0).max(1), infrastructure: z.boolean(),
    }).strict()).length(5),
  }).strict()),
  reverseEvidence: z.object({
    removedLinksDisappear: z.boolean(),
    removedCommandDisappears: z.boolean(),
    unrelatedTaskLabelDoesNotChangeFacts: z.boolean(),
    unsupportedRepositoryStaysUnconfirmed: z.boolean(),
  }).strict(),
  leakChecks: z.object({
    taskVisibleHasNoGoldKeys: z.boolean(),
    developmentHasNoHeldoutSentinel: z.boolean(),
    payloadCanariesRejected: z.boolean(),
    unsafePayloadPathRejected: z.boolean(),
    provenanceNotRuntimeVisible: z.boolean(),
    reportHasNoRawModelContent: z.boolean(),
  }).strict(),
  issues: z.array(z.object({ taskId: z.string(), caseId: z.enum(CASE_IDS) }).strict()),
  claimBoundary: z.string().min(1),
}).strict()

export type ZhReadmeContractAuditReport = z.infer<typeof ZhReadmeContractAuditReportSchema>

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function repositoryFiles(task: Task): Record<string, string> {
  return Object.fromEntries(Object.entries(task.fixtures).filter(([name]) => name !== "readme-interface.json"))
}

function groupCommands(facts: ZhReadmeConfirmedFacts, role: "installation" | "quickstart" | "development"): string {
  return facts.commands.filter((entry) => entry.role === role).map((entry) => entry.command).join("\n")
}

function createValidReadme(facts: ZhReadmeConfirmedFacts, reordered: boolean): string {
  const pathLine = facts.paths[0] ? `主要实现位于 \`${facts.paths[0]}\`。` : "仓库结构以现有文件为准。"
  const links = facts.links.map((entry, index) => `[正式入口 ${index + 1}](${entry})`).join("、")
  const sections = [
    `## 安装\n\n\`\`\`bash\n${groupCommands(facts, "installation")}\n\`\`\``,
    `## 快速使用\n\n\`\`\`bash\n${groupCommands(facts, "quickstart")}\n\`\`\``,
    `## 项目结构\n\n${pathLine}${links ? `\n\n${links}` : ""}`,
    `## 开发与测试\n\n\`\`\`bash\n${groupCommands(facts, "development")}\n\`\`\``,
    `## 许可证\n\n本项目采用 ${facts.project.license ?? "待补充"} 许可证。`,
  ]
  if (reordered) sections.reverse()
  return [
    `# ${facts.project.name} 中文说明`,
    "",
    `${facts.project.name} 面向中文开发者整理仓库中已经公开的功能信息，帮助首次访问者理解项目并开始使用。`,
    "",
    ...sections,
    "",
  ].join("\n")
}

function runResult(workDir: string, reference: RunResult["initialWorkdirManifest"]): RunResult {
  return {
    text: "audit", steps: [], tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, cost: 0,
    durationMs: 0, llmDurationMs: 0, workDir, initialWorkdirManifest: reference, runStatus: "ok",
  }
}

async function auditCase(task: Task, caseId: CaseId) {
  const facts = deriveZhReadmeFacts(repositoryFiles(task))
  if (facts.status !== "confirmed") throw new Error(`development facts unconfirmed: ${task.id}`)
  const root = await mkdtemp(path.join(tmpdir(), "skvm-readme-contract-"))
  const workDir = path.join(root, "workdir")
  try {
    for (const [relativePath, text] of Object.entries(task.fixtures)) {
      const output = path.join(workDir, ...relativePath.split("/"))
      await mkdir(path.dirname(output), { recursive: true })
      await writeFile(output, text, "utf8")
    }
    const reference = await writeInitialWorkdirManifest({ workDir, manifestPath: path.join(root, "initial-workdir-manifest.json") })
    let readme = createValidReadme(facts, caseId === "positive-reordered")
    if (caseId === "missing-command") {
      for (const entry of facts.commands.filter((command) => command.role === "quickstart")) {
        readme = readme.replace(`${entry.command}\n`, "")
      }
    }
    if (caseId === "fabricated-command") readme = readme.replace(/```bash\n/u, "```bash\nnpm run deploy\n")
    if (caseId === "fabricated-link") readme += "\n[下载](https://fake.example/download)\n"
    if (caseId === "fabricated-path") readme += "\n入口位于 `src/does-not-exist.ts`。\n"
    if (caseId === "wrong-license" && facts.project.license) readme = readme.replaceAll(facts.project.license, "GPL-3.0")
    if (caseId === "english-only") {
      readme = `# ${facts.project.name}\n\nRepository overview for developers.\n\n## Install\n\n\`\`\`bash\n${groupCommands(facts, "installation")}\n\`\`\`\n\n## Quick start\n\n\`\`\`bash\n${groupCommands(facts, "quickstart")}\n\`\`\`\n\n## Development\n\n\`\`\`bash\n${groupCommands(facts, "development")}\n\`\`\`\n\n## License\n\n${facts.project.license ?? "Pending"}\n`
    }
    await writeFile(path.join(workDir, "README.zh-CN.md"), readme, "utf8")
    if (caseId === "source-modified") {
      const manifest = task.fixtures["package.json"] ? "package.json" : "pyproject.toml"
      await writeFile(path.join(workDir, manifest), `${task.fixtures[manifest]}# modified\n`, "utf8")
    }
    if (caseId === "unexpected-file") await writeFile(path.join(workDir, "debug.log"), "unexpected\n", "utf8")

    const criteria = []
    for (const rawCriterion of task.eval) {
      const criterion = EvalCriterionSchema.parse(rawCriterion)
      if (criterion.method !== "custom") throw new Error("zh-readme criterion must be custom")
      const result = await zhReadmeGrade.run({ criterion, runResult: runResult(workDir, reference) })
      criteria.push({ criterionId: rawCriterion.id, pass: result.pass, score: result.score, infrastructure: result.infraError !== undefined })
    }
    const observedPass = criteria.every((entry) => entry.pass && !entry.infrastructure)
    const expectedPass = caseId === "positive-primary" || caseId === "positive-reordered"
    return {
      taskId: task.id, caseId, expectedPass, observedPass,
      status: observedPass === expectedPass ? "matched" as const : "mismatched" as const,
      criteria,
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

function hasForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasForbiddenKey)
  if (value && typeof value === "object") {
    return Object.entries(value).some(([key, nested]) =>
      /^(?:expected|expectedAnswer|gold|goldAnswer|answer|oracle|sourceQuote)$/iu.test(key) || hasForbiddenKey(nested))
  }
  return false
}

async function validateProvenance(rootDir: string, value: unknown): Promise<z.infer<typeof ProvenanceSchema>> {
  const provenance = ProvenanceSchema.parse(value)
  for (const claim of provenance.claims) {
    const bytes = await readFile(path.join(rootDir, ...claim.path.split("/")))
    if (sha256Bytes(bytes) !== claim.sha256) throw new Error(`source digest mismatch: ${claim.claimId}`)
    const lines = bytes.toString("utf8").replace(/\r\n/g, "\n").split("\n")
    const anchor = `${lines.slice(claim.startLine - 1, claim.endLine).join("\n")}\n`
    if (sha256Bytes(Buffer.from(anchor, "utf8")) !== claim.anchorSha256) throw new Error(`source anchor mismatch: ${claim.claimId}`)
  }
  return provenance
}

export async function buildZhReadmeContractAudit(input: { rootDir: string }): Promise<ZhReadmeContractAuditReport> {
  const rootDir = path.resolve(input.rootDir)
  const read = (relativePath: string) => readFile(path.join(rootDir, ...relativePath.split("/")))
  const [developmentBytes, interfaceBytes, splitFreezeBytes, provenanceBytes, contractBytes, oracleBytes, evaluatorBytes, auditBytes] = await Promise.all([
    read(DEVELOPMENT_PATH), read(INTERFACE_PATH), read(SPLIT_FREEZE_PATH), read(PROVENANCE_PATH),
    read(CONTRACT_PATH), read(ORACLE_PATH), read(EVALUATOR_PATH), read(AUDIT_PATH),
  ])
  const taskSet = ZhReadmeTaskSetSchema.parse(JSON.parse(developmentBytes.toString("utf8")))
  const provenance = await validateProvenance(rootDir, JSON.parse(provenanceBytes.toString("utf8")))
  const cases = []
  for (const task of taskSet.tasks) {
    for (const caseId of CASE_IDS) cases.push(await auditCase(task, caseId))
  }

  const firstFiles = repositoryFiles(taskSet.tasks[0])
  const manifest = JSON.parse(firstFiles["package.json"]!) as Record<string, unknown>
  const before = deriveZhReadmeFacts(firstFiles)
  const after = deriveZhReadmeFacts({
    ...firstFiles,
    "package.json": `${JSON.stringify({ ...manifest, homepage: undefined, repository: undefined, scripts: { start: "node src/cli.js", lint: "node --check src/cli.js" } }, null, 2)}\n`,
  })
  const tagged = deriveZhReadmeFacts({ ...firstFiles, "TEST_ONLY_TASK_LABEL.txt": "unrelated\n" })
  const reverseEvidence = {
    removedLinksDisappear: before.status === "confirmed" && after.status === "confirmed" && before.links.length > 0 && after.links.length === 0,
    removedCommandDisappears: before.status === "confirmed" && after.status === "confirmed"
      && before.commands.some((entry) => entry.command === "npm test") && !after.commands.some((entry) => entry.command === "npm test"),
    unrelatedTaskLabelDoesNotChangeFacts: JSON.stringify(before) === JSON.stringify(tagged),
    unsupportedRepositoryStaysUnconfirmed: deriveZhReadmeFacts({ "notes.txt": "plain text\n" }).status === "unconfirmed",
  }

  const exemplarPayload = taskSet.tasks[0].eval[0]!.payload
  const payloadCanariesRejected = ["gold", "rawModel", "sourceQuote", "heldout"].every((key) =>
    !ZhReadmeGradePayloadSchema.safeParse({ ...exemplarPayload, [key]: "TEST_ONLY_CANARY" }).success)
  const unsafePayload = {
    ...exemplarPayload,
    protectedSha256: { ...exemplarPayload.protectedSha256, "../outside.json": "0".repeat(64) },
  }
  const leakChecks = {
    taskVisibleHasNoGoldKeys: !hasForbiddenKey(taskSet),
    developmentHasNoHeldoutSentinel: !developmentBytes.toString("utf8").includes("TEST_ONLY_HELDOUT_ZH_README"),
    payloadCanariesRejected,
    unsafePayloadPathRejected: !ZhReadmeGradePayloadSchema.safeParse(unsafePayload).success,
    provenanceNotRuntimeVisible: !provenance.runtimeReadable && !provenance.taskVisible,
    reportHasNoRawModelContent: cases.every((entry) => !JSON.stringify(entry).includes("rawModel")),
  }
  const issues = cases.filter((entry) => entry.status === "mismatched").map((entry) => ({ taskId: entry.taskId, caseId: entry.caseId }))
  const allChecks = [...Object.values(reverseEvidence), ...Object.values(leakChecks)].every(Boolean)
  return ZhReadmeContractAuditReportSchema.parse({
    schemaVersion: "skill-ir-zh-readme-contract-audit/v1",
    auditId: "zh-readme-development-v1",
    status: issues.length === 0 && allChecks ? "passed" : "failed",
    inputs: {
      developmentTasksSha256: sha256(developmentBytes), publicInterfaceSha256: sha256(interfaceBytes),
      taskSplitFreezeSha256: sha256(splitFreezeBytes), sourceProvenanceSha256: sha256(provenanceBytes),
      contractImplementationSha256: sha256(contractBytes), oracleImplementationSha256: sha256(oracleBytes),
      evaluatorImplementationSha256: sha256(evaluatorBytes), auditImplementationSha256: sha256(auditBytes),
    },
    counts: { tasks: taskSet.tasks.length, cases: cases.length, matched: cases.length - issues.length },
    cases, reverseEvidence, leakChecks, issues,
    claimBoundary: "Development-only deterministic benchmark contract audit; no model, IR, artifact, held-out, or optimization claim.",
  })
}
