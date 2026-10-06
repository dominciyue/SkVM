import { expect, test } from "bun:test"
import { runtimePlan } from "./study.ts"

test("account study uses one fixed original task and distinguishes native quality arms", () => {
  expect(runtimePlan({ id: "native-cloudflare-download-original", kind: "native", task: "download" })).toMatchObject({ method: "M", domainTools: true, strategy: "operation-evidence-v4", inputName: "paperless-download-original.json" })
  expect(runtimePlan({ id: "quality-owui-N", kind: "quality", task: "owui" })).toMatchObject({ domainTools: false, strategy: "legacy", inputName: "owui-ingestion-original.json" })
  expect(runtimePlan({ id: "quality-owui-D-S", kind: "quality", task: "owui" })).toMatchObject({ method: "D1", domainTools: true, strategy: "operation-evidence-v4" })
  expect(() => runtimePlan({ id: "../evaluator", kind: "native", task: "other" })).toThrow()
})
