import { createHash } from "node:crypto"
import { cp, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { materializeAuthorizationWorkspace } from "../../../../../src/benchmarks/authorization-dsl/authoring-workspace/materialize.ts"
import { compareAuthorizationInput } from "../../../../../src/benchmarks/authorization-dsl/change-report.ts"
import { checkLocalAuthorizationInput, inspectLocalAuthorizationOutput } from "../../../../../src/benchmarks/authorization-dsl/local-run.ts"

const root = import.meta.dir
const repo = path.resolve(root, "../../../../..")
const tempParent = await realpath(os.tmpdir())
const temp = await mkdtemp(path.join(tempParent, "ai-task-semantics-example-"))
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex")
try {
  const sample = path.join(temp, "task-semantics")
  await cp(path.join(repo, "examples", "authorization-assessment", "task-semantics"), sample, { recursive: true })
  const publication = await materializeAuthorizationWorkspace(path.join(sample, "workspace.json"), path.join(sample, "generated"))
  if (publication.status !== "created") throw Error(JSON.stringify(publication.diagnostics))
  const checks = []
  for (const id of ["owner-only", "owner-or-supervisor"]) {
    const checked = await checkLocalAuthorizationInput(path.join(sample, "generated", `${id}.json`), "B", "plain", "v6", "standard", "explicit-v1")
    if (checked.status !== "valid") throw Error(`${id}: ${JSON.stringify(checked.diagnostics)}`)
    checks.push({ id, status: checked.status, assessmentMode: checked.assessmentMode, promptIncludesBoundary: checked.preview?.includes("declared-entry") ?? false, promptIncludesBranch: checked.preview?.includes("counterfactual-no-supervisor") ?? false })
  }
  const originalAuthorPackage = path.join(root, "author-packages", "fastapi-policy-change")
  const relocatedAuthorPackage = path.join(temp, "relocated-author-package")
  await cp(originalAuthorPackage, relocatedAuthorPackage, { recursive: true })
  const originalBasePath = path.join(originalAuthorPackage, "dsl", "original.json")
  const originalBase = JSON.parse(await readFile(originalBasePath, "utf8"))
  const originalSource = path.resolve(path.dirname(originalBasePath), originalBase.sourceRoot)
  const relocatedSource = path.join(temp, "source")
  await cp(originalSource, relocatedSource, { recursive: true })
  const sourceFile = "items.py"
  const sourceSha256 = digest(await readFile(path.join(originalSource, sourceFile)))
  if (sourceSha256 !== digest(await readFile(path.join(relocatedSource, sourceFile)))) throw Error("Relocated source changed bytes")
  const relocatedBasePath = path.join(relocatedAuthorPackage, "dsl", "original.json")
  const relocatedBase = { ...originalBase, sourceRoot: path.relative(path.dirname(relocatedBasePath), relocatedSource).replaceAll("\\", "/") }
  await writeFile(relocatedBasePath, `${JSON.stringify(relocatedBase, null, 2)}\n`)
  const relocatedGenerated = path.join(relocatedAuthorPackage, "generated-relocated")
  const relocatedPublication = await materializeAuthorizationWorkspace(path.join(relocatedAuthorPackage, "workspace.json"), relocatedGenerated)
  if (relocatedPublication.status !== "created") throw Error(JSON.stringify(relocatedPublication.diagnostics))
  for (const id of ["original", "changed"]) {
    const checked = await checkLocalAuthorizationInput(path.join(relocatedGenerated, `${id}.json`), "B", "plain", "v6", "standard", "explicit-v1")
    if (checked.status !== "valid") throw Error(`Relocated ${id}: ${JSON.stringify(checked.diagnostics)}`)
  }
  const realRun = JSON.parse(await readFile(path.join(root, "author-use-runs", "fastapi-policy-change-dsl-original", "unit.json"), "utf8"))
  const sessionPath = path.join(root, "author-use-runs", "fastapi-policy-change-dsl-original", "sessions", realRun.report.sessionId)
  const inspected = await inspectLocalAuthorizationOutput(sessionPath)
  if (inspected.status !== "completed") throw Error(`Real session inspection: ${inspected.status}`)
  const comparison = await compareAuthorizationInput(sessionPath, path.join(relocatedGenerated, "changed.json"))
  if (comparison.status !== "needs-review" || !comparison.reasons.includes("assessment-contract-changed") || comparison.affectedScenarioIds.length !== 2) {
    throw Error(`Relocated comparison missed changed dependencies: ${JSON.stringify(comparison)}`)
  }
  const result = { schemaVersion: "authorization-ai-ordinary-example/v1", relocatedToOrdinaryTemp: true, publishedVariants: publication.variants.length,
    checkedVariants: checks, relocatedAuthorVariants: relocatedPublication.variants.length, relocatedSourceSha256: sourceSha256,
    inspectedRealSession: { status: inspected.status, sessionId: inspected.sessionId },
    comparison: { status: comparison.status, reasons: comparison.reasons, affectedScenarioIds: comparison.affectedScenarioIds, providerCalls: comparison.providerCalls },
    providerCalls: 0, targetExecutions: 0, cleanup: "verified temporary directory only",
    note: "Synthetic compose/check and copied author-package compose/check are offline relocation checks. Inspect/compare reuse an existing real model session; this is not a new semantic model result." }
  await writeFile(path.join(root, "ordinary-example.json"), `${JSON.stringify(result, null, 2)}\n`)
  console.log(JSON.stringify(result))
} finally {
  const resolved = await realpath(temp).catch(() => null)
  if (resolved && path.dirname(resolved) === tempParent && path.basename(resolved).startsWith("ai-task-semantics-example-")) {
    await rm(resolved, { recursive: true, force: false })
  }
}
