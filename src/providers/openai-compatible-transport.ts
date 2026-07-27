import { z } from "zod"

const MAX_HELPER_OUTPUT_BYTES = 32 * 1024 * 1024
const DEFAULT_HELPER_TIMEOUT_MS = 180_000

export type OpenAICompatibleHttpRequest = {
  url: string
  apiKey: string
  body: Record<string, unknown>
}

export type OpenAICompatibleHttpResponse = {
  status: number
  headers: Record<string, string>
  body: string
}

export type OpenAICompatibleHttpTransport = (
  request: OpenAICompatibleHttpRequest,
) => Promise<OpenAICompatibleHttpResponse>

const NodeHelperResponseSchema = z.object({
  status: z.number().int().min(100).max(599),
  headers: z.record(z.string()),
  body: z.string(),
}).strict()

export async function requestViaNodeHttpHelper(opts: {
  nodeExecutable: string
  helperPath: string
  url: string
  apiKey: string
  body: Record<string, unknown>
  timeoutMs: number
}): Promise<OpenAICompatibleHttpResponse> {
  const payload = JSON.stringify({
    url: opts.url,
    apiKey: opts.apiKey,
    body: opts.body,
    timeoutMs: opts.timeoutMs,
  })
  const proc = Bun.spawn([opts.nodeExecutable, opts.helperPath], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  })
  proc.stdin.write(payload)
  proc.stdin.end()

  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    proc.kill()
  }, opts.timeoutMs + 5_000)
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited.finally(() => clearTimeout(timer)),
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  if (timedOut) throw new Error("Node HTTP helper network timeout")
  if (exitCode !== 0) {
    const stderrDigestHint = stderr.length > 0 ? " with diagnostic output" : ""
    throw new Error(`Node HTTP helper network error: exit ${exitCode}${stderrDigestHint}`)
  }
  if (Buffer.byteLength(stdout, "utf8") > MAX_HELPER_OUTPUT_BYTES) {
    throw new Error("Node HTTP helper response exceeds the size limit")
  }
  let value: unknown
  try {
    value = JSON.parse(stdout)
  } catch {
    throw new Error("Node HTTP helper returned invalid JSON")
  }
  return NodeHelperResponseSchema.parse(value)
}

export function createOpenAICompatibleHttpTransport(
  env: Record<string, string | undefined> = process.env,
): OpenAICompatibleHttpTransport | undefined {
  const nodeExecutable = env.SKVM_OPENAI_HTTP_NODE?.trim()
  const helperPath = env.SKVM_OPENAI_HTTP_HELPER?.trim()
  if (!nodeExecutable && !helperPath) return undefined
  if (!nodeExecutable || !helperPath) {
    throw new Error("OpenAI-compatible Node transport requires both helper paths")
  }
  return (request) => requestViaNodeHttpHelper({
    nodeExecutable,
    helperPath,
    ...request,
    timeoutMs: DEFAULT_HELPER_TIMEOUT_MS,
  })
}

export const fetchOpenAICompatibleHttp: OpenAICompatibleHttpTransport = async (request) => {
  const response = await fetch(request.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${request.apiKey}`,
    },
    body: JSON.stringify(request.body),
  })
  const headers: Record<string, string> = {}
  response.headers.forEach((value, key) => { headers[key.toLowerCase()] = value })
  return { status: response.status, headers, body: await response.text() }
}
