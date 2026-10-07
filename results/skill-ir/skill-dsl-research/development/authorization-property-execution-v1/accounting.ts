import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { gunzipSync } from "node:zlib"
import { resolveInquiryContext } from "../../../../../src/benchmarks/authorization-dsl/inquiry-context.ts"
import { loadInquiryInput } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { loadPortableSourceBundle } from "../../../../../src/benchmarks/authorization-dsl/inputs.ts"
import { redactCodexEvent } from "../../../../../src/adapters/codex-account-session.ts"

type Usage = Partial<Record<"input" | "output" | "cacheRead" | "cacheWrite", number>>
const sha = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex")
const fields = ["input", "output", "cacheRead", "cacheWrite"] as const
const known = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0
export function sumAccountUsage(rows: Array<Usage | null | undefined>) {
  for (const usage of rows) if (usage && known(usage.input) && known(usage.cacheRead) && usage.cacheRead > usage.input) throw new Error("Account cache is inside input; invalid cache total")
  const sum = (values: Array<number | undefined>) => ({ knownSubtotal: values.reduce<number>((total, n) => total + (known(n) ? n : 0), 0), knownRows: values.filter(known).length, unknownRows: values.filter(n => !known(n)).length })
  const totals = Object.fromEntries(fields.map(field => [field, sum(rows.map(row => row?.[field]))])) as Record<typeof fields[number], ReturnType<typeof sum>>
  return { ...totals, nonCachedInput: sum(rows.map(row => row && known(row.input) && known(row.cacheRead) ? row.input - row.cacheRead : undefined)), complete: Object.values(totals).every(t => t.unknownRows === 0), convention: "input includes cacheRead; neither cache nor unknown usage is added again" }
}

/** Decode only packets retained from actual outgoing messages, never host-only context copies. */
export function auditAccountContexts(events: any[], expectedPackets?: number, verifiedWindows = new Map<string, any>()) {
  const contexts: any[] = [], issues: string[] = []; let restoredSourceWindows = 0
  const restore = (value: any): any => {
    if (value && typeof value === "object" && typeof value.id === "string" && verifiedWindows.has(value.id)) {
      const original = verifiedWindows.get(value.id), current = JSON.stringify(value), exact = JSON.stringify(original)
      if (current !== exact && (redactCodexEvent(exact) === current || redactCodexEvent(redactCodexEvent(exact)) === current)) { restoredSourceWindows++; return original }
    }
    if (Array.isArray(value)) return value.map(restore)
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, restore(item)]))
    return value
  }
  for (const event of events) {
    if (event.direction !== "client") continue
    let wire: any
    try {
      if (event.method === "turn/start") {
        const text = event.params?.input?.[0]?.text, marker = "Current local explanation context: "
        if (typeof text === "string" && text.includes(marker)) wire = JSON.parse(text.slice(text.indexOf(marker) + marker.length))
      } else if (event.result?.contentItems?.[0]?.text?.startsWith("{")) wire = JSON.parse(event.result.contentItems[0].text).currentContext
      if (!wire?.contextSequence) continue
      wire = restore(wire); contexts.push(wire); resolveInquiryContext(wire, contexts)
    } catch (error) { issues.push(String(error)) }
  }
  if (expectedPackets !== undefined && contexts.length !== expectedPackets) issues.push(`incomplete-wire-context: expected ${expectedPackets} packets, retained ${contexts.length}`)
  return { status: issues.length ? "failed" : contexts.length ? restoredSourceWindows ? "verified-with-source-reconstruction" : "verified" : "not-available", packets: contexts.length, restoredSourceWindows, issues, inference: 0, targetExecutions: 0 }
}
/** Reconstruct only numbered windows from the registered, SHA-verified source;
 * their exact sanitizer image must match an ACTUAL outgoing packet before use. */
async function originalSourceWindows(claim: any, evidence: any[]) {
  const windows = new Map<string, any>()
  if (!claim?.inputFile || !evidence?.length) return windows
  const input = await loadInquiryInput(claim.inputFile)
  if (input.inputSha256 !== claim.inputSha256) throw new Error("Registered source input changed before audit")
  const sourceCache = new Map<string, string>()
  for (const item of evidence) {
    if (!claim.sourceFiles?.some((file: any) => file.path === item.path && file.sha256 === item.sha256)) throw new Error("Unregistered window source identity")
    if (!sourceCache.has(item.path)) {
      const loaded = await loadPortableSourceBundle({ ...input.context, sourceFiles: [item.path] })
      if (!loaded.success || loaded.bundle.files[0]?.sha256 !== item.sha256) throw new Error("Window source bytes changed before audit")
      sourceCache.set(item.path, loaded.bundle.files[0]!.content)
    }
    const content = sourceCache.get(item.path)!, lines = content ? content.replace(/\r?\n$/, "").split(/\r?\n/) : []
    if (!Number.isSafeInteger(item.startLine) || !Number.isSafeInteger(item.endLine) || item.startLine < 1 || item.endLine < item.startLine || item.endLine > lines.length) throw new Error("Window range is not an original source interval")
    const text = lines.slice(item.startLine - 1, item.endLine).map((line, i) => `${item.startLine + i} | ${line}\n`).join("")
    const id = `ev-${sha([input.value.repository, input.value.sourceRef, item.path, item.sha256, item.startLine, item.endLine].join("\0")).slice(0, 20)}`
    if (id !== item.id || Buffer.byteLength(text) !== item.bytes) throw new Error("Window range identity changed before audit")
    windows.set(id, { id, repository: input.value.repository, sourceRef: input.value.sourceRef, path: item.path, sha256: item.sha256, startLine: item.startLine, endLine: item.endLine, text, bytes: item.bytes })
  }
  return windows
}
async function optional(file: string) { try { return await readFile(file) } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error } }
export async function collectAccounts(root = import.meta.dir) {
  const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")), rows: any[] = []
  for (const position of manifest.positions) for (const [index, id] of position.attempts.entries()) {
    if (!new RegExp(`^${position.id}/[a-z0-9-]+$`).test(id) || !/^[a-zA-Z0-9-]+$/.test(position.id)) throw new Error("Invalid registered attempt path")
    const directory = path.join(root, "attempts", id), rawClaim = await optional(path.join(directory, "claim.json")), claim = rawClaim ? JSON.parse(rawClaim.toString("utf8")) : undefined
    let rawReport = await optional(path.join(directory, "report.json")), report = rawReport ? JSON.parse(rawReport.toString("utf8")) : undefined, account: any, native: any
    if (position.kind === "smoke") {
      const bytes = await optional(path.join(directory, "account.json")); account = bytes ? JSON.parse(bytes.toString("utf8")) : undefined
      rawReport = await optional(path.join(directory, "evaluation.json")); report = rawReport ? JSON.parse(rawReport.toString("utf8")) : undefined
    } else if (report) {
      const compressed = await optional(path.join(directory, "run-result.json.gz"))
      const archived = compressed ? JSON.parse(gunzipSync(compressed).toString("utf8")) : report.sessionPath ? JSON.parse(await readFile(path.join(report.sessionPath, "run.json"), "utf8")) : undefined
      native = archived?.authorizationInquiry ?? archived?.native; account = archived?.authorizationInquiry?.account ?? archived?.account ?? archived?.telemetry?.account
    }
    const rawAnswer = await optional(path.join(directory, "answer-original.md")), rawInput = await optional(path.join(directory, "input-original.json"))
    if (rawInput && claim?.inputSha256 && sha(rawInput) !== claim.inputSha256 || rawAnswer && report?.answerSha256 && sha(rawAnswer) !== report.answerSha256) throw new Error(`Original archive identity changed: ${id}`)
    const usage = account?.usage ?? report?.accountUsage ?? null
    const contextAudit = native?.contextPayloads ? auditAccountContexts(account?.events ?? [], native.contextPayloads.length, await originalSourceWindows(claim, native.evidence)) : { status: "not-applicable-or-unavailable", inference: 0 }
    const group = position.kind === "quality" ? position.id.endsWith("-D-S") ? "quality-D-S" : position.id.endsWith("-M-S") ? "quality-M-S" : "quality-N" : position.kind === "change" ? position.id.endsWith("-previous") ? "change-previous" : "change-fresh" : position.kind
    rows.push({ attemptId: id, positionId: position.id, group, firstOrRevision: index === 0 ? "first" : "revision", status: report?.status ?? "report-missing", accountStatus: account?.status ?? report?.accountStatus ?? null, gitRevision: claim?.gitRevision, runtimeTree: claim?.runtimeTree ?? null, finalPresent: report?.finalPresent ?? !!account?.text?.trim(), inferenceDispatched: account?.inferenceDispatched ?? report?.inferenceDispatched ?? null, usage, durationMs: account?.durationMs ?? report?.durationMs ?? null, providerRequests: null, actualUsd: null, hostToolCalls: report?.hostToolCalls ?? (account?.tools ? account.tools.length + (account.toolRejections?.length ?? 0) : null), resultPresent: !!native?.result, sourceWorkMetrics: native?.domain?.sourceWorkMetrics ?? report?.sourceWorkMetrics, reuse: report?.reuse, contextAudit, reportSha256: rawReport ? sha(rawReport) : null, answerSha256: rawAnswer ? sha(rawAnswer) : null, originalInputSha256: rawInput ? sha(rawInput) : null, targetExecutions: report?.targetExecutions ?? null })
  }
  const groups: Record<string, ReturnType<typeof sumAccountUsage>> = {}
  for (const group of [...new Set<string>(rows.map(row => `${row.group}/${row.firstOrRevision}`))]) groups[group] = sumAccountUsage(rows.filter(row => `${row.group}/${row.firstOrRevision}` === group).map(row => row.usage))
  const summary = { schemaVersion: "authorization-ax-accounting/v1", collectedAt: new Date().toISOString(), logicalPositions: manifest.positions.length, attemptedPositions: manifest.positions.filter((p: any) => p.attempts.length).length, retainedAttempts: rows.length, visibleOwnedAccountUsage: sumAccountUsage(rows.map(row => row.usage)), groups, completeness: "known subtotal of visible owned sessions; native child usage, developer/scout usage, internal requests and USD remain unknown", unobservedNativeChildUsage: [{ attemptId: "native-cloudflare-download-original/original", reason: "Unwanted native child event terminated the account boundary; its additional usage is not exposed." }], developer: { configuredModel: manifest.developmentModel, configuredEffort: manifest.developmentEffort, usage: null, actualUsd: null }, scouts: { role: "default", usage: null, actualUsd: null }, accountUsd: null, internalProviderRequests: null, newInference: 0, rows }
  await writeFile(path.join(root, "call-index.json"), JSON.stringify({ schemaVersion: "authorization-ax-call-index/v1", rows }, null, 2) + "\n")
  await writeFile(path.join(root, "accounting.json"), JSON.stringify(summary, null, 2) + "\n")
  return summary
}
if (import.meta.main) { const result = await collectAccounts(); console.log(JSON.stringify({ retainedAttempts: result.retainedAttempts, attemptedPositions: result.attemptedPositions, usage: result.visibleOwnedAccountUsage, contextAudits: result.rows.map(row => ({ attemptId: row.attemptId, ...row.contextAudit })), newInference: 0 })) }
