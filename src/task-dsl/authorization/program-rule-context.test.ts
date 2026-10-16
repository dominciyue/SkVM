import { expect, test } from "bun:test"
import { createProgramRulesContext } from "./program-rule-context.ts"
test("rules details retain malformed raw workflow with diagnostics instead of crashing", async () => {
  const rules = createProgramRulesContext({ files: [], evidence: [], snapshotVerification: { valid: true } } as any)
  const raw = { id: "partial", resourceWorkflow: { steps: { unsupported: "draft" } } }
  await rules.import(raw)
  const detail = await rules.details({ view: "draft", format: "raw" })
  expect(detail).toHaveProperty("raw", raw)
  expect(detail).toHaveProperty("steps", [])
  expect((detail as any).diagnostics.length).toBeGreaterThan(0)
  expect(await rules.details({ trialCaseId: "injected" })).toMatchObject({ status: "capability-unavailable" })
})
