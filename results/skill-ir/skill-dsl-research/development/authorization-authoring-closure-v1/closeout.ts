import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const base = import.meta.dir
const load = async (name: string) => JSON.parse(await readFile(path.join(base, name), "utf8"))
const save = async (name: string, value: unknown) => writeFile(path.join(base, name), JSON.stringify(value, null, 2) + "\n", "utf8")
const positions = ["A1", "A2", "C1", "C2", "P0-full", "P0-compact", "P1-compact", "P1-full"]
const ledger: any[] = await load("attempts.json")
assert.deepEqual(ledger.map(r => r.position), positions)
assert.ok(ledger.every(r => r.status === "completed" && r.answerDelivery === "delivered"))
const accounting = await load("accounting.json"), quality = await load("quality.json"), comparison = await load("comparison.json")
assert.equal(accounting.runs.length, positions.length)
assert.deepEqual(new Set(quality.runs.map((r: any) => r.position)), new Set(positions))
assert.equal(comparison.pairs.length, 2)
assert.ok(comparison.pairs.every((p: any) => p.sameConditions))
const raw = await readFile(path.join(base, "authoring/automatic-program.json"))
const programSha256 = createHash("sha256").update(raw).digest("hex")
assert.equal(programSha256, quality.frozenProgram.sha256)
assert.ok(accounting.runs.filter((r: any) => r.position.startsWith("C")).every((r: any) => r.programSha256 === programSha256 && !r.returned))
const engineering = await load("verification/engineering-stage-2.json"), offline = await load("verification/offline.json"), portable = await load("verification/portability.json"), transmission = await load("verification/transmission-reconciliation.json"), final = await load("verification/final.json")
assert.equal(engineering.affectedAuthorizationSuite.fail, 0)
assert.equal(offline.providerCalls, 0)
assert.equal(portable.providerCalls, 0)
assert.equal(transmission.observations.length, 8)
assert.ok(transmission.observations.every((r: any) => r.allSampleBytesAndSha256Match && r.classificationMatches))
assert.ok(Object.values(final.checks).every((c: any) => c.exitCode === 0))
let publication: any = null
try { publication = await load("publication.json") } catch (error: any) { if (error.code !== "ENOENT") throw error }
const publicationComplete = publication?.remoteMatches === true
const naturalRuns = quality.runs.map((r: any) => ({ position: r.position, natural: r.natural, sourceMeaning: r.sourceMeaning, wholeTask: r.wholeTask, machine: r.machine }))
const pendingResponsibilities = [
  { responsibility: "Bind the automatic raw program to supplied question-specific facts", owner: "model author using visible inputBindings and original task/source", evidence: "quality.json:frozenProgram.questionBinding" },
  { responsibility: "Author independent None/empty/explicit version selection and correct latest ordering", owner: "model author; existing finite operators support the exposed reference relations", evidence: "quality.json:frozenProgram.gaps" },
  { responsibility: "Express nonowner authorization, loaded root/missing-root fallback, and final file/representation relations", owner: "model author and source review; external permission/deployment facts stay conditional", evidence: "authoring/automatic-program.json and original source" },
  { responsibility: "Establish stable cost benefit beyond two exposed developer-reference pairs", owner: "future explicitly scoped evaluation; no automatic additional model dispatch", evidence: "comparison.json" }
]
const axes = {
  engineering: { achieved: true, evidence: ["verification/engineering-stage-1.json", "verification/engineering-stage-2.json", "verification/final.json", "verification/offline.json", "verification/portability.json"] },
  automaticMainChain: { achieved: false, frozenProgramSha256: programSha256, inputVariants: ["root-default", "empty-version"], result: "Both automatic consumers have empty program input maps and no computed file descriptor; full natural explanation is separate.", evidence: ["authoring/automatic-program.json", "quality.json", "zero-model/", "runs/C1-first/", "runs/C2-first/"] },
  wholeTaskQuality: { achievedForEveryRun: naturalRuns.every((r: any) => r.wholeTask === "full"), fullRuns: naturalRuns.filter((r: any) => r.wholeTask === "full").length, totalRuns: naturalRuns.length, runs: naturalRuns, interpretation: "Descriptive counts only: A2 recovers A1, C uses the automatic original, P uses a developer reference. These are distinct denominators." },
  consumptionBenefit: { stableNetBenefitEstablished: false, pairs: comparison.pairs, recommendedDefault: "full; compact remains explicit", evidence: "comparison.json" },
  maintainableDelivery: { engineeringArtifactsAvailable: true, publicationComplete, evidence: ["examples/authorization-assessment/download-workflow/README.md", "docs/usage.md", "docs/skill-ir/developer-guide.md", "publication.json"] }
}
const status = await load("status.json")
status.status = publicationComplete ? "completed-with-unmet-criteria" : "in-progress"
status.stage = publicationComplete ? "BI23-published-with-specific-unmet-criteria" : "BI23-publication-pending"
status.finiteQueueComplete = true
status.researchGoalAchieved = false
status.publicationComplete = publicationComplete
status.activeOrUnknownModelRuns = 0
status.nextAction = publicationComplete ? "Finite BI queue closed. Preserve the frozen automatic original and pendingResponsibilities; no third author, extra panel or historic unknown resend is authorized by this closeout." : "Commit final docs and current BI evidence, push user origin, verify remote content HEAD, save publication.json, then commit/push the closeout metadata. No model rerun."
status.axes = axes
if (publicationComplete) status.completedAt = publication.verifiedAt
await save("status.json", status)
const elapsedMs = Date.parse(status.completedAt ?? final.verifiedAt) - Date.parse(status.startedAt)
const common = { identity: status.identity, status: status.status, finiteQueueComplete: true, researchGoalAchieved: false, publicationComplete, accountSessions: { attempted: 8, completed: 8, delivered: 8, activeOrUnknown: 0, extraRepairSessions: 0, providerRequestCount: null }, axes, pendingResponsibilities }
await save("acceptance.json", { ...common, goal: "Unreferenced model author computes authorization/root/file/representation and changed input from the same original; quality-preserving consumption has measured cost benefit.", conclusion: "Shared engineering and finite authorized queue complete; automatic main chain and stable net benefit unmet. Do not replace automatic evidence with developer-reference computation." })
await save("summary.json", { ...common, takeoverCommit: status.takeoverCommit, engineeringCommits: ["00053b32ee0b2dea0ecc5cefd2097f62987694bc", "c9749483"], automaticProgram: { file: "authoring/automatic-program.json", sha256: programSha256, adoptedFrom: "A2-first", developerSemanticEdits: false, naturalAnswersReused: false }, costs: { ...accounting.totals, groups: accounting.groups, cacheConvention: accounting.cacheConvention, unknowns: accounting.unknowns }, recordedTime: { startedAt: status.startedAt, lastVerifiedAt: status.completedAt ?? final.verifiedAt, elapsedMs, elapsedHours: elapsedMs / 3600000, plannedHours: 12, basis: "Recorded wall-clock interval, not active human/agent minutes. No waiting, repeated audit or extra sampling to fill the estimate." }, evidence: { attempts: "attempts.json", quality: "quality.json", accounting: "accounting.json", comparisons: "comparison.json", readPurposes: "verification/source-read-audit.json", payloadReconciliation: "verification/transmission-reconciliation.json", verification: "verification/final.json" }, protectedEvidence: "BH/BE/held-out/prospective/Q1/readiness and historic 0-of-6 unchanged" })
console.log(JSON.stringify({ status: status.status, publicationComplete, naturalWholeTaskFull: axes.wholeTaskQuality.fullRuns, runs: 8, comparisons: comparison.pairs.map((p: any) => ({ prefix: p.prefix, classification: p.classification })), pendingResponsibilities: pendingResponsibilities.length }))
