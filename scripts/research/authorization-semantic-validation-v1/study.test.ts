import { expect, test } from "bun:test"
import { admit, optionsFor } from "./study.ts"
test("BT queue preserves common inputs and identical RR/RE reference bytes, with separate automatic provenance", () => {
  for (const t of ["M", "G"]) {
    expect(optionsFor(`RR-${t}`).domainProgramFile).toBe(optionsFor(`RE-${t}`).domainProgramFile)
    expect(optionsFor(`AE-${t}`).domainProgramFile).not.toBe(optionsFor(`RE-${t}`).domainProgramFile)
    expect(optionsFor(`N-${t}`).inputFile).toBe(optionsFor(`RE-${t}`).inputFile)
    expect(optionsFor(`A-${t}`).domainProgramFile).toContain(`${t}-initial.json`)
  }
})
test("BT dispatch refuses unknown, out-of-order and unregistered repairs", () => {
  expect(() => admit([], "N-M", "first", [])).toThrow("registered-order")
  expect(() => admit([{ position: "A-M", status: "unknown", lifecycle: { localExecution: "unknown" } }], "A-G", "first", [])).toThrow("active-unknown")
  const closed = [{ position: "A-M", status: "completed", attempt: "first", lifecycle: { localExecution: "closed" } }]
  expect(() => admit(closed, "A-M", "repair", [])).toThrow("named-confirmation")
  expect(() => admit(closed, "A-G", "first", [])).not.toThrow()
})
