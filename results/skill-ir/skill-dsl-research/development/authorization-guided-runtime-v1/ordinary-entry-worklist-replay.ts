import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import assert from "node:assert/strict"
import { isDeepStrictEqual } from "node:util"
import { loadInquiryInput } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createInquiryTools } from "../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { createInquiryWorklist } from "../../../../../src/benchmarks/authorization-dsl/inquiry-worklist.ts"

const root = import.meta.dir, original = "ordinary/native-memos-policy-change-compact-repaired/native-trace.json"
const trace = JSON.parse(await readFile(path.join(root, original), "utf8"))
const input = await loadInquiryInput(path.join(path.dirname(root), "authorization-domain-execution-v1/model/inputs/memos-remove-policy-change.json"))
const tools = await createInquiryTools({ ...input.context, maxToolCalls: 24 })
assert(isDeepStrictEqual(tools.files, trace.sourceFiles), "Original indexed source bytes must match")
const restored = tools.restoreEvidence(trace.evidence)
assert.equal(restored.diagnostics.length, 0)
const work = createInquiryWorklist({ program: trace.program, tools, entryContext: input.value.brief, dependencyStates: () => trace.domain.dependencies })
work.sync(trace.domain.slice); work.sync(trace.domain.slice)
const before = trace.domain.worklist.items.filter((i: any) => i.kind === "entry" && i.origin === "question-duty")
const after = work.snapshot().filter(i => i.kind === "entry" && i.origin === "question-duty")
assert(before.every((i: any) => i.state === "unlocated"))
assert(after.every(i => i.selectedBy === "accepted-entry-citation" && i.state === "awaiting-verification"))
assert.equal(tools.history.length, 0, "Associating accepted evidence must not dispatch new reads")
const result = { schemaVersion: "ar-entry-worklist-replay/v1", originalArtifact: original, mechanism: "Same-question accepted source-bound entry citation anchors a unique indexed declaration", before: before.map((i: any) => ({ questionId: i.questionId, state: i.state, code: i.code })), after: after.map(i => ({ questionId: i.questionId, state: i.state, selectedBy: i.selectedBy, selected: i.selected, evidenceIds: i.evidenceIds })), originalSliceUnmodified: true, originalFailedGraphNotRechecked: true, restoredEvidenceWindows: restored.importedEvidenceIds.length, automaticNewReads: tools.history.length, providerCallsDuringReplay: 0, targetExecutionsDuringReplay: 0, semanticSupport: "unreviewed", limits: ["Only physical entry/worklist association replayed", "No old rejection deleted, new answer produced, graph promoted or quality panel released"] }
if (process.argv[2] === "save") await writeFile(path.join(root, "entry-worklist-replay.json"), JSON.stringify(result, null, 2) + "\n", { flag: "wx", encoding: "utf8" })
else if (process.argv[2] !== "replay") throw new Error("Use save|replay")
console.log(JSON.stringify({ before: result.before, after: result.after.map(i => ({ questionId: i.questionId, state: i.state, path: i.selected?.path, selectedBy: i.selectedBy })), providerCalls: 0, automaticNewReads: 0 }))
