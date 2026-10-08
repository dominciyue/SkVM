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
  if (sha(bytes) !== source.sha256) throw new Error(`frozen-source-changed:${source.path}`)
  return { path: source.path, content: bytes.toString("utf8") }
}))
const supplements = []
for (const name of ["drf-action-source-v1.json", "schema-decorator-source-v1.json", "django-view-source-v1.json", "schema-runtime-source-v1.json"]) {
  const bytes = await readFile(path.join(ay, "source-provenance", name)), supplement = JSON.parse(bytes)
  if (sha(originalBytes) !== supplement.originalProvenanceSha256) throw new Error("original-provenance-changed")
  for (const source of supplement.sources ?? [supplement.source]) {
    const bytes = await readFile(path.join(ay, source.path))
    if (sha(bytes) !== source.sha256) throw new Error(`supplement-source-changed:${source.path}`)
    if (files.some(file => file.path === source.indexPath)) throw new Error(`duplicate-source-path:${source.indexPath}`)
    files.push({ path: source.indexPath, content: bytes.toString("utf8") })
  }
  supplements.push({ path: `source-provenance/${name}`, sha256: sha(bytes) })
}
const index = await buildStructureIndex(files, { repository: original.appRepository, sourceRef: original.appRef })
const selectedClasses = ["rest_framework.schemas.inspectors.ViewInspector", "rest_framework.schemas.inspectors.DefaultSchema", "drf_spectacular.openapi.AutoSchema"].map(name => {
  const candidates = index.resolveName(name, "src/paperless/settings/__init__.py").filter(s => s.kind === "class")
  if (candidates.length !== 1) throw new Error(`class-not-unique:${name}`)
  const source = candidates[0], mro = index.linearize(source.qualifiedName)
  const methods = ["__new__", "__init__", "__get__", "__set__", "view", "get_operation"].map(method => ({ method, candidates: index.lookupMethod(source.qualifiedName, method).map(s => ({ id: s.id, qualifiedName: s.qualifiedName, path: s.path, sha256: s.sha256, startLine: s.startLine, endLine: s.endLine, parameters: s.parameters, decorators: s.decorators ?? [] })) }))
  return { id: source.id, requestedName: name, qualifiedName: source.qualifiedName, path: source.path, sha256: source.sha256, startLine: source.startLine, endLine: source.endLine, mro: mro ?? null, moduleClassDefinitionProof: source.classDefinition ?? null, methods, actualInitializerMaterialUse: 0, actualDescriptorMaterialUse: 0 }
})
const extended = index.symbols.find(s => s.qualifiedName.endsWith("drf_spectacular.utils.extend_schema.decorator.ExtendedSchema"))
const superGaps = index.calls.filter(c => c.gap?.startsWith("source-class-super-")), constructorGaps = index.calls.filter(c => c.gap?.startsWith("source-class-constructor-"))
const settings = files.find(f => f.path === "src/paperless/settings/__init__.py")
const record = { schemaVersion: "authorization-schema-runtime-source-replay/v1", date: "2026-10-08", relationshipVersion: index.relationshipVersion, originalProvenanceSha256: sha(originalBytes), supplements, frozenSourcesVerified: original.appFiles.length + original.dependencyFiles.length, sourceFiles: files.length, selectedClasses, applicationSettingsSource: settings ? { path: settings.path, sha256: sha(settings.content), declarationStartLine: 168, declarationEndLine: 184, schemaSettingLine: 180, lexicalSchemaSetting: "drf_spectacular.openapi.AutoSchema", actualConfigurationEvaluation: "pending" } : null, extendedSchemaStatus: extended ? { id: extended.id, path: extended.path, sha256: extended.sha256, classDefinitionGap: extended.classDefinition?.gap ?? null, staticMro: index.linearize(extended.qualifiedName) ?? null } : null, ordinarySuperCandidates: index.calls.filter(c => c.superMethod).length, explicitSuperGaps: superGaps.length, constructorGaps: constructorGaps.length, moduleClassInitialization: "pending", descriptorExecution: "pending", fullRequestComposition: "pending", modelReadEvidence: false, applicationSemanticUnitsAuthored: 0, materialUses: 0, modelExecutions: 0, targetExecutions: 0, probeNetworkRequests: 0, originalInputsAndAllowlistsUnmodified: true, oldResultsUnmodified: true, costs: { experimentTokens: 0, developerAndScoutTokens: null, usd: null, humanTime: null } }
if (await readFile(path.join(base, "source-provenance/locked-framework-v1.json")).then(sha) !== sha(originalBytes)) throw new Error("original-provenance-changed")
const output = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ay, "verification/paperless-schema-runtime-source-replay.json")
await writeFile(output, JSON.stringify(record, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify({ output, sha256: sha(await readFile(output)), sourceFiles: files.length, classes: selectedClasses.map(c => ({ name: c.qualifiedName, mro: c.mro, moduleClassDefinitionProof: !!c.moduleClassDefinitionProof, methods: c.methods.map(m => ({ method: m.method, candidates: m.candidates.length })) })), superGaps: superGaps.length, constructorGaps: constructorGaps.length, materialUses: 0 }))
