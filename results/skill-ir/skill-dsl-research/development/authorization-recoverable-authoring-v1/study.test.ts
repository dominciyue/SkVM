import { expect, test } from "bun:test"
import { admitPurpose, positionOptions } from "./study.ts"

test("a quarantined historical unknown is local to its old attempt", () => {
  const observation = { terminal: "unknown", localExecution: "closed", reconciliation: "unavailable", channel: "available", nextPurpose: "independent-task", independentAuthorized: true } as const
  expect(admitPurpose([], observation).allowNewTurn).toBe(true)
  expect(admitPurpose([{ status: "running" }], observation).allowNewTurn).toBe(false)
  expect(admitPurpose([{ quotaOrAuth: true }], observation).action).toBe("pause-channel")
  expect(admitPurpose([{ transportFailure: true }, { transportFailure: true }], observation).action).toBe("pause-channel")
})
test("fresh author has no prior or reference program and pair order uses matching facts", () => {
  expect(positionOptions("A0")).toEqual({ author: true, baseline: false, variant: "root-default" })
  expect(positionOptions("C0").variant).toBe(positionOptions("B0").variant)
  expect(positionOptions("C1").variant).toBe(positionOptions("B1").variant)
  expect(positionOptions("C2").variant).toBe("denied")
  expect(() => positionOptions("R0")).toThrow()
})
