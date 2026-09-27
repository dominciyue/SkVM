import { createHash } from "node:crypto"
import { copyFile, mkdir, readFile, writeFile, constants } from "node:fs/promises"
import path from "node:path"
import { applyAuthorizationLocalEdit } from "../../../../../src/benchmarks/authorization-dsl/authoring-workspace/local-edit.ts"

const root = import.meta.dir
const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex")
const manifest = JSON.parse(await readFile(path.join(root, "author-change-selection.json"), "utf8")) as { items: Array<{ id: string; selected: boolean; attempt: number; semanticReview: string }> }
const briefs = JSON.parse(await readFile(path.join(root, "author-use-briefs.json"), "utf8")) as { packages: any[] }
if (manifest.items.length !== 4 || manifest.items.some(item => !item.selected || item.attempt !== 1)) throw new Error("Unexpected changed selection")
const rows = []
for (const item of manifest.items) {
  const attempt = JSON.parse(await readFile(path.join(root, "author-attempts", "use", `${item.id}.json`), "utf8"))
  const check = JSON.parse(await readFile(path.join(root, "author-candidates", `${item.id}-check.json`), "utf8"))
  const matched = /^(memos-space-policy|paperless-note-relation)-(markdown|dsl)-changed$/.exec(item.id)
  if (!matched || attempt.status !== "completed" || attempt.response.stopReason !== "end_turn") throw new Error(`Incomplete selected attempt ${item.id}`)
  const [, packageId, representation] = matched
  if (check.status !== "valid" && item.id !== "paperless-note-relation-markdown-changed") throw new Error(`Unexpected failed check ${item.id}`)
  if (item.id === "paperless-note-relation-markdown-changed" && JSON.stringify(check.diagnostics) !== JSON.stringify(["Accepted policy text is not preserved exactly"])) throw new Error("Unexpected Markdown diagnostic")
  const brief = briefs.packages.find(candidate => candidate.id === packageId)
  const extension = representation === "dsl" ? "json" : "md"
  const candidate = path.join(root, "author-candidates", `${item.id}.${extension}`)
  const destinationDir = path.join(root, "author-packages", packageId!, representation!)
  await mkdir(destinationDir, { recursive: true })
  const output = path.join(destinationDir, representation === "dsl" ? "change.json" : "changed.md")
  await copyFile(candidate, output, constants.COPYFILE_EXCL)
  let localEdit: unknown = null
  if (representation === "dsl") {
    const original = JSON.parse(await readFile(path.join(destinationDir, "original.json"), "utf8"))
    const patch = JSON.parse(await readFile(output, "utf8"))
    const result = applyAuthorizationLocalEdit(original, patch)
    if (result.status !== "ready" || !result.value) throw new Error(`Selected patch invalid ${item.id}: ${JSON.stringify(result.diagnostics)}`)
    if (brief.kind === "policy-change") {
      if (!Object.values(result.value.policies).some((policy: any) => policy.text === brief.changedPolicy)
        || JSON.stringify(result.suppliedPaths) !== JSON.stringify(["policies.space-member-deletion.text", "scenarios.other-member.expectation", "scenarios.self-leave.expectation"]))
        throw new Error("Policy patch changes unexpected fields or misses scenario review")
    } else if (JSON.stringify(result.changedPaths) !== JSON.stringify([
      "analysisContract.scenarios.view-only.premises.object-relation.statement",
      "scenarios.view-only.expectation", "scenarios.view-only.relation",
    ])) throw new Error(`Relation patch changes unexpected fields: ${JSON.stringify(result.changedPaths)}`)
    localEdit = { suppliedPaths: result.suppliedPaths, changedPaths: result.changedPaths, affectedScenarios: result.affectedScenarios }
  }
  rows.push({ id: item.id, selectedAttempt: item.attempt, semanticReview: item.semanticReview,
    outputPath: path.relative(root, output).replaceAll("\\", "/"), sha256: hash(await readFile(output)), localEdit })
}
await writeFile(path.join(root, "author-changes-selected.json"), `${JSON.stringify({ schemaVersion: "authorization-aj-author-changes-selected/v1", rows }, null, 2)}\n`, { flag: "wx" })
process.stdout.write(`${JSON.stringify({ selected: rows.length, rows: rows.map(row => ({ id: row.id, sha256: row.sha256, localEdit: row.localEdit })) })}\n`)
