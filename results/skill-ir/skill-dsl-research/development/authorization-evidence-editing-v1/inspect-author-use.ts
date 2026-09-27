import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { loadLocalAuthorizationInputValue } from "../../../../../src/benchmarks/authorization-dsl/local-input.ts"
import { applyAuthorizationLocalEdit } from "../../../../../src/benchmarks/authorization-dsl/authoring-workspace/local-edit.ts"

const root = import.meta.dir
const phase = process.argv[2]
if (phase !== "original" && phase !== "changed") throw new Error("Usage: bun inspect-author-use.ts original|changed")
const attemptNumber = Number(process.argv.find(arg => arg.startsWith("--attempt="))?.slice(10) ?? "1")
if (attemptNumber !== 1 && attemptNumber !== 2) throw new Error("--attempt must be 1 or 2")
const briefs = JSON.parse(await readFile(path.join(root, "author-use-briefs.json"), "utf8")) as { packages: any[] }
const plan = JSON.parse(await readFile(path.join(root, "author-use-plan.json"), "utf8")) as { order: Array<{ id: string; packageId: string; representation: string; phase: string }> }
const candidateDir = path.join(root, "author-candidates")
await mkdir(candidateDir, { recursive: true })
for (const unit of plan.order.filter(item => item.phase === phase)) {
  const suffix = attemptNumber === 1 ? "" : "-attempt2"
  const attemptPath = path.join(root, "author-attempts", "use", `${unit.id}${suffix}.json`)
  try { await access(attemptPath) } catch { if (attemptNumber === 2) continue; throw new Error(`Missing first attempt ${unit.id}`) }
  const attempt = JSON.parse(await readFile(attemptPath, "utf8"))
  const brief = briefs.packages.find(item => item.id === unit.packageId)
  const response = attempt.response?.text ?? ""
  const targetDir = path.join(root, "author-packages", unit.packageId, unit.representation)
  const extension = unit.representation === "dsl" ? "json" : "md"
  const candidatePath = path.join(candidateDir, `${unit.id}${suffix}.${extension}`)
  await writeFile(candidatePath, response.endsWith("\n") ? response : `${response}\n`, { flag: "wx" })
  const diagnostics: string[] = []
  if (attempt.status !== "completed" || attempt.response?.stopReason !== "end_turn" || !response.trim()) diagnostics.push("No complete nonempty first response")
  if (response.trimStart().startsWith("```")) diagnostics.push("Response starts with a code fence")
  if (unit.representation === "markdown") {
    for (const scenario of brief.scenarios) if (!response.includes(scenario.key)) diagnostics.push(`Missing scenario key ${scenario.key}`)
    const expectedPolicy = phase === "changed" ? brief.changedPolicy ?? brief.originalPolicy : brief.originalPolicy
    if (!response.includes(expectedPolicy)) diagnostics.push("Accepted policy text is not preserved exactly")
  } else {
    let value: any
    try { value = JSON.parse(response) }
    catch (error) { diagnostics.push(`JSON parse: ${error instanceof Error ? error.message : String(error)}`) }
    if (value && phase === "original") {
      if (value.taskId !== brief.taskId || value.repository !== brief.repository || value.sourceRef !== brief.sourceRef) diagnostics.push("Task identity differs from brief")
      if (JSON.stringify(Object.keys(value.scenarios ?? {}).sort()) !== JSON.stringify(brief.scenarios.map((item: any) => item.key).sort())) diagnostics.push("Scenario keys differ from brief")
      if (JSON.stringify(value.sources) !== JSON.stringify(brief.sourceFiles)) diagnostics.push("Source file list differs from brief")
      if (!Object.values(value.policies ?? {}).some((item: any) => item.text === brief.originalPolicy)) diagnostics.push("Accepted policy text differs from brief")
      for (const scenario of brief.scenarios) {
        const selected = value.analysisContract?.scenarios?.[scenario.key]
        if (!selected?.premises?.some((item: any) => item.id === scenario.premiseId && item.statement === scenario.premise)) diagnostics.push(`Scenario premise differs: ${scenario.key}`)
      }
      const loaded = await loadLocalAuthorizationInputValue(value, path.join(targetDir, "original.json"))
      if (loaded.status !== "valid") diagnostics.push(...loaded.diagnostics.map(item => `${item.code}: ${item.message}`))
    } else if (value && phase === "changed") {
      const original = JSON.parse(await readFile(path.join(targetDir, "original.json"), "utf8"))
      const edited = applyAuthorizationLocalEdit(original, value)
      if (edited.status !== "ready") diagnostics.push(...edited.diagnostics.map(item => `${item.code}: ${item.message}`))
    }
  }
  const check = { id: unit.id, packageId: unit.packageId, phase, representation: unit.representation,
    status: diagnostics.length ? "invalid" : "valid", diagnostics, candidatePath, responseCharacters: response.length,
    firstAttempt: attemptNumber === 1 }
  await writeFile(path.join(candidateDir, `${unit.id}${suffix}-check.json`), `${JSON.stringify(check, null, 2)}\n`, { flag: "wx" })
  process.stdout.write(`${JSON.stringify(check)}\n`)
}
