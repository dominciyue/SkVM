import { readFile } from "node:fs/promises"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import { runAuthorizationCli } from "../../../../../src/cli/authorization.ts"
import { applyTaskChange } from "../../../../../src/benchmarks/authorization-dsl/authoring-task.ts"
import { hash, json, repo, root, save } from "./common.ts"

const mode = process.argv[2]
if (!["check", "replay"].includes(mode ?? "")) throw new Error("Usage: portable-check.ts check|replay (zero provider)")
const copy = path.resolve(repo, "../project-maintenance/authorization-an-portable-20260930")
if (copy === repo || !path.relative(repo, copy).startsWith("..")) throw new Error("Portable verification must use a copy outside the checkout")
const recordFile = path.join(root, "portable-verification.json")
const checked = ["current-task-context.json", "current-task.json", "current-task-change.json", "changed-current-task.json",
  "current-authoring.json", "changed-authoring.json", "project/src/owner-records.ts",
  "current-material/assessment.json", "current-material/report.json", "current-material/source/src/owner-records.ts",
  "changed-material/assessment.json", "changed-material/report.json", "changed-material/reuse.json", "changed-material/source/src/owner-records.ts"]
const digest = async (relative: string) => hash(await readFile(path.join(copy, relative)))

if (mode === "replay") {
  const record = await json(recordFile)
  if (record.copy !== copy || record.checkedFiles.length !== checked.length || record.providerCalls !== 0 || record.targetExecutions !== 0) throw new Error("Portable record identity changed")
  for (const item of record.checkedFiles) if (!checked.includes(item.path) || await digest(item.path) !== item.sha256) throw new Error(`Portable bytes changed: ${item.path}`)
  console.log(JSON.stringify({ status: "reproduced", files: checked.length, providerCallsThisCommand: 0 }))
} else {
  const original = await json(path.join(copy, "current-task.json")), change = await json(path.join(copy, "current-task-change.json"))
  const applied = applyTaskChange(original, change)
  if (applied.status !== "ready" || !isDeepStrictEqual(applied.current, await json(path.join(copy, "changed-current-task.json"))) ||
      !isDeepStrictEqual(applied.changedPaths, ["request", "cases.no-grant.premises.owner-state.statement"])) throw new Error("Named task change did not reproduce")
  const current = await json(path.join(copy, "current-authoring.json")), changed = await json(path.join(copy, "changed-authoring.json"))
  if (!isDeepStrictEqual(current.policies, changed.policies) || !isDeepStrictEqual(current.entries, changed.entries) ||
      !isDeepStrictEqual(current.sources, changed.sources) || current.request === changed.request ||
      current.analysisContract.scenarios["no-grant"].premises[0].statement === changed.analysisContract.scenarios["no-grant"].premises[0].statement) throw new Error("Named task change altered source/policy or failed to alter premise")
  const currentReport = await json(path.join(copy, "current-material", "report.json")), changedReport = await json(path.join(copy, "changed-material", "report.json"))
  const reuse = await json(path.join(copy, "changed-material", "reuse.json"))
  const fullSourceSha256 = await digest("project/src/owner-records.ts")
  const checkoutSourceSha256 = hash(await readFile(path.join(repo, "examples/authorization-assessment/task-semantics/project/src/owner-records.ts")))
  const cropHashes = await Promise.all(["current-material/source/src/owner-records.ts", "changed-material/source/src/owner-records.ts"].map(digest))
  const fullSource = await readFile(path.join(copy, "project/src/owner-records.ts"), "utf8")
  const expectedCrop = fullSource.split(/\r?\n/).slice(4, 10).join("\n").trimEnd()
  const actualCrop = (await readFile(path.join(copy, "current-material/source/src/owner-records.ts"), "utf8")).trimEnd()
  if (fullSourceSha256 !== checkoutSourceSha256 || cropHashes[0] !== cropHashes[1] || expectedCrop !== actualCrop ||
      !isDeepStrictEqual(currentReport.sourceIdentity, changedReport.sourceIdentity) ||
      !isDeepStrictEqual(currentReport.included, changedReport.included) || !isDeepStrictEqual(currentReport.gaps, changedReport.gaps) ||
      !reuse.requiresAnalysis) throw new Error("Source bytes, identity, included material or pending gaps changed")
  async function ordinaryCheck(input: string) {
    const output: string[] = [], errors: string[] = []
    const exitCode = await runAuthorizationCli(["check", `--input=${path.join(copy, input)}`, "--method=plain", "--assessment=explicit-v1", "--wire=v6", "--task-contract=current-v1"], {
      stdout: value => output.push(value), stderr: value => errors.push(value), providerFactory: () => { throw new Error("Portable check attempted provider creation") },
    })
    const result = JSON.parse(output.join("\n"))
    if (exitCode || result.status !== "valid" || result.taskContractMode !== "current-v1" ||
        result.sourceRoot !== path.join(copy, "current-material", "source") && result.sourceRoot !== path.join(copy, "changed-material", "source")) throw new Error(`Ordinary portable check failed: ${input} ${JSON.stringify({ exitCode, errors, status: result.status, sourceRoot: result.sourceRoot })}`)
    return { status: result.status, taskContractMode: result.taskContractMode, expandedObligations: result.scopePreview.expandedObligations,
      repository: result.repository, sourceRef: result.sourceRef, sourceFiles: result.sourceFiles }
  }
  const checks = { current: await ordinaryCheck("current-material/assessment.json"), changed: await ordinaryCheck("changed-material/assessment.json") }
  if (!isDeepStrictEqual(checks.current, checks.changed) || checks.current.expandedObligations !== 1 ||
      checks.current.repository !== currentReport.sourceIdentity.repository || checks.current.sourceRef !== currentReport.sourceIdentity.sourceRef) throw new Error("Portable ordinary check identity or obligation changed")
  const currentAssessmentSha256 = await digest("current-material/assessment.json"), changedAssessmentSha256 = await digest("changed-material/assessment.json")
  if (currentAssessmentSha256 === changedAssessmentSha256) throw new Error("Task change failed to alter the prepared assessment")
  const record = { schemaVersion: "authorization-an-portable/v1", copy, checkedFiles: await Promise.all(checked.map(async file => ({ path: file, sha256: await digest(file) }))),
    sourceSha256: fullSourceSha256, preparedCropSha256: cropHashes[0], sourceIdentity: currentReport.sourceIdentity,
    material: { current: currentReport.status, changed: changedReport.status, pendingGaps: currentReport.gaps.length,
      sourceBytesSame: true, includedSame: true, gapsSame: true, currentAssessmentSha256, changedAssessmentSha256 },
    changedPaths: applied.changedPaths, checks, providerCalls: 0, targetExecutions: 0 }
  await save(recordFile, record, true)
  console.log(JSON.stringify({ status: "verified", files: checked.length, checks, providerCalls: 0, targetExecutions: 0 }))
}
