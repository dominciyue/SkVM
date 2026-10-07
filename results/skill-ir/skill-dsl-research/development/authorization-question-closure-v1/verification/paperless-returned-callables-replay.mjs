import { readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { buildStructureIndex } from "../../../../../../src/benchmarks/authorization-dsl/evidence-preparation/structure-index.ts"

const ay = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), base = path.resolve(ay, "../authorization-focused-closure-v1")
const sha = data => createHash("sha256").update(data).digest("hex")
const originalBytes = await readFile(path.join(base, "source-provenance/locked-framework-v1.json")), original = JSON.parse(originalBytes)
const files = await Promise.all([...original.appFiles, ...original.dependencyFiles].map(async source => {
  const bytes = await readFile(path.join(base, "model/source/paperless-framework-v1", source.path))
  if (sha(bytes) !== source.sha256) throw new Error(`frozen-source-changed:${source.path}`)
  return { path: source.path, content: bytes.toString("utf8") }
}))
const supplements = []
for (const name of ["drf-action-source-v1.json", "schema-decorator-source-v1.json", "django-view-source-v1.json"]) {
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
const returnedSources = index.symbols.filter(s => s.returnedCallable)
const selectedSuffixes = ["rest_framework.viewsets.ViewSetMixin.as_view.view", "rest_framework.decorators.action.decorator", "drf_spectacular.utils.extend_schema_view.decorator", "drf_spectacular.utils.extend_schema.decorator", "drf_spectacular.drainage.isolate_view_method.wrapped_method", "django.views.generic.base.View.as_view.view"]
const selected = selectedSuffixes.map(suffix => {
  const source = index.symbols.find(s => s.qualifiedName.endsWith(suffix))
  if (!source) throw new Error(`factory-source-missing:${suffix}`)
  return { source, owner: index.symbols.find(s => s.id === source.localCallable?.ownerId), directCalls: index.calls.filter(c => c.candidateIds.includes(source.id) && !c.callableBinding), returnedInvocations: index.calls.filter(c => c.candidateIds.includes(source.id) && c.callableBinding), boundary: source.returnedCallable?.gap ?? (!source.returnedCallable ? "source-returned-callable-return-expression-unmodeled" : "source-returned-callable-actual-instance-unavailable") }
})
const invocations = index.calls.filter(c => c.callableBinding), gaps = Object.fromEntries([...new Set(returnedSources.map(s => s.returnedCallable.gap ?? "eligible-source-definition"))].sort().map(gap => [gap, returnedSources.filter(s => (s.returnedCallable.gap ?? "eligible-source-definition") === gap).length]))
const record = {
  schemaVersion: "authorization-source-returned-callable-replay/v1", date: "2026-10-08", originalProvenanceSha256: sha(originalBytes), supplements,
  relationshipVersion: index.relationshipVersion, frozenSourcesVerified: original.appFiles.length + original.dependencyFiles.length, sourceFiles: files.length,
  returnedSourceDefinitions: returnedSources.length, eligibleSourceDefinitions: returnedSources.filter(s => !s.returnedCallable.gap).length, sourceDefinitionGaps: gaps, selected, actualReturnedInvocations: invocations,
  modelReadEvidence: false, semanticUnitsAuthored: 0, materialUses: 0, fullFrameworkComposition: "pending",
  originalInputsAndAllowlistsUnmodified: true, newModelInputRegistered: false, originalAttemptPromoted: false,
  modelExecutions: 0, targetExecutions: 0, networkRequests: 0, costs: { experimentTokens: 0, developerAndScoutTokens: null, usd: null, humanTime: null },
}
if (await readFile(path.join(base, "source-provenance/locked-framework-v1.json")).then(sha) !== sha(originalBytes)) throw new Error("original-provenance-changed")
const output = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ay, "verification/paperless-returned-callables-replay.json")
await writeFile(output, JSON.stringify(record, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify({ output, sha256: sha(await readFile(output)), relationshipVersion: index.relationshipVersion, frozenSourcesVerified: record.frozenSourcesVerified, sourceFiles: files.length, returnedSourceDefinitions: record.returnedSourceDefinitions, eligibleSourceDefinitions: record.eligibleSourceDefinitions, sourceDefinitionGaps: gaps, selected: selected.map(s => ({ source: s.source.qualifiedName, boundary: s.boundary })), actualReturnedInvocations: invocations.length, modelExecutions: 0, targetExecutions: 0, materialUses: 0 }))
