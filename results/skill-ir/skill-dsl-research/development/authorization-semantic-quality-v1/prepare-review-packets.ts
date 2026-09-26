import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { hashAuthorizationRawOutput } from "../../../../../src/benchmarks/authorization-dsl/evaluate.ts"

const root = import.meta.dir
const repo = path.resolve(root, "../../../../..")
const read = async (file: string) => JSON.parse(await readFile(file, "utf8"))
const configBytes = await readFile(path.join(root, "panel-config.json"), "utf8")
const config = JSON.parse(configBytes)
const rubrics = await read(path.join(root, "evaluator", "rubrics.json"))
const evaluatorRoots = await read(path.join(root, "evaluator", "source-roots.json"))
const configHash = createHash("sha256").update(configBytes).digest("hex")
const reviewRoot = path.join(root, "evaluator", "review-packets")
await mkdir(reviewRoot, { recursive: true })
const map: Record<string, { unitId: string; generation: "initial" | "repair"; caseId: string; rawOutputSha256: string }> = {}
const counts: Record<string, number> = {}

for (const item of config.cases) {
  const provenance = await read(path.join(root, "inputs", item.id, "provenance.json"))
  const originalInputPath = path.join(repo, provenance.originalInput)
  const originalInput = await read(originalInputPath)
  const originalSourceRoot = evaluatorRoots.overrides[item.id]
    ? path.join(repo, evaluatorRoots.overrides[item.id])
    : path.resolve(path.dirname(originalInputPath), originalInput.sourceRoot)
  const rubric = rubrics.cases.find((candidate: any) => candidate.caseId === item.id)
  if (!rubric) throw Error(`Missing rubric ${item.id}`)
  const rows = []
  for (const unit of config.units.filter((candidate: any) => candidate.caseId === item.id)) {
    const stored = await read(path.join(root, "runs", unit.id, "unit.json"))
    if (stored.configSha256 !== configHash) throw Error(`Unit config identity mismatch ${unit.id}`)
    const session = path.join(root, "runs", unit.id, "sessions", stored.report.sessionId)
    const run = await read(path.join(session, "run.json"))
    for (const generation of ["initial", "repair"] as const) {
      const artifact = run[generation]
      if (!artifact) continue
      const anonymousId = `R${createHash("sha256").update(`${configHash}:${unit.id}:${generation}`).digest("hex").slice(0, 12)}`
      const rawOutputSha256 = hashAuthorizationRawOutput(artifact.rawResponse)
      map[anonymousId] = { unitId: unit.id, generation, caseId: item.id, rawOutputSha256 }
      rows.push({ anonymousId, generation, rawOutputSha256, result: artifact.result, validation: artifact.validation })
    }
  }
  rows.sort((a, b) => a.anonymousId.localeCompare(b.anonymousId))
  const sourcePaths = [...new Set([
    ...item.sources.map((source: any) => source.path.slice(`${path.relative(repo, root).replaceAll("\\", "/")}/inputs/${item.id}/source/`.length)),
    ...rubric.dispositionRule.sourceLocations.map((location: any) => location.path),
    ...rubric.scopeRule.sourceLocations.map((location: any) => location.path),
    ...rubric.criteria.flatMap((criterion: any) => criterion.sourceLocations.map((location: any) => location.path)),
  ])] as string[]
  const sources = []
  for (const relativePath of sourcePaths) {
    const current = path.join(root, "inputs", item.id, "source", relativePath)
    let text: string
    try { text = await readFile(current, "utf8") }
    catch { text = await readFile(path.join(originalSourceRoot, relativePath), "utf8") }
    sources.push({ path: relativePath, content: text })
  }
  const packet = {
    schemaVersion: "authorization-ah-blind-review-packet/v1", caseId: item.id,
    instructions: "Assess each anonymous answer against the accepted rubric and exact fixed source. For each criterion, disposition and scope, return supported/contradicted/missing/uncertain, answerLocation (or null), and a concise source-grounded reason. Accept logically equivalent wording. Ignore answer schema validity as proof of semantic correctness. Do not try to infer arm identity.",
    rubric, sources, rows,
  }
  counts[item.id] = rows.length
  await writeFile(path.join(reviewRoot, `${item.id}.json`), `${JSON.stringify(packet, null, 2)}\n`, { flag: "wx" })
}
await writeFile(path.join(root, "evaluator", "review-map.json"), `${JSON.stringify({ schemaVersion: "authorization-ah-blind-review-map/v1", configSha256: configHash, map }, null, 2)}\n`, { flag: "wx" })
console.log(JSON.stringify({ status: "prepared", cases: config.cases.length, anonymousRows: Object.keys(map).length, counts }))
