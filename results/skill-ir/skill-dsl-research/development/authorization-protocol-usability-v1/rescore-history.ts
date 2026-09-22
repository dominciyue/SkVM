import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { evaluateAuthorizationGenerationV3 } from "../../../../../src/benchmarks/authorization-dsl/evaluate.ts"
const repo = path.resolve(import.meta.dir, "../../../../..")
const y = path.join(repo, "results/skill-ir/skill-dsl-research/development/authorization-transfer-value-v1/migration/runs/y11-initial-v1/units")
const read = async (p: string) => JSON.parse(await readFile(p, "utf8"))
const { responseDetails, ...rubric } = (await read(path.join(import.meta.dir, "evaluator/rubrics-v3.json"))).cases.find((c: any) => c.caseId.endsWith("writer-nonadmin"))
const units = []
for (const relative of [...new Bun.Glob("*lock*/sessions/*/run.json").scanSync({ cwd: y })].sort()) {
  const runPath = path.join(y, relative)
  const run = await read(runPath)
  const unitRoot = path.resolve(path.dirname(runPath), "../..")
  const review = await read(path.join(unitRoot, "review.initial.json"))
  review.rubricVersion = rubric.rubricVersion
  review.reviewer.identity = "Z-development-agent-historical-calibration"
  const control = review.criterionReviews.find((c: any) => c.criterionId === "lock-nonadmin-http-403")
  control.criterionId = "lock-nonadmin-denial-control"
  control.status = "supported"
  control.answerLocation = "/results/0/facts/control/0"
  control.reason = "Read the retained answer: both administrator predicates false cause rejection before handler; this reclassified control criterion does not demand a numeric HTTP status. The separate response detail remains missing."
  const sourceBundle = await read(path.join(path.dirname(runPath), "source-bundle.json"))
  const evaluation = evaluateAuthorizationGenerationV3({ rubric, sourceBundle, artifact: run.initial, generation: "initial", review, responseDetails })
  units.push({ unitId: path.basename(unitRoot), historicalQuality: "partial", evaluation, review })
}
await writeFile(path.join(import.meta.dir, "historical-calibration.json"), JSON.stringify({ schemaVersion: "authorization-historical-calibration/v3", originalArtifactsModified: false, attribution: "Evaluation-version change only; no new-method benefit", remoteCalls: 0, units }, null, 2) + "\n", "utf8")
console.log(JSON.stringify(units.map(u => ({ unit: u.unitId, quality: u.evaluation.qualityStatus, dimensions: u.evaluation.dimensions, reviewValid: u.evaluation.reviewValidation.status }))))
