import { describe, expect, test } from "bun:test"
import {
  classifyI18nReportAuthority,
  publicOutputShapeSignature,
  resolvePublicOutputAbiModulePath,
  validateDeclaredPublicOutputAbi,
} from "./public-output-abi-authority-audit.ts"

describe("public output ABI post-run authority audit", () => {
  test("classifies source-order keys as a hidden-order false reject", () => {
    expect(classifyI18nReportAuthority({
      abiStatus: "pass",
      reportCriterionFailed: true,
      report: {
        framework: "react-i18next",
        scannedFiles: ["src/App.tsx"],
        extractedKeys: ["home.welcome", "home.save"],
        missingKeys: { "zh-CN": [], "en-US": [] },
      },
      derivedKeys: ["home.save", "home.welcome"],
    })).toEqual({
      status: "representation-false-reject",
      reason: "array-order-undeclared",
    })
  })

  test("does not relabel semantic mismatch or missing output as representation failure", () => {
    expect(classifyI18nReportAuthority({
      abiStatus: "pass",
      reportCriterionFailed: true,
      report: {
        framework: "react-i18next",
        scannedFiles: [],
        extractedKeys: ["wrong.key"],
        missingKeys: { "zh-CN": [], "en-US": [] },
      },
      derivedKeys: ["home.save"],
    })).toEqual({ status: "semantic-failure" })
    expect(classifyI18nReportAuthority({
      abiStatus: "missing",
      reportCriterionFailed: true,
    })).toEqual({ status: "missing-output" })
  })

  test("emits value-free, stable recursive shape signatures", () => {
    expect(publicOutputShapeSignature({
      missingKeys: { "zh-CN": [], "en-US": [] },
      extractedKeys: ["private.value"],
    })).toBe("object{extractedKeys:array<string>,missingKeys:object{en-US:array<empty>,zh-CN:array<empty>}}")
  })

  test("dispatches ABI v2 and preserves set-like report order", () => {
    const abi = {
      schemaVersion: "skill-ir-public-output-abi/v2",
      additionalProperties: false,
      fields: {
        extractedKeys: {
          required: true,
          schema: {
            type: "array",
            nullable: false,
            order: "set-like",
            duplicates: "forbid",
            items: { type: "string", nullable: false },
          },
        },
      },
    }
    expect(validateDeclaredPublicOutputAbi(abi, {
      extractedKeys: ["home.welcome", "home.save"],
    })).toEqual({ status: "pass", issues: [] })
    expect(resolvePublicOutputAbiModulePath(abi)).toBe("src/bench/public-output-abi-v2.ts")
  })
})
