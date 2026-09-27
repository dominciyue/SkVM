import { createHash } from "node:crypto"
import { copyFile, readFile, writeFile, constants } from "node:fs/promises"
import path from "node:path"
import { applyAuthorizationLocalEdit } from "../../../../../src/benchmarks/authorization-dsl/authoring-workspace/local-edit.ts"

const root = import.meta.dir
const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex")
const dslDir = path.join(root, "author-packages", "memos-space-policy", "dsl")
const mdDir = path.join(root, "author-packages", "paperless-note-relation", "markdown")
const dslSource = path.join(root, "author-candidates", "memos-space-policy-dsl-changed-attempt2.json")
const mdSource = path.join(root, "author-candidates", "paperless-note-relation-markdown-changed-attempt2.md")
const dslText = await readFile(dslSource, "utf8")
const mdText = await readFile(mdSource, "utf8")
const patch = JSON.parse(dslText)
const base = JSON.parse(await readFile(path.join(dslDir, "original.json"), "utf8"))
const edited = applyAuthorizationLocalEdit(base, patch)
if (edited.status !== "ready" || !edited.value) throw new Error(`Revised DSL patch invalid: ${JSON.stringify(edited.diagnostics)}`)
const policy = edited.value.policies["space-member-deletion"]
if (policy?.location !== "author-use-briefs.json#/memos-space-policy/changedPolicy" || policy.revision !== "changedPolicy"
  || JSON.stringify(edited.suppliedPaths) !== JSON.stringify([
    "policies.space-member-deletion.location", "policies.space-member-deletion.revision", "policies.space-member-deletion.text",
    "scenarios.other-member.expectation", "scenarios.self-leave.expectation",
  ])) throw new Error("Revised DSL patch has incorrect provenance or edit surface")
if (!mdText.includes("caller-owns-document") || !mdText.includes("change-granted")
  || /update this scenario.s policy expectation to allow/i.test(mdText)
  || /source[- ]visible (?:result|behavior) is (?:allow|deny)/i.test(mdText)) throw new Error("Revised Markdown still leaks a scenario answer or drops a scenario")
const dslOutput = path.join(dslDir, "change-final.json")
const mdOutput = path.join(mdDir, "changed-final.md")
await copyFile(dslSource, dslOutput, constants.COPYFILE_EXCL)
await copyFile(mdSource, mdOutput, constants.COPYFILE_EXCL)
const rows = [
  { id: "memos-space-policy-dsl-changed", selectedAttempt: 2, firstAttemptPreserved: "change.json", output: path.relative(root, dslOutput).replaceAll("\\", "/"), sha256: hash(await readFile(dslOutput)), changedPaths: edited.changedPaths, suppliedPaths: edited.suppliedPaths },
  { id: "paperless-note-relation-markdown-changed", selectedAttempt: 2, firstAttemptPreserved: "changed.md", output: path.relative(root, mdOutput).replaceAll("\\", "/"), sha256: hash(await readFile(mdOutput)), semanticReview: "The changed owner premise is retained; scenario-specific outcome wording was removed; accepted policy and unrelated scenario remain." },
]
await writeFile(path.join(root, "author-revisions-selected.json"), `${JSON.stringify({ schemaVersion: "authorization-aj-author-revisions-selected/v1", rows }, null, 2)}\n`, { flag: "wx" })
process.stdout.write(`${JSON.stringify({ selected: rows.length, rows })}\n`)
