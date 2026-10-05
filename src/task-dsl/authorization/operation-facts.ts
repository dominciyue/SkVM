import { createHash } from "node:crypto"
import { canonicalControl } from "./control-slice.ts"
import type { AuthorizationInquiryProgram } from "./inquiry-program.ts"
import type { BoundSemanticBlock } from "./semantic-flow.ts"

export interface OperationIdentity { id: string; repository: string; sourceRef: string; entrySymbolId: string; sourceRevision: string }
export interface SourceFactDependency { kind: "source-span" | "symbol-resolution" | "candidate-set" | "framework-model"; key: string; revision: string }
export interface OperationSourceFact { id: string; operationId: string; level: "structure" | "interpreted" | "checked"; evidenceIds: string[]; dependencies: SourceFactDependency[]; semanticSupport: "unreviewed"; current: boolean; unit?: BoundSemanticBlock }
export interface OperationFactSnapshot { identities: OperationIdentity[]; facts: OperationSourceFact[]; retired: Array<{ id: string; reason: string }>; invalidDependencies?: SourceFactDependency[] }
const digest = (value: unknown) => createHash("sha256").update(canonicalControl(value)).digest("hex")
export function createOperationFacts(program: AuthorizationInquiryProgram, source: { repository: string; sourceRef: string }, initial?: OperationFactSnapshot) {
  const state: OperationFactSnapshot = structuredClone(initial ?? { identities: [], facts: [], retired: [] })
  state.invalidDependencies ??= []
  const retire = (fact: OperationSourceFact, reason: string) => { if (fact.current) { fact.current = false; state.retired.push({ id: fact.id, reason }) } }
  const bind = (operationId: string, entry: NonNullable<BoundSemanticBlock["source"]>) => {
    if (!program.operations?.some(o => o.id === operationId)) throw new Error("operation-missing")
    const identity = { id: operationId, ...source, entrySymbolId: entry.id, sourceRevision: entry.sha256 }
    const old = state.identities.find(i => i.id === operationId)
    if (old && canonicalControl(old) !== canonicalControl(identity)) { for (const f of state.facts.filter(f => f.operationId === operationId)) retire(f, "entry-binding-changed"); state.identities.splice(state.identities.indexOf(old), 1) }
    if (!state.identities.some(i => canonicalControl(i) === canonicalControl(identity))) state.identities.push(identity)
    return identity
  }
  const accept = (operationId: string, unit: BoundSemanticBlock, dependencies: SourceFactDependency[]) => {
    if (dependencies.some(d => state.invalidDependencies!.some(old => canonicalControl(d) === canonicalControl(old)))) throw new Error("operation-dependency-invalidated")
    const identity = state.identities.find(i => i.id === operationId)
    if (!identity || !unit.source || unit.role === "entry" && (unit.source.id !== identity.entrySymbolId || unit.source.sha256 !== identity.sourceRevision)) throw new Error("operation-entry-unbound")
    const operation = program.operations!.find(o => o.id === operationId)!
    if (unit.questionId !== operation.sourceQuestionId) throw new Error("operation-source-question-mismatch")
    const fact: OperationSourceFact = { id: `fact-${digest([identity, unit.handle, unit.source, unit.blocks, dependencies]).slice(0, 24)}`, operationId, level: "interpreted", evidenceIds: [...unit.evidenceIds], dependencies: structuredClone(dependencies), semanticSupport: "unreviewed", current: true, unit: structuredClone(unit) }
    for (const f of state.facts.filter(f => f.current && f.operationId === operationId && f.unit?.handle === unit.handle && f.id !== fact.id)) retire(f, "source-interpretation-replaced")
    const old = state.facts.find(f => f.id === fact.id); if (old) old.current = true; else state.facts.push(fact)
    return fact
  }
  const invalidate = (affected: (dependency: SourceFactDependency) => boolean, reason: string) => { for (const f of state.facts) for (const d of f.dependencies.filter(affected)) { retire(f, reason); if (!state.invalidDependencies!.some(old => canonicalControl(old) === canonicalControl(d))) state.invalidDependencies!.push(structuredClone(d)) } }
  const unbind = (operationId: string, reason: string) => { for (const f of state.facts.filter(f => f.operationId === operationId)) retire(f, reason); state.identities = state.identities.filter(i => i.id !== operationId) }
  return { bind, accept, invalidate, unbind, snapshot: () => structuredClone(state) }
}
/** Source templates are projected; values, policies, answers and check flags never enter here. */
export function projectOperationUnits(program: AuthorizationInquiryProgram, _units: BoundSemanticBlock[], facts: OperationFactSnapshot): BoundSemanticBlock[] {
  return (program.operationQuestions ?? []).flatMap(q => facts.facts.filter(f => f.operationId === q.operationId && f.current && f.unit).map(f => ({ ...structuredClone(f.unit!), questionId: q.questionId })))
}
