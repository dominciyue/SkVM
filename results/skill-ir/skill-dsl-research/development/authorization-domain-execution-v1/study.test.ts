import { expect, test } from "bun:test"
const study = await import("./study.ts").catch(() => ({} as any))
const evaluation = await import("./evaluate.ts").catch(() => ({} as any))

test("fixed AQ panel keeps all 48 denominators, rotates arms and reverses preselected repeats", () => {
  expect(typeof study.plannedRows).toBe("function")
  const rows = study.plannedRows()
  expect(rows).toHaveLength(48)
  expect(new Set(rows.map((r: any) => r.id)).size).toBe(48)
  expect(rows.filter((r: any) => r.kind === "quality")).toHaveLength(40)
  expect(rows.filter((r: any) => r.kind === "ablation")).toHaveLength(4)
  expect(rows.filter((r: any) => r.kind === "native")).toHaveLength(4)
  for (const task of ["owui-ingestion", "paperless-notes"]) {
    const base = rows.filter((r: any) => r.kind === "quality" && r.task === task && !r.repeat).map((r: any) => r.arm)
    expect(rows.filter((r: any) => r.kind === "quality" && r.task === task && r.repeat).map((r: any) => r.arm)).toEqual([...base].reverse())
  }
  expect(rows.filter((r: any) => r.kind === "ablation").every((r: any) => r.method === "D1" && r.strategy === "domain-evidence-v1")).toBe(true)
  expect(study.budgets).toMatchObject({ maxDispatches: 12, maxToolCalls: 24, maxConcurrency: 2, maxDisplayBytes: 262144, maxTokens: 6000 })
})
test("claims and unknown completion cannot silently create new paid attempts; protocol misses are not infrastructure failures", () => {
  expect(typeof study.rowDisposition).toBe("function")
  expect(study.rowDisposition(undefined, true)).toMatchObject({ state: "completion-unknown", terminal: false, canDispatch: false })
  expect(study.rowDisposition(undefined, false)).toMatchObject({ state: "undispatched", canDispatch: true })
  expect(study.rowDisposition({ status: "timeout-unknown" }, true)).toMatchObject({ terminal: true, canDispatch: false })
  expect(study.isInfrastructureFailure({ status: "transport-failed", attempts: [{ status: "protocol-error", error: { name: "StructuredExtractionError", message: "missing-tool-call" } }] })).toBe(false)
  expect(study.isInfrastructureFailure({ status: "transport-failed", attempts: [{ status: "error", error: { name: "ProviderNetworkError", message: "connection reset" } }] })).toBe(true)
  expect(study.isInfrastructureFailure({ status: "completed-with-diagnostics" })).toBe(false)
})
test("anonymous review packet hides arm/cost/oracle, preserves raw first/final and separates extraction meaning", () => {
  expect(typeof evaluation.makePacket).toBe("function")
  const packet = evaluation.makePacket("anonymous-1", { brief: "Current natural question", policy: { text: "Current policy" } }, { status: "completed-with-diagnostics", row: { arm: "D-E" }, telemetry: { totalActualUsd: 10 }, initial: { raw: "wrong first" }, final: { raw: "revised final" }, result: undefined, domain: { checkHistory: [{ slice: { rules: [{ key: "r", claim: "Model extraction" }] }, check: { diagnostics: [{ code: "conflict" }] } }], slice: { rules: [] } }, evidence: [{ id: "ev", path: "entry.ts", text: "source" }] })
  expect(packet.initial).toEqual({ raw: "wrong first" })
  expect(packet.final).toEqual({ raw: "revised final" })
  expect(packet.extractionInitial.rules[0].claim).toBe("Model extraction")
  const text = JSON.stringify(packet)
  expect(text).not.toContain('"arm"')
  expect(text).not.toContain("totalActualUsd")
  expect(text).not.toContain("oracle")
})
