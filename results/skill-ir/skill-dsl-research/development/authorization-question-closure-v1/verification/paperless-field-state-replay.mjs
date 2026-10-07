import { readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { buildStructureIndex } from "../../../../../../src/benchmarks/authorization-dsl/evidence-preparation/structure-index.ts"
import { buildSourceSkeleton } from "../../../../../../src/benchmarks/authorization-dsl/evidence-preparation/source-skeleton.ts"

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
const index = await buildStructureIndex(files, { repository: original.appRepository, sourceRef: original.appRef }), receiverClass = "documents.views.UnifiedSearchViewSet"
const selected = [
  ["rest_framework.views.APIView.dispatch", receiverClass],
  ["rest_framework.viewsets.ViewSetMixin.initialize_request", receiverClass],
  ["rest_framework.viewsets.ViewSetMixin.as_view.view"],
  ["django.views.generic.base.View.setup"],
  ["django.views.generic.base.View.dispatch"],
  ["django.views.generic.base.View.as_view.view"],
]
const sources = []
for (const [suffix, receiver] of selected) {
  const matches = index.symbols.filter(s => s.qualifiedName.endsWith(suffix))
  if (matches.length !== 1) throw new Error(`source-not-unique:${suffix}`)
  const source = matches[0]
  // This diagnostic window comes from verified host bytes, never an experimental
  // model read or adoptable semantic material.
  const window = { id: `mechanical-source-probe-${source.id}`, path: source.path, sha256: source.sha256, startLine: source.startLine, endLine: source.endLine }
  const skeleton = await buildSourceSkeleton(index, source, [window], receiver, "finite-control/v1", true, true)
  sources.push({ source, ...(receiver ? { receiverClass: receiver } : {}), mechanicalWindowOnly: true,
    fieldWrites: skeleton.anchors.filter(a => a.fieldWrite).map(a => ({ id: a.id, selector: a.selector, sourceSha256: a.sourceSha256, name: a.name, valueExpression: a.valueExpression, valueAnchorId: a.valueAnchorId, fieldWrite: a.fieldWrite, literalKnown: a.literalKnown, literalValue: a.literalValue, dependencyFacts: a.dependencyFacts })),
    calls: skeleton.anchors.filter(a => a.call).map(a => ({ id: a.id, selector: a.selector, call: a.call })), gaps: skeleton.gaps,
  })
}
const record = {
  schemaVersion: "authorization-source-field-state-replay/v1", date: "2026-10-08", originalProvenanceSha256: sha(originalBytes), supplements,
  relationshipVersion: index.relationshipVersion, frozenSourcesVerified: original.appFiles.length + original.dependencyFiles.length, sourceFiles: files.length, sources,
  mechanicalWindowOnly: true, modelReadEvidence: false, semanticUnitsAuthored: 0, materialUses: 0, handlerBinding: "pending", fullFrameworkComposition: "pending",
  originalInputsAndAllowlistsUnmodified: true, newModelInputRegistered: false, originalAttemptPromoted: false,
  modelExecutions: 0, targetExecutions: 0, networkRequests: 0, costs: { experimentTokens: 0, developerAndScoutTokens: null, usd: null, humanTime: null },
}
if (await readFile(path.join(base, "source-provenance/locked-framework-v1.json")).then(sha) !== sha(originalBytes)) throw new Error("original-provenance-changed")
const output = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ay, "verification/paperless-field-state-replay.json")
await writeFile(output, JSON.stringify(record, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify({ output, sha256: sha(await readFile(output)), relationshipVersion: index.relationshipVersion, sourceFiles: files.length, sources: sources.length, fieldWrites: sources.reduce((n, s) => n + s.fieldWrites.length, 0), sourceGaps: [...new Set(sources.flatMap(s => s.gaps.map(g => g.code)))], modelReadEvidence: false, materialUses: 0, modelExecutions: 0, targetExecutions: 0 }))
