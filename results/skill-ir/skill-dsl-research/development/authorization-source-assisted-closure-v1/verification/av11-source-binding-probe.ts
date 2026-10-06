import path from "node:path"
import { readFile, writeFile } from "node:fs/promises"
import { z } from "zod"
import { root } from "../study.ts"
import { loadInquiryInput } from "../../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createInquiryTools } from "../../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { lowerSourceInterpretation, type SourceInterpretation } from "../../../../../../src/task-dsl/authorization/source-interpretation.ts"
import { SemanticBlockSchema, semanticBlockDiagnostics } from "../../../../../../src/task-dsl/authorization/semantic-flow.ts"

const original = path.join(root, "positions/debug-paperless-download-D1/revision-local-envelope/raw/inquiry/sessions/2026-10-06T111707214Z-cae62faa/run.json")
const raw = z.object({ domain: z.object({ focus: z.object({ sourceInterpretations: z.array(z.object({ event: z.string(), focusId: z.string(), raw: z.unknown(), generated: SemanticBlockSchema.optional() }).passthrough()) }).passthrough() }).passthrough() }).passthrough().parse(JSON.parse(await readFile(original, "utf8")))
const history = raw.domain.focus.sourceInterpretations, old = history.find(h => h.generated?.handle === "unit-12bd4a5db4e83c713d2e170b")!
if (!old?.generated) throw new Error("Exact original generated helper is absent")
const input = await loadInquiryInput(path.join(root, "model/inputs/paperless-download-original.json")), tools = await createInquiryTools({ ...input.context, structure: true })
const source = tools.structure!.symbols.find(s => s.name === "serve_file" && s.path === "src/documents/views.py")!
await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
const skeleton = (await tools.sourceSkeleton(source.id))!
let previous: SourceInterpretation | undefined, lowered: ReturnType<typeof lowerSourceInterpretation> | undefined
for (const h of history.filter(h => h.focusId === old.focusId)) {
  const envelope = z.object({ interpretation: z.unknown() }).passthrough().parse(h.raw)
  lowered = lowerSourceInterpretation(skeleton, envelope.interpretation, { index: tools.structure, itemId: old.generated.itemId, handle: old.generated.handle, questionId: "download-controls", role: "helper", previous })
  previous = lowered.interpretation
}
if (!lowered?.unit) throw new Error("Last original proposal did not lower; inspect the retained diagnostics")
const names = old.generated.blocks.flatMap(b => b.steps.map(s => s.name)), before = [...new Set(names.filter((name, i) => names.indexOf(name) !== i))]
const after = semanticBlockDiagnostics(lowered.unit)
if (!before.length || after.some(d => d.code === "semantic-duplicate")) throw new Error("Actual generated duplicate was not reproduced and removed")
const result = { schemaVersion: "authorization-av-source-binding-probe/v1", source: skeleton.source, original, originalDuplicateNames: before, currentStepCount: lowered.unit.blocks.flatMap(b => b.steps).length, currentDuplicateDiagnostics: after.filter(d => d.code === "semantic-duplicate"), otherCurrentDiagnostics: [...lowered.diagnostics, ...after], originalInterpretationReusedWithoutFieldEditing: true, skeletonGaps: skeleton.gaps, providerCalls: 0, targetExecutions: 0, qualityClaim: false }
await writeFile(path.join(import.meta.dir, "av11-source-binding-probe.json"), JSON.stringify(result, null, 2) + "\n", { flag: "wx", encoding: "utf8" })
console.log(JSON.stringify({ originalDuplicateNames: before, currentDuplicateDiagnostics: result.currentDuplicateDiagnostics, otherDiagnosticCount: result.otherCurrentDiagnostics.length, providerCalls: 0, targetExecutions: 0 }))
