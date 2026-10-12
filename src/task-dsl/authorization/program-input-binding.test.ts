import { expect, test } from "bun:test"
const api = await import("./program-input-binding.ts").catch(() => ({} as any))
const program = { questions: [{ id: "semantic", premises: [{ text: "Only this question's premise" }] }, { id: "data" }, { id: "elsewhere" }], operationQuestions: [{ questionId: "semantic", operationId: "local" }, { questionId: "data", operationId: "local" }, { questionId: "elsewhere", operationId: "other" }], policy: { text: "Independent policy" } }
const inputs = { resourceInputs: { semantic: { actor: 1 }, data: { actor: 9, rows: [] }, elsewhere: { actor: 20 } }, externalAssumptions: { data: [{ name: "store", arguments: { key: 9 }, value: true, reason: "Given current scenario" }] } }
const raw = (binding?: unknown) => ({ scope: { questionId: "semantic" }, ...(binding === undefined ? {} : { inputBinding: binding }) })
test("default uses the exact semantic question and explicit binding uses only same-operation data", () => {
  expect(typeof api.resolveProgramInputBinding).toBe("function")
  const before = structuredClone({ program, inputs })
  const same = api.resolveProgramInputBinding(raw(), program, inputs)
  expect(same.origin).toBe("scope-default")
  expect(same.inputQuestionId).toBe("semantic")
  expect(same.resourceInputs).toEqual({ actor: 1 })
  const selected = api.resolveProgramInputBinding(raw({ questionId: "data" }), program, inputs)
  expect(selected.scopeQuestionId).toBe("semantic")
  expect(selected.inputQuestionId).toBe("data")
  expect(selected.resourceInputs).toEqual({ actor: 9, rows: [] })
  expect(selected.externalAssumptions).toEqual(inputs.externalAssumptions.data)
  expect(selected.diagnostics).toEqual([])
  expect(selected).not.toHaveProperty("policy")
  expect(selected).not.toHaveProperty("premises")
  expect({ program, inputs }).toEqual(before)
})
test("invalid identities and cross-operation or ambiguous mapping never inject facts", () => {
  for (const [binding, current, code] of [
    [{ questionId: "missing" }, program, "program-input-question-missing"],
    [{ questionId: "elsewhere" }, program, "program-input-operation-mismatch"],
    [{ questionId: "data" }, { ...program, operationQuestions: [] }, "program-input-operation-missing"],
    [{ questionId: "data" }, { ...program, operationQuestions: [...program.operationQuestions, { questionId: "data", operationId: "other" }] }, "program-input-operation-ambiguous"],
  ] as const) {
    const r = api.resolveProgramInputBinding(raw(binding), current, inputs)
    expect(r.diagnostics[0].code).toBe(code)
    expect(r.resourceInputs).toEqual({})
    expect(r.externalAssumptions).toEqual([])
  }
  expect(api.resolveProgramInputBinding({ ...raw({ questionId: "data" }), scope: { questionId: "semantic", operationId: "wrong" } }, program, inputs).diagnostics[0].code).toBe("program-input-operation-mismatch")
})
test("empty and external-only datasets exist and absent defaults do not pick among candidates", () => {
  const empty = api.resolveProgramInputBinding(raw({ questionId: "data" }), program, { resourceInputs: { data: {} } })
  expect(empty.datasetPresent).toBe(true)
  expect(empty.diagnostics).toEqual([])
  const external = api.resolveProgramInputBinding(raw({ questionId: "data" }), program, { externalAssumptions: inputs.externalAssumptions })
  expect(external.datasetPresent).toBe(true)
  expect(external.resourceInputs).toEqual({})
  expect(external.externalAssumptions).toEqual(inputs.externalAssumptions.data)
  const absent = api.resolveProgramInputBinding(raw(), program, { resourceInputs: { data: {}, elsewhere: {} } })
  expect(absent.inputQuestionId).toBe("semantic")
  expect(absent.datasetPresent).toBe(false)
  expect(absent.diagnostics[0].code).toBe("program-input-dataset-missing")
  expect(absent.resourceInputs).toEqual({})
})
