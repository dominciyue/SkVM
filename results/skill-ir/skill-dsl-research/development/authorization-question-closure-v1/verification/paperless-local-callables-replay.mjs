import { readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { buildStructureIndex } from "../../../../../../src/benchmarks/authorization-dsl/evidence-preparation/structure-index.ts"
import { sourceArgumentBindings } from "../../../../../../src/benchmarks/authorization-dsl/evidence-preparation/source-arguments.ts"

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
const selected = ["rest_framework.viewsets.ViewSetMixin.as_view.view", "rest_framework.decorators.action.decorator", "drf_spectacular.utils.extend_schema_view.decorator", "drf_spectacular.utils.extend_schema.decorator", "drf_spectacular.drainage.isolate_view_method.wrapped_method"].map(name => {
  const matches = index.symbols.filter(s => s.qualifiedName === name || s.qualifiedName.endsWith(`.${name}`))
  if (matches.length !== 1 || !matches[0].localCallable) throw new Error(`local-source-not-unique:${name}`)
  const symbol = matches[0], owner = index.symbols.find(s => s.id === symbol.localCallable.ownerId)
  return { source: symbol, owner: { id: owner.id, path: owner.path, sha256: owner.sha256, startLine: owner.startLine, endLine: owner.endLine }, calls: index.relatedCalls(symbol.id) }
})
const directSourceCalls = index.calls.filter(c => c.candidateIds.length === 1 && index.symbols.some(s => s.id === c.candidateIds[0] && s.localCallable)).map(call => ({ call, argumentBinding: sourceArgumentBindings(index, call, index.symbols.find(s => s.id === call.candidateIds[0])) }))
const record = {
  schemaVersion: "authorization-source-local-callables-replay/v1", date: "2026-10-08", originalProvenanceSha256: sha(originalBytes), supplements,
  relationshipVersion: index.relationshipVersion, frozenSourcesVerified: original.appFiles.length + original.dependencyFiles.length, selected, directSourceCalls,
  localCallableCount: index.symbols.filter(s => s.localCallable).length, localGapCounts: Object.fromEntries([...new Set(index.symbols.flatMap(s => s.localCallable?.gap ?? []))].map(gap => [gap, index.symbols.filter(s => s.localCallable?.gap === gap).length])),
  modelReadEvidence: false, semanticUnitsAuthored: 0, materialUses: 0, invocation: "unproven", fullFrameworkComposition: "pending",
  originalInputsAndAllowlistsUnmodified: true, newModelInputRegistered: false, originalAttemptPromoted: false,
  modelExecutions: 0, targetExecutions: 0, networkRequests: 0, costs: { experimentTokens: 0, developerAndScoutTokens: null, usd: null, humanTime: null },
}
if (await readFile(path.join(base, "source-provenance/locked-framework-v1.json")).then(sha) !== sha(originalBytes)) throw new Error("original-provenance-changed")
const output = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ay, "verification/paperless-local-callables-replay.json")
await writeFile(output, JSON.stringify(record, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify({ output, selected: selected.map(s => ({ name: s.source.qualifiedName, captures: s.source.localCallable.captures.map(c => c.name), gap: s.source.localCallable.gap })), directSourceCalls: directSourceCalls.length, localGapCounts: record.localGapCounts, modelExecutions: 0, targetExecutions: 0 }))
