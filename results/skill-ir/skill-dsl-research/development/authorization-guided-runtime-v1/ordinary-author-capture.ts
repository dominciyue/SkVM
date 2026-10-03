import path from "node:path"
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises"
import { gzipSync, gunzipSync } from "node:zlib"
import { createHash } from "node:crypto"

/** The normal (non-optimize) bare-agent conversation is in the CLI log folder, not the runtime capture's source-task metadata. */
export async function captureOrdinaryAuthorConversation(options: { stdout: string; taskKey: string; logRoot: string; output: string }) {
  if (!/^natural-[a-f0-9]{12}$/.test(options.taskKey)) throw new Error("Invalid natural task identity")
  const logRoot = path.resolve(options.logRoot), directories = new Set<string>(), sourceCaptureFiles: Array<{ source: string; archive: string; bytes: number }> = [], events: any[] = []
  for (const line of options.stdout.replace(/\x1b\[[0-9;]*m/g, "").split(/\r?\n/)) {
    const match = /^(?:\d{2}:\d{2}:\d{2}\.\d{3}\s+\[INFO\s*\]\s+\[conv-log\]\s+)?Conversation logging enabled:\s*(.+?)\s*$/.exec(line)
    if (!match) continue
    const directory = path.resolve(match[1]!), relative = path.relative(logRoot, directory)
    if (!path.isAbsolute(relative) && /^\d{8}-\d{6}-run$/.test(relative)) directories.add(directory)
  }
  const expected = new RegExp(`^conv-\\d+-${options.taskKey}\\.jsonl$`)
  for (const directory of directories) for (const name of await readdir(directory).catch(() => [])) {
    if (!expected.test(name)) continue
    const source = path.join(directory, name), raw = await readFile(source), messages = raw.toString("utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))
    events.push(...messages)
    const archive = `source-capture/${path.basename(directory)}.${name}.gz`, destination = path.join(options.output, archive)
    await mkdir(path.dirname(destination), { recursive: true })
    try { await writeFile(destination, gzipSync(raw), { flag: "wx" }) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || !gunzipSync(await readFile(destination)).equals(raw)) throw error
    }
    sourceCaptureFiles.push({ source, archive, bytes: raw.length })
  }
  const requests = events.filter(m => m.type === "request"), responses = events.filter(m => m.type === "response"), known = requests.length > 0
  const keys = ["input", "output", "cacheRead", "cacheWrite"] as const
  const token = (message: any, key: string) => (message.tokens ?? message.usage ?? {})[key]
  const knownTokens = Object.fromEntries(keys.map(key => [key, responses.length ? responses.reduce((n, m) => n + (typeof token(m, key) === "number" ? token(m, key) : 0), 0) : null]))
  const missingUsageResponses = Object.fromEntries(keys.map(key => [key, responses.filter(m => typeof token(m, key) !== "number").length]))
  return { providerCalls: known ? requests.length : null, respondedCalls: known ? responses.length : null, knownTokens, missingUsageResponses, actualUSD: null, transportAttempts: "unknown", sourceCaptureFiles, accountingBasis: "Task-hash-bound request/response events from the actual CLI conversation log; runtime directory existence is not call evidence." }
}

if (import.meta.main) {
  const stage = process.argv[2]
  if (!stage || !/^author-authorization-[a-z0-9-]+$/.test(stage)) throw new Error("Use an existing authorization author stage")
  const filename = process.argv[3] ?? "accounting-correction.json"
  if (!/^accounting-correction(?:-[a-z0-9-]+)?\.json$/.test(filename)) throw new Error("Use a named correction JSON filename")
  const root = import.meta.dir, output = path.join(root, "ordinary", stage), claim = JSON.parse(await readFile(path.join(output, "claim.json"), "utf8")), previous = JSON.parse(await readFile(path.join(output, "process-result.json"), "utf8"))
  const taskKey = `natural-${createHash("sha256").update(claim.prompt).digest("hex").slice(0, 12)}`
  const capture = await captureOrdinaryAuthorConversation({ stdout: await readFile(path.join(output, "stdout.txt"), "utf8"), taskKey, output, logRoot: path.resolve(root, "../../../../../.skvm/log") })
  const correction = { at: new Date().toISOString(), stage, taskKey, originalRecord: "process-result.json", originalProviderCalls: previous.providerCalls, originalRespondedCalls: previous.respondedCalls, ...capture, reason: "Original harness looked for conversation.jsonl under a runtime directory containing only source-task metadata; original record is preserved.", providerCallsDuringCorrection: 0, targetExecutionsDuringCorrection: 0 }
  await writeFile(path.join(output, filename), JSON.stringify(correction, null, 2) + "\n", { flag: "wx" })
  console.log(JSON.stringify({ stage, providerCalls: capture.providerCalls, respondedCalls: capture.respondedCalls, knownTokens: capture.knownTokens, sourceCaptureFiles: capture.sourceCaptureFiles.length }))
}
