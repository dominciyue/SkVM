import { cp, mkdtemp, realpath, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { materializeAuthorizationWorkspace } from "../../../../../src/benchmarks/authorization-dsl/authoring-workspace/materialize.ts"
import { planAuthorizationWorkspace } from "../../../../../src/benchmarks/authorization-dsl/authoring-workspace/plan.ts"
import { compareAuthorizationWorkspaces, snapshotAuthorizationWorkspace } from "../../../../../src/benchmarks/authorization-dsl/authoring-workspace/changes.ts"
import { checkLocalAuthorizationInput, inspectLocalAuthorizationOutput } from "../../../../../src/benchmarks/authorization-dsl/local-run.ts"

const root = import.meta.dir, repo = path.resolve(root, "../../../../..")
const tempParent = await realpath(os.tmpdir())
const temp = await mkdtemp(path.join(tempParent, "ah-ordinary-workspace-"))
const sample = path.join(temp, "scenario-workspace")
const source = path.join(repo, "examples", "authorization-assessment", "scenario-workspace")
try {
  await cp(source, sample, { recursive: true })
  const workspace = path.join(sample, "workspace.json")
  const previous = path.join(sample, "previous-workspace.json")
  const out = path.join(sample, "generated")
  const plan = await planAuthorizationWorkspace(workspace, out)
  if (plan.status !== "valid") throw Error(JSON.stringify(plan.diagnostics))
  const comparison = compareAuthorizationWorkspaces(
    snapshotAuthorizationWorkspace(await planAuthorizationWorkspace(previous, path.join(sample, "previous-generated"))),
    snapshotAuthorizationWorkspace(plan),
  )
  if (comparison.status !== "valid" || !comparison.commonChangedFields.includes("policies")) throw Error("Common policy comparison failed")
  const publication = await materializeAuthorizationWorkspace(workspace, out)
  if (publication.status !== "created") throw Error(JSON.stringify(publication.diagnostics))
  const checks = []
  for (const id of ["owner", "outsider", "role-override"]) {
    const checked = await checkLocalAuthorizationInput(path.join(out, id + ".json"), "B", "plain", "v4", "control-binding-v1")
    if (checked.status !== "valid") throw Error(id + ": " + JSON.stringify(checked.diagnostics))
    checks.push({ id, status: checked.status, focusedPreview: checked.preview?.includes("Control-to-effect") ?? false })
  }
  const mock = await inspectLocalAuthorizationOutput(path.join(root, "mock-runs", "initial-owui-file-M0"))
  const report = { schemaVersion: "authorization-ah-ordinary-demo/v1", tempCopiedOutsideCheckout: true,
    plannedVariants: plan.variants.length, publishedVariants: publication.variants.length,
    comparison, checks, priorMockInspect: { status: mock.status, sessionId: mock.sessionId },
    providerCalls: 0, targetExecutions: 0, cleanup: "verified temporary directory only" }
  await writeFile(path.join(root, "ordinary-demo.json"), JSON.stringify(report, null, 2) + "\n")
  console.log(JSON.stringify({ status: "valid", variants: checks.length, policyComparison: comparison.status, priorMockInspect: mock.status, providerCalls: 0 }))
} finally {
  const resolved = await realpath(temp).catch(() => null)
  if (resolved && path.dirname(resolved) === tempParent && path.basename(resolved).startsWith("ah-ordinary-workspace-")) {
    await rm(resolved, { recursive: true, force: false })
  }
}
