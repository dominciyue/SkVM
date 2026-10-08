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
    const bytes = await readFile(path.join(ay, source.path))
    if (sha(bytes) !== source.sha256) throw new Error(`supplement-source-changed:${source.path}`)
    files.push({ path: source.indexPath, content: bytes.toString("utf8") })
  }
  supplements.push({ path: `source-provenance/${name}`, sha256: sha(bytes) })
}
const index = await buildStructureIndex(files, { repository: original.appRepository, sourceRef: original.appRef })
const selected = ["drf_spectacular.utils.extend_schema", "drf_spectacular.utils.extend_schema.decorator", "drf_spectacular.utils.extend_schema_view", "drf_spectacular.utils.extend_schema_view.decorator", "drf_spectacular.drainage.isolate_view_method", "drf_spectacular.drainage.isolate_view_method.wrapped_method", "rest_framework.views.APIView.dispatch", "rest_framework.viewsets.ViewSetMixin.as_view.view", "django.views.generic.base.View.dispatch", "django.views.generic.base.View.setup", "django.views.generic.base.View.as_view.view", "rest_framework.fields.SerializerMethodField.to_representation"].map(suffix => {
  const matches = index.symbols.filter(s => s.qualifiedName.endsWith(suffix))
  if (matches.length !== 1) throw new Error(`source-not-unique:${suffix}`)
  return matches[0]
})
const definitions = index.symbols.filter(s => s.classDefinition).map(s => ({ id: s.id, qualifiedName: s.qualifiedName, path: s.path, sha256: s.sha256, definition: s.classDefinition }))
const applications = index.calls.filter(c => c.implicitClassDecorator), namespaceCalls = index.calls.filter(c => c.classNamespaceCall)
const selectedDefinitions = definitions.filter(d => selected.some(s => s.id === d.definition.ownerId))
const methodFacts = definitions.flatMap(d => d.definition.methods.map(method => ({ classId: d.id, classGap: d.definition.gap ?? null, method })))
const captureFacts = index.symbols.flatMap(symbol => {
  const proof = symbol.classMethod ?? symbol.valueCallable ?? symbol.localCallable
  if (!proof) return []
  const gap = symbol.classMethod ? index.symbols.find(s => s.id === symbol.classMethod.classId)?.classDefinition?.gap : proof.gap
  return proof.captures.map(capture => ({ id: symbol.id, qualifiedName: symbol.qualifiedName, path: symbol.path, sha256: symbol.sha256, creationOwnerId: proof.ownerId, creationOwnerSha256: proof.ownerSha256, binding: capture.binding ?? { ownerId: proof.ownerId, ownerSha256: proof.ownerSha256 }, relay: capture.relay ?? [], name: capture.name, use: capture.use, gap: gap ?? null }))
})
const returnedDefinitions = index.symbols.filter(s => s.returnedCallable).map(s => ({ id: s.id, qualifiedName: s.qualifiedName, path: s.path, sha256: s.sha256, proof: s.returnedCallable }))
const sourceEligibility = { localClassDefinitions: definitions.length, eligibleLocalClassDefinitions: definitions.filter(d => !d.definition.gap).length, baseFacts: definitions.reduce((n, d) => n + d.definition.bases.length, 0), methodFacts: methodFacts.length, eligibleClassMethodFacts: methodFacts.filter(m => !m.classGap).length, namespaceCallCandidates: namespaceCalls.length, selectedBodyClassDefinitions: selectedDefinitions.length, selectedBodyEligibleClassDefinitions: selectedDefinitions.filter(d => !d.definition.gap).length, selectedBodyBaseFacts: selectedDefinitions.reduce((n, d) => n + d.definition.bases.length, 0), selectedBodyMethodFacts: selectedDefinitions.reduce((n, d) => n + d.definition.methods.length, 0), selectedBodyNamespaceCallCandidates: namespaceCalls.filter(c => selected.some(s => s.id === c.ownerId)).length, implicitApplicationCandidates: applications.length, selectedBodyImplicitApplicationCandidates: applications.filter(c => selected.some(s => s.id === c.ownerId)).length }
Object.assign(sourceEligibility, { captureFacts: captureFacts.length, ancestorCaptureFacts: captureFacts.filter(c => c.binding.ownerId !== c.creationOwnerId).length, relayCaptureFacts: captureFacts.filter(c => c.relay.length).length, eligibleRelayCaptureFacts: captureFacts.filter(c => c.relay.length && !c.gap).length, selectedBodyRelayCaptureFacts: captureFacts.filter(c => c.relay.length && selected.some(s => s.id === c.id)).length, returnedDefinitions: returnedDefinitions.length, eligibleReturnedDefinitions: returnedDefinitions.filter(d => !d.proof.gap).length, selectedBodyEligibleReturnedDefinitions: returnedDefinitions.filter(d => !d.proof.gap && selected.some(s => s.id === d.id)).length })
const record = { schemaVersion: "authorization-transitive-capture-replay/v1", date: "2026-10-08", relationshipVersion: index.relationshipVersion, originalProvenanceSha256: sha(originalBytes), supplements, frozenSourcesVerified: original.appFiles.length + original.dependencyFiles.length, sourceFiles: files.length, selectedBodies: selected.map(s => ({ id: s.id, qualifiedName: s.qualifiedName, path: s.path, sha256: s.sha256, startLine: s.startLine, endLine: s.endLine })), definitions, methodFacts, namespaceCalls, applications, captureFacts, returnedDefinitions, sourceEligibility, preparation: index.preparation, modelReadEvidence: false, applicationSemanticUnitsAuthored: 0, materialUses: 0, moduleInitialization: "pending", constructorInvocation: "pending", classTransformation: "pending", fullFrameworkComposition: "pending", originalInputsAndAllowlistsUnmodified: true, newModelInputRegistered: false, originalAttemptPromoted: false, modelExecutions: 0, targetExecutions: 0, networkRequests: 0, costs: { experimentTokens: 0, developerAndScoutTokens: null, usd: null, humanTime: null } }
if (await readFile(path.join(base, "source-provenance/locked-framework-v1.json")).then(sha) !== sha(originalBytes)) throw new Error("original-provenance-changed")
const output = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ay, "verification/paperless-transitive-capture-replay.json")
await writeFile(output, JSON.stringify(record, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify({ output, sha256: sha(await readFile(output)), sourceFiles: files.length, selectedBodies: selected.length, sourceEligibility, materialUses: 0, modelExecutions: 0, targetExecutions: 0 }))
