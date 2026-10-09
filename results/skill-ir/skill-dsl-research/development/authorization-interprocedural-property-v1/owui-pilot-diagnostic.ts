import { readFile, writeFile } from "node:fs/promises"
import { gunzipSync, gzipSync } from "node:zlib"
import path from "node:path"
import { root, sha, write } from "./study.ts"
import { loadInquiryInput } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createInquiryTools } from "../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { lowerSourceInterpretation } from "../../../../../src/task-dsl/authorization/source-interpretation.ts"
import { projectSourceMaterials } from "../../../../../src/benchmarks/authorization-dsl/source-material-projection.ts"

export async function diagnoseOriginalOwui() {
  const directory = path.join(root, "attempts/pilot-owui/original"), bytes = await readFile(path.join(directory, "run-result.json.gz")), original = JSON.parse(gunzipSync(bytes).toString("utf8")).authorizationInquiry, claim = JSON.parse(await readFile(path.join(directory, "claim.json"), "utf8")), loaded = await loadInquiryInput(claim.inputFile)
  if (loaded.inputSha256 !== claim.inputSha256) throw new Error("Current input differs from the dispatched original")
  const tools = await createInquiryTools({ ...loaded.context, structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), entry = original.domain.semantic.units.find((u: any) => u.role === "entry"), draft = original.domain.focus.sourceDrafts.find((d: any) => d.handle === entry.handle).interpretation
  await tools.execute("source_read", { path: entry.source.path, startLine: entry.source.startLine, endLine: entry.source.endLine })
  const skeleton = (await tools.sourceSkeleton(entry.source.id))!
  if (skeleton.revision !== draft.revision) throw new Error("Original retained source revision changed")
  const lowered = lowerSourceInterpretation(skeleton, draft, { index: tools.structure, itemId: entry.itemId, handle: entry.handle, questionId: entry.questionId, role: "entry", propertyDirected: true, propertyAbstraction: true, propertyContext: { operationId: original.program.operations[0].id, sources: [{ questionId: entry.questionId, operationId: original.program.operations[0].id, skeleton, interpretation: draft }] } })
  if (!lowered.unit || lowered.diagnostics.length || JSON.stringify(lowered.interpretation?.annotations) !== JSON.stringify(draft.annotations)) throw new Error("Diagnostic may not change or invent original annotation meaning")
  const current = { ...entry, ...lowered.unit }, snapshot = structuredClone(original.domain.sourceMaterials), material = snapshot.materials.find((m: any) => m.current && m.source.id === entry.source.id), units = original.domain.semantic.units.map((u: any) => u.handle === entry.handle ? current : u)
  material.unit = current
  const projected = projectSourceMaterials(original.program, units, snapshot, tools.structure!, { questionDirected: true, semanticVersion: "interprocedural-property/v1" })
  const result = { schemaVersion: "authorization-bb-source-order-diagnostic/v1", attemptId: claim.attemptId, rawSha256: sha(bytes), inputSha256: claim.inputSha256, modelCalls: 0, originalFilesChanged: false, newSemanticFields: 0, originalMaterialUses: original.domain.materialUses.length, derivedMaterialUses: projected.uses.length, derivedUseKinds: projected.uses.map(u => u.kind), rootCreationFaultRemoved: !projected.diagnostics.some(d => d.code === "material-callable-creation-invalid" && d.sourceId === entry.source.id), retainedConditionGaps: current.blocks.flatMap((b: any) => b.steps).filter((s: any) => s.kind === "unresolved" && s.reason.startsWith("source-fields-missing:condition")).map((s: any) => ({ name: s.name, reason: s.reason })), derivedDiagnostics: projected.diagnostics, liveOutcomeUnchanged: true, wholeTaskCertified: false, propertyStatus: "not-rechecked-by-this-availability-diagnostic", next: "Named original-input model verification in the new epoch; no diagnostic is supplied to runtime" }
  await write(path.join(root, "verification/owui-source-order-diagnostic.json"), result)
  await writeFile(path.join(root, "verification/owui-marker-derived.json.gz"), gzipSync(JSON.stringify({ originalAnnotations: draft.annotations, projected })))
  return { rootCreationFaultRemoved: result.rootCreationFaultRemoved, originalMaterialUses: result.originalMaterialUses, derivedMaterialUses: result.derivedMaterialUses, modelCalls: 0 }
}
if (import.meta.main) console.log(JSON.stringify(await diagnoseOriginalOwui()))
