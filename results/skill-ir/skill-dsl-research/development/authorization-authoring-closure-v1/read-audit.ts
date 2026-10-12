import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
const base = import.meta.dir, repo = path.resolve(base, "../../../../..")
const load = async (p: string) => JSON.parse(await readFile(p, "utf8"))
const ledger: any[] = await load(path.join(base, "attempts.json")), observations = []
for (const e of ledger.filter(e => e.session && e.status === "completed")) {
  const run = await load(path.join(repo, e.session, "run.json")), groups = new Map<string, any[]>()
  const all = run.native.history.filter((h: any) => h.call.name === "source_read")
  for (const h of all) {
    const key = JSON.stringify(h.call.arguments), o = typeof h.output === "string" ? JSON.parse(h.output) : h.output
    const items = groups.get(key) ?? []
    items.push({ executed: h.executed, exitCode: h.exitCode, status: o.status, code: o.code, outputKeys: Object.keys(o), diagnostics: o.diagnostics ?? o.error ?? o.message })
    groups.set(key, items)
  }
  observations.push({ position: e.position, sourceReadAttempts: all.length, executedReads: all.filter((h: any) => h.executed).length, rejectedReadAttempts: all.filter((h: any) => !h.executed).map((h: any) => ({ arguments: h.call.arguments, output: h.output })), distinctReadArguments: groups.size, repeatedExactRanges: [...groups].filter(([, v]) => v.length > 1).map(([k, v]) => ({ arguments: JSON.parse(k), replies: v })), inference: "Routing/DRF, lookup/root permissions, version/representation and storage/naming source reads serve original duties outside computed fields. Repeated identical arguments can still obtain or confirm evidence; output status and purpose must be checked before calling them waste. No model-intent label is available from tool arguments alone." })
}
await writeFile(path.join(base, "verification/source-read-audit.json"), JSON.stringify({ providerCalls: 0, observations, purposeReview: "This is a derived trace audit, not a second execution or causal cost estimate. Attempt counts include diagnostics and rejected requests; sourceAccounting separately reports actual I/O. Byte repetitions remain in total transmitted bytes. Original text presence is not inferred from shallow keys of nested source_read evidence; actual tool replies are retained in each session." }, null, 2) + "\n", "utf8")
console.log(JSON.stringify(observations.map(o => ({ position: o.position, sourceReadAttempts: o.sourceReadAttempts, distinctReadArguments: o.distinctReadArguments, repeats: o.repeatedExactRanges.map(g => ({ arguments: g.arguments, statuses: g.replies.map(r => ({ executed: r.executed, status: r.status, code: r.code, diagnostics: r.diagnostics })) })) }))))
