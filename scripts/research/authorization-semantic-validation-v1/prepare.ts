import { copyFile, readFile, readdir, mkdir } from "node:fs/promises"
import path from "node:path"
import { AuthorizationInquiryInputSchema } from "../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { base, root, repo, load, save, hash, relative } from "./evidence.ts"
import { prepareReferences } from "./reference.ts"
export const positions = ["A-M", "A-G", "N-M", "RR-M", "RE-M", "AE-M", "AE-G", "RE-G", "RR-G", "N-G"]
export const limits = { maxToolCalls: 64, maxDisplayBytes: 786432, maxReadBytes: 33554432, sessionTimeoutMs: 2700000 }
async function files(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  return (await Promise.all(entries.map(e => e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]))).flat()
}
export async function prepare(freeze = false) {
  if (await Bun.file(path.join(base, "registration.json")).exists()) throw new Error("registration-already-frozen")
  const bs = path.join(root, "authorization-task-coverage-v1"), domain = path.join(root, "authorization-domain-execution-v1/model")
  if (await Bun.file(path.join(base, "attempts.json")).exists() && (await load(path.join(base, "attempts.json"))).length) throw new Error("inference-already-started")
  for (const name of ["memos-original", "memos-changed", "gitea-original", "gitea-changed"]) {
    const input = await load(path.join(bs, `inputs/${name}.json`))
    if (name.startsWith("gitea")) input.sourceNotes.text = input.sourceNotes.text.replace("from an empty draft", "by repairing the supplied existing draft")
    AuthorizationInquiryInputSchema.parse(input)
    await save(path.join(base, `inputs/${name}.json`), input)
    if (name.endsWith("-original")) {
      const author = structuredClone(input)
      author.sourceNotes.text += name.startsWith("memos")
        ? " Repair feedback from independent source inspection: inspect the current memo_visible_state predicate against server/api/v1/memo_share_service.go:182-189; inspect creator_valid placement against core/access/memo_resolve.go:31-90 and core/access/memo.go:92-122. Final error equality alone does not validate lookup order. Read those source relations and repair the last raw rather than selecting an older draft."
        : " Repair feedback from prior host/schema diagnostics: the current route_reader_gate.permission is an object where the schema requires a string. Inspect the parent /issues group in routers/api/v1/api.go and complete source-supported handler work in routers/api/v1/repo/issue.go:624-652, including necessary services/issue helpers. Format repair alone does not supply missing source semantics. Preserve unknown transaction/deployment facts."
      await save(path.join(base, `inputs/${name.replace("-original", "-author")}.json`), author)
    }
  }
  await mkdir(path.join(base, "automatic"), { recursive: true })
  for (const task of ["M", "G"]) await copyFile(path.join(bs, `authoring/${task}-automatic-program.json`), path.join(base, `automatic/${task}-initial.json`))
  await prepareReferences()
  await save(path.join(base, "attempts.json"), [])
  await save(path.join(base, "repairs.json"), [])
  const rubric = await load(path.join(bs, "evaluation/rubric.json"))
  await save(path.join(base, "evaluation/rubric.json"), { ...rubric, targetExecutions: undefined,
    identity: "authorization-semantic-validation-v1", sourceFirst: true, frozenBeforeCalls: true,
    coreRelations: {
      M: ["token object binding", "entry versus helper activation", "context calls before creator/audience decision", "independent conversion creator and response scope"],
      G: ["parent route and route-specific gates", "reader creation versus writer-only fields and experimental policy", "creation/close/refetch/converter first-error and effect limits"],
    },
    severeUnsupportedClaims: ["Absence of a check proves safety", "An unrelated object grant protects current effect", "Parent gate is absent because helper alone lacks it", "Later error proves no prior creation request", "Synthetic error null proves durable commit", "Reference preparation or code inspection counted as automatic author success"],
    scoring: "Blind original question domains full/partial/incorrect/not-covered; each core relation correct/incorrect/not-covered; severe unsupported claims counted separately. Keep first and final delivery, all ten planned positions including zero-call ineligible. No keyword scoring.",
    comparison: "RR vs RE is same-reference execution/check increment. AE vs RE diagnoses automatic material quality. N vs RR includes developer preparation; no DSL-only effect claim. Two exposed tasks are diagnostic only." })
  await copyFile(path.join(bs, "evaluation/cases.json"), path.join(base, "evaluation/inherited-cases.json"))
  const registered: Record<string, string> = {}
  const register = async (p: string) => { registered[relative(p)] = hash(await readFile(p)) }
  for (const dir of ["inputs", "automatic", "reference"]) for (const p of await files(path.join(base, dir))) await register(p)
  for (const dir of ["public-source/memos", "public-source/gitea", "source-skills/github-security-review"]) for (const p of await files(path.join(domain, dir))) await register(p)
  for (const name of ["evaluation/rubric.json", "evaluation/inherited-cases.json"]) await register(path.join(base, name))
  await save(path.join(base, freeze ? "registration.json" : "registration-draft.json"), { identity: "authorization-semantic-validation-v1", registeredAt: new Date().toISOString(), beforeFirstProvider: true, providerCalls: 0, positions, limits, model: "gpt-5.6-sol", effort: "high", files: registered,
    author: { startingRaw: "exact BS last raw copied byte-for-byte into automatic/*-initial.json", maximumTurns: 3, cumulativeBudget: true, feedback: "shared diagnostics plus registered source-inspection repair hints in author-only sourceNotes; original question and facts unchanged; reference/oracle/evaluation unavailable to model" },
    reference: { provenance: "Developer source reading plus independent read-only G review and M extracted original function tests", generator: relative(path.join(repo, "scripts/research/authorization-semantic-validation-v1/reference.ts")), automaticSuccess: false, finalAnswersIncluded: false, oracleIncluded: false, developerTimeAndCost: "unknown; source/development calls are not experimental consumer usage", scope: "M through local shared read decision; G conditional handler field/observed error order with unresolved writer-assignee boundary. Original tasks preserved." },
    source: { additionsToModelScope: [], completeCheckouts: "ignored .tmp/bt-source, independent validation only", heldOutChanged: false, thirdPartyModelCalls: 0 },
    fairness: { originalSkill: true, identicalReferenceBytesRRRE: true, commonSourceAndInputs: true, gEditDutyTextChange: "from empty draft -> repairing supplied existing draft, common to all G arms", aeEligibility: "zero-call skip for invalid raw or known core counterexample; partial source-related executable scope may qualify", confirmationLimit: 4 } })
  return { positions, registeredFiles: Object.keys(registered).length, providerCalls: 0 }
}
if (import.meta.main) console.log(JSON.stringify(await prepare(process.argv.includes("--freeze")), null, 2))
