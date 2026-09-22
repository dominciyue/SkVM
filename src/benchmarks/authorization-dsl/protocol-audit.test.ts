import { expect, it } from "bun:test"
import { AuthorizationWireResultV3Schema } from "../../task-dsl/authorization/transport.ts"
import { auditAuthorizationProtocol } from "./protocol-audit.ts"

it("replays all six retained C first answers under the unchanged v3 schema and captures the real extraction schema", async () => {
  const audit = await auditAuthorizationProtocol()
  expect(audit.units).toHaveLength(6)
  expect(audit.units.every(unit => !unit.firstSchemaValid && unit.fallbackSchemaValid)).toBe(true)
  expect(audit.totals.failedKnownTokens).toBe(47330)
  expect(audit.totals.fallbackKnownTokens).toBe(62413)
  const schema = audit.modelVisibleToolSchema as any
  expect(schema.properties.results.items.properties.facts.required).toContain("condition")
  expect(schema.properties.conditionAnalysis.type).toBe("object")
  expect(schema.properties.conditionAnalysis.properties.schemaVersion.const).toBe("authorization-condition-analysis-result/v1")
  const valid = audit.syntheticBase as any
  const shapes = [
    (x: any) => { delete x.results[0].facts.condition },
    (x: any) => { x.conditionAnalysis = [] },
    (x: any) => { x.conditionAnalysis.schemaVersion = "source-authorization-assessment-wire/v3" },
    (x: any) => { x.conditionAnalysis.analyses[0].conditionAnalysis = x.conditionAnalysis.analyses[0].branches; delete x.conditionAnalysis.analyses[0].branches },
    (x: any) => { delete x.conditionAnalysis.analyses[0].branches },
    (x: any) => { x.schemaVersion = "source-authorization-assessment-wire/v2" },
  ]
  for (const mutate of shapes) {
    const input = structuredClone(valid); mutate(input)
    expect(AuthorizationWireResultV3Schema.safeParse(input).success).toBe(false)
  }
})
