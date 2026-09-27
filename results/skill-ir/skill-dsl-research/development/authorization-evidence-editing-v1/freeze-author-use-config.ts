import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { loadLocalAuthorizationInput } from "../../../../../src/benchmarks/authorization-dsl/local-input.ts"

const root = import.meta.dir
const repo = path.resolve(root, "../../../../..")
const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex")
const bind = (file: string) => ({ path: path.relative(repo, file).replaceAll("\\", "/"), sha256: hash(readFileSync(file)) })
const briefs = JSON.parse(readFileSync(path.join(root, "author-use-briefs.json"), "utf8")) as { model: string; packages: any[] }
const authorPlan = JSON.parse(readFileSync(path.join(root, "author-use-plan.json"), "utf8")) as { sources: Array<{ path: string; sha256: string }> }
const scaffold = JSON.parse(readFileSync(path.join(root, "markdown-consumer-plan.json"), "utf8")) as { packages: Record<string, any> }
const units = []
for (const brief of briefs.packages) {
  let sourceIdentity: string | undefined
  for (const phase of ["original", "changed"] as const) for (const representation of ["markdown", "dsl"] as const) {
    const dir = path.join(root, "author-packages", brief.id, representation)
    const inputFile = representation === "markdown" ? path.join(dir, `assessment-${phase}.json`)
      : phase === "original" ? path.join(dir, "original.json")
      : path.join(dir, brief.id === "memos-space-policy" ? "changed-final" : "changed", "assessment.json")
    const loaded = await loadLocalAuthorizationInput(inputFile)
    if (loaded.status !== "valid" || loaded.task.taskId !== brief.taskId || loaded.task.repository !== brief.repository
      || loaded.task.sourceRef !== brief.sourceRef) throw new Error(`Invalid author-use input ${brief.id}/${representation}/${phase}`)
    const scenarios = brief.scenarios.map((item: any) => item.key).sort()
    const obligations = loaded.task.obligations.map(item => item.id.replace(/^scenario:/, "")).sort()
    if (JSON.stringify(scenarios) !== JSON.stringify(obligations)) throw new Error(`Scenario drift ${brief.id}/${representation}/${phase}`)
    const rule = scaffold.packages[brief.id]
    const expected = phase === "changed" ? rule.changedExpectations : rule.originalExpectations
    for (const obligation of loaded.task.obligations) if (obligation.expectation !== expected[obligation.id.replace(/^scenario:/, "")])
      throw new Error(`Policy expectation drift ${brief.id}/${representation}/${phase}/${obligation.id}`)
    const expectedPolicy = phase === "changed" ? brief.changedPolicy ?? brief.originalPolicy : brief.originalPolicy
    if (!loaded.task.policySources.some(item => item.text === expectedPolicy)) throw new Error(`Policy text drift ${brief.id}/${representation}/${phase}`)
    const source = JSON.stringify(loaded.sourceBundle.files.map(item => ({ path: item.relativePath, sha256: item.sha256 })).sort((a, b) => a.path.localeCompare(b.path)))
    if (sourceIdentity && sourceIdentity !== source) throw new Error(`Source byte drift within package ${brief.id}`)
    sourceIdentity = source
    const markdown = representation === "markdown" ? bind(path.join(dir, phase === "original" ? "original.md"
      : brief.id === "paperless-note-relation" ? "changed-final.md" : "changed.md")) : undefined
    units.push({ id: `${brief.id}-${representation}-${phase}`, packageId: brief.id, phase, representation,
      input: bind(inputFile), ...(markdown ? { markdown } : {}), scenarios })
  }
}
if (units.length !== 8 || units.reduce((sum, unit) => sum + unit.scenarios.length, 0) !== 16) throw new Error("Author-use denominator changed")
const selected = ["author-original-selected.json", "author-changes-selected.json", "author-revisions-selected.json",
  "markdown-consumer-plan.json"].map(file => bind(path.join(root, file)))
const implementation = ["src/benchmarks/authorization-dsl/local-run.ts", "src/benchmarks/authorization-dsl/markdown-study.ts",
  "src/benchmarks/authorization-dsl/change-report.ts", "src/benchmarks/authorization-dsl/authoring-workspace/local-edit.ts",
  "results/skill-ir/skill-dsl-research/development/authorization-evidence-editing-v1/run-author-use.ts"].map(file => bind(path.join(repo, ...file.split("/"))))
const config = { schemaVersion: "authorization-aj-author-use-config/v1", frozenBeforeConsumerRun: true,
  planSha256: hash(readFileSync(path.join(root, "author-use-plan.json"))),
  oracleSha256: hash(readFileSync(path.join(root, "author-use-oracle.json"))),
  brief: bind(path.join(root, "author-use-briefs.json")), selected, sources: authorPlan.sources,
  implementation, model: briefs.model, wireVersion: "v6", method: "plain", assessmentMode: "explicit-v1", reasoningStrategy: "standard",
  executionOptions: { timeoutMs: 300_000, unitTimeoutMs: 900_000, maxTokens: 6_000, maxProviderDispatches: 4, maxDomainRepairs: 1 }, units }
writeFileSync(path.join(root, "author-use-config.json"), `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
process.stdout.write(`${JSON.stringify({ units: units.length, scenarios: 16, configSha256: hash(JSON.stringify(config, null, 2) + "\n") })}\n`)
