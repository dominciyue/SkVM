import { readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { buildStructureIndex } from "../../../../../../src/benchmarks/authorization-dsl/evidence-preparation/structure-index.ts"
import { operationWork } from "../../../../../../src/benchmarks/authorization-dsl/operation-work.ts"

const ay = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), base = path.resolve(ay, "../authorization-focused-closure-v1")
const sha = data => createHash("sha256").update(data).digest("hex")
const originalBytes = await readFile(path.join(base, "source-provenance/locked-framework-v1.json")), original = JSON.parse(originalBytes)
const files = await Promise.all([...original.appFiles, ...original.dependencyFiles].map(async source => {
  const bytes = await readFile(path.join(base, "model/source/paperless-framework-v1", source.path))
  if (sha(bytes) !== source.sha256) throw new Error(`frozen-source-changed:${source.path}`)
  return { path: source.path, content: bytes.toString("utf8") }
}))
const supplements = []
for (const name of ["drf-action-source-v1.json", "schema-decorator-source-v1.json"]) {
  const bytes = await readFile(path.join(ay, "source-provenance", name)), supplement = JSON.parse(bytes)
  if (sha(originalBytes) !== supplement.originalProvenanceSha256) throw new Error("original-provenance-changed")
  for (const source of supplement.sources ?? [supplement.source]) {
    const sourceBytes = await readFile(path.join(ay, source.path))
    if (sha(sourceBytes) !== source.sha256) throw new Error(`supplement-source-changed:${source.path}`)
    files.push({ path: source.indexPath, content: sourceBytes.toString("utf8") })
  }
  supplements.push({ path: `source-provenance/${name}`, sha256: sha(bytes), dependency: supplement.dependency })
}
const index = await buildStructureIndex(files, { repository: original.appRepository, sourceRef: original.appRef })
const receivers = ["documents.views.DocumentViewSet", "documents.views.UnifiedSearchViewSet"].map(receiverClass => {
  const source = index.symbols.find(s => s.kind === "class" && s.qualifiedName === receiverClass)
  if (!source) throw new Error(`receiver-source-missing:${receiverClass}`)
  const decorators = index.classDecorators(receiverClass), work = operationWork(index, source.id, [], [], receiverClass, { sourceAssisted: true, operationRoot: true, questionDirected: true })
  if (!decorators.some(d => d.sourceCandidates.some(c => c.role === "factory" && index.symbols.find(s => s.id === c.candidateId)?.qualifiedName.endsWith("drf_spectacular.utils.extend_schema_view")))) throw new Error(`class-factory-source-missing:${receiverClass}`)
  const candidateIds = new Set(decorators.flatMap(d => d.sourceCandidates.map(c => c.candidateId)))
  return { receiverClass, source, decorators, sourceWork: work.actions.filter(a => candidateIds.has(a.candidateId)).map(a => ({ ...a, candidate: index.symbols.find(s => s.id === a.candidateId) })), frameworkDependencies: work.frameworkDependencies, frameworkGaps: work.frameworkGaps }
})
const record = {
  schemaVersion: "authorization-source-class-decorator-replay/v1", date: "2026-10-08", originalProvenanceSha256: sha(originalBytes), supplements,
  relationshipVersion: index.relationshipVersion, frozenSourcesVerified: original.appFiles.length + original.dependencyFiles.length, receivers,
  modelReadEvidence: false, semanticUnitsAuthored: 0, materialUses: 0, invocation: "unproven", transformation: "unproven", fullFrameworkComposition: "pending",
  originalInputsAndAllowlistsUnmodified: true, newModelInputRegistered: false, originalAttemptPromoted: false,
  modelExecutions: 0, targetExecutions: 0, networkRequests: 0, costs: { experimentTokens: 0, developerAndScoutTokens: null, usd: null, humanTime: null },
}
if (await readFile(path.join(base, "source-provenance/locked-framework-v1.json")).then(sha) !== sha(originalBytes)) throw new Error("original-provenance-changed")
const output = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ay, "verification/paperless-class-decorators-replay.json")
await writeFile(output, JSON.stringify(record, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify({ output, sha256: sha(await readFile(output)), receivers: receivers.map(r => ({ receiverClass: r.receiverClass, declarations: r.decorators.length, sourceWork: r.sourceWork.length, gaps: [...new Set(r.frameworkGaps.map(g => g.code ?? g.key))] })), modelExecutions: 0, targetExecutions: 0, materialUses: 0 }))
