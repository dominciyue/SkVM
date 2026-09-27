import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { checkLocalAuthorizationInput } from "../../../../../src/benchmarks/authorization-dsl/local-run.ts"

const root = import.meta.dir
const repo = path.resolve(root, "../../../../..")
const briefs = JSON.parse(await readFile(path.join(root, "author-neutral-briefs.json"), "utf8"))
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex")
const binding = async (file: string) => ({ path: path.relative(repo, file).replaceAll("\\", "/"), sha256: hash(await readFile(file)) })
const units = []
for (const phase of ["original", "changed"] as const) for (const packageId of ["fastapi-policy-change", "gitea-relation-change"]) for (const representation of ["markdown", "dsl"] as const) {
  const packageRoot = path.join(root, "author-packages", packageId)
  const inputFile = representation === "markdown"
    ? path.join(root, "author-md-inputs", packageId, `${phase}.json`)
    : path.join(packageRoot, "generated", `${phase}.json`)
  const markdownFile = representation === "markdown" ? path.join(packageRoot, "markdown", `${phase}.md`) : undefined
  const checked = await checkLocalAuthorizationInput(inputFile, "B", "plain", "v6", "standard", "explicit-v1")
  if (checked.status !== "valid") throw Error(`${packageId}/${representation}/${phase}: ${JSON.stringify(checked.diagnostics)}`)
  const value = JSON.parse(await readFile(inputFile, "utf8"))
  if (Object.keys(value.scenarios).length !== 2) throw Error("Author use requires exactly two scenarios per session")
  units.push({ id: `${packageId}-${representation}-${phase}`, packageId, phase, representation, input: await binding(inputFile), ...(markdownFile ? { markdown: await binding(markdownFile) } : {}), scenarios: Object.keys(value.scenarios).sort() })
}
const config = {
  schemaVersion: "authorization-ai-author-use-config/v1",
  registeredBeforeConsumption: true,
  authoredDeliveries: "Four independent original and four independent changed deliveries. Markdown receives a neutral brief-derived runner input, not the structured author's draft.",
  rubric: await binding(path.join(root, "author-use-rubric.json")),
  brief: await binding(path.join(root, "author-neutral-briefs.json")),
  sources: await Promise.all(briefs.packages.map((brief: { sourcePath: string }) => binding(path.join(repo, brief.sourcePath)))),
  model: "xty/gpt-5.6-sol",
  method: "plain", wire: "v6", assessmentMode: "explicit-v1", temperature: 0, autoProbe: false,
  executionOptions: { timeoutMs: 180000, unitTimeoutMs: 600000, maxTokens: 6000, maxProviderDispatches: 4, maxDomainRepairs: 1 },
  units, stopRule: "Eight fresh sessions assessing sixteen scenario answers; preserve every claimed/unknown unit without resending or outcome-driven additions.",
}
await writeFile(path.join(root, "author-use-config.json"), `${JSON.stringify(config, null, 2)}\n`, { flag: "wx" })
console.log(JSON.stringify({ sessions: units.length, scenarioAnswers: units.reduce((sum, unit) => sum + unit.scenarios.length, 0), configSha256: hash(`${JSON.stringify(config, null, 2)}\n`) }))
