import { cp, mkdir, readFile, writeFile, realpath } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { checkAuthorizationInquiry, compareLocalInquiry, inspectLocalInquiry, saveLocalInquiryCheck } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createNativeInquiryRuntime } from "../../../../../src/benchmarks/authorization-dsl/inquiry-native.ts"
const base = import.meta.dir, repo = path.resolve(base, "../../../../..")
const load = async (file: string) => JSON.parse(await readFile(file, "utf8"))
const save = async (file: string, value: unknown) => { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(value, null, 2) + "\n", "utf8") }
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex")
const relative = (file: string) => path.relative(repo, file).split(path.sep).join("/")
function assert(truth: unknown, message: string): asserts truth { if (!truth) throw new Error(message) }
const owned = (suffix: string, root = base) => { const target = path.resolve(root, "verification", suffix); assert(target.startsWith(path.join(root, "verification") + path.sep), "Output escaped owned verification"); return target }
async function copyTree(source: string, destination: string) {
  // Resume a partial owned copy without overwriting any existing file.
  await mkdir(path.dirname(destination), { recursive: true })
  await cp(source, destination, { recursive: true, force: false, errorOnExist: false })
}

export async function verifyMovedPackage() {
  const resultFile = owned("move-result.json"), prior = await load(resultFile).catch(() => undefined)
  if (prior) return prior
  const matrix = await load(path.join(base, "evaluation/variation-matrix.json")), row = matrix.results.find((r: any) => r.variant === "root-default" && r.track === "developer-assisted-binding-only")
  assert(row?.session, "Offline binding diagnostic session required")
  const originalSession = path.resolve(repo, row.session), old: any = await inspectLocalInquiry(originalSession)
  const originalInput = await load(path.join(base, "inputs/root-default.json")), sourceRoot = path.resolve(base, "inputs", originalInput.sourceRoot)
  const packageRoot = owned("moved/package"), copiedSession = path.join(packageRoot, "session"), copiedProgram = path.join(packageRoot, "program.json")
  await copyTree(sourceRoot, path.join(packageRoot, "source")); await copyTree(originalSession, copiedSession)
  await writeFile(copiedProgram, await readFile(path.resolve(repo, row.program)))
  assert(sha(await readFile(copiedProgram)) === row.programSha256, "Copied program differs")
  const inspected: any = await inspectLocalInquiry(copiedSession)
  assert(inspected.sessionPath === copiedSession && inspected.model === "none", "Moved inspect used a different session")
  const results: any[] = []
  for (const variant of ["root-default", "empty-version", "denied"]) {
    const input = await load(path.join(base, `inputs/${variant}.json`)), inputFile = path.join(packageRoot, `${variant}.json`)
    input.sourceRoot = "source"; await save(inputFile, input)
    const fresh: any = await checkAuthorizationInquiry(inputFile, "D1", "question-checked-v1", copiedProgram, { executionPolicy: "progressive", programContext: "full" })
    const previous: any = await compareLocalInquiry(inputFile, copiedSession, "question-checked-v1", copiedProgram, { executionPolicy: "progressive" })
    assert(fresh.status === "valid" && fresh.providerCalls === 0 && previous.providerCalls === 0, "Moved public check failed")
    assert(isDeepStrictEqual(fresh.sourceFiles, old.sourceFiles), "Copied source snapshot differs")
    assert(isDeepStrictEqual(fresh.executableContract.resourceExecution, previous.executableContract.resourceExecution), "Fresh/previous current computation differs")
    assert(previous.answerReused === false, "A moved answer was reused")
    const execution = fresh.executableContract.resourceExecution
    results.push({ variant, input: relative(inputFile), inputBinding: fresh.executableContract.inputBinding, currentInputs: execution.inputs, returned: execution.returned, termination: execution.termination, conditions: execution.conditions, gaps: execution.gaps, freshPreviousEqual: true, reuseLayers: previous.reuseEligibility.info.layers, answerReused: false, sourceChanged: previous.sourceChanged })
  }
  const result = { scope: "Developer-assisted binding-only diagnostic; no automatic or model reuse claim", providerCalls: 0, sourceFiles: old.sourceFiles.length, originalSession: relative(originalSession), copiedSession: relative(copiedSession), program: relative(copiedProgram), programSha256: row.programSha256, sourceBytesPreserved: true, inspectResolvedCopiedPath: true, results }
  await save(resultFile, result); console.log(JSON.stringify({ stage: "moved", providerCalls: 0, variants: results.length, copiedSession: result.copiedSession }))
  return result
}

export async function verifySourceChange() {
  const resultFile = owned("source-change-result.json"), prior = await load(resultFile).catch(() => undefined)
  if (prior) return prior
  const moved = await verifyMovedPackage(), packageRoot = owned("source-change/package"), sourceRoot = path.join(packageRoot, "source")
  const original = await load(path.join(base, "inputs/root-default.json")), originalRoot = path.resolve(base, "inputs", original.sourceRoot)
  await copyTree(originalRoot, sourceRoot)
  const sourcePath = "src/documents/versioning.py", originalFile = path.join(originalRoot, sourcePath), targetFile = path.join(sourceRoot, sourcePath)
  assert((await realpath(targetFile)).toLowerCase().startsWith((await realpath(sourceRoot)).toLowerCase() + path.sep), "Mutation target resolved outside the copied source")
  const before = await readFile(originalFile, "utf8"), needle = "return latest or root_doc"
  assert(before.split(needle).length === 2, "Mutation is not uniquely located")
  const after = before.replace(needle, "return root_doc"), current = await readFile(targetFile, "utf8")
  assert(current === before || current === after, "Owned source has an unrelated edit; preserve it")
  if (current === before) await writeFile(targetFile, after, "utf8")
  assert(await readFile(originalFile, "utf8") === before, "Original protected source changed")
  original.sourceRoot = "source"
  const inputFile = path.join(packageRoot, "input.json"), programFile = path.join(packageRoot, "program.json")
  await save(inputFile, original); await writeFile(programFile, await readFile(path.resolve(repo, moved.program)))
  const compared: any = await compareLocalInquiry(inputFile, path.resolve(repo, moved.copiedSession), "question-checked-v1", programFile, { executionPolicy: "progressive" })
  assert(compared.sourceChanged === true && compared.providerCalls === 0, "Source mutation was not detected")
  assert(compared.programSourceBasis === "previous-canonical-source-snapshot", "Old raw was rebound to current source")
  assert(compared.executableContract?.resourceExecution?.returned === undefined, "Old file result survived decisive source mutation")
  const result = { scope: "Copied-source deterministic invalidation on the developer-assisted diagnostic", providerCalls: 0, input: relative(inputFile), program: relative(programFile), previous: moved.copiedSession, mutation: { path: sourcePath, line: 166, original: needle, changed: "return root_doc", beforeSha256: sha(before), afterSha256: sha(after), originalUnchanged: true, newFiniteSelection: { fileDocument: 10, representation: "archive", sourceReason: "The changed helper unconditionally returns root_doc" } }, sourceChanged: true, programSourceBasis: compared.programSourceBasis, diagnostics: compared.executableContract?.diagnostics, resourceExecution: compared.executableContract?.resourceExecution, reuseEligibility: compared.reuseEligibility, answerReused: false, S0: { status: "not-run", reason: "R0 remains completion-unknown and no BJ automatic main chain exists" } }
  await save(resultFile, result); console.log(JSON.stringify({ stage: "source-change", providerCalls: 0, oldReturnWithdrawn: true, layers: result.reuseEligibility.info.layers }))
  return result
}

export async function verifyShareLink(outputRoot = base) {
  const own = (suffix: string) => owned(suffix, outputRoot)
  const resultFile = own("sharelink-result.json"), prior = await load(resultFile).catch(() => undefined)
  if (prior) return prior
  const example = path.join(repo, "examples/authorization-assessment/share-create-workflow"), originalInputFile = path.join(example, "inputs/allowed.json"), originalProgramFile = path.join(example, "program.json")
  const originalProgramBytes = await readFile(originalProgramFile), input = await load(originalInputFile), originalData = input.resourceInputs["share-create"]
  const dataQuestion = "scenario-facts", operationId = "share-action"
  input.inquiry = { ...input.inquiry, schemaVersion: "authorization-inquiry/v2", operations: [{ id: operationId, request: "Inspect the original share operation" }], questions: [...input.inquiry.questions.map((q: any) => ({ ...q, operationId, intent: "policy-comparison" })), { id: dataQuestion, operationId, intent: "scope", request: "Retain supplied development scenario facts", premises: [] }] }
  input.resourceInputs = { [dataQuestion]: originalData }
  const inputFile = path.join(outputRoot, "inputs/share-link-allowed.json"), sourceRoot = path.resolve(path.dirname(originalInputFile), input.sourceRoot)
  input.sourceRoot = path.relative(path.dirname(inputFile), sourceRoot).split(path.sep).join("/"); await save(inputFile, input)
  const raw = { ...JSON.parse(originalProgramBytes.toString("utf8")), inputBinding: { questionId: dataQuestion } }
  const programFile = own("developer-assisted/sharelink-bound.json"); await save(programFile, raw)
  const runtime = await createNativeInquiryRuntime({ inputFile, workDir: outputRoot, domainTools: true, method: "D1", strategy: "question-checked-v1", programMode: "edit", executionPolicy: "progressive", maxToolCalls: 32, maxDisplayBytes: 786432, maxReadBytes: 33554432 })
  const phases: any[] = []; let retained: any, evidence: any[] = [], firstReport: any
  try {
    await runtime.execute({ id: "prepare", name: "authorization_prepare_properties", arguments: { schemaVersion: "authorization-property-intent/v1", questions: input.inquiry.questions.map((q: any) => ({ questionId: q.id, state: "residual", reason: "Original duties remain for source explanation" })) } })
    const empty = JSON.parse((await runtime.execute({ id: "empty", name: "authorization_program_details", arguments: { view: "draft" } })).output)
    assert(empty.events.length === 0 && empty.steps.length === 0, "Empty ShareLink draft was not readable")
    const citations = [...raw.sourceDeclarations.map((d: any) => d.source), ...raw.resourceWorkflow.steps.flatMap((s: any) => [s.source, ...(s.sources ?? [])])]
    for (const at of new Map(citations.map((at: any) => [JSON.stringify([at.path, at.startLine, at.endLine]), at])).values()) await runtime.execute({ id: `read-${runtime.report().toolBudget.totalUsed}`, name: "source_read", arguments: { path: at.path, startLine: at.startLine, endLine: at.endLine } })
    await runtime.execute({ id: "first", name: "authorization_program", arguments: raw })
    assert((runtime.report().domain?.executableContract?.resourceExecution?.returned as any)?.document_id === 10, "Bound ShareLink descriptor not computed")
    phases.push({ phase: "bound", returned: runtime.report().domain!.executableContract!.resourceExecution!.returned })
    const patch = async (id: string, binding: unknown) => runtime.execute({ id, name: "authorization_program_patch", arguments: { baseRevision: runtime.report().domain!.programDraft.currentDraft!.revision, upsertSteps: [], inputBinding: binding } })
    await patch("revoke", null)
    assert(runtime.report().domain!.executableContract!.resourceExecution!.returned === undefined, "Revoked binding reused old facts")
    phases.push({ phase: "revoked", firstBlocker: (await runtime.accountContext(false) as any).authoring.firstBlocker })
    await patch("rebind", { questionId: dataQuestion })
    assert((runtime.report().domain!.executableContract!.resourceExecution!.returned as any).document_id === 10, "Rebinding did not recompute")
    const accepted = runtime.report().domain!.programDraft.currentDraft!, rejected = JSON.parse((await runtime.execute({ id: "reject-order", name: "authorization_program_patch", arguments: { baseRevision: accepted.revision, upsertSteps: [], stepOrder: ["missing"] } })).output)
    assert(rejected.controlDiagnostics.some((d: any) => d.code === "program-patch-order") && runtime.report().domain!.programDraft.currentDraft!.revision === accepted.revision, "Rejected edit changed the draft")
    const details = JSON.parse((await runtime.execute({ id: "details", name: "authorization_program_details", arguments: { view: "draft", expectedRevision: accepted.revision, stepId: "create_descriptor" } })).output)
    assert(details.events.some((e: any) => e.outputs?.value?.document_id === 10), "Draft detail lost the actual descriptor")
    retained = JSON.parse(JSON.stringify(runtime.report().domain!.programDraft.currentDraft)); evidence = runtime.report().evidence; firstReport = runtime.report()
    await save(own("developer-assisted/sharelink-retained-draft.json"), retained)
  } finally { await runtime.close() }
  const denied = structuredClone(input); denied.resourceInputs[dataQuestion].object_grants = []
  const deniedFile = path.join(outputRoot, "inputs/share-link-denied.json"); await save(deniedFile, denied)
  const resumed = await createNativeInquiryRuntime({ inputFile: deniedFile, workDir: outputRoot, domainTools: true, method: "D1", strategy: "question-checked-v1", programMode: "edit", executionPolicy: "progressive", maxToolCalls: 32, reuse: { info: { answerReused: false } as any, seed: { delta: { schemaVersion: "authorization-control-slice/v1", rules: [], dependencies: [], bindings: [], policyRules: [] }, evidence, programDraft: retained } } })
  let second: any
  try {
    await resumed.execute({ id: "prepare", name: "authorization_prepare_properties", arguments: { schemaVersion: "authorization-property-intent/v1", questions: denied.inquiry.questions.map((q: any) => ({ questionId: q.id, state: "residual", reason: "Original duties retained" })) } })
    assert((await resumed.accountContext(false) as any).authoring.computed === undefined, "Restoration inherited the allowed result")
    await resumed.execute({ id: "recompute", name: "authorization_program_patch", arguments: { baseRevision: retained.revision, upsertSteps: [], inputBinding: { questionId: dataQuestion } } })
    second = resumed.report()
    assert(second.domain.executableContract.resourceExecution.termination === "serializer-object-permission-denied" && second.domain.executableContract.resourceExecution.returned === undefined, "Current missing grant did not reject")
    assert(second.domain.programDraft.authorLoop.firstProgramToolUnit === undefined, "Patch-only repair invented a program call")
  } finally { await resumed.close() }
  const checked: any = await checkAuthorizationInquiry(deniedFile, "D1", "question-checked-v1", programFile, { executionPolicy: "progressive" })
  assert(checked.status === "valid" && checked.providerCalls === 0, "ShareLink public check failed")
  const archived = await saveLocalInquiryCheck(deniedFile, programFile, own("archives/sharelink"), checked, { executionPolicy: "progressive" }), inspected: any = await inspectLocalInquiry(archived.sessionPath)
  assert(inspected.execution.resourceExecution.termination === "serializer-object-permission-denied", "ShareLink archive lost rejection")
  assert(sha(await readFile(originalProgramFile)) === sha(originalProgramBytes), "Original ShareLink program changed")
  const result = { scope: "Developer offline verification only; historical ShareLink unknowns sealed and no account call", providerCalls: 0, originalProgramUnchanged: true, input: relative(inputFile), deniedInput: relative(deniedFile), program: relative(programFile), phases, firstAuthorLoop: firstReport.domain.programDraft.authorLoop, restoredDraftRevision: second.domain.programDraft.restoredDraftRevision, secondAuthorLoop: second.domain.programDraft.authorLoop, deniedExecution: second.domain.executableContract.resourceExecution, remainingDuties: second.program.questions.map((q: any) => q.id), semanticPolicyQuestion: "share-create", inputQuestion: dataQuestion, originalPolicyPreserved: isDeepStrictEqual(input.inquiry.policy, denied.inquiry.policy), actualTargetWrites: 0, session: relative(archived.sessionPath) }
  await save(resultFile, result); console.log(JSON.stringify({ stage: "sharelink", providerCalls: 0, termination: result.deniedExecution.termination, remainingDuties: result.remainingDuties }))
  return result
}

const command = process.argv[2] ?? "all"
if (import.meta.main) {
  if (command === "move" || command === "all") await verifyMovedPackage()
  if (command === "source" || command === "all") await verifySourceChange()
  if (command === "sharelink" || command === "all") await verifyShareLink()
}
