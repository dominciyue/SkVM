import { mkdir, readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import { checkAuthorizationInquiry, saveLocalInquiryCheck } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { projectProgramAuthoring } from "../../../../../src/task-dsl/authorization/program-authoring-context.ts"
import { createDevelopmentCases } from "./development-cases.ts"
import { sourceDownloadOracle } from "./evaluation/source-oracle.ts"
import { assessFiniteCase } from "./evaluation/finite-assessment.ts"
const base = import.meta.dir, repo = path.resolve(base, "../../../../.."), question = "requested-document-and-returned-file"
const load = async (file: string) => JSON.parse(await readFile(file, "utf8"))
const save = async (file: string, value: unknown) => { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(value, null, 2) + "\n", "utf8") }
const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex")
const relative = (file: string) => path.relative(repo, file).split(path.sep).join("/")

export async function runOfflineMatrix() {
  const seeds = await Promise.all(["root-default", "empty-version", "denied", "root-fallback"].map(name => load(path.join(base, `inputs/${name}.json`))))
  const variants = createDevelopmentCases(seeds[0], seeds[1], seeds[2], seeds[3])
  const historical = path.resolve(base, "../authorization-authoring-closure-v1/authoring/automatic-program.json")
  const assisted = path.join(base, "verification/developer-assisted/BI-A2-binding-only.json")
  const tracks = [{ name: "historical-automatic-raw", program: historical, origin: "BI A2 original raw; no BJ author adoption" }, { name: "developer-assisted-binding-only", program: assisted, origin: "Only inputBinding was added in BJ; no source meanings repaired" }]
  const before = sha(await readFile(historical)), results: any[] = [], criteria: any[] = []
  for (const variant of variants) {
    const inputFile = path.join(base, `inputs/variations/${variant.name}.json`), input = variant.input
    input.sourceRoot = path.relative(path.dirname(inputFile), path.resolve(base, "inputs", input.sourceRoot)).split(path.sep).join("/")
    await save(inputFile, input)
    const expected = sourceDownloadOracle(input.resourceInputs[question], input.externalAssumptions?.[question] ?? [])
    criteria.push({ variant: variant.name, inputSha256: sha(await readFile(inputFile)), expected })
    for (const track of tracks) {
      const raw = await load(track.program), check: any = await checkAuthorizationInquiry(inputFile, "D1", "question-checked-v1", track.program, { executionPolicy: "progressive", programContext: "full" })
      const contract = check.executableContract, execution = contract?.resourceExecution
      const author: any = projectProgramAuthoring({ currentDraft: { revision: "offline-raw", raw }, candidate: { revision: "offline-raw", diagnostics: contract?.diagnostics, resourceExecution: execution } }, input.inquiry.questions, undefined, { resourceInputs: input.resourceInputs, externalAssumptions: input.externalAssumptions, operationQuestions: input.inquiry.questions.map((q: any) => ({ questionId: q.id, operationId: q.operationId })) })
      const assessed = assessFiniteCase(expected, execution)
      let session: string | undefined
      if (variant.name === "root-default" && check.status === "valid" && contract && "evaluation" in contract) {
        const archived = await saveLocalInquiryCheck(inputFile, track.program, path.join(base, `verification/archives/${track.name}`), check, { executionPolicy: "progressive", programContext: "full" })
        session = relative(archived.sessionPath)
      }
      results.push({ variant: variant.name, track: track.name, origin: track.origin, input: relative(inputFile), program: relative(track.program), programSha256: sha(await readFile(track.program)), providerCalls: check.providerCalls, status: check.status, inputBinding: contract?.inputBinding,
        expected, actual: { status: execution?.status, returned: execution?.returned, termination: execution?.termination, conditions: execution?.conditions, gaps: execution?.gaps, events: execution?.events?.map((e: any) => ({ id: e.id, op: e.op, outcome: e.outcome, source: e.source, inputs: e.op === "guard" || e.op === "external" ? e.inputs : undefined, outputs: e.outputs })) },
        firstBlocker: author.firstBlocker, rootBlockers: author.rootBlockers, ...assessed, semanticSupport: "not-certified; source-visible helper/version/root relations remain incomplete", session })
    }
  }
  if (sha(await readFile(historical)) !== before) throw new Error("Historical raw program changed")
  const invariants = tracks.map(track => {
    const rows = results.filter(r => r.track === track.name), original = rows.find(r => r.variant === "root-default")
    const equivalent = (name: string) => isDeepStrictEqual(rows.find(r => r.variant === name)?.actual, original.actual)
    return { track: track.name, recordOrderInvariant: equivalent("reordered"), unrelatedDocumentInvariant: equivalent("unrelated-document") }
  })
  await save(path.join(base, "evaluation/variation-criteria.json"), { origin: "Source-derived evaluation only; not model facts", criteria })
  await save(path.join(base, "evaluation/variation-matrix.json"), { providerCalls: 0, variants: variants.length, tracks, historicalRawUnchanged: true, results, invariants, automaticMainChainEvidence: false })
  console.log(JSON.stringify({ variants: variants.length, checks: results.length, providerCalls: 0, invariants, finiteMatches: tracks.map(t => ({ track: t.name, matched: results.filter(r => r.track === t.name && r.finiteMachineMatch).length })) }))
  return results
}
if (import.meta.main) await runOfflineMatrix()
