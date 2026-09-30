import path from "node:path"
import { readFile, writeFile, appendFile, mkdir, cp, readdir, stat } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { z } from "zod"
import { sources } from "./acquire-source.ts"
import { checkAuthorizationInquiry, executeLocalInquiryRun, inspectLocalInquiry, compareLocalInquiry, AuthorizationInquiryInputSchema } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createNativeInquiryRuntime } from "../../../../../src/benchmarks/authorization-dsl/inquiry-native.ts"
import { createInquiryTools } from "../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { AuthorizationInquirySchema, type AuthorizationInquiry } from "../../../../../src/task-dsl/authorization/inquiry.ts"
import { renderNaturalInquiryAuthorTask } from "../../../../../src/benchmarks/authorization-dsl/inquiry-run.ts"
import { acceptAuthoredInquiry } from "../../../../../src/benchmarks/authorization-dsl/authoring-assist.ts"
import { createTelemetryProvider } from "../../../../../src/benchmarks/authorization-dsl/telemetry.ts"
import { extractStructured } from "../../../../../src/providers/structured.ts"
import { createProviderForModel } from "../../../../../src/providers/registry.ts"
import { authorArtifactReview } from "./author-review.ts"
import { executeRun, loadRunSkill, materializeNaturalRunTask } from "../../../../../src/run/index.ts"
import { BareAgentAdapter } from "../../../../../src/adapters/bare-agent.ts"
import { rowState, nextFailureStreak } from "./row-ledger.ts"

const root = import.meta.dir, repo = path.resolve(root, "../../../../.."), model = "xty/gpt-5.6-sol"
const json = async (file: string) => JSON.parse(await readFile(file, "utf8"))
const save = async (file: string, value: unknown, exclusive = true) => { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", flag: exclusive ? "wx" : "w" }) }
const exists = (file: string) => stat(file).then(() => true, () => false)
type Task = { id: string; source: string; mode: "behavior" | "conformance"; brief: string; policy?: AuthorizationInquiry["policy"]; sourceVariant?: string }
const policy = (text: string, location: string): AuthorizationInquiry["policy"] => ({ text, origin: "user", location })
export const tasks: Task[] = [
  { id: "memos-share", source: "memos", mode: "behavior", brief: "Investigate GetSharedMemo in this Memos revision. How does a supplied share token bind to the memo that is returned, and which visible controls and exceptions determine access? Compare invalid or expired tokens with a valid token, and distinguish what an unauthenticated caller can obtain from what the same token authorizes around the memo. Read relevant dependencies as needed. Describe source behavior and its limits; no normative policy is supplied." },
  { id: "paperless-download", source: "paperless", mode: "behavior", brief: "Investigate the document Download operation in this Paperless revision. Explain how the requested document, selected version or original/archive representation, and authenticated user's authorization relate to the file returned. Identify relevant control branches and whether selecting another version changes the resource that is authorized. Ownership and object grants are unspecified: analyze relevant source branches rather than assuming a grant. State missing source or deployment facts precisely." },
  { id: "owui-ingestion", source: "owui", mode: "behavior", brief: "Investigate process_file at /process/file in this Open WebUI revision. Trace the caller, the supplied file_id and the destination collection_name through authorization and the eventual processing or vector write. Explain whether the object authorized for input and the object affected by output are the same, and what happens for caller-owned versus another user's file. Do not assume the caller owns the destination collection. Give visible conditions and specific remaining limits; this is behavior investigation." },
  { id: "gitea-self-query", source: "gitea", mode: "behavior", brief: "Investigate GetRepoPermissions in this Gitea revision. Compare a normal authenticated caller querying their own collaborator permission with the same caller querying another user's permission; include differences for privileged callers visible in source. Explain path-specific controls, identity comparison and the repository permission result. Follow upstream code only when relevant. Do not turn this behavior question into an invented normative policy." },
  { id: "memos-remove", source: "memos", mode: "conformance", brief: "Check DeleteSpaceMember in this Memos revision against the independently supplied current policy. May an ordinary space member remove a different member, and do visible admin and self-removal paths differ? Do not assume deployment middleware or undocumented role grants. Explain actual behavior, compare it with the policy, cite the controlling source and preserve any decisive missing facts.", policy: policy("Only a space administrator may remove another member from that space. This policy does not prohibit a member leaving the space themselves.", "experimental-user-brief:memos-member-policy/v1") },
  { id: "paperless-notes", source: "paperless", mode: "conformance", brief: "Check GET and POST on the document notes operation against the current independently supplied policy. Compare viewing notes and creating a note on the addressed document. The document owner is unspecified, and object grants are not given; retain relevant owner and permission branches rather than silently supplying those facts. Trace endpoint and object controls to the corresponding effects, explain policy compliance and preserve exact gaps.", policy: policy("Viewing notes requires a view_document grant for the addressed document; creating notes requires a change_document grant for that same document. Document ownership by itself does not substitute for either grant.", "experimental-user-brief:paperless-note-policy/v1") },
  { id: "paperless-share-create", source: "paperless", mode: "conformance", brief: "Check creating a share through ShareLinkViewSet against the current independently supplied policy. A principal asks to share an existing document; determine which endpoint and object controls apply to that exact document before the share is created. Include relevant inherited permission and serializer paths. Do not assume that document existence or a global model permission grants access to this document. Explain source behavior, policy compliance and specific missing facts.", policy: policy("A caller creating a document share must have view_document permission for the exact shared document. A global add_sharelink permission or knowing a document ID alone is insufficient.", "experimental-user-brief:paperless-share-policy/v1") },
  { id: "gitea-create-issue", source: "gitea", mode: "conformance", brief: "Check CreateIssue and its API route in this Gitea revision against the independently supplied current policy. Compare authenticated repository readers and principals with issue write permission. Trace route-level controls, repository or issue-unit checks and the issue creation effect; identify any relevant exceptions instead of assuming endpoint-local checks are the whole path. Explain policy compliance and precise source or deployment limits.", policy: policy("Creating an issue requires write permission to the repository's issues unit. Read permission to the repository alone does not authorize this write.", "experimental-user-brief:gitea-issue-policy/v1") },
]
export const changedTasks: Task[] = [
  { ...tasks[4]!, id: "memos-remove-policy-change", brief: tasks[4]!.brief.replace("current policy", "revised current policy"), policy: policy("Any current member of a space may remove a different member from that space; self-removal is also allowed.", "experimental-user-brief:memos-member-policy/v2") },
  { ...tasks[2]!, id: "owui-ingestion-relation-change", brief: "Investigate process_file at /process/file under this explicit current premise: the supplied file belongs to the authenticated caller, while the requested destination collection belongs to a different principal and the caller has no stated grant on that collection. Does the visible source let this request process or write into that destination? Trace the object authorized and the object affected, relevant controls and exact unresolved deployment facts. This is a behavior question, not a supplied normative policy." },
  { ...tasks[0]!, id: "memos-share-offline-deny", sourceVariant: "memos-deny", brief: tasks[0]!.brief + " This is a labeled synthetic offline source variant, not an upstream commit or an unseen project; investigate its actual current bytes." },
  { ...tasks[3]!, id: "gitea-self-query-renamed", sourceVariant: "gitea-renamed", brief: tasks[3]!.brief.replaceAll("GetRepoPermissions", "InspectRepoAccess") + " This is a labeled synthetic path/symbol rename with no intended semantic change; use the current paths and names." },
]
export function makeInput(task: Task): any {
  const source = sources.find(s => s.id === task.source)!
  return { schemaVersion: "authorization-inquiry-input/v1", taskId: task.id, repository: source.repository, sourceRef: task.sourceVariant ? `${source.sourceRef}+synthetic:${task.sourceVariant}` : source.sourceRef, sourceRoot: `../${task.sourceVariant ? "source-variants/" + task.sourceVariant : "public-source/" + source.id}`, allowedPaths: task.sourceVariant === "gitea-renamed" ? source.paths.map(p => p === "routers/api/v1/repo" ? "routers/api/v1/repository_access" : p) : source.paths, brief: task.brief, mode: task.mode, ...(task.policy ? { policy: task.policy } : {}) }
}
type Row = { id: string; kind: "quality" | "author" | "consume" | "skill"; task: string; method?: "M" | "D0" | "D1"; format?: "MD" | "DSL"; version?: "original" | "changed"; dependsOn?: string; sourceSkill?: string; domainTools?: boolean }
export function plannedRows(): Row[] {
  const rows: Row[] = []
  tasks.forEach((task, i) => { const methods = ["M", "D0", "D1"] as const; for (let j = 0; j < 3; j++) { const method = methods[(i + j) % 3]!; rows.push({ id: `quality-${task.id}-${method}`, kind: "quality", task: task.id, method }) } })
  for (const task of changedTasks) for (const method of ["M", "D1"] as const) rows.push({ id: `quality-${task.id}-${method}`, kind: "quality", task: task.id, method })
  for (const task of ["memos-remove", "paperless-notes"]) for (const format of ["MD", "DSL"] as const) for (const version of ["original", "changed"] as const) rows.push({ id: `author-${task}-${format}-${version}`, kind: "author", task, format, version, ...(version === "changed" ? { dependsOn: `author-${task}-${format}-original` } : {}) })
  for (const author of rows.filter(r => r.kind === "author")) rows.push({ ...author, id: author.id.replace(/^author-/, "consume-"), kind: "consume", dependsOn: author.id })
  for (const sourceSkill of ["cloudflare-security-audit", "github-security-review"]) for (const task of ["memos-remove", "paperless-notes"]) for (const domainTools of [false, true]) rows.push({ id: `skill-${sourceSkill}-${task}-${domainTools ? "domain" : "original"}`, kind: "skill", task, sourceSkill, domainTools })
  return rows
}
export function authorTask(row: Row): Task {
  const base = tasks.find(t => t.id === row.task)!
  if (row.version !== "changed") return base
  return row.task === "memos-remove" ? { ...changedTasks[0]!, id: "memos-remove" } : { ...base, brief: base.brief + " Revised current premise: the addressed document's owner field is absent/null. Keep all other current requirements, including GET versus POST, unchanged." }
}
export function renameGiteaSource(text: string) { return text.replaceAll("GetRepoPermissions", "InspectRepoAccess").replaceAll('"gitea.dev/routers/api/v1/repo"', '"gitea.dev/routers/api/v1/repository_access"') }
async function sealVariants() {
  if (await exists(path.join(root, "runs"))) throw new Error("Variant registration is closed after generation starts")
  for (const [variant, source] of [["memos-deny", "memos"], ["gitea-renamed", "gitea"]]) {
    const ancestor = await json(path.join(root, "public-source", source!, "source.json")), files = []
    for (const original of ancestor.files) {
      const currentPath = variant === "gitea-renamed" ? original.path.replace(/^routers\/api\/v1\/repo\//, "routers/api/v1/repository_access/") : original.path
      const bytes = await readFile(path.join(root, "source-variants", variant!, currentPath))
      files.push({ path: currentPath, ancestorPath: original.path, ancestorGitBlob: original.gitBlob, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length })
    }
    await save(path.join(root, "source-variants", variant!, "source.json"), { schemaVersion: "authorization-ao-synthetic-source/v1", id: variant, repository: ancestor.repository, sourceRef: `${ancestor.sourceRef}+synthetic:${variant}`, ancestorRef: ancestor.sourceRef, synthetic: true, targetExecuted: false, upstreamCommitClaim: false, files }, false)
  }
}
async function register() {
  if (await exists(path.join(root, "manifest.json"))) throw new Error("Registration already exists; use check/status/replay")
  await cp(path.join(root, "public-source/memos"), path.join(root, "source-variants/memos-deny"), { recursive: true, errorOnExist: true, force: false })
  const memo = path.join(root, "source-variants/memos-deny/server/api/v1/memo_share_service.go"), memoText = await readFile(memo, "utf8"), signature = "func (s *APIV1Service) GetSharedMemo(ctx context.Context, request *v1pb.GetSharedMemoRequest) (*v1pb.Memo, error) {"
  if (memoText.split(signature).length !== 2) throw new Error("Offline variant anchor mismatch")
  await writeFile(memo, memoText.replace(signature, signature + '\n\treturn nil, status.Error(codes.PermissionDenied, "synthetic offline denial")'), "utf8")
  await cp(path.join(root, "public-source/gitea"), path.join(root, "source-variants/gitea-renamed"), { recursive: true, errorOnExist: true, force: false })
  const oldDir = path.join(root, "source-variants/gitea-renamed/routers/api/v1/repo"), newDir = path.join(root, "source-variants/gitea-renamed/routers/api/v1/repository_access")
  const { rename } = await import("node:fs/promises"); await rename(oldDir, newDir)
  async function renameSymbols(dir: string) { for (const entry of await readdir(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) await renameSymbols(file); else if (entry.name.endsWith(".go")) { const text = await readFile(file, "utf8"), changed = renameGiteaSource(text); if (changed !== text) await writeFile(file, changed, "utf8") } } }
  await renameSymbols(path.join(root, "source-variants/gitea-renamed"))
  await sealVariants()
  await save(path.join(root, "evaluator/construction.json"), { development: true, exposedProjects: true, unseenClaim: false, knownToConstructor: true, variants: [{ id: "memos-deny", change: "Unconditional source-visible PermissionDenied return inserted at GetSharedMemo entry; target not executed." }, { id: "gitea-renamed", change: "API repo path renamed repository_access; function and route reference renamed InspectRepoAccess; intended same behavior, target not executed." }] })
  for (const task of [...tasks, ...changedTasks]) await save(path.join(root, `inputs/${task.id}.json`), makeInput(task))
  for (const sourceSkill of ["cloudflare-security-audit", "github-security-review"]) {
    const original = path.join(root, "source-skills", sourceSkill), extended = path.join(root, "skill-packages", sourceSkill)
    await cp(original, extended, { recursive: true, errorOnExist: true, force: false })
    const content = await readFile(path.join(original, "SKILL.md"), "utf8")
    await writeFile(path.join(extended, "SKILL.md"), content + "\n\n## SkVM authorization tool support\n\nFor the bounded current authorization task, read INQUIRY-TOOLS.md and use the registered authorization_compile, authorization_observe and authorization_check_result tools with the common source tools. Original skill duties outside the current source-only question remain with the user; this extension does not perform deployment validation or a whole security audit.\n", "utf8")
    await writeFile(path.join(extended, "INQUIRY-TOOLS.md"), renderNaturalInquiryAuthorTask("Declare only the current user question, not a source answer.", "behavior") + '\n\nThe runtime supplies the current mode and independent policy in the task. For conformance, copy that supplied policy exactly. Call authorization_compile({inquiry}) once. Read original source through source_list/search/symbol/read. Optional authorization_observe takes observations [{questionId,kind:entry|principal-binding|resource-binding|guard|effect|exception,subject,object?,claim,state:pending|observed|unresolved,evidenceIds}]. Cite IDs actually returned by source tools.\n\nCall authorization_check_result({result}) using {schemaVersion:"authorization-inquiry-result/v1",questions:[{questionId,behavior:{disposition:allow|deny|conditional|unknown,explanation},branches:[{id,condition,disposition,explanation,evidenceIds}],evidenceIds,missing:[{kind:source-gap|premise-unspecified|deployment-unverified|dependency-out-of-scope,detail,nextRead?}],policyAssessment?:{status:satisfied|violated|undetermined,explanation}}],observations:[],scope}. behavior has no policyAssessment; conformance requires it. Relevant conditional branches need evidence. unknown names a decisive gap. Check is mechanical, semantic support remains unreviewed. At most one delivery repair. Then answer the user in the original skill\'s prose format.\n\nRuntime: existing SkVM checkout plus installed Bun dependencies. Use ordinary skvm run --skill=SKILL.md --prompt=<current-task> --authorization-scope=<inquiry-input> --authorization-domain-tools --authorization-trace=<new-file> --model=<provider/model>. This package preserves all original companions and license; it is not a standalone runtime.\n', "utf8")
    await save(path.join(extended, "extension-source.json"), { schemaVersion: "authorization-skill-extension/v1", source: await json(path.join(original, "source.json")), originalSkillPreservedAsPrefix: true, runtime: "SkVM bare-agent opt-in authorization source runtime", residualDuties: ["whole-repository audit", "deployment verification", "target execution", "patch application", "independent semantic validation"] })
  }
  const manifest = { schemaVersion: "authorization-ao-study/v1", development: true, unseenClaim: false, model, createdAt: new Date().toISOString(), implementationCommit: null, budgets: { perCallTimeoutMs: 300000, sessionTimeoutMs: 1200000, maxDispatches: 12, maxToolCalls: 24, maxDisplayBytes: 262144, maxFiles: 512, maxReadBytes: 8388608, authorDiagnosticRepairs: 1 }, tasks: [...tasks, ...changedTasks], rows: plannedRows(), evaluation: { required: ["correct source behavior", "requested scenario completeness", "evidence supports decisive claims", "control/resource/effect binding", "specific and justified unknown", "policy comparison only for independently supplied policy"], firstAndFinalSeparate: true, structureIsNotQuality: true, reviewer: "development-agent after all generation closes", authorObligations: { "memos-remove": ["other-member removal", "self-removal distinction", "current independently supplied policy", "source-only evidence and limits"], "paperless-notes": ["GET view and POST create", "respective view_document/change_document grant", "owner unspecified originally / absent in changed version", "source-only evidence and limits"] } } }
  await save(path.join(root, "manifest.json"), manifest); console.log(`Registered ${manifest.rows.length} planned rows; zero provider calls`)
}
async function check() {
  const manifest = await json(path.join(root, "manifest.json")), checks = []
  for (const task of manifest.tasks) for (const method of ["M", "D0", "D1"] as const) {
    const result = await checkAuthorizationInquiry(path.join(root, `inputs/${task.id}.json`), method)
    if (result.status !== "valid") throw new Error(`Input invalid ${task.id}: ${JSON.stringify(result.diagnostics)}`)
    checks.push({ task: task.id, method, sourceFiles: result.sourceFiles.length, gaps: result.scopeGaps })
  }
  for (const sourceSkill of ["cloudflare-security-audit", "github-security-review"]) for (const domainTools of [false, true]) {
    const loaded = await loadRunSkill(path.join(root, domainTools ? "skill-packages" : "source-skills", sourceSkill, "SKILL.md"))
    const runtime = await createNativeInquiryRuntime({ inputFile: path.join(root, "inputs/memos-remove.json"), workDir: root, domainTools })
    if (loaded.skillContent.length < 5000 || runtime.definitions.some(t => ["execute_command", "write_file", "web_fetch"].includes(t.name))) throw new Error("Source skill or executor precheck failed")
  }
  const canary = path.join(root, "canary"); await mkdir(path.join(canary, "oracle"), { recursive: true }); await writeFile(path.join(canary, "oracle/answer.ts"), "CANARY_NOT_AN_ANSWER"); await writeFile(path.join(canary, "visible.ts"), "export const visible = true;\n")
  const tools = await createInquiryTools({ sourceRoot: canary, allowedPaths: ["."], repository: "synthetic-canary", sourceRef: "canary" })
  if ((await tools.execute("source_read", { path: "oracle/answer.ts", startLine: 1, endLine: 1 })).status !== "error") throw new Error("Oracle isolation canary failed")
  await save(path.join(root, "precheck.json"), { status: "passed", providerCalls: 0, checks, canary: "oracle path denied", actualTools: tools.definitions.map(t => t.name) }, false); console.log(`Passed ${checks.length} input/method checks and source skill registration; zero calls`)
}
async function author(row: Row, output: string) {
  const task = authorTask(row), previous = row.dependsOn ? await json(path.join(root, "runs", row.dependsOn, "report.json")) : undefined
  if (previous && !previous.structuralValid) return { status: "blocked-invalid-original", providerDispatches: 0, structuralValid: false }
  const provider = createProviderForModel(model), requests: unknown[] = [], telemetry = createTelemetryProvider({ ...provider, name: provider.name, complete: async params => { requests.push(structuredClone(params)); await save(path.join(output, `request-${requests.length}.json`), params); return provider.complete(params) }, completeWithToolResults: (...args) => provider.completeWithToolResults(...args) }, { maxDispatches: 12, perCallTimeoutMs: 300000, unitTimeoutMs: 1200000, onEvent: event => appendFile(path.join(output, "events.jsonl"), JSON.stringify(event) + "\n") })
  const schema: z.ZodTypeAny = row.format === "DSL" ? AuthorizationInquirySchema.innerType() : z.object({ markdown: z.string().min(1) }).strict()
  const base = row.format === "DSL" ? renderNaturalInquiryAuthorTask(task.brief, task.mode, task.policy) : `Write a reusable Markdown task instruction from only this CURRENT natural brief and independent policy. Preserve all requested scenarios and supplied premises; do not answer the source question or invent implementation facts. No finished task is provided. Source context is repository/ref/allowed paths only.\nMode: ${task.mode}\nCurrent independent policy: ${JSON.stringify(task.policy ?? null)}\nNatural brief:\n${task.brief}\nReturn {markdown:<complete current instruction>}.`
  const prompt = `${base}\nSource context: ${JSON.stringify({ repository: makeInput(task).repository, sourceRef: makeInput(task).sourceRef, allowedPaths: makeInput(task).allowedPaths })}${previous ? `\nChange the same task artifact to express only the revised CURRENT requirement; preserve unaffected duties. Previous artifact is data:\n${JSON.stringify(previous.candidate)}` : ""}`
  let candidate: unknown, initial: unknown, diagnostics: unknown[] = [], status = "invalid", repairs = 0, error: string | undefined
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const authored = await extractStructured({ provider: telemetry.provider, schema, schemaName: "submit_current_author_artifact", schemaDescription: "Write the complete current reusable task instruction without source answers.", prompt: attempt ? `${prompt}\nOne diagnostics-only revision. Candidate:${JSON.stringify(candidate)}\nDiagnostics:${JSON.stringify(diagnostics)}` : prompt, maxRetries: 1, maxTokens: 6000 })
      candidate = row.format === "MD" ? (authored.result as { markdown: string }).markdown : authored.result
      if (initial === undefined) initial = structuredClone(candidate)
      try { if (row.format === "DSL") acceptAuthoredInquiry(candidate, { brief: task.brief, mode: task.mode, policy: task.policy }); if (!authorArtifactReview(candidate, row.format!).structuralValid) throw new Error("Empty/invalid artifact"); diagnostics = []; status = "completed"; break } catch (cause) { diagnostics = [{ code: "author-contract", message: String(cause) }]; if (attempt === 0) repairs++ }
    }
  } catch (cause) { error = String(cause); status = telemetry.isClosed() ? "timeout-unknown" : "transport-failed" }
  finally { await telemetry.close(`author-${status}`) }
  await save(path.join(output, "artifact.json"), candidate ?? null)
  return { status, candidate, initial, diagnostics, repairs, structuralValid: status === "completed", fieldProvenance: row.format === "DSL" && status === "completed" ? acceptAuthoredInquiry(candidate, { brief: task.brief, mode: task.mode, policy: task.policy }).provenance : { naturalBrief: task.brief, modelAuthored: ["markdown"], semanticEquivalence: "unreviewed" }, telemetry: telemetry.summary(), attempts: telemetry.attempts, events: telemetry.events, ...(error ? { error } : {}) }
}
async function executeRow(id: string) {
  process.env.SKVM_AUTO_PROBE = "0"
  const manifest = await json(path.join(root, "manifest.json")), row: Row = manifest.rows.find((r: Row) => r.id === id)
  if (!row) throw new Error("Unregistered row")
  const output = path.join(root, "runs", id); await mkdir(output, { recursive: true })
  if (await exists(path.join(output, "report.json"))) { console.log(`${id}: terminal already; no resend`); return }
  await save(path.join(output, "claim.json"), { row, model, implementationCommit: manifest.implementationCommit, startedAt: new Date().toISOString(), noAutomaticResend: true })
  const started = Date.now(); let result: any
  try {
    if (row.kind === "author") result = await author(row, output)
    else if (row.kind === "quality") result = await executeLocalInquiryRun({ inputFile: path.join(root, `inputs/${row.task}.json`), outDir: output, model, method: row.method })
    else if (row.kind === "consume") {
      const artifact = await json(path.join(root, "runs", row.dependsOn!, "report.json"))
      if (!artifact.structuralValid) result = { status: "blocked-invalid-author", providerDispatches: 0 }
      else {
        const task = authorTask(row), supplied = makeInput(task)
        const input = row.format === "DSL" ? { ...supplied, brief: undefined, mode: undefined, policy: undefined, inquiry: artifact.candidate } : { ...supplied, brief: artifact.candidate }
        input.sourceRoot = path.relative(output, path.resolve(root, "inputs", supplied.sourceRoot)).replaceAll("\\", "/")
        const file = path.join(output, "consumer-input.json"); await save(file, input)
        const previous = row.version === "changed" ? path.join(root, "runs", row.id.replace(/-changed$/, "-original")) : undefined
        if (previous && await exists(path.join(previous, "sessions.jsonl"))) await save(path.join(output, "compare.json"), await compareLocalInquiry(file, previous))
        result = await executeLocalInquiryRun({ inputFile: file, outDir: output, model, method: row.format === "DSL" ? "D1" : "M" })
        result.sameAuthorFamily = row.task + ":" + row.format; result.hostFilledDomainFields = false
      }
    } else {
      const task = tasks.find(t => t.id === row.task)!, skill = await loadRunSkill(path.join(root, row.domainTools ? "skill-packages" : "source-skills", row.sourceSkill!, "SKILL.md"))
      await save(path.join(output, "loaded-skill.json"), { skillPath: path.relative(root, skill.skillPath), skillContent: skill.skillContent, bundleFiles: skill.bundleFiles, source: await json(path.join(root, "source-skills", row.sourceSkill!, "source.json")) })
      const prompt = `${task.brief}\nCurrent mode: ${task.mode}\nIndependent current user policy: ${JSON.stringify(task.policy ?? null)}\nThis request is limited to the named source-visible authorization question. Whole-repository scanning, dependency/secret audits, deployment tests, target execution and patch application are outside this task. Explain relevant source branches and limits in your normal skill format. The host supplies identical bounded common source tools to both packages.`
      const natural = await materializeNaturalRunTask({ prompt, taskPath: path.join(output, "natural-task.json") })
      const run = await executeRun({ task: natural, skill, adapter: new BareAgentAdapter(() => createProviderForModel(model)), adapterConfig: { model, maxSteps: 12, timeoutMs: 1200000, providerOptions: { authorizationScope: path.join(root, `inputs/${row.task}.json`), authorizationDomainTools: row.domainTools, authorizationTraceDir: path.join(output, "native-trace") } }, workDir: path.join(output, "workdir"), keepWorkDir: true, skillMode: "inject" })
      await save(path.join(output, "ordinary-run.json"), run)
      result = { status: run.runResult.runStatus === "ok" ? "completed" : run.runResult.runStatus, error: run.runResult.statusDetail, text: run.runResult.text, skillLoaded: run.runResult.skillLoaded, native: run.runResult.authorizationInquiry, telemetry: run.runResult.authorizationInquiry?.telemetry, originalSkillPrefixPreserved: row.domainTools ? skill.skillContent.startsWith(await readFile(path.join(root, "source-skills", row.sourceSkill!, "SKILL.md"), "utf8")) : true }
    }
  } catch (error) { const dispatches = await retainedDispatches(output); result = { status: dispatches ? "completion-unknown" : "failed", providerDispatches: dispatches, error: String(error), recovery: "Inspect retained attempt/dispatch events; never automatically resend a claimed row" } }
  await save(path.join(output, "report.json"), { schemaVersion: "authorization-ao-row-report/v1", row, durationMs: Date.now() - started, ...result })
  await appendFile(path.join(root, "journal.jsonl"), JSON.stringify({ at: new Date().toISOString(), row: id, status: result.status, providerCalls: result.telemetry?.providerCalls ?? result.providerDispatches ?? null }) + "\n")
  console.log(`${id}: ${result.status}; calls=${result.telemetry?.providerCalls ?? result.providerDispatches ?? "unknown"}`)
}
async function status() {
  const manifest = await json(path.join(root, "manifest.json")), rows = []
  for (const row of manifest.rows) { const dir = path.join(root, "runs", row.id), report = await exists(path.join(dir, "report.json")) ? await json(path.join(dir, "report.json")) : undefined; rows.push({ ...row, ...rowState(report, await exists(path.join(dir, "claim.json"))), providerCalls: report?.telemetry?.providerCalls ?? report?.providerDispatches ?? null }) }
  return { planned: rows.length, terminal: rows.filter(r => r.terminal).length, rows }
}
async function retainedDispatches(dir: string): Promise<number> {
  let count = 0
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory() && ["sessions", "native-trace"].includes(entry.name)) {
      if (entry.name === "sessions") for (const session of await readdir(file)) count += await retainedDispatches(path.join(file, session))
      else count += await retainedDispatches(file)
    } else if (["events.jsonl", "lifecycle.jsonl"].includes(entry.name)) {
      for (const line of (await readFile(file, "utf8")).trim().split(/\r?\n/).filter(Boolean)) if (JSON.parse(line).kind === "dispatch") count++
    }
  }
  return count
}
async function run() {
  const manifest = await json(path.join(root, "manifest.json")); if (!manifest.implementationCommit) throw new Error("Bind one verified engineering commit before generation")
  let failureStreak = 0, paused = false
  for (const kind of ["quality", "author", "consume", "skill"]) {
    // Independent workers preserve provider/loader logging isolation; dependencies stay sequential.
    const batches: Row[][] = kind === "author" || kind === "consume" ? [manifest.rows.filter((r: Row) => r.kind === kind && r.version === "original"), manifest.rows.filter((r: Row) => r.kind === kind && r.version === "changed")] : [manifest.rows.filter((r: Row) => r.kind === kind)]
    for (const batch of batches) {
      let cursor = 0
      await Promise.all(Array.from({ length: 3 }, async () => { while (!paused && cursor < batch.length) {
        const row = batch[cursor++]!, dir = path.join(root, "runs", row.id)
        if (await exists(path.join(dir, "claim.json"))) { console.log(`${row.id}: claimed, skipped without resend`); continue }
        console.log(`Starting ${row.id}`)
        const child = Bun.spawn([process.execPath, path.join(root, "study.ts"), "worker", row.id], { cwd: repo, stdout: "inherit", stderr: "inherit" }); const code = await child.exited
        if (code !== 0 && !(await exists(path.join(dir, "report.json")))) await save(path.join(dir, "report.json"), { schemaVersion: "authorization-ao-row-report/v1", row, status: "completion-unknown", providerDispatches: await retainedDispatches(dir), error: `Worker stopped with exit ${code}; retained claim forbids resend`, completionUnknown: true })
        const report = await json(path.join(dir, "report.json")); failureStreak = nextFailureStreak(failureStreak, report)
        if (failureStreak >= 2) paused = true
      } }))
      if (paused) { await appendFile(path.join(root, "journal.jsonl"), JSON.stringify({ at: new Date().toISOString(), status: "infrastructure-paused", failureStreak, remainingRowsPreserved: true }) + "\n"); throw new Error("Two consecutive infrastructure failures; inspect retained evidence before continuing undispatched rows") }
    }
  }
  const summary = await status(); if (summary.rows.some(r => !r.terminal)) throw new Error("Generation still has undispatched rows or unsettled claims")
  await save(path.join(root, "generation-closed.json"), { closedAt: new Date().toISOString(), ...summary, noResamplingForScores: true, sharedRevisionSessions: 0 }); console.log(`Generation closed: ${summary.terminal}/${summary.planned} terminal; review separately`)
}
async function replay() {
  const summary = await status()
  for (const row of summary.rows) if (row.kind === "quality" || row.kind === "consume") {
    const dir = path.join(root, "runs", row.id); if (await exists(path.join(dir, "sessions.jsonl"))) await inspectLocalInquiry(dir)
  }
  console.log(JSON.stringify(summary)); return summary
}
if (import.meta.main) {
  const command = process.argv[2]
  if (command === "register") await register()
  else if (command === "check") await check()
  else if (command === "seal-variants") await sealVariants()
  else if (command === "refresh-registration") {
    if (await exists(path.join(root, "runs"))) throw new Error("Registration changes are forbidden after generation starts")
    const source = sources.find(s => s.id === "gitea")!, original = path.join(root, "public-source/gitea"), variant = path.join(root, "source-variants/gitea-renamed")
    for (const p of source.paths.filter(p => p !== "routers/api/v1/repo")) await cp(path.join(original, p), path.join(variant, p), { recursive: true, force: true })
    const route = path.join(variant, "routers/api/v1/api.go"), text = await readFile(route, "utf8")
    await writeFile(route, renameGiteaSource(text), "utf8")
    for (const task of [...tasks, ...changedTasks]) await save(path.join(root, `inputs/${task.id}.json`), makeInput(task), false)
    const manifest = await json(path.join(root, "manifest.json")); manifest.tasks = [...tasks, ...changedTasks]; await save(path.join(root, "manifest.json"), manifest, false)
    console.log("Corrected pre-generation fixed-ref Gitea scope and retained task/row denominators")
  }
  else if (command === "bind") { const manifest = await json(path.join(root, "manifest.json")); if (manifest.implementationCommit) throw new Error("Already bound"); manifest.implementationCommit = execFileSync("git", ["-c", `safe.directory=${repo.replaceAll("\\", "/")}`, "rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(); await save(path.join(root, "manifest.json"), manifest, false); console.log(manifest.implementationCommit) }
  else if (command === "worker") await executeRow(process.argv[3]!)
  else if (command === "run") await run()
  else if (command === "status") console.log(JSON.stringify(await status()))
  else if (command === "replay") await replay()
  else throw new Error("Use register|check|bind|run|status|replay; worker is one registered no-resend unit")
}
