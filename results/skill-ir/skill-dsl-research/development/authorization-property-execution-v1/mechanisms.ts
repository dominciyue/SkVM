import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { gunzipSync } from "node:zlib"
import { isDeepStrictEqual } from "node:util"
import { buildSourceSkeleton } from "../../../../../src/benchmarks/authorization-dsl/evidence-preparation/source-skeleton.ts"
import type { StructureIndex, StructureSymbol } from "../../../../../src/benchmarks/authorization-dsl/evidence-preparation/structure-index.ts"
import type { InquiryEvidence } from "../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { lowerSourceInterpretation, SourceInterpretationSchema } from "../../../../../src/task-dsl/authorization/source-interpretation.ts"
import { lowerSemanticFlow, type BoundSemanticBlock } from "../../../../../src/task-dsl/authorization/semantic-flow.ts"
import { canonicalControl } from "../../../../../src/task-dsl/authorization/control-slice.ts"
import { loadInquiryInput } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createInquiryTools } from "../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { projectSourceMaterials } from "../../../../../src/benchmarks/authorization-dsl/source-material-projection.ts"
import { assertCleanSource } from "./replay.ts"

const digest = (value: unknown) => createHash("sha256").update(canonicalControl(value)).digest("hex")
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value))
const codes = (diagnostics: Array<{ code: string }>) => [...new Set(diagnostics.map(d => d.code))].sort()
const requiredCodes = new Set(["source-interpretation-role-required", "source-interpretation-condition-required", "source-interpretation-return-outcome-required", "source-interpretation-failure-kind-required", "source-interpretation-fallthrough-outcome-required"])
type Binding = { itemId: string; handle: string; questionId: string; role: "entry" | "helper" }
/** These frontends are not invoked by the two pure mechanism comparisons. */
export function qualifyMechanismVersion(changedPaths: string[]) {
  const frontend = new Set(["src/benchmarks/authorization-dsl/inquiry-native.ts", "src/benchmarks/authorization-dsl/inquiry-domain-runtime.ts", "src/benchmarks/authorization-dsl/inquiry-focus.ts"])
  const other = changedPaths.filter(p => !frontend.has(p) && !p.endsWith(".test.ts"))
  return { eligible: other.length === 0, changedPaths, changedOtherCoreFiles: other, scope: "pure source-demand/state-merge functions only; never full runtime replay or current-version model quality" }
}
export function assertRecordedMaterialUses(projected: unknown, recorded: unknown) {
  if (!Array.isArray(recorded) || !isDeepStrictEqual(JSON.parse(JSON.stringify(projected)), recorded)) throw new Error("recorded-material-use-mismatch")
}
/** Only revision is rebound for the same complete original source; no annotations are supplied. */
export async function compareSourceDemand(index: StructureIndex, source: StructureSymbol, windows: readonly InquiryEvidence[], raw: unknown, binding: Binding, receiverClass?: string, affectedQuestionIds?: string[]) {
  const directed = await buildSourceSkeleton(index, source, windows, receiverClass, "finite-control/v1", true)
  const legacy = await buildSourceSkeleton(index, source, windows, receiverClass, "finite-control/v1", false)
  const shape = (s: typeof directed) => ({ source: s.source, anchors: s.anchors.map(a => ({ id: a.id, kind: a.kind, selector: a.selector, text: a.text, call: a.call })), flow: s.flow, edges: s.edges, gaps: s.gaps })
  if (!isDeepStrictEqual(shape(directed), shape(legacy))) throw new Error("source-shape-mismatch")
  const draft = SourceInterpretationSchema.parse(raw)
  if (draft.revision !== directed.revision) throw new Error("draft-revision-mismatch")
  const lower = (s: typeof directed, interpretation: unknown, propertyDirected: boolean) => lowerSourceInterpretation(s, interpretation, { ...binding, index, propertyDirected, affectedQuestionIds })
  const empty = { schemaVersion: "source-interpretation/v1", annotations: [], unresolved: [] }
  const initialLegacy = lower(legacy, { ...empty, revision: legacy.revision }, false), initialDirected = lower(directed, { ...empty, revision: directed.revision }, true)
  const withoutDemand = lower(legacy, { ...draft, revision: legacy.revision }, false), withDemand = lower(directed, draft, true)
  const describe = (s: typeof directed, result: typeof withDemand, initial: typeof withDemand, interpretation: unknown) => ({
    accepted: !!result.unit && result.diagnostics.length === 0,
    initialRequiredFields: initial.demand?.required.length ?? initial.diagnostics.filter(d => requiredCodes.has(d.code)).length,
    initialRequiredAnnotations: initial.demand?.requiredAnnotationCount ?? new Set(initial.diagnostics.filter(d => requiredCodes.has(d.code)).map(d => d.path)).size,
    currentRequiredFields: result.demand?.required.length ?? initial.diagnostics.filter(d => requiredCodes.has(d.code)).length,
    currentRequiredAnnotations: result.demand?.requiredAnnotationCount ?? new Set(initial.diagnostics.filter(d => requiredCodes.has(d.code)).map(d => d.path)).size,
    pendingAnnotations: result.demand?.pendingAnnotationCount ?? new Set(result.diagnostics.filter(d => requiredCodes.has(d.code)).map(d => d.path)).size,
    diagnosticCount: result.diagnostics.length, diagnostics: codes(result.diagnostics), exclusions: result.demand?.excluded ?? [],
    fullSkeletonBytes: bytes(s), offlineEnvelopeBytes: bytes({ sourceSkeleton: s, interpretation, ...(result.demand ? { propertyDemand: result.demand } : {}) }),
    loweredUnitBytes: result.unit ? bytes(result.unit) : null, complete: result.unit?.complete ?? null
  })
  return { source: directed.source, sourceShapeAligned: true, revisionRebindingOnly: true, draftSha256: digest(raw),
    annotationCount: draft.annotations.length, unresolvedCount: draft.unresolved.length,
    withoutDemand: describe(legacy, withoutDemand, initialLegacy, { ...draft, revision: legacy.revision }),
    withDemand: describe(directed, withDemand, initialDirected, draft),
    interpretationProvenance: "same retained model draft; revision only rebound for demand-off; no added source meaning", payloadConvention: "full offline skeleton/draft/demand envelope, not actual outgoing account bytes",
    requirementConvention: "initial is empty-draft base demand; current retains all mandatory fields, including already supplied ones; v4 additionally expands typed dependencies from the retained draft; pending is separate" }
}
/** Both evaluators consume the same adopted, source-bound units. */
export function compareStateMerge(units: BoundSemanticBlock[]) {
  const describe = (propertyDirected: boolean) => {
    const result = lowerSemanticFlow(units, { compositional: true, propertyDirected }), terminals = result.delta.rules.filter(r => r.terminal)
    return { controlRules: result.delta.rules.length, terminalOutcomes: terminals.length, outcomes: [...new Set(terminals.map(r => r.outcome ?? "unknown"))].sort(),
      dependencies: result.delta.dependencies.length, diagnosticCount: result.diagnostics.length, diagnostics: codes(result.diagnostics), deltaBytes: bytes(result.delta),
      ...result.propertyMetrics, summaries: result.propertySummaries.map(s => ({ questionId: s.questionId, handle: s.handle, block: s.block, sourceSteps: s.sourceSteps, failureSteps: s.failureSteps, semantics: s.semantics })) }
  }
  return { sourceUnitsSha256: digest(units), unitCount: units.length, withoutMerge: describe(false), withMerge: describe(true), convention: "control rules and terminal outcomes, not internal provider states or runtime execution" }
}
async function optional(file: string) { try { return await readFile(file) } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error } }
export async function collectMechanisms(root = import.meta.dir) {
  const repo = path.resolve(root, "../../../../.."); assertCleanSource(repo)
  const runtimeTree = execFileSync("git", ["rev-parse", "HEAD:src"], { cwd: repo, encoding: "utf8" }).trim()
  const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")), rows: any[] = []
  for (const position of manifest.positions) for (const attemptId of position.attempts) {
    const directory = path.join(root, "attempts", attemptId), reportBytes = await optional(path.join(directory, "report.json"))
    if (["author", "smoke"].includes(position.kind)) { rows.push({ attemptId, status: "not-a-domain-mechanism" }); continue }
    if (!reportBytes) { rows.push({ attemptId, status: "active-or-unclosed" }); continue }
    const report = JSON.parse(reportBytes.toString("utf8")), claim = JSON.parse(await readFile(path.join(directory, "claim.json"), "utf8"))
    const frozenRuntimeTree = claim.runtimeTree ?? execFileSync("git", ["rev-parse", `${claim.gitRevision}:src`], { cwd: repo, encoding: "utf8" }).trim()
    const versionQualification = qualifyMechanismVersion(frozenRuntimeTree === runtimeTree ? [] : execFileSync("git", ["diff", "--name-only", `${claim.gitRevision}:src`, "HEAD:src"], { cwd: repo, encoding: "utf8" }).trim().split("\n").filter(Boolean).map(p => `src/${p}`))
    if (!versionQualification.eligible) { rows.push({ attemptId, status: "frozen-semantic-core-not-analyzed", frozenRuntimeTree, versionQualification }); continue }
    if ((report.accountStatus ?? report.status) !== "completed" || !report.inferenceDispatched) { rows.push({ attemptId, status: "no-completed-account-domain-evidence" }); continue }
    const compressed = await optional(path.join(directory, "run-result.json.gz")), record = compressed ? JSON.parse(gunzipSync(compressed).toString("utf8")) : JSON.parse(await readFile(path.join(report.sessionPath, "run.json"), "utf8"))
    const native = record.authorizationInquiry ?? record.native
    if (!native.domain) { rows.push({ attemptId, status: "common-only-no-domain-mechanism" }); continue }
    if (native.sourceVerification?.valid !== true) throw new Error(`source-unverified: ${attemptId}`)
    const input = await loadInquiryInput(claim.inputFile, { allowMissingPolicy: true })
    if (input.inputSha256 !== claim.inputSha256 || sha(await readFile(path.join(directory, "answer-original.md"))) !== report.answerSha256) throw new Error(`archive-bytes-changed: ${attemptId}`)
    const tools = await createInquiryTools({ ...input.context, structure: true, controlSemantics: "finite-control/v1", propertyDirected: true }), index = tools.structure!
    if (tools.files.length !== claim.sourceFiles.length || claim.sourceFiles.some((f: any) => !tools.files.some(g => g.path === f.path && g.sha256 === f.sha256 && g.bytes === f.bytes))) throw new Error(`source-files-changed: ${attemptId}`)
    const domain = native.domain, units: BoundSemanticBlock[] = domain.semantic.units, demandRows: any[] = []
    for (const saved of domain.focus.sourceDrafts) {
      const unit = units.find(u => u.handle === saved.handle && u.source), source = unit && index.symbols.find(s => s.id === unit.source!.id && s.sha256 === unit.source!.sha256)
      if (!unit || !source) { demandRows.push({ handle: saved.handle, status: "no-accepted-source-binding-for-retained-draft" }); continue }
      const affected = native.program.operationQuestions?.filter((q: any) => native.program.operationQuestions.find((p: any) => p.questionId === unit.questionId)?.operationId === q.operationId).map((q: any) => q.questionId)
      demandRows.push({ handle: unit.handle, status: "compared-retained-draft", draftRole: "latest retained draft for accepted source, not necessarily the accepted unit", ...await compareSourceDemand(index, source, native.evidence, saved.interpretation, unit, unit.receiverClass, affected) })
    }
    const adopted = projectSourceMaterials(native.program, units, domain.sourceMaterials, index)
    assertRecordedMaterialUses(adopted.uses, domain.materialUses)
    rows.push({ attemptId, status: frozenRuntimeTree === runtimeTree ? "analyzed" : "analyzed-frozen-proposals-current-semantic-core", runtimeTree, frozenRuntimeTree, versionQualification, reportSha256: sha(reportBytes), inputSha256: claim.inputSha256, sourceDemand: demandRows,
      sourceMaterialUses: adopted.uses.length, recordedMaterialUses: "exactly matched", stateMerge: compareStateMerge(adopted.units),
      observedLocalContextPayloads: { count: domain.promptPayloads.length, bytes: domain.promptPayloads.reduce((n: number, p: any) => n + p.bytes, 0), convention: "recorded local-context rendering only; not complete requests and not token cost" },
      formalAcceptance: !!native.result, wholeAnswerQuality: "independent review required; mechanisms do not promote quality" })
  }
  assertCleanSource(repo)
  const result = { schemaVersion: "authorization-ax-mechanisms/v1", collectedAt: new Date().toISOString(), runtimeTree, newInference: 0, additionalModelMechanismPositions: 0, targetExecutions: 0, rows }
  await writeFile(path.join(root, "verification", "mechanisms.json"), JSON.stringify(result, null, 2) + "\n")
  return result
}
if (import.meta.main) { const result = await collectMechanisms(); console.log(JSON.stringify({ newInference: 0, rows: result.rows.map(r => ({ attemptId: r.attemptId, status: r.status, drafts: r.sourceDemand?.length, materialUses: r.sourceMaterialUses, withoutMergeRules: r.stateMerge?.withoutMerge.controlRules, withMergeRules: r.stateMerge?.withMerge.controlRules })) })) }
