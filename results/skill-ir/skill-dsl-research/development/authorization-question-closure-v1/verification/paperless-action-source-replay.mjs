import { readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { buildStructureIndex } from "../../../../../../src/benchmarks/authorization-dsl/evidence-preparation/structure-index.ts"
import { operationWork } from "../../../../../../src/benchmarks/authorization-dsl/operation-work.ts"

const ay = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), base = path.resolve(ay, "../authorization-focused-closure-v1")
const sha = data => createHash("sha256").update(data).digest("hex")
const originalBytes = await readFile(path.join(base, "source-provenance/locked-framework-v1.json")), original = JSON.parse(originalBytes)
const supplementBytes = await readFile(path.join(ay, "source-provenance/drf-action-source-v1.json")), supplement = JSON.parse(supplementBytes)
if (sha(originalBytes) !== supplement.originalProvenanceSha256) throw new Error("original-provenance-changed")
const files = await Promise.all([...original.appFiles, ...original.dependencyFiles].map(async source => {
  const bytes = await readFile(path.join(base, "model/source/paperless-framework-v1", source.path))
  if (sha(bytes) !== source.sha256) throw new Error(`frozen-source-changed:${source.path}`)
  return { path: source.path, content: bytes.toString("utf8") }
}))
const bytes = await readFile(path.join(ay, supplement.source.path))
if (sha(bytes) !== supplement.source.sha256) throw new Error("supplement-source-changed")
const identity = { repository: original.appRepository, sourceRef: original.appRef }, receiverClass = "documents.views.UnifiedSearchViewSet"
const before = await buildStructureIndex(files, identity), current = await buildStructureIndex([...files, { path: supplement.source.indexPath, content: bytes.toString("utf8") }], identity)
const entry = current.lookupMethod(receiverClass, "download")
if (entry.length !== 1) throw new Error("actual-method-not-unique")
const mappings = current.requestActions(receiverClass).filter(a => a.methodMappings.some(m => m.candidateIds.includes(entry[0].id)))
const work = operationWork(current, entry[0].id, [], [], receiverClass, { sourceAssisted: true, operationRoot: true, questionDirected: true })
const record = {
  schemaVersion: "authorization-drf-source-work-replay/v1", date: "2026-10-08",
  originalProvenanceSha256: sha(originalBytes), supplementSha256: sha(supplementBytes),
  originalSourceIdsPreserved: files.every(file => before.symbols.filter(s => s.path === file.path).every(s => current.symbols.some(c => c.id === s.id && c.sha256 === s.sha256))),
  relationshipVersion: current.relationshipVersion, sourceVersion: supplement.dependency,
  entry: entry[0], receiverClass,
  before: before.requestActions(receiverClass).filter(a => a.methodMappings.some(m => m.candidateIds.includes(entry[0].id))),
  current: mappings,
  operationWork: { ...work, actions: work.actions.map(a => ({ ...a, source: current.symbols.find(s => s.id === a.candidateId) })) },
  invocation: "unproven", fullFrameworkComposition: "pending",
  semanticUnitsAuthored: 0, materialUses: 0, originalAttemptPromoted: false,
  originalInputsAndAllowlistsUnmodified: true, newModelInputRegistered: false,
  modelExecutions: 0, targetExecutions: 0, networkRequests: 0,
  costs: { experimentTokens: 0, developerAndScoutTokens: null, usd: null, humanTime: null },
}
if (await readFile(path.join(base, "source-provenance/locked-framework-v1.json")).then(sha) !== sha(originalBytes)) throw new Error("original-provenance-changed")
const output = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ay, "verification/paperless-action-source-replay.json")
await writeFile(output, JSON.stringify(record, null, 2) + "\n", { flag: "wx" })
process.stdout.write(JSON.stringify({ output, originalSourceIdsPreserved: record.originalSourceIdsPreserved, actionMappings: mappings.length, httpMappings: mappings.flatMap(m => m.methodMappings), sourceActions: work.actions.length, frameworkGaps: work.frameworkGaps, modelExecutions: 0, targetExecutions: 0 }, null, 2) + "\n")
