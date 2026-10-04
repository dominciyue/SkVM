import { readFile, writeFile, readdir } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { root, replay } from "./study.ts"
type Usage = Record<string, any>
const count = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x) && x >= 0
const money = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0
/** This provider reports fresh input separately from cache reads. USD is never inferred from tokens. */
export function sumUsage(accounts: Usage[]) {
  const known = (field: string) => accounts.reduce((n, a) => n + (count(a[field]) ? a[field] : 0), 0)
  const tokens = (field: string) => accounts.reduce((n, a) => n + (count(a.knownTokens?.[field]) ? a.knownTokens[field] : 0), 0)
  const knownFreshInput = tokens("input"), knownCacheRead = tokens("cacheRead"), knownCacheWrite = tokens("cacheWrite"), knownOutput = tokens("output")
  const tokensComplete = accounts.every(a => a.tokensStatus === "complete" && (a.unknownUsageCalls ?? 0) === 0 && ["input", "output", "cacheRead", "cacheWrite"].every(k => count(a.knownTokens?.[k])))
  const usdComplete = accounts.every(a => money(a.totalActualUsd))
  return { providerCalls: accounts.every(a => count(a.providerCalls)) ? known("providerCalls") : null, knownProviderCalls: known("providerCalls"), respondedCalls: accounts.every(a => count(a.respondedCalls)) ? known("respondedCalls") : null, knownRespondedCalls: known("respondedCalls"), unknownUsageCalls: known("unknownUsageCalls"), tokensStatus: tokensComplete ? "complete" : "partial", knownFreshInput, knownCacheRead, knownCacheWrite, knownFullPrompt: knownFreshInput + knownCacheRead, knownOutput, knownPromptAndOutput: knownFreshInput + knownCacheRead + knownOutput, knownActualUsdSubtotal: accounts.reduce((n, a) => n + (money(a.knownActualUsdSubtotal) ? a.knownActualUsdSubtotal : 0), 0), totalActualUsd: usdComplete ? accounts.reduce((n, a) => n + a.totalActualUsd, 0) : null, actualUsdStatus: usdComplete ? "complete" : "unknown" }
}
const json = async (file: string) => JSON.parse(await readFile(file, "utf8")), sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex")
export async function collectAccounting() {
  const retained = await replay(), manifest = await json(path.join(root, "manifest.json")), attempts: any[] = [], active: any[] = []
  for (const id of (await readdir(path.join(root, "runs"))).sort()) for (const directory of (await readdir(path.join(root, "runs", id))).filter(p => /^attempt-\d+$/.test(p)).sort((a, b) => Number(a.slice(8)) - Number(b.slice(8)))) {
    const relative = `runs/${id}/${directory}/report.json`, claim = await json(path.join(root, "runs", id, directory, "claim.json")), bytes = await readFile(path.join(root, relative)).catch(() => undefined)
    if (!bytes) { active.push({ id, attempt: claim.attempt, startedAt: claim.startedAt, noAutomaticResend: true }); continue }
    const { report: r } = JSON.parse(bytes.toString("utf8")), zero = retained.rows.find(row => row.id === id)?.classificationCorrections?.some((x: any) => x.artifact === relative)
    const account = r.telemetry ?? (zero ? { providerCalls: 0, respondedCalls: 0, unknownUsageCalls: 0, tokensStatus: "complete", knownTokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, totalActualUsd: 0, knownActualUsdSubtotal: 0 } : {})
    let requests = r.requests
    if (!requests && r.sessionPath) requests = (await json(path.join(r.sessionPath, "run.json")).catch(() => undefined))?.requests
    const serializedRequestBytes = Array.isArray(requests) ? requests.reduce((n: number, request: unknown) => n + Buffer.byteLength(JSON.stringify(request)), 0) : null
    const c = r.domain?.check
    attempts.push({ id, attempt: claim.attempt, row: claim.row, revision: claim.revision, model: claim.model, budgets: claim.budgets, originalArtifact: relative, originalArtifactSha256: sha(bytes), originalStatus: r.status, inspectedZeroDispatch: !!zero, repairId: claim.repairId, repairOf: claim.repairOf, durationMs: r.durationMs ?? null, account, sourceAccounting: r.sourceAccounting ?? null, observedSerializedRequestBytes: serializedRequestBytes, serializedRequestMeasure: "UTF-8 JSON of retained request records; not network tokens or actual HTTP body bytes", requestPhases: Array.isArray(requests) ? requests.map((x: any) => x.phase ?? "ordinary") : null, check: c ? { structureValid: c.structureValid, sourceBound: c.sourceBound, ruleConsistency: c.ruleConsistency, taskResolution: c.taskResolution, semanticSupport: c.semanticSupport } : null, semanticUnits: r.domain?.semantic?.units?.length ?? null, targetExecutions: 0 })
  }
  const quality = attempts.filter(a => a.row.kind === "quality"), authoring = attempts.filter(a => a.row.kind === "author"), native = attempts.filter(a => a.row.kind === "native"), consumers = attempts.filter(a => a.id.startsWith("consume-author-"))
  const panel = manifest.rows.map((row: any) => {
    const runs = attempts.filter(a => a.id === row.id).sort((a, b) => a.attempt - b.attempt), first = runs.find(a => a.attempt === 1), last = runs.at(-1)
    return { id: row.id, task: row.task, kind: row.kind, studyArm: row.studyArm, admission: row.admission, first: first ? { artifact: first.originalArtifact, status: first.originalStatus, revision: first.revision, account: first.account, check: first.check } : null, lastKnown: last ? { artifact: last.originalArtifact, status: last.originalStatus, revision: last.revision, account: last.account, check: last.check } : null, repairs: runs.filter(a => a.attempt > 1).map(a => a.originalArtifact), allAttempts: sumUsage(runs.map(a => a.account)) }
  })
  const authorWorkload = []
  for (const a of authoring) {
    const directory = path.dirname(path.join(root, a.originalArtifact)), input = await json(path.join(directory, "authored-inquiry.json")).catch(() => undefined)
    authorWorkload.push({ id: a.id, attempt: a.attempt, modelAuthoredQuestions: input?.inquiry?.questions?.length ?? null, modelAuthoredPremises: input?.inquiry?.questions?.reduce((n: number, q: any) => n + q.premises.length, 0) ?? null, inputArtifact: input ? path.relative(root, path.join(directory, "authored-inquiry.json")).split(path.sep).join("/") : null, modelCalls: a.account.providerCalls ?? null, humanMinutes: null, completeSourceSkillAndReferences: true, hostInput: "original skill identity, natural task, source identity/scope and independently supplied policy; public format and mechanical workspace metadata", modelOutput: "questions, task wording, premise transcription, source entry hints and USAGE; no host-authored source answers or graph", authoringIsAnalysisCompletion: false })
  }
  const summary = { schemaVersion: "authorization-as-accounting/v1", collectedAt: new Date().toISOString(), registeredDenominator: 29, registeredQuality: 15, eligibleQuality: 12, registeredNative: 4, registeredVariations: 8, registeredSourceChanges: 2, separateAuthoring: 4, additionalExactAuthorConsumers: 4, closedAttempts: attempts.length, active, allAttempts: sumUsage(attempts.map(a => a.account)), primaryQualityFirsts: sumUsage(quality.filter(a => a.attempt === 1).map(a => a.account)), qualityRepairs: sumUsage(quality.filter(a => a.attempt > 1).map(a => a.account)), authoring: sumUsage(authoring.map(a => a.account)), native: sumUsage(native.map(a => a.account)), exactAuthorConsumers: sumUsage(consumers.map(a => a.account)), panel, authorWorkload, targetExecutions: 0, developerUsage: null, humanMinutes: null, financialAssumptions: "No token-to-USD estimate. Missing price/cost and missing usage remain unknown. Transport attempts remain as reported, often unknown.", comparisonRule: "Same-model/budget/version firsts form descriptive task blocks. Firsts and repairs remain separate; historical OWUI D-S first is a different implementation and cannot establish a same-version causal gain." }
  await writeFile(path.join(root, "call-index.json"), JSON.stringify({ schemaVersion: "authorization-as-call-index/v1", attempts, active }, null, 2) + "\n")
  await writeFile(path.join(root, "accounting.json"), JSON.stringify(summary, null, 2) + "\n")
  return summary
}
if (import.meta.main) { const s = await collectAccounting(); console.log(JSON.stringify({ closedAttempts: s.closedAttempts, active: s.active.length, allAttempts: s.allAttempts, providerCallsThisCommand: 0 })) }
