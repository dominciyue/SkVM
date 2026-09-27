import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const root = import.meta.dir
const repo = path.resolve(root, "../../../../..")
const briefs = JSON.parse(await readFile(path.join(root, "author-neutral-briefs.json"), "utf8"))
const instruction = "Assess each current question at its stated handler-entry boundary using the fixed supplied source and accepted policy. Treat the entry premise as given, not as proof about upstream binding. Distinguish observed control flow from the accepted policy and cite decisive source lines. Do not execute the target or infer unsupplied deployment facts."

for (const brief of briefs.packages) for (const phase of ["original", "changed"] as const) {
  const directory = path.join(root, "author-md-inputs", brief.id)
  await mkdir(directory, { recursive: true })
  const sourceFile = path.join(repo, brief.sourcePath)
  const sourceRoot = path.relative(directory, path.dirname(sourceFile)).replaceAll("\\", "/")
  const sourceName = path.basename(sourceFile)
  const scenarios = brief.originalScenarios.map((scenario: { id: string; question: string; premise: string; boundary: string }) => {
    if (phase === "changed" && brief.id === "gitea-relation-change" && scenario.id === "nonadmin-other") return {
      ...scenario,
      question: "At GetRepoPermissions, can the same authenticated repository-read collaborator who is neither site nor repository administrator query their own existing username's permission?",
      premise: "At entry, caller and queried existing collaborator have the same username; caller is neither site nor repository administrator.",
    }
    return scenario
  })
  const fastapi = brief.id === "fastapi-policy-change"
  const policies = { accepted: {
    text: phase === "changed" && brief.changedPolicy ? brief.changedPolicy : brief.originalPolicy,
    location: `author-neutral-briefs.json#/packages/${fastapi ? 0 : 1}/${phase === "changed" && brief.changedPolicy ? "changedPolicy" : "originalPolicy"}`,
    revision: `${brief.id}-${phase}`, acceptance: "accepted", reason: "Supplied by the independent neutral task author, not inferred from source behavior.",
  } }
  const principals = fastapi ? {
    nonadmin: { role: "authenticated active non-superuser", facts: [scenarios[0]!.premise], capabilities: ["authenticated"] },
    superuser: { role: "authenticated active superuser", facts: [scenarios[1]!.premise], capabilities: ["authenticated", "superuser"] },
  } : {
    nonadmin: { role: "authenticated repository-read collaborator, not administrator", facts: [scenarios[0]!.premise], capabilities: ["authenticated", "repository-read"] },
    repoadmin: { role: "authenticated repository administrator", facts: [scenarios[1]!.premise], capabilities: ["authenticated", "repository-admin"] },
  }
  const resources = fastapi ? { item: { type: "existing item", facts: ["Owned by someone other than the stated caller."] } }
    : { collaborator: { type: "existing collaborator", facts: ["The queried collaborator exists; username relation is specified separately per scenario."] } }
  const entries = fastapi ? {
    update: { name: "update_item", locations: [{ path: sourceName, startLine: 75, endLine: 96 }] },
    read: { name: "read_item", locations: [{ path: sourceName, startLine: 48, endLine: 58 }] },
  } : { permissions: { name: "GetRepoPermissions", locations: [{ path: sourceName, startLine: 4, endLine: 58 }] } }
  const authorScenarios: Record<string, unknown> = {}
  const contractScenarios: Record<string, unknown> = {}
  for (const [index, scenario] of scenarios.entries()) {
    const entry = fastapi ? index === 0 ? "update" : "read" : "permissions"
    const expectation = fastapi ? scenario.id === "foreign-update" ? "deny" : phase === "changed" ? "deny" : "allow"
      : scenario.id === "repo-admin-other" || phase === "changed" ? "allow" : "deny"
    const principal = fastapi ? index === 0 ? "nonadmin" : "superuser" : index === 0 ? "nonadmin" : "repoadmin"
    const relation = fastapi ? "foreign-owner" : index === 0 ? phase === "changed" ? "same-username" : "different-username" : "different-username"
    authorScenarios[scenario.id] = { principal, resource: fastapi ? "item" : "collaborator", policy: "accepted", entries: [entry], relation, operation: scenario.question, expectation }
    contractScenarios[scenario.id] = { boundary: "declared-entry", premises: [{ id: "entry-premise", statement: scenario.premise, atEntry: entry, provenance: "task-assumption" }], requestedBranches: [], requiredResponseDetails: ["Separate the accepted policy from observed source behavior and do not assert upstream principal binding from this handler crop."] }
  }
  const value = { schemaVersion: "authorization-assessment-authoring/v2", taskId: `${brief.id}-${phase}-neutral-markdown-harness`,
    request: scenarios.map((scenario: { question: string }) => scenario.question).join(" "), repository: brief.repository, sourceRef: brief.sourceRef,
    sourceRoot, sources: [sourceName], policies, principals, resources, entries, scenarios: authorScenarios,
    analysisContract: { schemaVersion: "authorization-analysis-contract/v1", publicInstruction: instruction, scenarios: contractScenarios },
  }
  const file = path.join(directory, `${phase}.json`)
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
  console.log(JSON.stringify({ packageId: brief.id, phase, file, scenarios: scenarios.map((scenario: { id: string }) => scenario.id), origin: "neutral brief only; independent Markdown draft is added by the study runner" }))
}
