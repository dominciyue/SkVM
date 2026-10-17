import { expect, test } from "bun:test"
const panel: any = await import("./panel.ts").catch(() => ({}))
test("quality epoch identity retains working source diff and common experimental binding", async () => {
  const study: any = await import("./study.ts")
  expect(typeof study.qualityPairIdentity).toBe("function")
  const row = { model: "m", effort: "high", inputSha256: "input", limits: { max: 64 }, binding: { source: "s", skill: "k", accountBoundary: "a" }, codeEpoch: { sourceTree: "tree", sourceDiffSha256: "clean" } }
  expect(study.qualityPairIdentity(row)).toBe(study.qualityPairIdentity({ ...row, position: "different-arm" }))
  expect(study.qualityPairIdentity(row)).not.toBe(study.qualityPairIdentity({ ...row, codeEpoch: { ...row.codeEpoch, sourceDiffSha256: "changed" } }))
  expect(study.qualityPairIdentity(row)).not.toBe(study.qualityPairIdentity({ ...row, inputSha256: "other" }))
  expect(study.qualityPairIdentity({ ...row, codeEpoch: {} })).toBeUndefined()
})
test("partial archive verification binds retained bytes and readonly terminal without inventing complete persistence", async () => {
  const study: any = await import("./study.ts")
  expect(typeof study.verifyPartialArchive).toBe("function")
  const bytes = "retained lifecycle", entry = { status: "unknown", terminalStatus: "completion-unknown", lifecycle: { persistence: "partial", localExecution: "closed", threadId: "thread", turnId: "turn" }, reconciliation: { lifecycleSha256: study.hash(bytes), terminalStatus: "interrupted", finalUsageUnknown: true } }
  const evidence = { status: "terminal-found", terminalStatus: "interrupted", threadId: "thread", turnId: "turn", events: [{ direction: "client", method: "thread/read" }, { direction: "server", result: { thread: { id: "thread", turns: [{ id: "turn", status: "interrupted" }] } } }] }
  expect(study.verifyPartialArchive(entry, bytes, evidence)).toMatchObject({ completeArchive: false, retainedLifecycleVerified: true, reconciledTerminal: "interrupted", finalUsageUnknown: true })
  expect(() => study.verifyPartialArchive(entry, bytes + "changed", evidence)).toThrow("digest")
  expect(() => study.verifyPartialArchive(entry, bytes, { ...evidence, turnId: "other" })).toThrow("identity")
  expect(() => study.verifyPartialArchive(entry, bytes, { ...evidence, events: [] })).toThrow("terminal")
  expect(() => study.verifyPartialArchive({ ...entry, lifecycle: { ...entry.lifecycle, localExecution: "active" } }, bytes, evidence)).toThrow("closed")
})
test("registered implementation transition retains input binding but cannot claim same-epoch pairing", async () => {
  const study: any = await import("./study.ts")
  expect(typeof study.verifyRegisteredPairBinding).toBe("function")
  const old = { model: "model", effort: "high", inputSha256: "input", limits: { max: 64 }, binding: { source: "source" }, codeEpoch: { sourceTree: "old", sourceDiffSha256: "clean" } }
  const current = { ...old, codeEpoch: { sourceTree: "new", sourceDiffSha256: "clean" } }
  const transition = { fromSourceTree: "old", toSourceTree: "new", reason: "Inspected exact CLI version", evidence: "verification/cli-protocol-review.json" }
  expect(() => study.verifyRegisteredPairBinding(old, current, [])).toThrow("unregistered")
  expect(study.verifyRegisteredPairBinding(old, current, [transition])).toMatchObject({ sameEpoch: false, causalComparisonEligible: false })
  expect(() => study.verifyRegisteredPairBinding(old, { ...current, inputSha256: "other" }, [transition])).toThrow("inputSha256")
  expect(() => study.verifyRegisteredPairBinding(old, { ...current, codeEpoch: { sourceTree: "new", sourceDiffSha256: "dirty" } }, [transition])).toThrow("sourceDiffSha256")
  expect(study.verifyRegisteredPairBinding(current, current, [])).toMatchObject({ sameEpoch: true, causalComparisonEligible: true })
})
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
  row.wholeAnswer = "full"
  expect(() => panel.validateReview(row)).toThrow("whole")
  row.wholeAnswer = "incorrect"
  row.facts[0].label = "undelivered"
  expect(() => panel.validateReview(row)).toThrow("delivery")
  row.facts[0].label = "correct"
  row.facts[0].evidence = ""
  expect(() => panel.validateReview(row)).toThrow("evidence")
})
test("cross-epoch primary rows remain in denominator but cannot create paired quality evidence", () => {
  const rows = panel.panelOrder.map((position: string) => ({ position, delivery: "undelivered", facts: panel.rubric.facts.map((f: any) => ({ id: f.id, label: "undelivered", evidence: "No answer" })), questions: ["partial", "partial", "partial", "partial"], wholeAnswer: "partial", answer: `${position}.txt` }))
  const epochs = Object.fromEntries(panel.panelOrder.map((p: string) => [p, "new"]))
  epochs["Q0-R1-0"] = "old"
  const summary = panel.summarizeQuality(rows, epochs), comparison = summary.domains["object-relations"].comparisons["R2-R1"]
  expect(summary.primaryDenominator).toBe(36)
  expect(summary.rows).toHaveLength(36)
  expect(comparison.unpaired).toBe(1)
  expect(comparison.pairs[0]).toMatchObject({ result: "unpaired", reason: "implementation-epoch-mismatch", descriptiveResult: "tie" })
  expect(comparison.repeats[0]).toMatchObject({ plannedPairs: 6, eligiblePairs: 5 })
  expect(summary.domains["object-relations"].qualityEvidenceStatus).toBe("incomplete-pairing")
  expect(summary.localQualityGoalAchieved).toBe(false)
})
