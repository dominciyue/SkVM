import path from "node:path"
import { z } from "zod"
import type { LLMProvider } from "../../../providers/types.ts"
import { loadPortableSourceBundle } from "../inputs.ts"
import { loadLocalAuthorizationInput } from "../local-input.ts"
import { AuthorizationEvidenceRequestSchema, type AuthorizationEvidenceRequest } from "./schema.ts"

const ProposalSchema = z.object({ dependencies: z.array(z.object({
  id: z.string().trim().min(1), from: z.string().trim().min(1), path: z.string().trim().min(1),
  startLine: z.number().int().positive(), endLine: z.number().int().positive(), match: z.string().trim().min(1).optional(),
  reason: z.enum(["identity", "resource-binding", "control", "effect", "other"]),
}).strict()).max(16) }).strict()

export interface AuthorizationDependencyProposal {
  schemaVersion: "authorization-dependency-proposal/v1"
  model: string
  dependencies: AuthorizationEvidenceRequest["dependencies"]
  promptCharacters: number
  responseCharacters: number
  durationMs: number
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number }
  actualCostUsd: number | null
}

function numberedWindow(content: string, startLine: number, endLine: number, maxChars: number): string {
  const lines = content.split(/\r?\n/)
  if (lines.at(-1) === "") lines.pop()
  const first = Math.max(1, startLine)
  const last = Math.min(lines.length, endLine)
  const output: string[] = []
  let used = 0
  for (let line = first; line <= last; line++) {
    const rendered = `${line} | ${lines[line - 1]}\n`
    if (used + rendered.length > maxChars) break
    output.push(rendered)
    used += rendered.length
  }
  return `shown ${first}-${first + output.length - 1} of ${lines.length} original lines; other lines omitted\n${output.join("")}`
}

/** One optional advisory call. Its output is only a request extension; the host's normal validator decides what can be read. */
export async function proposeAuthorizationDependencies(input: {
  inputFile: string
  request: AuthorizationEvidenceRequest
  model: string
  provider: LLMProvider
}): Promise<AuthorizationDependencyProposal> {
  const request = AuthorizationEvidenceRequestSchema.parse(input.request)
  const loaded = await loadLocalAuthorizationInput(input.inputFile)
  if (loaded.status !== "valid" || request.sourceRoot !== loaded.normalizedInput.sourceRoot) throw new Error("Proposal requires a valid input and matching sourceRoot.")
  const allowed = new Set(request.allowedFiles)
  if (request.entries.some(entry => !allowed.has(entry.path))) throw new Error("Proposal entry is outside the allowlist.")
  const sections: string[] = []
  let remaining = Math.min(request.limits.maxBytes, 64 * 1024)
  for (const file of request.allowedFiles) {
    if (remaining < 200) break
    const absolute = path.resolve(loaded.sourceRoot, ...file.split("/"))
    const relative = path.relative(loaded.sourceRoot, absolute)
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`Unsafe proposal path: ${file}`)
    const source = await loadPortableSourceBundle({ sourceRoot: loaded.sourceRoot,
      repository: loaded.task.repository, sourceRef: loaded.task.sourceRef, sourceFiles: [file] })
    if (!source.success) { sections.push(`${file}: unavailable; no source lines shown`); continue }
    const content = source.bundle.files[0]!.content
    const entries = request.entries.filter(entry => entry.path === file)
    const lines = content.split(/\r?\n/).length
    const start = entries.length ? Math.max(1, Math.min(...entries.map(entry => entry.startLine)) - 240) : 1
    const end = entries.length ? Math.min(lines, Math.max(...entries.map(entry => entry.endLine)) + 80) : Math.min(lines, 120)
    const section = `${file}\n${numberedWindow(content, start, end, remaining - file.length - 2)}`
    sections.push(section)
    remaining -= section.length
  }
  const prompt = [
    `Task: ${loaded.task.request}`,
    `Declared entries: ${JSON.stringify(request.entries)}`,
    `Allowed source files: ${JSON.stringify(request.allowedFiles)}`,
    `Existing dependency IDs: ${JSON.stringify(request.dependencies.map(item => item.id))}`,
    "Suggest up to 16 directly relevant source dependencies for identity, resource binding, authorization control, or protected effect. Return only JSON with a dependencies array. Each item needs id, from (entry key or dependency id), path, exact original startLine/endLine, optional literal match, and reason. Only use shown source lines. If a range is not visible, omit it. Do not infer whether a control is sufficient.",
    ...sections,
  ].join("\n\n")
  const response = await input.provider.complete({
    messages: [{ role: "user", content: prompt }],
    system: "You propose source locations only. Return strict JSON. Do not answer the authorization question.",
    maxTokens: 1200,
    temperature: 0,
  })
  const responseText = response.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
  let parsed: z.infer<typeof ProposalSchema>
  try { parsed = ProposalSchema.parse(JSON.parse(responseText)) }
  catch (error) { throw new Error(`Model dependency proposal was not valid JSON under the proposal schema: ${String(error)}`) }
  return {
    schemaVersion: "authorization-dependency-proposal/v1", model: input.model,
    dependencies: parsed.dependencies.map(item => ({ ...item, basis: "model-proposal" })),
    promptCharacters: prompt.length, responseCharacters: response.text.length, durationMs: response.durationMs,
    tokens: response.tokens, actualCostUsd: response.costUsd ?? null,
  }
}
