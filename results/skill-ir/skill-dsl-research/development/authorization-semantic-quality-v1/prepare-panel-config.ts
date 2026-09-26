import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const root = import.meta.dir
const repo = path.resolve(root, "../../../../..")
const relativeRoot = path.relative(repo, root).replaceAll("\\", "/")
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex")
const digest = async (relativePath: string) => ({ path: relativePath, sha256: hash(await readFile(path.join(repo, relativePath))) })

const ids = [
  "owui-file", "owui-text", "owui-header", "fastapi-foreign-update",
  "gitea-collaborator", "gitea-assignee", "gitea-lock", "fastapi-superuser-read",
]
const repeated = ["gitea-assignee", "gitea-lock", "gitea-collaborator"]
const arms = ["M0", "D0", "M1", "D1"] as const
const implementationPaths = [
  "src/task-dsl/authorization/reasoning-plan.ts",
  "src/task-dsl/authorization/render.ts",
  "src/benchmarks/authorization-dsl/host.ts",
  "src/benchmarks/authorization-dsl/local-input.ts",
  "src/benchmarks/authorization-dsl/local-run.ts",
  "src/benchmarks/authorization-dsl/markdown-study.ts",
  "src/providers/structured.ts",
  `${relativeRoot}/run-panel.ts`,
]

const cases = []
for (const id of ids) {
  const input = `${relativeRoot}/inputs/${id}/authoring.json`
  const markdown = `${relativeRoot}/markdown/${id}.md`
  const authoring = JSON.parse(await readFile(path.join(repo, input), "utf8"))
  const sourceRoot = `${relativeRoot}/inputs/${id}/source`
  const sources = await Promise.all(authoring.sources.map((source: string) => digest(`${sourceRoot}/${source}`)))
  cases.push({
    id, taskId: authoring.taskId, repository: authoring.repository, sourceRef: authoring.sourceRef,
    input: await digest(input), markdown: await digest(markdown), sources,
  })
}

const firstOrder = new Map<string, string[]>()
const units = []
for (const [index, id] of ids.entries()) {
  const order = [...arms.slice(index % 4), ...arms.slice(0, index % 4)]
  firstOrder.set(id, order)
  for (const arm of order) units.push({ id: `initial-${id}-${arm}`, phase: "initial", caseId: id, arm, reasoningStrategy: arm.endsWith("1") ? "control-binding-v1" : "standard", wire: "v4" })
}
for (const id of repeated) {
  for (const arm of [...firstOrder.get(id)!].reverse()) units.push({ id: `repeat-${id}-${arm}`, phase: "repeat", caseId: id, arm, reasoningStrategy: arm.endsWith("1") ? "control-binding-v1" : "standard", wire: "v4" })
}

const config = {
  schemaVersion: "authorization-ah-panel/v1",
  registeredBeforeModelDispatch: true,
  exposure: "public-development; previously exposed source families and task states recorded separately",
  implementationRevision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(),
  implementation: await Promise.all(implementationPaths.map(digest)),
  model: "xty/gpt-5.6-sol", temperature: 0, autoProbe: false,
  method: "plain", wire: "v4",
  executionOptions: { timeoutMs: 180000, unitTimeoutMs: 600000, maxTokens: 6000, maxProviderDispatches: 4, maxDomainRepairs: 1 },
  cases, units,
  preselectedRepeatStates: repeated,
  limits: { initialUnits: 32, repeatUnits: 12, revisionUnitsMaximum: 8, usdCap: null },
  stopRule: "Run all registered initial and repeat units. Preserve any dispatched unknown completion without automatic resend. Revise only one shared implementation defect for at most two matched states; no outcome-selected replacement or success-driven sample addition.",
  evaluatorSha256: hash(await readFile(path.join(root, "evaluator", "rubrics.json"))),
  authorProvenance: "markdown-author-original.md and markdown-alignment.json",
}
if (units.length !== 44 || cases.length !== 8) throw Error("Panel denominator changed")
await writeFile(path.join(root, "panel-config.json"), `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
console.log(JSON.stringify({ status: "frozen", cases: cases.length, units: units.length, revision: config.implementationRevision, sha256: hash(JSON.stringify(config, null, 2) + "\n") }))
