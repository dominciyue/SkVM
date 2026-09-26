import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
const root = import.meta.dir, repo = path.resolve(root, "../../../../..")
const relative = (p: string) => path.relative(repo, p).replaceAll("\\", "/")
const read = async (p: string) => JSON.parse(await readFile(p, "utf8"))
const hashFile = async (p: string) => createHash("sha256").update(await readFile(p)).digest("hex")
const abRoot = path.join(root, "../authorization-external-reuse-v1"), aaRoot = path.join(root, "../authorization-authoring-reuse-v1")
const ab = await read(path.join(abRoot, "panel-config.json")), aa = await read(path.join(aaRoot, "panel-config.json"))
const cases: any[] = ab.cases.filter((c: any) => c.project === "linkding").map((c: any) => ({ ...c, semanticCategory: "policy-enforced", materialOrigin: "AB unchanged original authored bytes", evaluator: { path: relative(path.join(abRoot, "evaluator/rubrics-v3.json")), sha256: ab.evaluatorSha256, sourceRoot: relative(path.join(abRoot, "evaluator/linkding")) } }))
for (const id of ["file", "header"]) {
  const c = aa.cases.find((c: any) => c.id === id)
  const input = await read(path.join(repo, c.input))
  const brief = { origin: c.input, taskId: input.task.taskId, request: input.task.request, acceptedPolicy: input.task.policySources, principals: input.task.principals, resources: input.task.resources, entries: input.task.entries, obligations: input.task.obligations, scope: input.task.scopeAssurance, requiredAnalysis: input.task.requiredAnalysis, constraints: input.task.constraints, publicQuestions: input.analysisRequirements.map((q: any) => q.question), conditionRequest: input.conditionAnalysisRequest, authoring: "Primary development agent wrote Markdown once from these neutral task facts; no DSL renderer, source answer or oracle used." }
  await writeFile(path.join(root, `materials/${id}-brief.json`), JSON.stringify(brief, null, 2) + "\n", { flag: "wx" })
  const markdown = relative(path.join(root, `materials/${id}.md`))
  cases.push({ id: `owui-${id}`, project: "open-webui", state: "existing-development", taskId: c.taskId, dsl: c.input, dslSha256: c.inputSha256, manifest: c.input, manifestSha256: c.inputSha256, markdown, markdownSha256: await hashFile(path.join(repo, markdown)), sources: c.sources, semanticCategory: id === "file" ? "policy-violation" : "deployment-undetermined", materialOrigin: "AA ordinary input and source unchanged; new independently worded MD from model-visible neutral brief", evaluator: { path: relative(path.join(aaRoot, "evaluator/rubrics-v3.json")), sha256: aa.evaluatorSha256, sourceRoot: "results/skill-ir/skill-dsl-research/development/authorization-v0" } })
}
const units: any[] = []
for (const [i, c] of cases.entries()) {
  const order = i % 2 === 0 ? [["markdown", "v4"], ["dsl", "v5"], ["markdown", "v5"], ["dsl", "v4"]] : [["dsl", "v4"], ["markdown", "v5"], ["dsl", "v5"], ["markdown", "v4"]]
  for (const [arm, wire] of order) units.push({ id: `${String(units.length + 1).padStart(2, "0")}-${c.id}-${arm}-${wire}`, caseId: c.id, arm, wire, method: "plain" })
}
const sourceFiles = ["src/task-dsl/authorization/policy-result.ts", "src/task-dsl/authorization/compact-transport.ts", "src/task-dsl/authorization/render.ts", "src/task-dsl/authorization/transport.ts", "src/benchmarks/authorization-dsl/host.ts", "src/benchmarks/authorization-dsl/local-run.ts", "src/benchmarks/authorization-dsl/local-input.ts", "src/benchmarks/authorization-dsl/markdown-study.ts", "src/providers/structured.ts"]
const implementation = await Promise.all(sourceFiles.map(async p => ({ path: p, sha256: await hashFile(path.join(repo, p)) })))
const config = { schemaVersion: "authorization-ae-panel/v1", exposure: "existing-development-mechanism", implementationRevision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(), implementation, implementationNote: "Source hashes also bind the AF prerequisite local-input change pending its separate integration commit.", model: "xty/gpt-5.6-sol", temperature: 0, autoProbe: false, executionOptions: aa.executionOptions, limits: { initialUnits: 24, additionalUnitsMaximum: 4, revisionReason: "one shared implementation defect only, at most two matched pairs", usdCap: null }, cases, units, evaluation: { timing: "Only after all generation terminates", rubric: "Existing v3 criteria and response detail rules unchanged; v5 maps mechanically to canonical", dimensions: ["first-response delivery", "final delivery", "policy label", "actual allow/deny/unknown reasoning", "necessary controls", "source evidence", "explanation", "justified unknown", "calls", "prompt/output/cache/time"], scoring: "Mapping correctness earns no semantic credit. Initial and revision separate. Same representation v4/v5 and same wire MD/DSL separately. No weighted score." }, missingMaterialPolicy: "Exclude with retained reason, no replacement", legacyAB: "Read-only; no denominator extension or rewrite", generationOracleAccess: false }
await writeFile(path.join(root, "panel-config.json"), JSON.stringify(config, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify({ cases: cases.length, units: units.length, implementationRevision: config.implementationRevision }))
