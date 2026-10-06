import { createHash } from "node:crypto"
import { canonicalControl } from "./control-slice.ts"
import { SemanticBlockSchema, semanticBlockDiagnostics, type BoundSemanticBlock } from "./semantic-flow.ts"
import type { SourceFactDependency } from "./operation-facts.ts"

export interface SourceMaterialIdentity { repository: string; sourceRef: string; semanticVersion: string }
export interface SourceMaterial {
  id: string; identity: SourceMaterialIdentity; source: NonNullable<BoundSemanticBlock["source"]>; receiverClass?: string;
  dependencies: SourceFactDependency[]; evidenceIds: string[]; unit: BoundSemanticBlock; current: boolean;
  semanticSupport: "unreviewed"; interpretationSource: "model" | "test-authored" | "revalidated-original";
}
export interface SourceMaterialSnapshot {
  schemaVersion: "authorization-source-materials/v1"; materials: SourceMaterial[]; retired: Array<{ id: string; reason: string }>;
}
const digest = (value: unknown) => createHash("sha256").update(canonicalControl(value)).digest("hex")
const orderedDependencies = (dependencies: SourceFactDependency[]) => [...new Map(dependencies.map(d => [canonicalControl(d), structuredClone(d)])).entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, d]) => d)
/** A source template identity contains no question, focus, run budget or local directory. */
export function sourceMaterialId(identity: SourceMaterialIdentity, unit: BoundSemanticBlock, dependencies: SourceFactDependency[]) {
  const { questionId: _q, itemId: _i, handle: _h, op: _o, repairsDraftId: _r, evidenceIds: _e, source: _s, receiverClass: _receiver, ...body } = unit
  const neutral = (value: unknown): unknown => {
    if (typeof value === "string" && value.startsWith(`${unit.handle}.`)) return `$self.${value.slice(unit.handle.length + 1)}`
    if (Array.isArray(value)) return value.map(neutral)
    if (!value || typeof value !== "object") return value
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "callee").map(([key, v]) => [key, neutral(v)]))
  }
  return `material-${digest([identity, unit.source, unit.receiverClass, neutral(body), orderedDependencies(dependencies)]).slice(0, 24)}`
}
/** Saving is independent of operation binding; only validated uses may produce task rules. */
export function createSourceMaterials(identity: SourceMaterialIdentity, initial?: SourceMaterialSnapshot) {
  const state: SourceMaterialSnapshot = { schemaVersion: "authorization-source-materials/v1", materials: [], retired: [] }
  const retire = (material: SourceMaterial, reason: string) => {
    if (!material.current) return
    material.current = false; state.retired.push({ id: material.id, reason })
  }
  const accept = (unit: BoundSemanticBlock, dependencies: SourceFactDependency[], interpretationSource: SourceMaterial["interpretationSource"] = "model") => {
    const { questionId: _q, evidenceIds: _e, source: _s, receiverClass: _r, ...raw } = unit
    SemanticBlockSchema.parse(raw)
    if (semanticBlockDiagnostics(raw).length) throw new Error("source-material-semantic-invalid")
    if (!unit.source || !unit.evidenceIds.length || !dependencies.some(d => d.kind === "source-span" && d.key === unit.source!.path && d.revision === unit.source!.sha256) || !dependencies.some(d => d.kind === "symbol-resolution" && d.key === unit.source!.id && d.revision === unit.source!.sha256)) throw new Error("source-material-dependency-missing")
    const id = sourceMaterialId(identity, unit, dependencies)
    for (const old of state.materials) if (old.current && old.id !== id && old.unit.role === unit.role && old.source.id === unit.source.id && old.receiverClass === unit.receiverClass) retire(old, "source-interpretation-replaced")
    const old = state.materials.find(m => m.id === id)
    if (old) return old
    const material: SourceMaterial = { id, identity: structuredClone(identity), source: structuredClone(unit.source), receiverClass: unit.receiverClass, dependencies: orderedDependencies(dependencies), evidenceIds: [...unit.evidenceIds], unit: structuredClone(unit), current: true, semanticSupport: "unreviewed", interpretationSource }
    state.materials.push(material); return material
  }
  if (initial) {
    if (initial.schemaVersion !== state.schemaVersion) throw new Error("source-material-version")
    for (const material of initial.materials) {
      if (canonicalControl(material.identity) !== canonicalControl(identity) || material.id !== sourceMaterialId(identity, material.unit, material.dependencies)) throw new Error("source-material-identity-mismatch")
      if (material.current) accept(material.unit, material.dependencies, material.interpretationSource)
      else state.materials.push(structuredClone(material))
    }
    state.retired = structuredClone(initial.retired)
  }
  const invalidate = (affected: (d: SourceFactDependency) => boolean, reason: string) => {
    for (const material of state.materials) if (material.dependencies.some(affected)) retire(material, reason)
  }
  return { accept, invalidate, snapshot: () => structuredClone(state) }
}
