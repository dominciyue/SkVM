import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { isDeepStrictEqual } from "node:util"
import path from "node:path"
import { loadInquiryInput, checkAuthorizationInquiry, inspectLocalInquiry, compareLocalInquiry } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { loadRunSkill } from "../../../../../src/run/index.ts"

export const identity = "authorization-executable-contract-v1", root = import.meta.dir, repo = path.resolve(root, "../../../../.."), runRoot = `D:/skill优化/project-maintenance/runs/${identity}`
export const originalInput = path.resolve(root, "../authorization-interprocedural-property-v1/model/packages/download/inquiry.json")
export const skillFile = path.resolve(root, "../authorization-domain-execution-v1/model/source-skills/cloudflare-security-audit/SKILL.md")
export const limits = { maxToolCalls: 64, maxDisplayBytes: 786432, maxReadBytes: 33554432, sessionTimeoutMs: 2700000 }
export const firstPositions = ["auto-h-1", "auto-d-1", "authored-use-base", "authored-use-change", "reuse-fresh", "reuse-previous"]
export const json = async (file: string): Promise<any> => JSON.parse(await readFile(file, "utf8"))
export const sha = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex")
export const write = (file: string, value: unknown, exclusive = false) => writeFile(file, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", ...(exclusive ? { flag: "wx" } : {}) })
export function positionConfiguration(id: string) {
  if (![...firstPositions, "auto-d-2", "auto-h-2"].includes(id)) throw new Error("Use a registered BF position")
  const automatic = id.startsWith("auto-"), h = id.startsWith("auto-h-"), authored = id.startsWith("authored-use-")
  return { id, track: automatic ? "B" : "C", entrance: "inquiry" as const, domainTools: true, method: h ? "M" as const : "D1" as const, strategy: h ? "question-guided-v1" as const : "question-checked-v1" as const, model: "gpt-5.6-sol", effort: "high", limits: { ...limits }, previousArm: id === "reuse-previous", ...(authored ? { domainProgramFile: path.join(root, "authoring/visibility-program-v2.json") } : {}) }
}
export function inputBoundaryIssues(config: ReturnType<typeof positionConfiguration>, input: any, original: any) {
  const issues: string[] = []
  for (const q of original.inquiry.questions) if (!isDeepStrictEqual(input.inquiry?.questions.find((current: any) => current.id === q.id), q)) issues.push(`original-question-changed:${q.id}`)
  if (config.track === "B") {
    if (config.domainProgramFile) issues.push("automatic-authored-program")
    if (input.contractInputs) issues.push("automatic-explicit-inputs")
    if (!isDeepStrictEqual(input, original)) issues.push("automatic-input-changed")
  }
  return issues
}
async function register() {
  const mf = path.join(root, "manifest.json"), sf = path.join(root, "status.json"), manifest = await json(mf), state = await json(sf)
  if (!manifest.positions) { manifest.positions = [...firstPositions, "auto-d-2", "auto-h-2"].map((id, order) => ({ id, order: order + 1, status: firstPositions.includes(id) ? "registered-not-run" : "conditional-not-run", attempts: [] })); await write(mf, manifest) }
  if (!state.accountChannel) { Object.assign(state, { activeAttempts: [], unknownCompletions: [], modelAttempts: 0, accountChannel: { status: "available", consecutiveRoutingFailures: 0, cumulativeRoutingFailures: 0, recoveryAttempts: 0 } }); await write(sf, state) }
  return { manifest, state }
}
async function chooseBaseline() {
  const file = path.join(root, "reuse-baseline.json")
  try { return await json(file) } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e }
  const { manifest } = await register(), examined: any[] = []
  for (const positionId of ["auto-d-1", "auto-d-2", "authored-use-base"]) for (const attemptId of manifest.positions.find((p: any) => p.id === positionId).attempts) {
    const report = await json(path.join(root, "attempts", attemptId, "report.json"))
    if (!report.sessionPath || report.status.endsWith("unknown")) { examined.push({ attemptId, reason: "No known recoverable session" }); continue }
    try {
      const inspected = await inspectLocalInquiry(report.sessionPath), inputFile = positionId.startsWith("auto-") ? originalInput : path.join(root, "authoring/visibility-input.json"), comparison: any = await compareLocalInquiry(inputFile, report.sessionPath, "question-checked-v1")
      const eligibility = comparison.reuseEligibility
      examined.push({ attemptId, status: eligibility?.status, layers: eligibility?.info?.layers })
      if (eligibility?.status !== "reusable" || !eligibility.info.layers?.R1.available) continue
      const baseline = { attemptId, sessionPath: report.sessionPath, runtimeTree: report.runtimeTree, inputFile, inputSha256: report.inputSha256, selection: positionId.startsWith("auto-") ? "first-recoverable-current-D-R1-not-best-verdict" : "authored-fallback-no-current-automatic-R1", provenance: positionId.startsWith("auto-") ? "isolated-study-model-authored" : "development-agent-authored", domainProgramFile: inspected.domainProgram ? path.join(inspected.sessionPath, "domain-program.json") : undefined, domainProgramSha256: inspected.domainProgram?.sha256, layers: eligibility.info.layers, examined, selectedAt: new Date().toISOString(), answerReused: false, previousVerdictRestored: false }
      await write(file, baseline, true); return baseline
    } catch (e) { examined.push({ attemptId, reason: String(e) }) }
  }
  throw new Error(`No current R1 baseline; preserve unrun reuse positions: ${JSON.stringify(examined)}`)
}
async function reuseInput(baseline: any) {
  const file = path.join(root, "model/reuse-input.json")
  try { await readFile(file); return file } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e }
  const base = await loadInquiryInput(baseline.inputFile), value = structuredClone(base.value)
  if (baseline.provenance === "development-agent-authored") delete value.contractInputs
  else {
    const registered = await loadInquiryInput(path.resolve(root, "../authorization-task-binding-v1/model/inputs/download-policy.json"))
    if (!registered.value.inquiry?.policy) throw new Error("Registered independent policy is unavailable")
    value.inquiry = { ...value.inquiry!, mode: "conformance", policy: registered.value.inquiry.policy }
  }
  value.sourceRoot = path.relative(path.dirname(file), base.context.sourceRoot).split(path.sep).join("/")
  await mkdir(path.dirname(file), { recursive: true }); await write(file, value, true)
  await write(path.join(root, "change-registration.json"), { baselineAttemptId: baseline.attemptId, provenance: baseline.provenance, change: baseline.provenance === "development-agent-authored" ? "local-entry-user-null-to-unspecified" : "registered-independent-policy", inputFile: file, inputSha256: sha(await readFile(file)), domainProgramSha256: baseline.domainProgramSha256, originalQuestionMeaningsChanged: false, oldAnswersImported: false, oldVerdictsImported: false, recordedAt: new Date().toISOString() }, true)
  return file
}
export async function prepare(id: string) {
  await register()
  const config = positionConfiguration(id), original = await loadInquiryInput(originalInput), baseline = id.startsWith("reuse-") ? await chooseBaseline() : undefined
  const inputFile = baseline ? await reuseInput(baseline) : id.startsWith("authored-use-") ? path.join(root, `authoring/visibility-input${id.endsWith("change") ? "-change" : ""}.json`) : originalInput
  const loaded = await loadInquiryInput(inputFile), fixedProgram = config.domainProgramFile ?? baseline?.domainProgramFile, domainProgramFile = config.previousArm ? undefined : fixedProgram
  const issues = inputBoundaryIssues(config, loaded.value, original.value), check = await checkAuthorizationInquiry(inputFile, config.method, config.strategy, fixedProgram), skill = await loadRunSkill(skillFile)
  const skillIdentity = await Promise.all([...new Set(["SKILL.md", ...skill.bundleFiles])].sort().map(async file => { const bytes = await readFile(path.join(skill.skillDir, file)); return { file, sha256: sha(bytes), bytes: bytes.length } }))
  if (issues.length || check.status !== "valid" || check.sourceFiles?.length !== 95 || skillIdentity.length !== 22) throw new Error(`BF readiness failed: ${JSON.stringify({ issues, status: check.status, sourceFiles: "sourceFiles" in check ? check.sourceFiles?.length : null, skillFiles: skillIdentity.length })}`)
  const previous = config.previousArm ? baseline!.sessionPath : undefined, comparison: any = baseline ? await compareLocalInquiry(inputFile, baseline.sessionPath, config.strategy, fixedProgram) : undefined
  if (previous && comparison.reuseEligibility?.status !== "reusable") throw new Error("Current previous input has no recoverable R0/R1 layer")
  const readiness = { ...config, inputFile, originalInput, skillFile, domainProgramFile, fixedProgramSha256: fixedProgram ? sha(await readFile(fixedProgram)) : null, inputSha256: loaded.inputSha256, originalTaskSha256: original.inputSha256, originalQuestionIds: original.value.inquiry!.questions.map(q => q.id), questionIds: loaded.value.inquiry!.questions.map(q => q.id), sourceFiles: check.sourceFiles, skillIdentity, runtimeTree: execFileSync("git", ["rev-parse", "HEAD:src"], { cwd: repo, encoding: "utf8" }).trim(), readyToDispatch: true, modelCalls: 0, evaluatorProvidedToRuntime: false, previous, baselineAttemptId: baseline?.attemptId, baselineProvenance: baseline?.provenance, reuseComparison: comparison }
  await mkdir(path.join(root, "verification"), { recursive: true }); await write(path.join(root, "verification", `ready-${id}.json`), readiness)
  return readiness
}
if (import.meta.main) {
  const command = process.argv[2]
  if (command === "prepare") { const ready = await prepare(process.argv[3]!); console.log(JSON.stringify({ id: ready.id, readyToDispatch: ready.readyToDispatch, modelCalls: 0, originalQuestionIds: ready.originalQuestionIds, questionCount: ready.questionIds.length, sourceFiles: ready.sourceFiles?.length, skillFiles: ready.skillIdentity.length, baselineAttemptId: ready.baselineAttemptId })) }
  else if (command === "run") await (await import("./runner.ts")).run(process.argv[3]!, process.argv[4])
  else console.log("prepare <position> | run <position> [named-revision]")
}
