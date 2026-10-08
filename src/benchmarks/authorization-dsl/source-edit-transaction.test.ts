import { expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createNativeInquiryRuntime } from "./inquiry-native.ts"

test("v6 finishes the current source transaction before automatic peripheral expansion", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ba-transaction-")); await mkdir(path.join(root, "source"))
  await writeFile(path.join(root, "source/app.py"), `class Noise:\n    def validate(self):\n        return True\n\ndef helper():\n    return False\n\nclass Extra:\n    pass\n\n@unknown_decorator(schema=Noise(), other=Extra())\nclass View:\n    def entry(self):\n        return helper()\n`)
  const inputFile = path.join(root, "input.json")
  await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "t", repository: "anonymous", sourceRef: "r", sourceRoot: "source", allowedPaths: ["app.py"], inquiry: { schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect app.View.entry and its actual helper", entryHint: "app.View.entry", premises: [] }] } }))
  const runtime = await createNativeInquiryRuntime({ inputFile, workDir: root, domainTools: true, method: "M", strategy: "operation-evidence-v6", maxToolCalls: 24 })
  try {
    let context: any = await runtime.accountContext()
    expect(context.focus.stage).toBe("interpret")
    expect(runtime.report().domain!.schedulerActions).toHaveLength(1)
    const before = runtime.report().toolBudget.totalUsed
    context = await runtime.accountContext()
    expect(runtime.report().toolBudget.totalUsed).toBe(before)
    const task = context.tasks[0], returned = task.sourceSkeleton.anchors.find((a: any) => a.kind === "return"), call = task.sourceSkeleton.anchors.find((a: any) => a.kind === "call")
    const edits = [{ anchorId: returned.id, field: "role", value: "context" }, { anchorId: returned.id, field: "explanation", value: "Returns actual helper value" }, { anchorId: returned.id, field: "returnOutcome", value: "unknown" }, { anchorId: call.id, field: "role", value: "condition" }, { anchorId: call.id, field: "explanation", value: "The actual helper determines the returned value" }]
    await runtime.execute({ id: "edit-entry", name: "authorization_observe", arguments: { controlDelta: { ...task.sourceEdit.template, edits } } })
    context = await runtime.accountContext()
    expect(runtime.report().domain!.sourceWorkMetrics!.acceptedSourceUnits).toBe(1)
    expect(context.tasks[0].sourceIdentity.startLine).toBe(5)
    expect(runtime.report().domain!.worklist!.frameworkBoundaries!.some(d => d.symbol.includes("class-decorator") || d.key.includes("class-decorator"))).toBe(true)
    const after = runtime.report().toolBudget.totalUsed
    await runtime.accountContext()
    expect(runtime.report().toolBudget.totalUsed).toBe(after)
    const entry = runtime.report().domain!.semantic!.units.find(u => u.role === "entry")!
    await runtime.execute({ id: "revisit-entry", name: "authorization_observe", arguments: { controlDelta: { schemaVersion: "authorization-focused-update/v1", kind: "defer", focusId: context.focus.id, revisit: entry.handle, reason: "Recheck the current source call meaning" } } })
    const revisiting = runtime.report().toolBudget.totalUsed
    await runtime.accountContext()
    expect(runtime.report().toolBudget.totalUsed).toBe(revisiting)
  } finally { await runtime.close() }
})
