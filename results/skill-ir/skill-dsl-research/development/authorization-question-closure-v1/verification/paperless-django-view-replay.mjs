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
let djangoSources = []
for (const name of ["drf-action-source-v1.json", "schema-decorator-source-v1.json", "django-view-source-v1.json"]) {
  const bytes = await readFile(path.join(ay, "source-provenance", name)), supplement = JSON.parse(bytes)
  if (sha(originalBytes) !== supplement.originalProvenanceSha256) throw new Error("original-provenance-changed")
  const selected = []
  for (const source of supplement.sources ?? [supplement.source]) {
    const sourceBytes = await readFile(path.join(ay, source.path))
    if (sha(sourceBytes) !== source.sha256) throw new Error(`supplement-source-changed:${source.path}`)
    selected.push({ path: source.indexPath, content: sourceBytes.toString("utf8") })
  }
  files.push(...selected)
  if (name === "django-view-source-v1.json") djangoSources = selected
  supplements.push({ path: `source-provenance/${name}`, sha256: sha(bytes), dependency: supplement.dependency })
}
const identity = { repository: original.appRepository, sourceRef: original.appRef }, index = await buildStructureIndex(files, identity)
const before = await buildStructureIndex(files.filter(file => !djangoSources.some(source => source.path === file.path)), identity)
const publicSource = djangoSources.find(source => source.path.endsWith("django/views/generic/__init__.py"))
if (!publicSource) throw new Error("public-view-source-missing")
const changed = await buildStructureIndex(files.map(file => file.path === publicSource.path ? { ...file, content: file.content + "\n# verification-only public binding revision\n" } : file), identity)
const unrelated = await buildStructureIndex([...files, { path: "unrelated_exports/__init__.py", content: "from django.views.generic import View\n" }], identity)
const view = index.symbols.find(s => s.kind === "class" && s.qualifiedName.endsWith("django.views.generic.base.View"))
const descriptor = index.symbols.find(s => s.kind === "class" && s.qualifiedName.endsWith("django.utils.decorators.classonlymethod"))
const apiView = index.symbols.find(s => s.qualifiedName === "rest_framework.views.APIView")
if (!view || !descriptor || !apiView || index.resolveName("View", apiView.path)[0]?.id !== view.id || !index.linearize(apiView.qualifiedName)?.includes(view.qualifiedName)) throw new Error("public-view-binding-not-canonical")
if (changed.candidateRevision(apiView.qualifiedName, "as_view") === index.candidateRevision(apiView.qualifiedName, "as_view") || unrelated.candidateRevision(apiView.qualifiedName, "as_view") !== index.candidateRevision(apiView.qualifiedName, "as_view")) throw new Error("selected-public-view-footprint-invalid")
const selectedSources = index.symbols.filter(s => s.className === view.qualifiedName && ["__init__", "as_view", "setup", "dispatch", "_allowed_methods"].includes(s.name) || s.className === descriptor.qualifiedName && s.name === "__get__")
const sourceWork = selectedSources.map(source => ({ source, calls: index.relatedCalls(source.id, source.className), work: operationWork(index, source.id, [], [], source.className, { sourceAssisted: true, operationRoot: true, questionDirected: true }) }))
const closure = index.symbols.find(s => s.localCallable?.ownerId === selectedSources.find(s => s.name === "as_view")?.id && s.name === "view")
if (!closure?.localCallable?.gap) throw new Error("escaped-view-closure-boundary-missing")
const receivers = ["documents.views.DocumentViewSet", "documents.views.UnifiedSearchViewSet"].map(receiverClass => ({ receiverClass, beforeMro: before.linearize(receiverClass), currentMro: index.linearize(receiverClass), bindingSources: index.classBindingSources(receiverClass), decorators: index.classDecorators(receiverClass), actionGaps: [...new Set(index.requestActions(receiverClass).map(action => action.gap).filter(Boolean))] }))
const record = {
  schemaVersion: "authorization-source-public-view-replay/v1", date: "2026-10-08", originalProvenanceSha256: sha(originalBytes), supplements,
  relationshipVersion: index.relationshipVersion, frozenSourcesVerified: original.appFiles.length + original.dependencyFiles.length,
  sourceFiles: files.length, publicViewBinding: { name: "django.views.generic.View", canonical: view.qualifiedName, source: view, bindingSources: index.classBindingSources(apiView.qualifiedName), selectedHopRevisionChanges: true, unrelatedExportRevisionStable: true }, descriptor, sourceWork, escapedFactoryClosure: closure, receivers,
  modelReadEvidence: false, semanticUnitsAuthored: 0, materialUses: 0, invocation: "unproven", transformation: "unproven", fullFrameworkComposition: "pending",
  originalInputsAndAllowlistsUnmodified: true, newModelInputRegistered: false, originalAttemptPromoted: false,
  modelExecutions: 0, targetExecutions: 0, networkRequests: 0, costs: { experimentTokens: 0, developerAndScoutTokens: null, usd: null, humanTime: null },
}
if (await readFile(path.join(base, "source-provenance/locked-framework-v1.json")).then(sha) !== sha(originalBytes)) throw new Error("original-provenance-changed")
const output = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ay, "verification/paperless-django-view-replay.json")
await writeFile(output, JSON.stringify(record, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify({ output, sha256: sha(await readFile(output)), relationshipVersion: index.relationshipVersion, frozenSourcesVerified: record.frozenSourcesVerified, sourceFiles: files.length, publicView: view.qualifiedName, bindingSources: record.publicViewBinding.bindingSources.map(s => s.path), sourceWork: sourceWork.length, escapedFactoryClosure: closure.localCallable.gap, receivers: receivers.map(receiver => ({ receiverClass: receiver.receiverClass, currentMro: receiver.currentMro, classDecoratorGaps: receiver.decorators.map(d => d.gap), actionGaps: receiver.actionGaps })), modelExecutions: 0, targetExecutions: 0, materialUses: 0 }))
