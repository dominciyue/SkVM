import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { loadLocalAuthorizationInputValue } from "../../../../../src/benchmarks/authorization-dsl/local-input.ts"

const root = import.meta.dir
const briefs = JSON.parse(await readFile(path.join(root, "author-use-briefs.json"), "utf8")) as { packages: any[] }
const plan = JSON.parse(await readFile(path.join(root, "markdown-consumer-plan.json"), "utf8")) as { packages: Record<string, any> }
for (const brief of briefs.packages) {
  const rule = plan.packages[brief.id]
  if (!rule || JSON.stringify(Object.keys(rule.originalExpectations).sort()) !== JSON.stringify(brief.scenarios.map((item: any) => item.key).sort()))
    throw new Error(`Markdown consumer scenario mismatch ${brief.id}`)
  const directory = path.join(root, "author-packages", brief.id, "markdown")
  await mkdir(directory, { recursive: true })
  const sourceRoot = path.relative(directory, path.join(root, brief.sourceDirectory)).replaceAll("\\", "/")
  for (const phase of ["original", "changed"] as const) {
    const policy = phase === "changed" ? brief.changedPolicy ?? brief.originalPolicy : brief.originalPolicy
    const obligations = Object.fromEntries(brief.scenarios.map((item: any) => {
      const relation = phase === "changed" && rule.changedScenario === item.key ? rule.changedRelation : item.relation
      const expectation = (phase === "changed" ? rule.changedExpectations : rule.originalExpectations)[item.key]
      return [item.key, { principal: "caller", resource: "target", policy: "accepted-policy", entries: ["declared-entry"],
        relation, operation: item.operation, expectation }]
    }))
    const contracts = Object.fromEntries(brief.scenarios.map((item: any) => {
      const statement = phase === "changed" && rule.changedScenario === item.key ? rule.changedPremise : item.premise
      return [item.key, { boundary: "declared-entry", premises: [{ id: item.premiseId, statement,
        atEntry: "declared-entry", provenance: "task-assumption" }], requestedBranches: [],
        requiredResponseDetails: ["Trace the decisive source-visible control and protected effect; compare them with the accepted policy without treating premises as source proof."] }]
    }))
    const input = { schemaVersion: "authorization-assessment-authoring/v2", taskId: brief.taskId,
      request: brief.question, repository: brief.repository, sourceRef: brief.sourceRef,
      sourceRoot, sources: brief.sourceFiles,
      policies: { "accepted-policy": { text: policy, location: `author-use-briefs.json#/${brief.id}/${phase === "changed" && brief.changedPolicy ? "changedPolicy" : "originalPolicy"}`,
        revision: phase === "changed" && brief.changedPolicy ? "changed" : "original", acceptance: "accepted", reason: "Task author supplied this bounded accepted policy for source comparison." } },
      principals: { caller: { role: "authenticated caller described by the scenario premises", facts: ["Entry identity and object relation are scenario premises."], capabilities: [] } },
      resources: { target: { type: rule.resourceType, facts: ["The target exists and its relation to the caller is fixed separately in each scenario."] } },
      entries: { "declared-entry": { name: rule.entryName, locations: [{ path: rule.entryPath,
        startLine: rule.entryStartLine, endLine: rule.entryEndLine }] } },
      scenarios: obligations,
      analysisContract: { schemaVersion: "authorization-analysis-contract/v1",
        publicInstruction: `Assess both declared scenarios at handler entry from supplied fixed-ref source and the accepted policy. Treat each scenario premise as an assumption, not source or deployment proof. Trace identity, protected object, decisive control, and effect with exact supplied-source citations. Separate policy expectation from observed authorization. Do not execute the target. Current question: ${brief.question}`,
        scenarios: contracts } }
    const output = path.join(directory, `assessment-${phase}.json`)
    const loaded = await loadLocalAuthorizationInputValue(input, output)
    if (loaded.status !== "valid") throw new Error(`Markdown consumer input invalid ${brief.id}/${phase}: ${JSON.stringify(loaded.diagnostics)}`)
    await writeFile(output, `${JSON.stringify(input, null, 2)}\n`, { flag: "wx" })
    process.stdout.write(`${JSON.stringify({ packageId: brief.id, phase, status: "valid", scenarios: brief.scenarios.length, output })}\n`)
  }
}
