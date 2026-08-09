import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { sha256Bytes } from "./source-fixture.ts"

const rootDir = path.resolve(import.meta.dir, "../../..")

async function readJson(relativePath: string) {
  return JSON.parse(await readFile(path.join(rootDir, relativePath), "utf8")) as Record<string, any>
}

async function verifyBindings(audit: Record<string, any>) {
  for (const file of Object.values(audit.inputs) as Array<{ path: string; sha256: string }>) {
    expect(sha256Bytes(await readFile(path.join(rootDir, file.path)))).toBe(file.sha256)
  }
}

describe("public-contract calibration persisted results", () => {
  test("freezes Law v2 as measurement-invalid despite a complete infrastructure-clean matrix", async () => {
    const gate = await readJson("results/skill-ir/law-to-markdown-v2-public-contract-calibration-v1/gate-report.json")
    const audit = await readJson("results/skill-ir/law-to-markdown-v2-public-contract-calibration-v1/measurement-validity.json")
    await verifyBindings(audit)
    expect(gate).toMatchObject({
      passed: false,
      counts: { observedRows: 8, completePairs: 4, infrastructureFailures: 0, differingPairs: 0 },
      systems: { "no-skill": { meanScore: 0.9 }, original: { meanScore: 0.9 } },
    })
    expect(audit).toMatchObject({
      status: "measurement-invalid",
      numericGatePassed: false,
      scorerAuthority: {
        field: "deliverable",
        publicTypeDeclared: false,
        privateExpectedShape: "boolean",
        observedAlternativeShape: "declared-output-path",
        falseRejectRows: 4,
      },
      interpretation: { baseIrAuditAllowed: false, heldOutAllowed: false, entersMainClaim: false },
    })
  })

  test("freezes i18n as measurement-invalid while retaining only a diagnostic partial signal", async () => {
    const gate = await readJson("results/skill-ir/i18n-helper-public-contract-calibration-v1/gate-report.json")
    const audit = await readJson("results/skill-ir/i18n-helper-public-contract-calibration-v1/measurement-validity.json")
    await verifyBindings(audit)
    expect(gate).toMatchObject({
      passed: true,
      counts: { observedRows: 8, completePairs: 4, infrastructureFailures: 0, differingPairs: 1, positivePairs: 1 },
      systems: { "no-skill": { meanScore: 0.7 }, original: { meanScore: 0.925 } },
    })
    expect(audit).toMatchObject({
      status: "measurement-invalid",
      numericGatePassed: true,
      scorerAuthority: {
        field: "missingKeys",
        publicTypeDeclared: false,
        privateExpectedShape: "empty-array",
        observedAlternativeShape: "locale-keyed-empty-arrays",
        falseRejectRows: 5,
      },
      diagnosticPartialSignal: {
        retained: true,
        positivePairs: 1,
        promotable: false,
      },
      interpretation: { baseIrAuditAllowed: false, heldOutAllowed: false, entersMainClaim: false },
    })
  })
})
