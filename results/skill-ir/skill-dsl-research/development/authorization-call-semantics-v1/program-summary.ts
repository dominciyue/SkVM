import { readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
const base = import.meta.dir, evaluation = path.join(base, "evaluation")
const load = async (file: string) => JSON.parse(await readFile(file, "utf8"))
const rows = []
for (const dir of await readdir(evaluation, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue
  const matrix = await load(path.join(evaluation, dir.name, "variation-matrix.json")).catch(() => undefined)
  if (!matrix) continue
  const extra = await load(path.join(evaluation, dir.name, "additional-traces.json"))
  const summarize = (cases: any[]) => ({ denominator: cases.length, strict: cases.filter(r => r.strictTrace?.pass).length, local: cases.filter(r => r.scopeAssessment?.local?.pass).length, unresolvedUpstream: cases.filter(r => r.scopeAssessment?.upstream?.status === "unresolved").length, failures: cases.filter(r => !r.scopeAssessment?.local?.pass).map(r => ({ variant: r.variant, failures: r.scopeAssessment?.local?.failures })) })
  rows.push({ track: dir.name, program: matrix.program, programSha256: matrix.programSha256, fieldMapping: matrix.semanticFieldAssessment.every((r: any) => r.fieldMappingStatus === "reviewed-raw-specific") ? "reviewed" : "pending", finiteFieldMatches: matrix.semanticFieldAssessment.filter((r: any) => r.semanticFields?.finiteMachineMatch).length, valuesOnly: matrix.semanticFieldAssessment.filter((r: any) => r.semanticFields?.valuesMatch || r.semanticFields?.rejectionMatch).length, literalShapeMatches: matrix.exactShapeFiniteMatches, historicalInputs: summarize(matrix.results), additionalTraces: summarize(extra.rows) })
}
const result = { providerCalls: 0, targetExecutions: 0, originalStrictPreserved: true, scopeContract: "Fixed before BO author results; local request/root through file descriptor, upstream conditions separate and never granted. Source-span partition is not semantic proof.", requestOperationCertified: false, rows }
await writeFile(path.join(evaluation, "program-summary.json"), JSON.stringify(result, null, 2) + "\n")
console.log(JSON.stringify(rows.map(({ historicalInputs, additionalTraces, ...row }) => ({ ...row, local: `${historicalInputs.local}/${historicalInputs.denominator}`, extra: `${additionalTraces.local}/${additionalTraces.denominator}` }))))
