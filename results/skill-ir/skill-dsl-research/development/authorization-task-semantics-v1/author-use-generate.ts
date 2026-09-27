import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { createProviderForModel } from "../../../../../src/providers/registry.ts"

const root = import.meta.dir
const repo = path.resolve(root, "../../../../..")
const phase = process.argv[2]
if (phase !== "original" && phase !== "changed") throw Error("Usage: bun author-use-generate.ts original|changed")
const only = process.argv.find(argument => argument.startsWith("--only="))?.slice("--only=".length)
const attemptNumber = Number(process.argv.find(argument => argument.startsWith("--attempt="))?.slice("--attempt=".length) ?? "1")
if (!Number.isInteger(attemptNumber) || attemptNumber < 1) throw Error("--attempt must be a positive integer")
process.env.SKVM_AUTO_PROBE = "0"
process.env.SKVM_CACHE = path.join(repo, ".skvm")
const briefs = JSON.parse(await readFile(path.join(root, "author-neutral-briefs.json"), "utf8"))
const provider = createProviderForModel("xty/gpt-5.6-sol")
const attemptsDir = path.join(root, "author-attempts", "use")
await mkdir(attemptsDir, { recursive: true })

const shape = [
  "Return one JSON object only, no Markdown fence. Use exact authoring/v2 keys and no extras:",
  '{"schemaVersion":"authorization-assessment-authoring/v2","taskId":string,"request":string,"repository":string,"sourceRef":string,"sourceRoot":string,"sources":[fileName],',
  '"policies":{"policy-name":{"text":string,"location":string,"revision":string,"acceptance":"accepted","reason":string}},',
  '"principals":{"principal-name":{"role":string,"facts":[string],"capabilities":[string]}},',
  '"resources":{"resource-name":{"type":string,"facts":[string]}},',
  '"entries":{"entry-name":{"name":string,"locations":[{"path":fileName,"startLine":positiveInteger,"endLine":positiveInteger}]}},',
  '"scenarios":{"scenario-name":{"principal":principalName,"resource":resourceName,"policy":policyName,"entries":[entryName],"relation":string,"operation":string,"expectation":"allow|deny|conditional"}},',
  '"analysisContract":{"schemaVersion":"authorization-analysis-contract/v1","publicInstruction":string,"scenarios":{"scenario-name":{"boundary":"declared-entry|supplied-path|deployment","premises":[{"id":string,"statement":string,"atEntry":entryName,"provenance":"task-assumption"}],"requestedBranches":[],"requiredResponseDetails":[string]}}}}',
  "Every scenario and entry name reference must match a declaration. Provide exactly two scenarios. The expectation is the task author's accepted policy judgment for each stated scenario; do not set it by copying source behavior. Scenario premises are assumed at handler entry, not evidence that upstream injection is proved.",
  "Use concise JSON strings and compact declarations; keep the complete JSON under 2500 output tokens. Preserve every required field and both scenarios.",
].join("\n")

for (const [index, brief] of briefs.packages.entries()) {
  const sourceFile = path.join(repo, brief.sourcePath)
  const sourceLines = (await readFile(sourceFile, "utf8")).split(/\r?\n/)
  const excerpt = brief.sourceRanges.flatMap((range: string) => {
    const [start, end] = range.split("-").map(Number)
    if (!start || !end || end < start || end > sourceLines.length) throw Error(`Invalid public source range ${range}`)
    return sourceLines.slice(start - 1, end).map((line, offset) => `${start + offset}: ${line}`)
  }).join("\n")
  for (const representation of ["markdown", "dsl"] as const) {
    const id = `${brief.id}-${representation}-${phase}`
    if (only && only !== id) continue
    const deliveryDir = path.join(root, "author-packages", brief.id, representation)
    const authorSourceRoot = path.relative(deliveryDir, path.dirname(sourceFile)).replaceAll("\\", "/")
    const ownOriginal = phase === "changed" ? await readFile(path.join(deliveryDir, representation === "markdown" ? "original.md" : "original.json"), "utf8") : ""
    const policy = phase === "changed" ? brief.changedPolicy ?? brief.originalPolicy : brief.originalPolicy
    const base = [
      briefs.sharedInstruction,
      `You are the independent ${representation === "markdown" ? "Markdown" : "structured workspace"} author. You see no other author's draft or answer key.`,
      `Package: ${brief.id}; repository: ${brief.repository}; fixed ref: ${brief.sourceRef}; source file name: ${path.basename(sourceFile)}.`,
      `Accepted ${phase} policy: ${policy}`,
      `Original two scenarios: ${JSON.stringify(brief.originalScenarios)}`,
      phase === "changed" ? `Requested change: ${brief.changeRequest}` : "Produce the original version from this brief.",
      phase === "changed" ? `Your own selected original draft, for continuity only:\n${ownOriginal}` : "",
      `Only supplied source crop, with source-file line numbers:\n${excerpt}`,
      representation === "dsl" ? `The output file's sourceRoot must be exactly ${JSON.stringify(authorSourceRoot)}; sources must be [${JSON.stringify(path.basename(sourceFile))}]. Policy location should be ${JSON.stringify(`author-neutral-briefs.json#/packages/${index}/${phase === "changed" && brief.changedPolicy ? "changedPolicy" : "originalPolicy"}`)}.\n${shape}` : "Write only usable Markdown instructions for a separate assessor, covering both scenarios and the accepted policy; do not answer either scenario. Require source locations and explicitly distinguish policy from observed handler behavior. No code fence or author commentary.",
    ].filter(Boolean).join("\n\n")
    const file = path.join(attemptsDir, `${id}${attemptNumber === 1 ? "" : `-attempt${attemptNumber}`}.json`)
    const startedAt = new Date().toISOString()
    const maxTokens = representation === "dsl" ? 3000 : 2500
    try {
      const response = await provider.complete({ messages: [{ role: "user", content: base }], temperature: 0, maxTokens })
      await writeFile(file, `${JSON.stringify({ id, attemptNumber, packageId: brief.id, representation, phase, model: "xty/gpt-5.6-sol", maxTokens, prompt: base, response, startedAt, endedAt: new Date().toISOString(), status: "completed" }, null, 2)}\n`, { flag: "wx" })
      console.log(JSON.stringify({ id, attemptNumber, characters: response.text.length, tokens: response.tokens, costUsd: response.costUsd ?? null, stopReason: response.stopReason }))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await writeFile(file, `${JSON.stringify({ id, attemptNumber, packageId: brief.id, representation, phase, model: "xty/gpt-5.6-sol", maxTokens, prompt: base, startedAt, endedAt: new Date().toISOString(), status: "transport-failed", message, usage: "unknown" }, null, 2)}\n`, { flag: "wx" })
      console.error(JSON.stringify({ id, attemptNumber, status: "transport-failed", message }))
    }
  }
}
