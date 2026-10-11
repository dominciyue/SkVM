import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createInquiryTools } from "./inquiry-tools.ts"
import { planInquiryReuse } from "./inquiry-reuse.ts"

test("question workflow restores R0 evidence without a checked property or any R1 meaning", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "be-r0-")); await writeFile(path.join(sourceRoot, "app.py"), "def entry(actor):\n    return actor\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "anonymous", sourceRef: "r", allowedPaths: ["app.py"], structure: true })
  await tools.execute("source_read", { path: "app.py", startLine: 1, endLine: 2 })
  const input: any = { schemaVersion: "authorization-inquiry-input/v1", taskId: "t", repository: "anonymous", sourceRef: "r", sourceRoot: ".", allowedPaths: ["app.py"], inquiry: { schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect app.entry", premises: [] }] } }
  const prior: any = { status: "completed", sourceFiles: tools.files, evidence: tools.evidence, sourceVerification: { valid: true }, final: { oldAnswer: "MUST_NEVER_RESTORE" }, domain: { closed: true } }
  const options: any = { currentInput: input, previousInput: input, previousRun: prior, previousSessionId: "previous", currentFiles: tools.files, currentStructure: tools.structure, currentMethod: "D1", previousMethod: "D1", currentStrategy: "question-checked-v1", previousStrategy: "question-checked-v1", currentModel: "gpt-5.6-sol", previousModel: "gpt-5.6-sol" }
  const plan: any = planInquiryReuse(options)
  expect(plan.status).toBe("reusable")
  expect(plan.info.layers.R0.available).toBe(true); expect(plan.info.layers.R1.available).toBe(false); expect(plan.info.layers.R2.available).toBe(false)
  expect(plan.seed.evidence).toHaveLength(1); expect(plan.seed.delta.rules).toEqual([])
  expect(JSON.stringify(plan.seed)).not.toContain("MUST_NEVER_RESTORE")
  const changed = structuredClone(input); changed.inquiry.questions[0].premises = [{ text: "actor is absent", origin: "user" }]
  expect(planInquiryReuse({ ...options, currentInput: changed }).status).toBe("reusable")
  expect(planInquiryReuse({ ...options, previousRun: { ...prior, status: "completion-unknown" } }).status).toBe("needs-fresh-analysis")
})
