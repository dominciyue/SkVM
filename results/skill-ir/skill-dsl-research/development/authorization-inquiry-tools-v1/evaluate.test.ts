import { test, expect } from "bun:test"
import { fullQuality, bindReview, packetDigest } from "./evaluate.ts"
test("quality is semantic criteria, no method or textual keyword score", () => {
  const criteria = { behavior: "correct", scenarios: "complete", evidence: "supported", bindings: "correct", unknowns: "appropriate", policy: "not-applicable" }
  expect(fullQuality(criteria)).toBe(true)
  expect(fullQuality({ ...criteria, evidence: "unsupported" })).toBe(false)
  expect(fullQuality({ ...criteria, policy: "incorrect" })).toBe(false)
})
test("review binds the exact anonymous packet and cannot transfer to a changed artifact", () => {
  const packet = { sampleId: "sample-one", candidate: "Deny", kind: "analysis" }
  const review = { sampleId: packet.sampleId, packetSha256: packetDigest(packet), reviewer: "development-agent", criteria: { behavior: "correct", scenarios: "complete", evidence: "supported", bindings: "correct", unknowns: "not-needed", policy: "correct" }, issues: [], sourceSupport: [], rationale: "The cited branch denies this caller." }
  expect(bindReview(packet, review).sampleId).toBe(packet.sampleId)
  expect(() => bindReview({ ...packet, candidate: "Allow" }, review)).toThrow("identity")
})
