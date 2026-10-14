import { cp, mkdir, readFile, writeFile, realpath } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { checkAuthorizationInquiry, compareLocalInquiry, inspectLocalInquiry, saveLocalInquiryCheck } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createCases } from "../authorization-reusable-program-v1/cases.ts"
import { sourceDownloadOracle } from "../authorization-authoring-loop-v1/evaluation/source-oracle.ts"
import { assessFiniteCase } from "../authorization-authoring-loop-v1/evaluation/finite-assessment.ts"
import { assessAutomaticCase } from "./assessment.ts"
const base = import.meta.dir, repo = path.resolve(base, "../../../../.."), question = "requested-document-and-returned-file"
const load = async (p: string) => JSON.parse(await readFile(p, "utf8"))
const save = async (p: string, v: unknown) => { await mkdir(path.dirname(p), { recursive: true }); await writeFile(p, JSON.stringify(v, null, 2) + "\n", "utf8") }
const sha = (v: Buffer | string) => createHash("sha256").update(v).digest("hex")
const relative = (p: string) => path.relative(repo, p).split(path.sep).join("/")
function assert(v: unknown, message: string): asserts v { if (!v) throw new Error(message) }

export async function runOffline(programFile = path.join(base, "authoring/automatic-program.json"), track = "selected") {
  assert(/^[a-z0-9-]+$/.test(track), "Invalid offline track")
  const matrixFile = path.join(base, `evaluation/${track}/variation-matrix.json`), bytes = await readFile(programFile), programSha256 = sha(bytes)
  const saved = await load(matrixFile).catch(() => undefined)
  if (saved) {
    assert(saved.programSha256 === programSha256, "Offline track already names other raw bytes")
    saved.semanticFieldAssessment = saved.results.map((row: any) => ({ variant: row.variant, ...assessAutomaticCase(row.expected, row.actual, programSha256) }))
    await save(matrixFile, saved)
    return saved
  }
  const seeds = await Promise.all(["root-default", "empty-version", "denied", "root-fallback"].map(n => load(path.join(base, `inputs/${n}.json`))))
  const cases = createCases(seeds[0], seeds[1], seeds[2], seeds[3]), rows: any[] = []
  for (const variant of cases) {
    const input = variant.input, inputFile = path.join(base, `evaluation/${track}/inputs/${variant.name}.json`)
    input.sourceRoot = path.relative(path.dirname(inputFile), path.resolve(base, "inputs", input.sourceRoot)).split(path.sep).join("/")
    await save(inputFile, input)
    // Actual execution is obtained before evaluation; neither expected values nor
    // this evaluation directory is part of the account's source boundary.
    const checked: any = await checkAuthorizationInquiry(inputFile, "D1", "question-checked-v1", programFile, { executionPolicy: "progressive", programContext: "directed" })
    const execution = checked.executableContract?.resourceExecution
    const expected = sourceDownloadOracle(input.resourceInputs[question], input.externalAssumptions?.[question] ?? [])
    let session: string | undefined
    if (variant.name === "root-default" && checked.status === "valid") session = relative((await saveLocalInquiryCheck(inputFile, programFile, path.join(base, `verification/${track}-archive`), checked, { executionPolicy: "progressive", programContext: "directed" })).sessionPath)
    rows.push({ variant: variant.name, input: relative(inputFile), inputSha256: sha(await readFile(inputFile)), providerCalls: checked.providerCalls, status: checked.status, diagnostics: checked.diagnostics, actual: execution, expected, ...assessFiniteCase(expected, execution), session })
  }
  assert(sha(await readFile(programFile)) === programSha256, "Automatic source bytes changed during evaluation")
  const original = rows.find(r => r.variant === "root-default")
  const equivalent = (name: string) => { const row = rows.find(r => r.variant === name); return isDeepStrictEqual({ returned: row.actual?.returned, termination: row.actual?.termination, gaps: row.actual?.gaps }, { returned: original.actual?.returned, termination: original.actual?.termination, gaps: original.actual?.gaps }) }
  const result = { track, origin: "Current BM model raw; no developer semantic edits", program: relative(programFile), programSha256, providerCalls: 0, variants: rows.length, visibility: { authorVisibleFacts: ["root-default", "empty-version", "explicit-version", "denied"], evaluationOnlyDevelopment: cases.map(c => c.name).filter(n => !["root-default", "empty-version", "explicit-version", "denied"].includes(n)), prospectiveOrHeldOut: false }, rootQueryApplicability: "Local get_root_document branch at versioning.py:149-156 over explicit finite relation/query observations. ORM snapshot/concurrency invariants and full request reachability are not certified; no deployment claim.", results: rows, invariants: { recordOrder: equivalent("reordered"), unrelatedDocument: equivalent("unrelated-document") }, exactShapeFiniteMatches: rows.filter(r => r.finiteMachineMatch).length }
  const evaluated = { ...result, semanticFieldAssessment: rows.map(row => ({ variant: row.variant, ...assessAutomaticCase(row.expected, row.actual, programSha256) })) }
  await save(matrixFile, evaluated); return evaluated
}

export async function verifyPortableAndChangedSource() {
  const matrix = await runOffline(), originalRow = matrix.results.find((r: any) => r.variant === "root-default")
  assert(originalRow.session, "Current automatic raw needs a valid public execution archive")
  const resultPath = path.join(base, "verification/portable.json"), prior = await load(resultPath).catch(() => undefined)
  if (prior) { assert(prior.programSha256 === matrix.programSha256, "Portable record belongs to different raw"); return prior }
  const input = await load(path.join(base, "inputs/root-default.json")), originalRoot = path.resolve(base, "inputs", input.sourceRoot)
  const moved = path.join(base, "verification/moved/package"), copiedSession = path.join(moved, "session"), programFile = path.join(moved, "program.json")
  await mkdir(moved, { recursive: true }); await cp(originalRoot, path.join(moved, "source"), { recursive: true, force: false }); await cp(path.resolve(repo, originalRow.session), copiedSession, { recursive: true, force: false }); await writeFile(programFile, await readFile(path.resolve(repo, matrix.program)))
  const inspected: any = await inspectLocalInquiry(copiedSession)
  assert(inspected.sessionPath === copiedSession, "Moved inspection resolved outside copied session")
  const results = []
  for (const variant of ["root-default", "empty-version", "denied", "renamed-and-reordered"]) {
    const row = matrix.results.find((r: any) => r.variant === variant)
    assert(row?.input, `Missing current matrix input: ${variant}`)
    const current = await load(path.resolve(repo, row.input)), file = path.join(moved, `${variant}.json`); current.sourceRoot = "source"; await save(file, current)
    const fresh: any = await checkAuthorizationInquiry(file, "D1", "question-checked-v1", programFile, { executionPolicy: "progressive" })
    const previous: any = await compareLocalInquiry(file, copiedSession, "question-checked-v1", programFile, { executionPolicy: "progressive" })
    assert(fresh.providerCalls === 0 && previous.providerCalls === 0 && previous.answerReused === false, "Offline reuse dispatched or reused an answer")
    assert(isDeepStrictEqual(fresh.executableContract?.resourceExecution, previous.executableContract?.resourceExecution), "Moved fresh/previous computation differs")
    results.push({ variant, input: relative(file), freshPreviousEqual: true, answerReused: false, actual: fresh.executableContract?.resourceExecution, layers: previous.reuseEligibility?.info?.layers })
  }
  const changed = path.join(base, "verification/source-change/package"), changedSource = path.join(changed, "source")
  await mkdir(changed, { recursive: true }); await cp(originalRoot, changedSource, { recursive: true, force: false })
  const sourcePath = "src/documents/views.py", target = path.join(changedSource, sourcePath), originalFile = path.join(originalRoot, sourcePath)
  assert((await realpath(target)).toLowerCase().startsWith((await realpath(changedSource)).toLowerCase() + path.sep), "Source mutation escaped its copy")
  const before = await readFile(originalFile, "utf8"), needle = 'if request.user is not None and not has_perms_owner_aware(\n            request.user,\n            "view_document",\n            root_doc,\n        ):\n            return HttpResponseForbidden("Insufficient permissions")\n        return ResolvedRequestDocs(request_doc=request_doc, root_doc=root_doc)'
  assert(before.split(needle).length === 2, "Decisive permission branch is not unique")
  const replacement = needle.replace("and not has_perms_owner_aware", "and has_perms_owner_aware")
  const after = before.replace(needle, replacement), current = await readFile(target, "utf8")
  assert(current === before || current === after, "Copied source has unrelated edits")
  if (current === before) await writeFile(target, after, "utf8")
  assert(await readFile(originalFile, "utf8") === before, "Protected original source changed")
  input.sourceRoot = "source"; const changedInput = path.join(changed, "input.json"), changedProgram = path.join(changed, "program.json")
  await save(changedInput, input); await writeFile(changedProgram, await readFile(programFile))
  const compared: any = await compareLocalInquiry(changedInput, copiedSession, "question-checked-v1", changedProgram, { executionPolicy: "progressive" })
  assert(compared.sourceChanged && compared.providerCalls === 0, "Actual copied source change was not detected")
  assert(compared.executableContract?.resourceExecution?.returned === undefined, "Stale automatic return survived its pinned source change")
  const mutation = { path: sourcePath, line: 1421, original: needle, changed: replacement, beforeSha256: sha(before), afterSha256: sha(after), originalUnchanged: true }
  await save(path.join(base, "verification/source-change.json"), { providerCalls: 0, mutation, sourceChanged: compared.sourceChanged, oldReturnWithdrawn: true, programSourceBasis: compared.programSourceBasis, diagnostics: compared.executableContract?.diagnostics, reuseEligibility: compared.reuseEligibility, previous: relative(copiedSession), input: relative(changedInput), program: relative(changedProgram), answerReused: false })
  const result = { programSha256: matrix.programSha256, providerCalls: 0, copiedSession: relative(copiedSession), program: relative(programFile), results, sourceMutation: mutation }
  await save(resultPath, result); return result
}
