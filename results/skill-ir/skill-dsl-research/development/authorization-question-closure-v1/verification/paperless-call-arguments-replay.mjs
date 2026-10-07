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
const index = await buildStructureIndex(files, { repository: original.appRepository, sourceRef: original.appRef }), receiverClass = "documents.views.UnifiedSearchViewSet"
const selected = new Map()
for (const method of ["dispatch", "initial", "initialize_request", "as_view"]) for (const s of index.lookupMethod(receiverClass, method)) selected.set(s.id, { symbol: s, receiverClass })
for (const name of ["rest_framework.viewsets.ViewSetMixin.as_view.view", "drf_spectacular.utils.extend_schema_view", "drf_spectacular.utils.extend_schema_view.decorator", "drf_spectacular.utils.extend_schema", "drf_spectacular.utils.extend_schema.decorator", "drf_spectacular.drainage.get_view_method_names", "drf_spectacular.drainage.isolate_view_method", "drf_spectacular.drainage.isolate_view_method.wrapped_method"]) {
  const matches = index.symbols.filter(s => s.qualifiedName === name || s.qualifiedName.endsWith(`.${name}`))
  if (matches.length !== 1) throw new Error(`source-not-unique:${name}`)
  selected.set(matches[0].id, { symbol: matches[0] })
}
const sources = [...selected.values()].map(({ symbol, receiverClass }) => ({
  source: symbol, ...(receiverClass ? { receiverClass } : {}),
  calls: index.relatedCalls(symbol.id, receiverClass).map(call => {
    const target = call.candidateIds.length === 1 && index.symbols.find(s => s.id === call.candidateIds[0] && s.kind === "function")
    return { call, argumentBinding: target ? sourceArgumentBindings(index, call, target) : { bindings: [], gap: "source-callee-unresolved" } }
  }),
}))
const record = {
  schemaVersion: "authorization-source-call-binding-replay/v1", date: "2026-10-08", originalProvenanceSha256: sha(originalBytes), supplements,
  relationshipVersion: index.relationshipVersion, receiverClass, frozenSourcesVerified: original.appFiles.length + original.dependencyFiles.length, sources,
  modelReadEvidence: false, semanticUnitsAuthored: 0, materialUses: 0, mappingBinding: "unproven", invocation: "unproven", fullFrameworkComposition: "pending",
  originalInputsAndAllowlistsUnmodified: true, newModelInputRegistered: false, originalAttemptPromoted: false,
  modelExecutions: 0, targetExecutions: 0, networkRequests: 0, costs: { experimentTokens: 0, developerAndScoutTokens: null, usd: null, humanTime: null },
}
if (await readFile(path.join(base, "source-provenance/locked-framework-v1.json")).then(sha) !== sha(originalBytes)) throw new Error("original-provenance-changed")
const output = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ay, "verification/paperless-call-arguments-replay.json")
await writeFile(output, JSON.stringify(record, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify({ output, sources: sources.length, calls: sources.reduce((n, s) => n + s.calls.length, 0), bindingGaps: [...new Set(sources.flatMap(s => s.calls.map(c => c.argumentBinding.gap).filter(Boolean)))], modelExecutions: 0, targetExecutions: 0 }))
