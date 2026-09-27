import { createHash } from "node:crypto"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { createProviderForModel } from "../../../../../src/providers/registry.ts"

const root = import.meta.dir
const repo = path.resolve(root, "../../../../..")
const phase = process.argv[2]
if (phase !== "original" && phase !== "changed") throw new Error("Usage: bun author-use-generate.ts original|changed [--count=1..4]")
const count = Number(process.argv.find(arg => arg.startsWith("--count="))?.slice(8) ?? "1")
if (!Number.isInteger(count) || count < 1 || count > 4) throw new Error("--count must be 1..4")
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex")
const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8"))
const exists = async (file: string) => { try { await access(file); return true } catch { return false } }
const briefsBytes = await readFile(path.join(root, "author-use-briefs.json"))
const briefs = JSON.parse(briefsBytes.toString("utf8")) as { model: string; sharedInstruction: string; packages: any[] }
const plan = await readJson(path.join(root, "author-use-plan.json"))
if (hash(briefsBytes) !== plan.briefsSha256 || hash(await readFile(import.meta.path)) !== plan.runnerSha256
  || plan.model !== briefs.model || plan.order.length !== 8) throw new Error("Author plan identity changed")
for (const source of plan.sources) {
  const file = path.join(repo, ...source.path.split("/"))
  if (hash(await readFile(file)) !== source.sha256) throw new Error(`Author source changed: ${source.path}`)
}
process.env.SKVM_AUTO_PROBE = "0"
process.env.SKVM_CACHE = path.join(repo, ".skvm")

const originalShape = [
  "Return exactly one JSON object, with no Markdown fence or commentary. Use authorization-assessment-authoring/v2 keys and no extras:",
  '{"schemaVersion":"authorization-assessment-authoring/v2","taskId":string,"request":string,"repository":string,"sourceRef":string,"sourceRoot":string,"sources":[filePath],',
  '"policies":{"policy-key":{"text":string,"location":string,"revision":string,"acceptance":"accepted","reason":string}},',
  '"principals":{"principal-key":{"role":string,"facts":[string],"capabilities":[string]}},',
  '"resources":{"resource-key":{"type":string,"facts":[string]}},',
  '"entries":{"entry-key":{"name":string,"locations":[{"path":filePath,"startLine":positiveInteger,"endLine":positiveInteger}]}},',
  '"scenarios":{"scenario-key":{"principal":principalKey,"resource":resourceKey,"policy":policyKey,"entries":[entryKey],"relation":string,"operation":string,"expectation":"allow|deny|conditional"}},',
  '"analysisContract":{"schemaVersion":"authorization-analysis-contract/v1","publicInstruction":string,"scenarios":{"scenario-key":{"boundary":"declared-entry","premises":[{"id":string,"statement":string,"atEntry":entryKey,"provenance":"task-assumption"}],"requestedBranches":[],"requiredResponseDetails":[string]}}}}',
  "Use exactly the two scenario keys in the brief and stable policy/entry keys. Derive policy expectations from accepted policy, not from current source behavior. Keep shared request and publicInstruction generic enough to remain accurate if one scenario's policy or relation changes later. Use each scenario's exact premiseId and premise statement. Cite entry ranges in supplied file-local line numbers. Keep the complete JSON concise.",
].join("\n")
const changedShape = [
  "Return exactly one local edit JSON object, not a complete assessment, with no Markdown fence or commentary:",
  '{"schemaVersion":"authorization-local-edit/v1","operations":[{"kind":"policy","key":string,"set":{"text":string}},{"kind":"scenario","key":string,"set":{"expectation":"allow|deny|conditional"}}],"reason":string}',
  "For a policy edit, include a scenario expectation operation for EVERY scenario referring to that policy, even if its value remains unchanged. For a relation edit, use scenario.set.relation and scenario.set.expectation plus a premise operation {kind:'premise',scenarioKey,premiseId,statement}. Do not alter taskId, shared request, source, policy or unrelated scenario unless the brief requests it.",
].join("\n")

async function sourceExcerpt(brief: any): Promise<string> {
  const sections = []
  for (const relative of brief.sourceFiles as string[]) {
    const file = path.join(root, brief.sourceDirectory, ...relative.split("/"))
    const lines = (await readFile(file, "utf8")).split(/\r?\n/)
    const excerpts = (brief.excerptRanges[relative] as string[]).flatMap(range => {
      const [start, end] = range.split("-").map(Number)
      if (!start || !end || end < start || end > lines.length) throw new Error(`Invalid source excerpt ${brief.id}/${relative}/${range}`)
      return lines.slice(start - 1, end).map((line, index) => `${start + index}: ${line}`)
    })
    sections.push(`File ${relative} (line numbers local to supplied source):\n${excerpts.join("\n")}`)
  }
  return sections.join("\n\n")
}

const provider = createProviderForModel(briefs.model)
let dispatched = 0
for (const unit of plan.order as Array<{ id: string; packageId: string; representation: "markdown" | "dsl"; phase: string }>) {
  if (unit.phase !== phase || dispatched >= count) continue
  const brief = briefs.packages.find(item => item.id === unit.packageId)
  if (!brief) throw new Error(`Missing package ${unit.packageId}`)
  const deliveryDir = path.join(root, "author-packages", brief.id, unit.representation)
  const ownOriginalPath = path.join(deliveryDir, unit.representation === "markdown" ? "original.md" : "original.json")
  const outDir = path.join(root, "author-attempts", "use")
  await mkdir(outDir, { recursive: true })
  const claimPath = path.join(outDir, `${unit.id}.claim.json`)
  if (await exists(claimPath)) continue
  const ownOriginal = phase === "changed" ? await readFile(ownOriginalPath, "utf8") : ""
  const sourceRoot = path.relative(deliveryDir, path.join(root, brief.sourceDirectory)).replaceAll("\\", "/")
  const visibleScenarios = brief.scenarios.map((item: any) => ({ key: item.key, principal: item.principal, relation: item.relation,
    operation: item.operation, premiseId: item.premiseId, premise: item.premise }))
  const base = [briefs.sharedInstruction,
    `You are the independent ${unit.representation === "markdown" ? "Markdown" : "structured assessment"} author. You see no other author's draft or answer key.`,
    `Package ${brief.id}. Repository ${brief.repository}; fixed ref ${brief.sourceRef}; taskId ${brief.taskId}.`,
    `Declared entry: ${brief.entry}. Current question: ${brief.question}`,
    `Accepted ${phase} policy: ${phase === "changed" ? brief.changedPolicy ?? brief.originalPolicy : brief.originalPolicy}`,
    `Original scenario facts (these are task premises, not source proof): ${JSON.stringify(visibleScenarios)}`,
    phase === "changed" ? `Requested change: ${brief.changeRequest}` : "Produce the original two-scenario assessment/instructions from this brief.",
    phase === "changed" ? `Your own accepted original draft only:\n${ownOriginal}` : "",
    `Supplied fixed source excerpts:\n${await sourceExcerpt(brief)}`,
    unit.representation === "dsl" ? (phase === "original"
      ? `Set sourceRoot exactly to ${JSON.stringify(sourceRoot)} and sources exactly to ${JSON.stringify(brief.sourceFiles)}. Set taskId/repository/sourceRef exactly as given. Policy location may be author-use-briefs.json#/${brief.id}/originalPolicy.\n${originalShape}`
      : changedShape)
      : (phase === "original"
        ? "Write only reusable Markdown assessment instructions covering both scenarios and accepted policy. Do not answer either scenario. Preserve each scenario key and premise, require exact supplied-source citations, and distinguish accepted policy from observed behavior. No code fence or author commentary."
        : "Return a complete revised Markdown instruction document for your own draft, making the requested local change. Preserve the unaffected scenario, source details and other instructions. Do not answer either scenario. No code fence or author commentary."),
  ].filter(Boolean).join("\n\n")
  const claim = { id: unit.id, phase, packageId: brief.id, representation: unit.representation, planSha256: hash(JSON.stringify(plan)),
    promptSha256: hash(base), ownOriginalSha256: phase === "changed" ? hash(ownOriginal) : null,
    noAutomaticResend: true, createdAt: new Date().toISOString() }
  await writeFile(claimPath, `${JSON.stringify(claim, null, 2)}\n`, { flag: "wx" })
  process.stdout.write(`${JSON.stringify({ id: unit.id, action: "start" })}\n`)
  const maxTokens = unit.representation === "dsl" ? phase === "original" ? 4000 : 1600 : phase === "original" ? 2200 : 2600
  const startedAt = new Date().toISOString()
  try {
    const response = await provider.complete({ messages: [{ role: "user", content: base }], temperature: 0, maxTokens })
    await writeFile(path.join(outDir, `${unit.id}.json`), `${JSON.stringify({ ...claim, model: briefs.model, maxTokens,
      prompt: base, response, startedAt, endedAt: new Date().toISOString(), status: "completed" }, null, 2)}\n`, { flag: "wx" })
    process.stdout.write(`${JSON.stringify({ id: unit.id, action: "finished", status: "completed", stopReason: response.stopReason,
      tokens: response.tokens, actualCostUsd: response.costUsd ?? null })}\n`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await writeFile(path.join(outDir, `${unit.id}.json`), `${JSON.stringify({ ...claim, model: briefs.model, maxTokens,
      prompt: base, startedAt, endedAt: new Date().toISOString(), status: "transport-failed", message,
      usage: "unknown" }, null, 2)}\n`, { flag: "wx" })
    process.stderr.write(`${JSON.stringify({ id: unit.id, action: "finished", status: "transport-failed", message })}\n`)
    break
  }
  dispatched++
}
