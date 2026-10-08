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
  supplements.push({ path: `source-provenance/${name}`, sha256: sha(bytes) })
}
const index = await buildStructureIndex(files, { repository: original.appRepository, sourceRef: original.appRef }), actualReceiver = "documents.views.UnifiedSearchViewSet"
const selected = [["rest_framework.views.APIView.dispatch", actualReceiver], ["rest_framework.viewsets.ViewSetMixin.as_view.view"], ["django.views.generic.base.View.dispatch", actualReceiver], ["django.views.generic.base.View.setup", actualReceiver], ["django.views.generic.base.View.as_view.view"], ["rest_framework.fields.SerializerMethodField.to_representation"]]
const sources = []
for (const [suffix, receiverClass] of selected) {
  const matches = index.symbols.filter(s => s.qualifiedName.endsWith(suffix))
  if (matches.length !== 1) throw new Error(`source-not-unique:${suffix}`)
  const source = matches[0], window = { id: `mechanical-source-probe-${source.id}`, path: source.path, sha256: source.sha256, startLine: source.startLine, endLine: source.endLine }
  const skeleton = await buildSourceSkeleton(index, source, [window], receiverClass, "finite-control/v1", true, true)
  sources.push({ source, ...(receiverClass ? { receiverClass } : {}), mechanicalWindowOnly: true,
    attributeAssignments: skeleton.anchors.filter(a => a.kind === "assignment" && a.valueExpression && a.name !== a.valueExpression && /^[A-Za-z_]\w*\.[A-Za-z_]\w*$/.test(a.valueExpression)).map(a => ({ id: a.id, selector: a.selector, name: a.name, valueExpression: a.valueExpression, fieldWrite: a.fieldWrite, syntaxOnly: true })),
    calls: index.relatedCalls(source.id, receiverClass), gaps: skeleton.gaps,
  })
}
const aliasCalls = index.calls.filter(c => c.methodBinding || c.gap?.startsWith("source-method-alias-")).map(call => ({ owner: index.symbols.find(s => s.id === call.ownerId)?.qualifiedName, call }))
const choiceCalls = index.calls.filter(c => c.methodChoices || c.gap?.startsWith("source-method-choice-")).map(call => ({ owner: index.symbols.find(s => s.id === call.ownerId)?.qualifiedName, call }))
const lookupCalls = index.calls.filter(c => c.methodLookup || c.gap?.startsWith("source-method-lookup-")).map(call => ({ owner: index.symbols.find(s => s.id === call.ownerId)?.qualifiedName, call }))
const record = {
  schemaVersion: "authorization-source-method-lookup-replay/v1", date: "2026-10-08", relationshipVersion: index.relationshipVersion,
  originalProvenanceSha256: sha(originalBytes), supplements, frozenSourcesVerified: original.appFiles.length + original.dependencyFiles.length, sourceFiles: files.length, sources, aliasCalls, choiceCalls, lookupCalls,
  mechanicalWindowOnly: true, modelReadEvidence: false, applicationSemanticUnitsAuthored: 0, materialUses: 0,
  dynamicHandlerBinding: "pending", fieldCallableBinding: "pending", fullFrameworkComposition: "pending",
  originalInputsAndAllowlistsUnmodified: true, newModelInputRegistered: false, originalAttemptPromoted: false,
  modelExecutions: 0, targetExecutions: 0, networkRequests: 0, costs: { experimentTokens: 0, developerAndScoutTokens: null, usd: null, humanTime: null },
}
if (await readFile(path.join(base, "source-provenance/locked-framework-v1.json")).then(sha) !== sha(originalBytes)) throw new Error("original-provenance-changed")
const output = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ay, "verification/paperless-method-lookup-replay.json")
await writeFile(output, JSON.stringify(record, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify({ output, sha256: sha(await readFile(output)), sourceFiles: files.length, selectedBodies: sources.length, aliasCalls: aliasCalls.length, methodChoiceCalls: choiceCalls.length, sourceEligible: lookupCalls.filter(a => a.call.methodLookup).length, methodLookupCalls: lookupCalls.length, lookupGaps: [...new Set(lookupCalls.map(a => a.call.gap).filter(Boolean))], namedGaps: [...new Set(aliasCalls.map(a => a.call.gap).filter(Boolean))], modelReadEvidence: false, materialUses: 0, modelExecutions: 0, targetExecutions: 0 }))
