import { cp, mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { root, repo, cli, save } from "./common.ts"
const destination = await mkdtemp(path.join(os.tmpdir(), "skvm-ak-evidence-portable-"))
await save(path.join(root, "portable-registration.json"), { destination, createdBy: "AK13", purpose: "Moved ordinary v2 source mapping and policy edit demonstration", cleanup: "Retained; no retry of prior rejected AJ deletion" }, true)
await cp(path.join(repo, "examples", "authorization-assessment", "evidence-editing"), destination, { recursive: true, errorOnExist: true })
const base = path.join(destination, "base.json"), operations = []
for (const [label, request, discover] of [["segments", "request-ready-v2.json", false], ["discovered", "entry-seed-v2.json", true]] as const) {
  const prepared = await cli(["prepare", `--input=${base}`, `--request=${path.join(destination, request)}`, `--out=${path.join(destination, label)}`, ...(discover ? ["--discover=true"] : [])])
  if (prepared.code) throw new Error(JSON.stringify(prepared))
  const checked = await cli(["check", `--input=${path.join(destination, label, "assessment.json")}`, "--method=plain", "--assessment=explicit-v1", "--wire=v6"])
  if (checked.code || checked.report.scopePreview.expandedObligations !== 2) throw new Error("Portable scope invalid")
  if (label === "segments" && (!checked.report.preview.includes("OMITTED original lines 3-4") || prepared.report.included.find((f: any) => f.path === "src/record.ts").segments.length !== 2)) throw new Error("Portable original line mapping lost")
  operations.push({ label, prepared: prepared.report, scope: checked.report.scopePreview })
}
const edited = await cli(["edit", `--input=${base}`, `--edit=${path.join(destination, "policy-change.json")}`, `--out=${path.join(destination, "edited")}`])
if (edited.code) throw new Error("Portable edit failed")
const changed = await cli(["prepare", `--input=${path.join(destination, "edited", "assessment.json")}`, `--request=${path.join(destination, "request-ready-v2-edited.json")}`, `--out=${path.join(destination, "edited-segments")}`])
if (changed.code) throw new Error("Portable changed prepare failed")
const checkChanged = await cli(["check", `--input=${path.join(destination, "edited-segments", "assessment.json")}`, "--method=plain", "--assessment=explicit-v1", "--wire=v6"])
if (checkChanged.code || checkChanged.report.scopePreview.expandedObligations !== 2) throw new Error("Portable changed scope failed")
operations.push({ label: "edited-segments", prepared: changed.report, scope: checkChanged.report.scopePreview })
await save(path.join(root, "ordinary-example.json"), { schemaVersion: "authorization-ak-ordinary-example/v1", destination, operations, providerCalls: 0, targetExecutions: 0, cleanup: "This run's named temporary copy retained; old AJ rejected cleanup was not attempted" }, true)
process.stdout.write(`${JSON.stringify({ status: "verified", destination, operations: operations.length, providerCalls: 0 })}\n`)
