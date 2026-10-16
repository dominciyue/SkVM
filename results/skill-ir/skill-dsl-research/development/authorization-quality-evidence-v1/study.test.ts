import { expect, test } from "bun:test"
const panel: any = await import("./panel.ts").catch(() => ({}))
test("BP oracle treats supplied None constructor as normal completion for values and trace", async () => {
  const { finiteExpectation }: any = await import("./offline.ts")
  expect(typeof finiteExpectation).toBe("function")
  const input = await Bun.file(import.meta.dir + "/inputs/root-default.json").json(), id = Object.keys(input.resourceInputs)[0]!
  input.externalAssumptions[id][0].value = null
  delete input.resourceInputs[id].request.version
  const expected = finiteExpectation(input.resourceInputs[id], input.externalAssumptions[id])
  expect(expected.traceExpected.requiredConditionCalls).toEqual([])
  expect(expected.traceExpected.conditional).toBe(false)
  expect(expected.expected.conditions).toEqual([])
})
test("fixed panel has 45 positions and balanced 36 primary first positions", () => {
  expect(typeof panel.positionOptions).toBe("function")
  expect(panel.positions).toHaveLength(45)
  expect(new Set(panel.positions).size).toBe(45)
  expect(panel.panelOrder.slice(0, 3)).toEqual(["Q0-R0-0", "Q0-R1-0", "Q0-R2-0"])
  for (const arm of ["R0", "R1", "R2"]) expect(panel.panelOrder.filter((p: string) => p.includes(arm))).toHaveLength(12)
  expect(panel.positionOptions("S-R1")).toMatchObject({ author: true, programSupport: "rules" })
  expect(() => panel.positionOptions("Q6-R2-0")).toThrow()
})
test("quality report cannot omit failed answers or a capability domain", () => {
  expect(typeof panel.summarizeQuality).toBe("function")
  const rows = panel.panelOrder.map((position: string) => ({ position, delivery: "undelivered", facts: panel.rubric.facts.map((f: any) => ({ id: f.id, label: "undelivered", evidence: "No answer delivered" })), questions: ["partial", "partial", "partial", "partial"], wholeAnswer: "partial", answer: `${position}.txt` }))
  const summary = panel.summarizeQuality(rows)
  expect(summary.primaryDenominator).toBe(36)
  expect(summary.localQualityGoalAchieved).toBe(false)
  expect(Object.keys(summary.domains)).toHaveLength(4)
  expect(() => panel.summarizeQuality(rows.slice(1))).toThrow("denominator")
  rows[0].facts.pop()
  expect(() => panel.summarizeQuality(rows)).toThrow("fact coverage")
})
test("semantic review labels retain correct object, wrong authorization, omission and bounded unknown separately", () => {
  expect(typeof panel.validateReview).toBe("function")
  const row = { position: "Q0-R0-0", delivery: "delivered", facts: panel.rubric.facts.map((f: any) => ({ id: f.id, label: "omitted", evidence: "Not stated in this answer" })), questions: ["partial", "incorrect", "incorrect", "partial"], wholeAnswer: "incorrect", answer: "anonymous-answer.txt" }
  row.facts[0] = { id: row.facts[0].id, label: "correct", evidence: "Answer: request lookup uses the URL pk; source views.py:1408-1415" }
  row.facts[1] = { id: row.facts[1].id, label: "incorrect", evidence: "Answer: selected version is checked instead of root; contradicted by views.py:1421-1424" }
  row.facts[2] = { id: row.facts[2].id, label: "appropriately-unknown", evidence: "Answer names missing constructor completion and the blocked local continuation" }
  row.facts[3] = { id: row.facts[3].id, label: "over-abstained", evidence: "Answer calls source-visible authorization object unknowable" }
  expect(panel.validateReview(row)).toBe(true)
  row.facts[0].label = "undelivered"
  expect(() => panel.validateReview(row)).toThrow("delivery")
  row.facts[0].label = "correct"
  row.facts[0].evidence = ""
  expect(() => panel.validateReview(row)).toThrow("evidence")
})
