import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const root = import.meta.dir
const repo = path.resolve(root, "../../../../..")
const ah = path.join(repo, "results/skill-ir/skill-dsl-research/development/authorization-semantic-quality-v1")
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex")
const relative = (value: string) => path.relative(repo, value).replaceAll("\\", "/")
const text = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`
const publicRequirements = JSON.parse(await readFile(path.join(root, "public-requirements.json"), "utf8"))
const oldConfig = JSON.parse(await readFile(path.join(ah, "panel-config.json"), "utf8"))
const cases: Array<Record<string, unknown>> = []

for (const requirement of publicRequirements.cases) {
  const sourceCase = oldConfig.cases.find((item: any) => item.id === requirement.sourceCase)
  if (!sourceCase) throw Error(`No public AH source case ${requirement.sourceCase}`)
  const oldInput = path.join(repo, sourceCase.input.path)
  const authored: any = JSON.parse(await readFile(oldInput, "utf8"))
  const scenarioName = Object.keys(authored.scenarios)[0]
  if (!scenarioName) throw Error(`No scenario for ${requirement.id}`)
  if (requirement.id === "fastapi-superuser-supplied-path") {
    authored.taskId = "fastapi-items-claimed-superuser-supplied-path"
    authored.request = requirement.currentQuestion
    authored.principals.caller.role = "external caller claiming to be an active superuser"
    authored.principals.caller.facts = ["The caller claims active-superuser status; the supplied handler crop does not establish what CurrentUser injects.", "The requested existing item belongs to another user."]
    authored.principals.caller.capabilities = ["can-request-read-item"]
    authored.scenarios[scenarioName].relation = "claimed-superuser-to-different-owner-with-binding-unproved"
    authored.scenarios[scenarioName].expectation = "conditional"
  }
  if (requirement.id === "gitea-collaborator-self") {
    authored.taskId = "gitea-collaborator-self-permission"
    authored.request = requirement.currentQuestion
    authored.principals.caller.facts = ["Authenticated", "Has repository read access", "Is a collaborator", "Is not a site administrator", "Is not a repository administrator", "Queries the caller's own existing username"]
    authored.resources["collaborator-permission"].facts = ["The queried existing collaborator account is the caller's own username", "Repository permission is queried through the collaborator permission endpoint"]
    authored.scenarios[scenarioName].relation = "caller-username-equals-collaborator-username"
    authored.scenarios[scenarioName].expectation = "allow"
  }
  const publicInstruction = [
    publicRequirements.commonInstruction,
    `Current question: ${requirement.currentQuestion}`,
    `Analysis boundary: ${requirement.boundary}.`,
    ...requirement.premises.map((premise: string) => `Task premise: ${premise}`),
    ...requirement.requestedBranches.map((branch: any) => `Requested counterfactual ${branch.id}: ${Object.entries(branch.assumptions).map(([condition, value]) => `${condition}=${value}`).join(", ")}.`),
    ...requirement.requiredResponseDetails.map((detail: string) => `Required response detail: ${detail}`),
  ].join("\n")
  authored.analysisContract = {
    schemaVersion: "authorization-analysis-contract/v1",
    publicInstruction,
    scenarios: { [scenarioName]: {
      boundary: requirement.boundary,
      premises: requirement.premises.map((statement: string, index: number) => ({ id: `premise-${index + 1}`, statement, atEntry: authored.scenarios[scenarioName].entries[0], provenance: "task-assumption" })),
      requestedBranches: requirement.requestedBranches.map((branch: any) => ({ id: branch.id, kind: "counterfactual", assumptions: Object.entries(branch.assumptions).map(([condition, value]) => ({ condition, value })) })),
      requiredResponseDetails: requirement.requiredResponseDetails,
    } },
  }
  const dir = path.join(root, "inputs", requirement.id)
  await mkdir(dir, { recursive: true })
  authored.sourceRoot = path.relative(dir, path.join(path.dirname(oldInput), "source")).replaceAll("\\", "/")
  const inputPath = path.join(dir, "authoring.json")
  await writeFile(inputPath, text(authored), { flag: "wx" })
  const markdownPath = path.join(dir, "independent.md")
  const oldMarkdown = path.join(repo, sourceCase.markdown.path)
  const markdown = requirement.id === "fastapi-superuser-supplied-path"
    ? `At the supplied FastAPI template source ref, assess the public supplied-path question about a caller claiming active-superuser status and another user's existing item. The accepted policy permits active superusers to read regardless of ownership, while other authenticated users are owner-bound. Use only the supplied items.py crop. Distinguish what the handler proves conditionally from whether the source proves the caller-to-current_user binding. Cite supplied locations and name decisive missing facts without inferring an upstream dependency or deployment state.\n`
    : requirement.id === "gitea-collaborator-self"
      ? `At the supplied Gitea source ref, assess the public self-query question for an authenticated repository-read collaborator who is neither site nor repository administrator. The accepted policy permits site administrators, repository administrators, or a caller querying their own username; otherwise it rejects before loading the collaborator. Use only the supplied collaborators.go crop, trace the stated relation and visible control, cite supplied locations, and do not execute or contact a deployment.\n`
      : await readFile(oldMarkdown, "utf8")
  await writeFile(markdownPath, markdown, { flag: "wx" })
  cases.push({ id: requirement.id, sourceCase: requirement.sourceCase, exposure: requirement.selection, taskId: authored.taskId,
    input: { path: relative(inputPath), sha256: hash(await readFile(inputPath)) },
    markdown: { path: relative(markdownPath), sha256: hash(await readFile(markdownPath)), origin: requirement.id === requirement.sourceCase ? "AH independent Markdown, reused without edit" : "new prose from frozen public scenario brief, independent of DSL rendering" },
    sources: sourceCase.sources,
    publicInstructionSha256: hash(publicInstruction),
  })
}

type Arm = "M0" | "D0" | "M1" | "D1"
const arms: Arm[] = ["M0", "D0", "M1", "D1"]
const units: Array<Record<string, unknown>> = []
const add = (id: string, phase: string, caseId: string, arm: Arm, mechanism?: string) => units.push({ id, phase, caseId, arm, assessmentMode: phase === "outcome-only" || arm.endsWith("0") ? "legacy" : "explicit-v1", wire: phase === "outcome-only" || arm.endsWith("1") ? "v6" : "v4", ...(mechanism ? { mechanism } : {}) })
cases.forEach((item: any, index) => {
  const rotated = [...arms.slice(index % 4), ...arms.slice(0, index % 4)]
  rotated.forEach(arm => add(`initial-${item.id}-${arm}`, "initial", item.id, arm))
})
for (const caseId of ["owui-text", "owui-header", "fastapi-superuser-read", "gitea-assignee"]) {
  for (const arm of [...arms].reverse()) add(`repeat-${caseId}-${arm}`, "repeat", caseId, arm)
}
for (const [mechanism, caseId] of [["label-direction", "owui-text"], ["entry-boundary", "fastapi-superuser-read"], ["requested-branches", "owui-header"]] as const) {
  for (const arm of ["M0", "D0"] as Arm[]) add(`outcome-only-${mechanism}-${arm}`, "outcome-only", caseId, arm, mechanism)
}
const implementationFiles = ["src/task-dsl/authorization/assessment-contract.ts", "src/task-dsl/authorization/assessment-program.ts", "src/task-dsl/authorization/outcome-result.ts", "src/task-dsl/authorization/render.ts", "src/benchmarks/authorization-dsl/authoring-v2.ts", "src/benchmarks/authorization-dsl/host.ts", "src/benchmarks/authorization-dsl/local-run.ts", "src/benchmarks/authorization-dsl/markdown-study.ts"]
const implementation = await Promise.all(implementationFiles.map(async value => ({ path: value, sha256: hash(await readFile(path.join(repo, value))) })))
const config = { schemaVersion: "authorization-ai-panel/v1", registeredBeforeModelDispatch: true, exposure: "public-development; six AH states plus two declared scenario variations", implementationRevision: "1f1b62a5", implementation, publicRequirementsSha256: hash(await readFile(path.join(root, "public-requirements.json"))), rubricSha256: hash(await readFile(path.join(root, "rubric.json"))), model: "xty/gpt-5.6-sol", temperature: 0, autoProbe: false, method: "plain", executionOptions: { timeoutMs: 180000, unitTimeoutMs: 600000, maxTokens: 6000, maxProviderDispatches: 4, maxDomainRepairs: 1 }, cases, units, stopRule: "No replacement or success-driven extra cases; one shared implementation bug revision only if evidenced." }
await writeFile(path.join(root, "panel-config.json"), text(config), { flag: "wx" })
console.log(JSON.stringify({ cases: cases.length, units: units.length, initial: 32, repeat: 16, outcomeOnly: 6, configSha256: hash(text(config)) }))
