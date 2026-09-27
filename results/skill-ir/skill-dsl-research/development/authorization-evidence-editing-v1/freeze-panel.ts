import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { loadLocalAuthorizationInput } from "../../../../../src/benchmarks/authorization-dsl/local-input.ts"

const root = import.meta.dir
const repo = path.resolve(root, "../../../../..")
const caseIds = ["owui-file", "fastapi-superuser-read", "memos-create-share", "memos-get-shared", "memos-member-leave", "paperless-download", "paperless-note-post", "paperless-share-create"]
const arms = ["M0", "D0", "M1", "D1"] as const
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex")
const bind = (file: string) => ({ path: path.relative(repo, file).replaceAll("\\", "/"), sha256: hash(readFileSync(file)) })
const plan = JSON.parse(readFileSync(path.join(root, "author-plan.json"), "utf8")) as { model: string; caseOrder: string[]; publicBriefsSha256: string }
if (JSON.stringify(plan.caseOrder) !== JSON.stringify(caseIds) || hash(readFileSync(path.join(root, "public-briefs.json"))) !== plan.publicBriefsSha256) throw new Error("Author plan identity changed")

const cases = []
for (const id of caseIds) {
  const caseRoot = path.join(root, "inputs", id)
  const baselineInput = path.join(caseRoot, "baseline", "authoring.json")
  const preparedInput = path.join(caseRoot, "prepared-final", "assessment.json")
  const markdown = path.join(caseRoot, "independent.md")
  const [base, prepared] = await Promise.all([baselineInput, preparedInput].map(loadLocalAuthorizationInput))
  if (base.status !== "valid" || prepared.status !== "valid") throw new Error(`Invalid case ${id}`)
  const bindSources = (inputFile: string, loaded: typeof base) => {
    if (loaded.status !== "valid") throw new Error("unreachable")
    return loaded.normalizedInput.sources.map(source => bind(path.resolve(path.dirname(inputFile), loaded.normalizedInput.sourceRoot, ...source.split("/"))))
  }
  if (base.task.taskId !== prepared.task.taskId || base.task.repository !== prepared.task.repository || base.task.sourceRef !== prepared.task.sourceRef) throw new Error(`Task identity drift ${id}`)
  if (base.analysisContract?.publicInstruction !== prepared.analysisContract?.publicInstruction) throw new Error(`Public instruction drift ${id}`)
  const attempt = JSON.parse(readFileSync(path.join(root, "author-attempts", `${id}.json`), "utf8")) as { caseId: string; model: string; response: { text: string; stopReason: string } }
  if (attempt.caseId !== id || attempt.model !== plan.model || attempt.response.stopReason !== "end_turn" || !attempt.response.text.trim()) throw new Error(`Independent author delivery invalid ${id}`)
  if (readFileSync(markdown, "utf8").trim() !== attempt.response.text.trim()) throw new Error(`Independent Markdown differs from first delivery ${id}`)
  cases.push({ id, taskId: base.task.taskId, repository: base.task.repository, sourceRef: base.task.sourceRef,
    baseline: { input: bind(baselineInput), sources: bindSources(baselineInput, base) },
    prepared: { input: bind(preparedInput), report: bind(path.join(caseRoot, "prepared-final", "report.json")), sources: bindSources(preparedInput, prepared) },
    markdown: bind(markdown), publicInstructionSha256: hash(base.analysisContract?.publicInstruction ?? "") })
}

const implementation = [
  "src/task-dsl/authorization/assessment-contract.ts", "src/task-dsl/authorization/assessment-program.ts",
  "src/task-dsl/authorization/outcome-result.ts", "src/task-dsl/authorization/render.ts",
  "src/benchmarks/authorization-dsl/authoring-v2.ts", "src/benchmarks/authorization-dsl/inputs.ts",
  "src/benchmarks/authorization-dsl/local-input.ts", "src/benchmarks/authorization-dsl/local-run.ts",
  "src/benchmarks/authorization-dsl/markdown-study.ts", "src/benchmarks/authorization-dsl/host.ts",
  "src/benchmarks/authorization-dsl/evidence-preparation/prepare.ts",
  "results/skill-ir/skill-dsl-research/development/authorization-evidence-editing-v1/run-panel.ts",
].map(file => bind(path.join(repo, ...file.split("/"))))
const units = []
for (let index = 0; index < caseIds.length; index++) {
  const id = caseIds[index]!
  const rotation = [...arms.slice(index % 4), ...arms.slice(0, index % 4)]
  for (const arm of rotation) units.push({ id: `initial-${id}-${arm}`, phase: "initial", caseId: id, arm, input: arm.endsWith("0") ? "baseline" : "prepared" })
}
for (const [index, id] of ["owui-file", "paperless-download"].entries()) {
  const rotation = [...arms.slice((index + 2) % 4), ...arms.slice(0, (index + 2) % 4)]
  for (const arm of rotation) units.push({ id: `repeat-${id}-${arm}`, phase: "repeat", caseId: id, arm, input: arm.endsWith("0") ? "baseline" : "prepared" })
}
const config = { schemaVersion: "authorization-aj-panel/v1", registeredBeforeAnalysis: true,
  exposure: "public-development: two named AI regressions and six new cases from two new public source projects",
  caseSelectionSha256: hash(readFileSync(path.join(root, "case-selection.json"))),
  authorPlanSha256: hash(readFileSync(path.join(root, "author-plan.json"))),
  publicBriefs: bind(path.join(root, "public-briefs.json")), implementation,
  model: plan.model, temperature: 0, method: "plain", wireVersion: "v6", assessmentMode: "explicit-v1", reasoningStrategy: "standard",
  executionOptions: { timeoutMs: 300_000, unitTimeoutMs: 900_000, maxTokens: 6_000, maxProviderDispatches: 4, maxDomainRepairs: 1 },
  budgetDecision: "Uniform 300s call and 900s session deadlines before any AJ analysis call; historical AI 180s client deadlines left nine completion-unknown units.",
  cases, units,
}
writeFileSync(path.join(root, "panel-config.json"), `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
process.stdout.write(`${JSON.stringify({ cases: cases.length, units: units.length, configSha256: hash(JSON.stringify(config, null, 2) + "\n") })}\n`)
