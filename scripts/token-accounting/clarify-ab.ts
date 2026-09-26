import { createHash } from "node:crypto"
import { readFileSync, writeFileSync, existsSync, realpathSync } from "node:fs"
import { isAbsolute, relative, resolve } from "node:path"
import { z } from "zod"
import { buildTokenReport } from "./report.ts"
import type { UsageGroup, UsageObservation } from "../../src/measurement/token-accounting.ts"

const pathSchema = z.string().min(1).refine(p => !p.includes("\\") && !p.includes(":") && !p.startsWith("/") && !p.split("/").includes(".."))
const ManifestSchema = z.object({
  schemaVersion: z.literal("ab-accounting-sources/v1"), summary: pathSchema, panel: pathSchema, authors: pathSchema,
  runs: z.array(z.object({ id: z.string().min(1), arm: z.enum(["markdown", "dsl"]), path: pathSchema }).strict()).length(16),
}).strict()
const token = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const UsageSchema = z.object({ input: token, output: token, cacheRead: token, cacheWrite: token })
const GroupSchema = z.object({ knownTokens: UsageSchema, providerCalls: token, knownDurationMs: z.number().finite().nonnegative(),
  actualUSD: z.null(), fullSuccess: token, necessarySupported: token })
const GroupsSchema = z.object({ markdown: GroupSchema, dsl: GroupSchema })
const AuthorUsageSchema = z.object({ input_tokens: token, output_tokens: token, cached_input_tokens: token,
  total_tokens: token, reasoning_output_tokens: token.optional() })
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex")
function equal(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`AB source mismatch: ${label}`)
}
function close(actual: number, expected: number, label: string) {
  if (Math.abs(actual - expected) > 1e-6) throw new Error(`AB numeric mismatch: ${label}`)
}

/** Read only the explicitly listed historical inputs. No provider, environment or recursive scan. */
export function buildAbEvidence(repoRoot: string, input: unknown) {
  const manifest = ManifestSchema.parse(input)
  const root = realpathSync(repoRoot)
  const sources = new Map<string, { absolute: string; sha256Before: string }>()
  const read = (path: string): unknown => {
    if (sources.has(path)) throw new Error(`duplicate source path: ${path}`)
    const absolute = realpathSync(resolve(root, path))
    const rel = relative(root, absolute)
    if (rel === ".." || rel.startsWith("..\\") || rel.startsWith("../") || isAbsolute(rel)) throw new Error("source escapes repository")
    const bytes = readFileSync(absolute)
    sources.set(path, { absolute, sha256Before: hash(bytes) })
    return JSON.parse(bytes.toString("utf8"))
  }
  const summary = z.object({ results: GroupsSchema, authors: z.object({
    markdown: z.object({ recordedTokens: AuthorUsageSchema }), dsl: z.object({ recordedTokens: AuthorUsageSchema }),
  }), actualAuthorizationReasoningCorrect: z.object({ markdown: token, dsl: token }), labelErrors: z.array(z.string()),
  value: z.object({ analysisTokenDeltaDslVsMarkdownPercent: z.number(), analysisDurationDeltaDslVsMarkdownPercent: z.number(),
    observedQuality: z.string(), methodBenefit: z.string() }),
  burden: z.object({ authorProviderCalls: z.null(), analysisActualUSD: z.null() }),
  }).parse(read(manifest.summary))
  const panel = z.object({ groups: GroupsSchema, units: z.array(z.object({ id: z.string(), arm: z.enum(["markdown", "dsl"]) })) }).parse(read(manifest.panel))
  equal(summary.results, panel.groups, "summary/panel groups")
  equal(manifest.runs.map(r => ({ id: r.id, arm: r.arm })), panel.units, "manifest matches all panel units in original order")
  const authors = z.object({ groups: z.array(z.object({ authorGroup: z.string(), usage: AuthorUsageSchema,
    actualUSD: z.null(), humanTime: z.null() })), costInterpretation: z.string() }).parse(read(manifest.authors))
  const analysis = { markdown: [] as UsageObservation[], dsl: [] as UsageObservation[] }
  const durations = { markdown: 0, dsl: 0 }
  const attempts: { id: string; path: string; usagePointer: string; durationMs: number; actualUSD: null }[] = []
  for (const row of manifest.runs) {
    const run = z.object({ attempts: z.array(z.object({ usage: UsageSchema, costUsd: z.null(),
      response: z.object({ tokens: UsageSchema, durationMs: z.number().finite().nonnegative() }) })).length(1),
      telemetry: z.object({ knownTokens: UsageSchema, providerCalls: z.literal(1), totalActualUsd: z.null() }),
    }).parse(read(row.path))
    const attempt = run.attempts[0]!
    equal(attempt.usage, attempt.response.tokens, `${row.id}: response tokens`)
    equal(attempt.usage, run.telemetry.knownTokens, `${row.id}: telemetry`)
    analysis[row.arm].push({ id: row.id, semantics: "skvm-disjoint", ...attempt.usage, actualUSD: attempt.costUsd,
      evidence: `${row.path}#/attempts/0/usage; src/providers/openai-compatible.ts:263-277 (mapped fields, gateway semantics unverified)` })
    durations[row.arm] += attempt.response.durationMs
    attempts.push({ id: row.id, path: row.path, usagePointer: "/attempts/0/usage", durationMs: attempt.response.durationMs, actualUSD: attempt.costUsd })
  }
  const authorObservations = { markdown: [] as UsageObservation[], dsl: [] as UsageObservation[] }
  for (const [index, row] of authors.groups.entries()) {
    const arm = row.authorGroup.endsWith("-md") ? "markdown" : row.authorGroup.endsWith("-dsl") ? "dsl" : null
    if (!arm) throw new Error(`unknown author arm: ${row.authorGroup}`)
    equal(row.usage.input_tokens + row.usage.output_tokens, row.usage.total_tokens, `${row.authorGroup}: inclusive total`)
    authorObservations[arm].push({ id: `author-${row.authorGroup}`, semantics: "inclusive-input",
      input: row.usage.input_tokens, output: row.usage.output_tokens, cacheRead: row.usage.cached_input_tokens,
      cacheWrite: null, reasoningOutput: row.usage.reasoning_output_tokens, actualUSD: row.actualUSD,
      evidence: `${manifest.authors}#/groups/${index}/usage; #/costInterpretation declares cached input subset` })
  }
  const groups: (UsageGroup & { observations: UsageObservation[] })[] = []
  for (const arm of ["markdown", "dsl"] as const) {
    groups.push({ id: `analysis-${arm}`, account: "ab-analysis", source: "skvm-openai-compatible-mapped-usage",
      semantics: "skvm-disjoint", evidence: "src/providers/openai-compatible.ts:263-277; AB archived mapped usage", observations: analysis[arm] })
    groups.push({ id: `author-${arm}`, account: "ab-author", source: "ab-local-author-agent-telemetry",
      semantics: "inclusive-input", evidence: `${manifest.authors}#/costInterpretation`, observations: authorObservations[arm] })
  }
  const observations = { schemaVersion: "token-accounting-input/v1", groups,
    comparisons: [{ baseline: "analysis-markdown", candidate: "analysis-dsl" }] }
  const report = buildTokenReport(observations)
  for (const arm of ["markdown", "dsl"] as const) {
    const metrics = report.groups.find(g => g.group.id === `analysis-${arm}`)!.metrics
    for (const [raw, metric] of [["input", "inputTokens"], ["output", "outputTokens"], ["cacheRead", "cacheReadTokens"], ["cacheWrite", "cacheWriteTokens"]] as const) {
      equal(metrics[metric].total, panel.groups[arm].knownTokens[raw], `${arm}: ${raw}`)
    }
    equal(analysis[arm].length, panel.groups[arm].providerCalls, `${arm}: providerCalls`)
    close(durations[arm], panel.groups[arm].knownDurationMs, `${arm}: response durations`)
    const author = report.groups.find(g => g.group.id === `author-${arm}`)!.metrics
    const recorded = summary.authors[arm].recordedTokens
    equal([author.inputTokens.total, author.outputTokens.total, author.cacheReadTokens.total, author.totalTokens.total],
      [recorded.input_tokens, recorded.output_tokens, recorded.cached_input_tokens, recorded.total_tokens], `${arm}: author totals`)
  }
  const comparison = report.comparisons[0]!
  equal(comparison.metrics.freshInputAndOutputTokens.percentChange, summary.value.analysisTokenDeltaDslVsMarkdownPercent, "original metric")
  close((durations.dsl / durations.markdown - 1) * 100, summary.value.analysisDurationDeltaDslVsMarkdownPercent, "duration delta")
  const sourceFiles = [...sources].map(([path, { absolute, sha256Before }]) => {
    const sha256After = hash(readFileSync(absolute))
    equal(sha256After, sha256Before, `${path}: bytes changed during read`)
    return { path, sha256Before, sha256After }
  })
  const clarification = {
    schemaVersion: "ab-accounting-clarification/v1", sourceFiles, attempts,
    originalMetric: { path: manifest.summary, pointer: "/value/analysisTokenDeltaDslVsMarkdownPercent",
      originalName: "analysisTokenDeltaDslVsMarkdownPercent", clarifiedName: "freshInputAndOutputDeltaPercent",
      formula: "((DSL fresh input + output) / (Markdown fresh input + output) - 1) * 100" },
    originalFreshInputAndOutputDeltaPercent: summary.value.analysisTokenDeltaDslVsMarkdownPercent,
    fullPromptAndOutputDeltaPercent: comparison.metrics.totalTokens.percentChange,
    originalResponseDurationDeltaPercent: summary.value.analysisDurationDeltaDslVsMarkdownPercent,
    responseDurationMs: durations,
    analysis: Object.fromEntries(report.groups.filter(g => g.group.account === "ab-analysis").map(g => [g.group.id, g.metrics])),
    authors: Object.fromEntries(report.groups.filter(g => g.group.account === "ab-author").map(g => [g.group.id, g.metrics])),
    authorProviderCalls: summary.burden.authorProviderCalls, humanMinutes: null,
    actualUSD: summary.burden.analysisActualUSD, newBusinessModelCalls: 0,
    quality: { unchanged: true, source: `${manifest.summary}#/results`,
      fullSuccess: { markdown: summary.results.markdown.fullSuccess, dsl: summary.results.dsl.fullSuccess },
      actualAuthorizationReasoningCorrect: summary.actualAuthorizationReasoningCorrect,
      labelErrors: summary.labelErrors, observedQuality: summary.value.observedQuality, methodBenefit: summary.value.methodBenefit },
    limitations: [
      "Mapped SkVM usage is archived, not the original gateway usage object. Adapter mapping is known; gateway compliance is not independently verified.",
      "Adapters default absent counters to zero and OpenAI-compatible clamps negative fresh input. Lost upstream missingness/inconsistency cannot be recovered from these snapshots.",
      "cacheWrite=0 is an adapter mapping value for these analysis rows, not independent evidence that the upstream provider performed no cache writes.",
      "Author input and output contain cache and reasoning subsets. Author cacheWrite, provider calls, human minutes, preparation/modification split and actual USD remain unknown.",
      "Analysis, author and development-agent accounts are separate. No total-work savings or model-quality improvement is inferred.",
    ],
  }
  return { observations, report, clarification }
}

if (import.meta.main) {
  try {
    const options = new Map<string, string>()
    for (const arg of process.argv.slice(2)) {
      const match = /^--(repo-root|input|out-dir)=(.+)$/u.exec(arg)
      if (!match || options.has(match[1]!)) throw new Error("Expected unique --repo-root= --input= --out-dir= paths")
      options.set(match[1]!, match[2]!)
    }
    if (options.size !== 3) throw new Error("Provide --repo-root= --input= --out-dir= explicitly")
    const result = buildAbEvidence(options.get("repo-root")!, JSON.parse(readFileSync(options.get("input")!, "utf8")))
    const outputs = [["observations.json", result.observations], ["comparison.json", result.report],
      ["ab-accounting-clarification.json", result.clarification]] as const
    const paths = outputs.map(([name]) => resolve(options.get("out-dir")!, name))
    if (paths.some(path => existsSync(path))) throw new Error("Refusing to overwrite an existing AB accounting output")
    for (const [index, [, value]] of outputs.entries()) writeFileSync(paths[index]!, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
  } catch (error) { console.error(error instanceof Error ? error.message : "AB accounting failed"); process.exitCode = 1 }
}
