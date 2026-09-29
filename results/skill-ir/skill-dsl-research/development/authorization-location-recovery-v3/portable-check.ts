import { cp, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { loadLocalAuthorizationInput } from "../../../../../src/benchmarks/authorization-dsl/local-input.ts"
import { root, repo, cli, save, exists, json, hash } from "./common.ts"
const external = path.resolve(repo, "../project-maintenance/authorization-al-portable-20260929")
const mode = process.argv[2] ?? "check"
if (!["check", "replay"].includes(mode)) throw new Error("Usage: portable-check.ts check|replay (zero provider)")
const record = path.join(root, "portable-verification.json")
if (mode === "replay") {
  const v = await json(record)
  for (const row of v.checkedFiles) if (hash(await readFile(row.path)) !== row.sha256) throw new Error("Portable output changed")
  console.log(JSON.stringify({ directory: external, status: "reproduced", providerCalls: 0, targetExecutions: 0 }))
} else {
  if (await exists(external)) throw new Error("Named external directory exists; preserve it and use replay")
  await mkdir(external, { recursive: true })
  await save(path.join(external, "purpose.json"), { purpose: "AL12 ordinary relative-path and diagnostic proof; no target execution or real provider", owner: "authorization-location-recovery-v3", repository: repo })
  for (const f of ["evidence-editing", "task-semantics"]) await cp(path.join(repo, "examples/authorization-assessment", f), path.join(external, f), { recursive: true, errorOnExist: true, force: false })
  const evidence = path.join(external, "evidence-editing"), task = path.join(external, "task-semantics"), rows: any[] = [], checkedFiles: any[] = []
  for (const [request, out] of [["request-recovery-v2.json", "recovered"], ["request-ready-v2.json", "segments"]]) {
    const dir = path.join(evidence, out!)
    const prepared = await cli(["prepare", "--input=" + path.join(evidence, "base.json"), "--request=" + path.join(evidence, request!), "--out=" + dir])
    if (prepared.exitCode || prepared.report.status !== (out === "recovered" ? "partial" : "ready")) throw new Error("Portable preparation failed")
    if (out === "recovered" && !prepared.report.gaps.some((g: any) => g.id === "explanation-is-not-source")) throw new Error("Named gap missing")
    const checked = await cli(["check", "--input=" + path.join(dir, "assessment.json"), "--method=plain", "--wire=v6", "--assessment=explicit-v1"])
    if (checked.exitCode || checked.report.status !== "valid") throw new Error("Portable check failed")
    rows.push({ request, preparation: prepared.report.status, check: checked.report.status, scope: checked.report.scopePreview })
    checkedFiles.push({ path: path.join(dir, "assessment.json"), sha256: hash(await readFile(path.join(dir, "assessment.json"))) })
  }
  const originalFile = path.join(task, "owner-premises.json"), original = await loadLocalAuthorizationInput(originalFile)
  if (original.status !== "valid") throw new Error("Owner premise example invalid")
  const edited = await cli(["edit", "--input=" + originalFile, "--edit=" + path.join(task, "owner-other-present-edit.json"), "--out=" + path.join(task, "known-owner")])
  if (edited.exitCode) throw new Error("Portable premise edit failed")
  const changed = await loadLocalAuthorizationInput(edited.report.inputPath)
  if (changed.status !== "valid") throw new Error("Edited premise invalid")
  const signature = (bundle: any) => bundle.files.map((f: any) => ({ path: f.relativePath, sha256: f.sha256, content: f.content }))
  if (JSON.stringify(signature(original.sourceBundle)) !== JSON.stringify(signature(changed.sourceBundle))) throw new Error("Premise edit altered source")
  if (JSON.stringify(original.assessmentProgram) === JSON.stringify(changed.assessmentProgram)) throw new Error("Premise edit failed to change program")
  const invalid = await json(originalFile); delete invalid.request
  const invalidFile = path.join(task, "missing-request.json"); await writeFile(invalidFile, JSON.stringify(invalid, null, 2) + "\n")
  const diagnostics = await cli(["check", "--input=" + invalidFile, "--method=plain", "--wire=v6", "--assessment=explicit-v1"])
  if (!diagnostics.exitCode || !diagnostics.report.diagnostics.some((d: any) => d.schemaPath === "/request")) throw new Error("Ordinary structure path missing")
  rows.push({ scenario: "owner-premise", original: original.status, changed: changed.status, sameSource: true, changedProgram: true, changedPaths: edited.report.changedPaths, missingRequestDiagnostic: diagnostics.report.diagnostics })
  for (const file of [originalFile, edited.report.inputPath, invalidFile]) checkedFiles.push({ path: file, sha256: hash(await readFile(file)) })
  await save(record, { schemaVersion: "authorization-al-portable/v1", directory: external, purpose: "Named repository-external ordinary example proof; no cleanup requested", rows, checkedFiles, providerCalls: 0, targetExecutions: 0 }, true)
  console.log(JSON.stringify({ directory: external, checks: rows.length, providerCalls: 0, targetExecutions: 0 }))
}
