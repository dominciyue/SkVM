import { cp, mkdtemp, readFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { isDeepStrictEqual } from "node:util"
import { cli, json, save, hash, root, repo } from "./common.ts"

const workspace = await mkdtemp(path.join(os.tmpdir(), "authorization-am-portable-"))
const evidence = path.join(workspace, "evidence"), owner = path.join(workspace, "owner")
await cp(path.join(repo, "examples/authorization-assessment/evidence-editing"), evidence, { recursive: true })
await cp(path.join(repo, "examples/authorization-assessment/task-semantics"), owner, { recursive: true })
const checks: any[] = []
async function ordinary(label: string, args: string[], expectedStatus?: string) {
  const result = await cli(args); checks.push({ label, args, ...result })
  if (result.exitCode || (expectedStatus && result.report?.status !== expectedStatus)) throw new Error(label + " failed: " + JSON.stringify(result))
  return result
}
await ordinary("context draft", ["init", "--context=" + path.join(evidence, "context.json"), "--out=" + path.join(evidence, "draft.json")], "created")
const draft = await json(path.join(evidence, "draft.json")), facts = await json(path.join(evidence, "base.json"))
for (const field of ["policies", "principals", "resources", "scenarios", "analysisContract"]) draft[field] = facts[field]
await save(path.join(evidence, "filled.json"), draft, true)
const flags = ["--method=plain", "--assessment=explicit-v1", "--wire=v6"]
await ordinary("filled check", ["check", "--input=" + path.join(evidence, "filled.json"), ...flags], "valid")
await ordinary("callable with named pending gap", ["prepare", "--input=" + path.join(evidence, "filled.json"), "--request=" + path.join(evidence, "request-recovery-v2.json"), "--context=callable-v1", "--out=" + path.join(evidence, "material")], "partial")
await ordinary("targeted text edit", ["edit", "--input=" + path.join(evidence, "filled.json"), "--edit=" + path.join(evidence, "policy-change.json"), "--out=" + path.join(evidence, "edited")], "ready")
await ordinary("source and gap reuse", ["prepare", "--input=" + path.join(evidence, "edited/assessment.json"), "--reuse=" + path.join(evidence, "material/assessment.json"), "--out=" + path.join(evidence, "reused")], "partial")
await ordinary("reused check", ["check", "--input=" + path.join(evidence, "reused/assessment.json"), ...flags], "valid")
await ordinary("owner preparation", ["prepare", "--input=" + path.join(owner, "owner-premises.json"), "--request=" + path.join(owner, "entry-seed-owner-v2.json"), "--context=callable-v1", "--out=" + path.join(owner, "material")], "partial")
await ordinary("owner premise edit", ["edit", "--input=" + path.join(owner, "owner-premises.json"), "--edit=" + path.join(owner, "owner-other-present-edit.json"), "--out=" + path.join(owner, "edited")], "ready")
await ordinary("owner same gap reuse", ["prepare", "--input=" + path.join(owner, "edited/assessment.json"), "--reuse=" + path.join(owner, "material/assessment.json"), "--out=" + path.join(owner, "reused")], "partial")
await ordinary("owner reused check", ["check", "--input=" + path.join(owner, "reused/assessment.json"), ...flags], "valid")
const invariants = []
for (const dir of [evidence, owner]) {
  const before = await json(path.join(dir, "material/report.json")), after = await json(path.join(dir, "reused/report.json"))
  if (!isDeepStrictEqual(before.gaps, after.gaps) || !isDeepStrictEqual(before.included, after.included) || !isDeepStrictEqual(before.materialBinding, after.materialBinding)) throw new Error("Portable inheritance mismatch")
  const sources = []
  for (const file of before.included) {
    const a = await readFile(path.join(dir, "material/source", file.path)), b = await readFile(path.join(dir, "reused/source", file.path))
    if (!a.equals(b)) throw new Error("Portable source byte mismatch")
    sources.push({ path: file.path, bytes: a.length, sha256: hash(a) })
  }
  invariants.push({ dir, preservedPendingGapIds: after.gaps.map((g: any) => g.id), sameSourceAndRange: true, sources })
}
await save(path.join(root, "portable-verification.json"), { schemaVersion: "authorization-am-portable/v1", workspace, checks, invariants, providerCalls: 0, targetExecutions: 0 }, true)
console.log(JSON.stringify({ checks: checks.length, invariants, providerCalls: 0, targetExecutions: 0 }))
