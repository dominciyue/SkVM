import { mkdir, readFile, writeFile, cp, realpath } from "node:fs/promises"
import path from "node:path"
import { verifyShareLink } from "../authorization-authoring-loop-v1/practical.ts"
import { createNativeInquiryRuntime } from "../../../../../src/benchmarks/authorization-dsl/inquiry-native.ts"
import { createProgramDelivery } from "../../../../../src/task-dsl/authorization/program-delivery.ts"
import { compareLocalInquiry } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
const base = import.meta.dir
const load = async (p: string) => JSON.parse(await readFile(p, "utf8"))
const save = async (p: string, value: unknown) => { await mkdir(path.dirname(p), { recursive: true }); await writeFile(p, JSON.stringify(value, null, 2) + "\n", "utf8") }
function assert(v: unknown, message: string): asserts v { if (!v) throw new Error(message) }
export async function verifySecondStructure() {
  await verifyShareLink(base)
  const input = await load(path.join(base, "inputs/share-link-allowed.json")), raw = await load(path.join(base, "verification/developer-assisted/sharelink-bound.json"))
  const q = "scenario-facts", fact = { name: "independent-access-backend", arguments: { actor: 7, object: 10, capability: "view_document" }, value: true, reason: "Explicit developer-only finite backend assumption" }
  input.externalAssumptions = { [q]: [fact] }
  const inputFile = path.join(base, "inputs/share-link-external.json"); await save(inputFile, input)
  const originalGrant = raw.resourceWorkflow.steps.find((s: any) => s.id === "object_grant")
  raw.resourceWorkflow.steps = raw.resourceWorkflow.steps.map((s: any) => s.id === "object_grant" ? { id: s.id, op: "external", name: fact.name, arguments: { actor: { field: { of: { ref: "actor" }, key: "id" } }, object: { field: { of: { ref: "document" }, key: "id" } }, capability: { literal: "view_document" } }, source: s.source } : s.id === "object_allowed" ? { ...s, test: { ...s.test, args: [...s.test.args.slice(0, 2), { op: "eq", left: { binding: "object_grant" }, right: { literal: true } }] } } : s)
  raw.authoringTarget = { mode: "reusable", coverage: [{ id: "exact-object-grant", source: originalGrant.source, stepIds: ["object_grant", "object_allowed"], disposition: "implemented" }] }
  const runtime = await createNativeInquiryRuntime({ inputFile, workDir: base, domainTools: true, method: "D1", strategy: "question-checked-v1", programMode: "edit", programContext: "directed", executionPolicy: "progressive", authoringTargetMode: "reusable", maxToolCalls: 64, maxReadBytes: 33554432, maxDisplayBytes: 786432 })
  const execute = async (name: string, args: Record<string, unknown>) => JSON.parse((await runtime.execute({ id: `second-${runtime.report().toolBudget.totalUsed}`, name, arguments: args })).output)
  try {
    const citations = [...raw.sourceDeclarations.map((d: any) => d.source), ...raw.resourceWorkflow.steps.flatMap((s: any) => [s.source, ...(s.sources ?? [])])]
    for (const at of new Map(citations.map((s: any) => [JSON.stringify(s), s])).values()) await execute("source_read", { path: at.path, startLine: at.startLine, endLine: at.endLine })
    await execute("authorization_program", raw)
    const current = () => runtime.report().domain!, execution = () => current().executableContract!.resourceExecution!, revision = () => current().programDraft.currentDraft!.revision
    const allowed = (execution().returned as any)?.document_id; assert(allowed === 10, "External ShareLink fact did not bind")
    const directed: any = (await runtime.accountContext(false) as any).executableContract
    assert(directed?.basis && directed.outcome.value.document_id === 10 && directed.rules.length, "Directed second structure lost current value or rules")
    const detail = await execute("authorization_program_details", { expectedBasis: directed.basis, stepId: "object_allowed" })
    assert(detail.steps?.length === 1 && detail.events?.length === 1, "Directed exact second-structure detail unavailable")
    const before = JSON.stringify(execution()), delivery = createProgramDelivery(), states: string[] = []
    delivery.record({ sequence: 1, phase: "task-answer", answer: "Developer delivery fixture", basis: runtime.deliveryBasis(), delivered: true }); states.push(delivery.snapshot(runtime.deliveryBasis()).status)
    const facts = input.resourceInputs[q]
    const trial = await execute("authorization_program_trial", { expectedRevision: revision(), cases: [
      { id: "denied", operationId: "share-action", resourceInputs: facts, externalAssumptions: [{ ...fact, value: false }] },
      { id: "other-object", operationId: "share-action", resourceInputs: facts, externalAssumptions: [{ ...fact, arguments: { ...fact.arguments, object: 20 } }] },
      { id: "absent", operationId: "share-action", resourceInputs: facts, externalAssumptions: [] },
    ] })
    const batch = trial.trial ?? trial
    const cases = batch.cases ?? current().programDraft.trials!.at(-1)!.cases
    const match = (i: number) => cases[i].execution.events.find((e: any) => e.id === "object_grant")?.inputs?.externalMatch?.status
    const activeResultUnchangedByTrial = JSON.stringify(execution()) === before
    assert(activeResultUnchangedByTrial, "Trial replaced active facts/result")
    const foreign = await execute("authorization_program_trial", { expectedRevision: revision(), cases: [{ id: "foreign", operationId: "another-operation", resourceInputs: facts }] })
    const foreignBatch = foreign.trial ?? foreign
    const foreignOperation = (foreignBatch.diagnostics ?? current().programDraft.trials!.at(-1)!.diagnostics)[0]?.code
    await execute("authorization_program_patch", { baseRevision: revision(), upsertSteps: [], authoringTarget: { ...raw.authoringTarget, coverage: [...raw.authoringTarget.coverage, { id: "external-creation", source: raw.scope.root, stepIds: [], disposition: "external", reason: "Creation is not executed" }] } })
    delivery.record({ sequence: 2, phase: "author-edit", answer: "Coverage changed", basis: runtime.deliveryBasis(), delivered: true }); states.push(delivery.snapshot(runtime.deliveryBasis()).status)
    delivery.record({ sequence: 3, phase: "final-answer", answer: "Developer final delivery fixture", basis: runtime.deliveryBasis(), delivered: true }); states.push(delivery.snapshot(runtime.deliveryBasis()).status)
    const stale = await execute("authorization_program_details", { expectedBasis: directed.basis, stepId: "object_allowed" })
    assert(stale.status === "stale-program-reference", "Directed reference survived a changed program basis")
    const sourceChanged = await verifyCopiedSourceInvalidation()
    const result = { scope: "Developer-assisted second structure only, not automatic author evidence", providerCalls: 0, actualTargetWrites: 0, directedBasis: directed.basis, directedDetails: true, oldBasisInvalidated: true, sourceChanged, sourceCoverageGaps: directed.outcome.coverageGaps, allowed, denied: cases[0].execution.termination, mismatch: match(1), absent: match(2), foreignOperation, activeResultUnchangedByTrial, deliveryStates: states, trials: current().programDraft.trials, delivery: delivery.snapshot(runtime.deliveryBasis()), program: raw }
    await save(path.join(base, "verification/second-structure.json"), result)
    return result
  } finally { await runtime.close() }
}

async function verifyCopiedSourceInvalidation() {
  const root = path.resolve(base, "../../../../.."), old = await load(path.join(base, "verification/sharelink-result.json"))
  const input = await load(path.join(base, "inputs/share-link-allowed.json")), originalRoot = path.resolve(base, "inputs", input.sourceRoot)
  const owned = path.join(base, "verification/sharelink-source-change"), copy = path.join(owned, "source")
  await mkdir(owned, { recursive: true }); await cp(originalRoot, copy, { recursive: true, force: false })
  const programFile = path.join(base, "verification/developer-assisted/sharelink-bound.json"), program = await load(programFile)
  const name = program.scope.root.path, target = path.join(copy, name), original = await readFile(path.join(originalRoot, name), "utf8")
  assert((await realpath(target)).toLowerCase().startsWith((await realpath(copy)).toLowerCase() + path.sep), "Second-structure mutation escaped its copy")
  const changed = original + "\n# BO isolated source freshness mutation\n", current = await readFile(target, "utf8")
  assert(current === original || current === changed, "Unexpected copied source content")
  if (current === original) await writeFile(target, changed, "utf8")
  input.sourceRoot = "source"; const inputFile = path.join(owned, "input.json"); await save(inputFile, input)
  const result: any = await compareLocalInquiry(inputFile, path.resolve(root, old.session), "question-checked-v1", programFile, { executionPolicy: "progressive", programContext: "directed" })
  assert(result.providerCalls === 0 && result.sourceChanged && result.executableContract?.resourceExecution?.returned === undefined, "Copied second-structure source change retained the old result")
  assert(await readFile(path.join(originalRoot, name), "utf8") === original, "Original second-structure source changed")
  return { sourceChanged: true, oldReturnWithdrawn: true, providerCalls: 0, originalUnchanged: true }
}
