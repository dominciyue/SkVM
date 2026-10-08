import { readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { buildStructureIndex } from "../../../../../../src/benchmarks/authorization-dsl/evidence-preparation/structure-index.ts"
const ay = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), base = path.resolve(ay, "../authorization-focused-closure-v1")
const sha = bytes => createHash("sha256").update(bytes).digest("hex")
const originalBytes = await readFile(path.join(base, "source-provenance/locked-framework-v1.json")), original = JSON.parse(originalBytes)
const files = await Promise.all([...original.appFiles, ...original.dependencyFiles].map(async source => {
  const bytes = await readFile(path.join(base, "model/source/paperless-framework-v1", source.path))
  if (sha(bytes) !== source.sha256) throw new Error("frozen-source-changed:" + source.path)
  return { path: source.path, content: bytes.toString("utf8") }
}))
const supplements = []
for (const name of ["drf-action-source-v1.json", "schema-decorator-source-v1.json", "django-view-source-v1.json", "schema-runtime-source-v1.json"]) {
  const bytes = await readFile(path.join(ay, "source-provenance", name)), supplement = JSON.parse(bytes)
  if (sha(originalBytes) !== supplement.originalProvenanceSha256) throw new Error("original-provenance-changed")
  for (const source of supplement.sources ?? [supplement.source]) {
    const bytes = await readFile(path.join(ay, source.path))
    if (sha(bytes) !== source.sha256) throw new Error("supplement-source-changed:" + source.path)
    if (files.some(file => file.path === source.indexPath)) throw new Error("duplicate-source-path:" + source.indexPath)
    files.push({ path: source.indexPath, content: bytes.toString("utf8") })
  }
  supplements.push({ path: "source-provenance/" + name, sha256: sha(bytes) })
}
const index = await buildStructureIndex(files, { repository: original.appRepository, sourceRef: original.appRef })
const selectedNames = ["drf_spectacular.utils.extend_schema", "drf_spectacular.utils.extend_schema.decorator", "drf_spectacular.utils.extend_schema_view", "drf_spectacular.utils.extend_schema_view.decorator", "drf_spectacular.drainage.isolate_view_method", "drf_spectacular.drainage.isolate_view_method.wrapped_method", "rest_framework.views.APIView.dispatch", "rest_framework.viewsets.ViewSetMixin.as_view.view", "django.views.generic.base.View.dispatch", "django.views.generic.base.View.setup", "django.views.generic.base.View.as_view.view", "rest_framework.fields.SerializerMethodField.to_representation"]
const selectedBodies = selectedNames.map(name => {
  const sources = index.symbols.filter(s => s.kind === "function" && s.qualifiedName.endsWith(name))
  if (sources.length !== 1) throw new Error("body-not-unique:" + name)
  const source = sources[0], calls = index.relatedCalls(source.id)
  return { id: source.id, name: source.qualifiedName, path: source.path, sha256: source.sha256, superCandidates: calls.filter(c => c.superMethod).length, superGaps: calls.filter(c => c.gap?.startsWith("source-class-super-")).length, constructorGaps: calls.filter(c => c.gap?.startsWith("source-class-constructor-")).length, actualMaterialUses: 0 }
})
const selectedClasses = ["rest_framework.schemas.inspectors.ViewInspector", "rest_framework.schemas.inspectors.DefaultSchema", "drf_spectacular.openapi.AutoSchema"].map(name => {
  const candidates = index.resolveName(name, "src/paperless/settings/__init__.py").filter(s => s.kind === "class")
  if (candidates.length !== 1) throw new Error("class-not-unique:" + name)
  const source = candidates[0], proof = source.moduleClassDefinition, owner = index.symbols.find(s => s.id === proof?.ownerId)
  return { id: source.id, name: source.qualifiedName, path: source.path, sha256: source.sha256, staticMro: index.linearize(source.qualifiedName) ?? null, moduleDefinition: proof ? { ownerId: proof.ownerId, ownerSha256: proof.ownerSha256, gap: proof.gap ?? null, controls: proof.controls, bases: proof.bases, fields: proof.fields.length, methods: proof.methods.length } : null, initializerSource: owner ? { id: owner.id, path: owner.path, sha256: owner.sha256, startLine: owner.startLine, endLine: owner.endLine, functionDefinitions: owner.moduleInitialization?.functions.length ?? 0 } : null, actualInitializerMaterialUse: 0 }
})
const modules = index.symbols.filter(s => s.kind === "module"), definitions = index.symbols.filter(s => s.moduleClassDefinition), functions = modules.flatMap(s => s.moduleInitialization?.functions ?? [])
const record = { schemaVersion: "authorization-module-initialization-replay/v1", date: "2026-10-08", relationshipVersion: index.relationshipVersion, originalProvenanceSha256: sha(originalBytes), supplements, frozenSourcesVerified: original.appFiles.length + original.dependencyFiles.length, sourceFiles: files.length, moduleSources: modules.length, moduleClassDefinitions: definitions.length, sourceEligibleModuleClasses: definitions.filter(s => !s.moduleClassDefinition.gap).length, moduleFunctionDefinitions: functions.length, sourceEligibleModuleFunctions: functions.filter(f => !f.definition.gap).length, selectedClasses, selectedBodies, selectedSuperGaps: selectedBodies.reduce((sum, s) => sum + s.superGaps, 0), selectedConstructorGaps: selectedBodies.reduce((sum, s) => sum + s.constructorGaps, 0), selectedSuperCandidates: selectedBodies.reduce((sum, s) => sum + s.superCandidates, 0), allSuperGaps: index.calls.filter(c => c.gap?.startsWith("source-class-super-")).length, allConstructorGaps: index.calls.filter(c => c.gap?.startsWith("source-class-constructor-")).length, moduleImportConfigurationAndEnvironment: "pending", constructorDescriptorAndRequestExecution: "pending", modelReadEvidence: false, applicationSemanticUnitsAuthored: 0, materialUses: 0, modelExecutions: 0, targetExecutions: 0, probeNetworkRequests: 0, originalInputsAndAllowlistsUnmodified: true, oldResultsUnmodified: true, costs: { experimentTokens: 0, developerAndScoutTokens: null, usd: null, humanTime: null } }
if (await readFile(path.join(base, "source-provenance/locked-framework-v1.json")).then(sha) !== sha(originalBytes)) throw new Error("original-provenance-changed")
const output = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ay, "verification/paperless-module-initialization-replay.json")
await writeFile(output, JSON.stringify(record, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify({ output, sha256: sha(await readFile(output)), sourceFiles: files.length, moduleSources: modules.length, sourceEligibleModuleClasses: record.sourceEligibleModuleClasses, sourceEligibleModuleFunctions: record.sourceEligibleModuleFunctions, selectedClasses: selectedClasses.map(s => ({ name: s.name, moduleDefinitionGap: s.moduleDefinition?.gap })), selectedSuperGaps: record.selectedSuperGaps, selectedConstructorGaps: record.selectedConstructorGaps, allSuperGaps: record.allSuperGaps, allConstructorGaps: record.allConstructorGaps, materialUses: 0 }))
