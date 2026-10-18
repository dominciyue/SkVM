import { expect, test } from "bun:test"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { createNativeInquiryRuntime } from "../../../../../src/benchmarks/authorization-dsl/inquiry-native.ts"
import { PROGRAM_RULES_INSTRUCTION } from "../../../../../src/task-dsl/authorization/program-rule-context.ts"

test("rules edit carries the author duty and requested reusable target from the native entry", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "bp-rule-duty-"))
  try {
    const inputFile = path.join(root, "input.json")
    await writeFile(path.join(root, "app.py"), "def work():\n    return 7\n")
    await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "duty", repository: "anonymous", sourceRef: "fixed", sourceRoot: ".", allowedPaths: ["app.py"], inquiry: { schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Explain the source result", premises: [] }] } }))
    const runtime = await createNativeInquiryRuntime({ inputFile, workDir: root, domainTools: true, strategy: "question-checked-v1", method: "D1", programSupport: "rules", programMode: "edit", programContext: "directed", authoringTargetMode: "reusable" })
    try {
      const context: any = await runtime.accountContext()
      expect(runtime.system).toContain("A prose-only investigation does not fulfill edit mode")
      expect(context.instruction).toContain("A prose-only investigation does not fulfill edit mode")
      expect(context.authoring.goal).toContain("source-supported")
      expect(context.authoring.target.mode).toBe("reusable")
      expect(context.authoring.target.coverageStatus).toBe("undeclared")
      expect(context.authoring.target.instruction).toContain("varying inputs")
      expect(JSON.stringify(context)).not.toContain("authorization_program_trial")
      expect(runtime.definitions.some(t => t.name === "authorization_program_trial")).toBe(false)
      expect(runtime.report().domain?.executableContract).toBeUndefined()
    } finally { await runtime.close() }
    const consumer = await createNativeInquiryRuntime({ inputFile, workDir: root, domainTools: true, strategy: "question-checked-v1", method: "D1", programSupport: "rules", programMode: "consume", programContext: "directed", authoringTargetMode: "reusable" })
    try {
      const context: any = await consumer.accountContext()
      expect(context.authoring).toBeUndefined()
      expect(context.instruction).toBe(PROGRAM_RULES_INSTRUCTION)
      expect(consumer.system).not.toContain("A prose-only investigation does not fulfill edit mode")
    } finally { await consumer.close() }
  } finally { await rm(root, { recursive: true, force: true }) }
})
