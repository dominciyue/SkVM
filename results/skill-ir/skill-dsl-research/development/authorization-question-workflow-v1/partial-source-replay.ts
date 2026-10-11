import { readFile } from "node:fs/promises"
import { gunzipSync } from "node:zlib"
import path from "node:path"
import { root, originalInput, sha, write } from "./study.ts"
import { loadInquiryInput } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createInquiryTools } from "../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { compileQuestionDeclaration } from "../../../../../src/task-dsl/authorization/question-workflow.ts"
import { compileSourceEdit } from "../../../../../src/task-dsl/authorization/source-edit.ts"
import { lowerSourceInterpretation } from "../../../../../src/task-dsl/authorization/source-interpretation.ts"
import { propertySourceReference } from "../../../../../src/task-dsl/authorization/property-query.ts"

/** Replay only archived model meanings; source identities are mechanically current. */
export async function replayPartialSource(label: string) {
  const file = path.join(root, "attempts/quality-d-1/predicate-guide-1/inquiry-run.json.gz"), bytes = await readFile(file), run = JSON.parse(gunzipSync(bytes).toString("utf8"))
  const action = run.native.history[47], raw = action.call.arguments, question = run.program.questions[0], loaded = await loadInquiryInput(originalInput)
  const tools = await createInquiryTools({ ...loaded.context, structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true, maxToolCalls: 64, maxReadBytes: 33554432, maxDisplayBytes: 786432 })
  tools.restoreEvidence(run.evidence)
  const source = tools.structure!.symbols.find(s => s.path === raw.source.path && s.startLine === raw.source.startLine && s.endLine === raw.source.endLine)!, skeleton = (await tools.sourceSkeleton(source.id))!
  const owner = { questionId: question.id, operationId: "document-download", skeleton }, references = skeleton.anchors.filter(a => ["condition", "call"].includes(a.kind) || a.fieldWrite).map(a => ({ ref: propertySourceReference(owner, a.id), kind: a.kind, source: a.selector, text: a.text }))
  const compiled = compileQuestionDeclaration(skeleton, raw, { transactionId: "archived-declaration-replay", questionId: question.id, properties: question.properties, references })
  const edit = compiled.edit && compileSourceEdit(skeleton, compiled.edit, { transactionId: "archived-declaration-replay", questionId: question.id, progressive: true })
  let lowered: ReturnType<typeof lowerSourceInterpretation> | undefined, error: string | undefined
  try { if (edit?.interpretation) lowered = lowerSourceInterpretation(skeleton, edit.interpretation, { index: tools.structure, itemId: "archived-partial", handle: "archived-partial", questionId: question.id, question, role: "helper", propertyDirected: true, propertyAbstraction: true, propertyContext: { operationId: "document-download", sources: [] }, sourceObjectBindings: true }) } catch (e) { error = String(e) }
  const result = { modelCalls: 0, originalArchiveSha256: sha(bytes), originalUnchanged: sha(await readFile(file)) === sha(bytes), originalHistoryIndex: 47, originalOutput: action.output, declarationSha256: sha(JSON.stringify(raw)), sourceSha256Unchanged: source.sha256 === raw.source.sha256, mechanicalSourceRevision: skeleton.revision, sourceMeaningsAdded: false, compilationDiagnostics: compiled.diagnostics, acceptedEdits: edit?.acceptedEdits, error, diagnostics: lowered?.diagnostics, unitComplete: lowered?.unit?.complete, unresolved: lowered?.unit?.blocks.flatMap(b => b.steps.filter(s => s.kind === "unresolved").map(s => ({ name: s.name, reason: s.kind === "unresolved" ? s.reason : undefined }))) }
  await write(path.join(root, `verification/partial-source-${label}.json`), result, true)
  return result
}
if (import.meta.main) console.log(JSON.stringify(await replayPartialSource(process.argv[2]!)))
