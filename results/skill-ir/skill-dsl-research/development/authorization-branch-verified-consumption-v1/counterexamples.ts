// Evaluation-only mechanical cases; never sent back to an active author.
import { readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { checkAuthorizationInquiry } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { sourceDownloadOracle } from "../authorization-authoring-loop-v1/evaluation/source-oracle.ts"
import { assessAutomaticCase } from "./assessment.ts"
const base = import.meta.dir, repo = path.resolve(base, "../../../../.."), q = "requested-document-and-returned-file"
const load = async (file: string) => JSON.parse(await readFile(file, "utf8"))
const programFile = process.argv[2] ? path.resolve(repo, process.argv[2]) : path.join(base, "authoring/automatic-program.json")
const track = process.argv[3] ?? "selected"
if (!/^[a-z0-9-]+$/.test(track)) throw new Error("Invalid track")
const bytes = await readFile(programFile), digest = createHash("sha256").update(bytes).digest("hex")
const seed = await load(path.join(base, "inputs/root-default.json")), rows = []
for (const name of ["translated-identifiers", "foreign-grant-only", "owner-without-initialization"]) {
  const input = structuredClone(seed), facts = input.resourceInputs[q], assumptions = input.externalAssumptions[q]
  if (name === "translated-identifiers") {
    const rename = (row: any) => { row.id += 1700; if (row.root_document_id !== null) row.root_document_id += 1700 }
    facts.documents.forEach(rename); if (facts.related_root) rename(facts.related_root); facts.request.pk += 1700
    for (const fact of assumptions) if (typeof fact.arguments.resource === "number") fact.arguments.resource += 1700
  } else if (name === "foreign-grant-only") {
    facts.documents.find((d: any) => d.id === facts.request.pk).owner_id = facts.actor.id + 1
    for (const fact of assumptions) if (typeof fact.arguments.resource === "number") fact.arguments.resource += 9999
  } else {
    facts.documents.find((d: any) => d.id === facts.request.pk).owner_id = facts.actor.id
    input.externalAssumptions[q] = assumptions.filter((a: any) => a.name !== "ObjectPermissionChecker.construct")
  }
  const file = path.join(base, `evaluation/${track}/counterexample-inputs/${name}.json`)
  input.sourceRoot = path.relative(path.dirname(file), path.resolve(base, "inputs", seed.sourceRoot)).split(path.sep).join("/")
  await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(input, null, 2) + "\n")
  const checked: any = await checkAuthorizationInquiry(file, "D1", "question-checked-v1", programFile, { executionPolicy: "progressive", programContext: "directed" })
  const actual = checked.executableContract?.resourceExecution, expected = sourceDownloadOracle(facts, input.externalAssumptions[q])
  rows.push({ name, input: path.relative(repo, file).split(path.sep).join("/"), expected, actual, outcome: checked.executableContract?.outcome, assessment: assessAutomaticCase(expected, actual, digest), grantCalls: actual?.events.filter((e: any) => e.op === "external" && e.inputs?.name === "ObjectPermissionChecker.has_perm" && e.outcome !== "skipped").length })
}
await writeFile(path.join(base, `evaluation/${track}/counterexamples.json`), JSON.stringify({ programSha256: digest, providerCalls: 0, developmentOnly: true, separateFromEighteenCaseDenominator: true, rows }, null, 2) + "\n")
console.log(JSON.stringify({ track, cases: rows.length, providerCalls: 0 }))
