import { describe, expect, test } from "bun:test"
import {
  PublicOutputAbiV2Schema,
  publicOutputRecordsEquivalent,
  validatePublicOutputRecordV2,
} from "./public-output-abi-v2.ts"
import type { PublicOutputAbiV2 } from "./public-output-abi-v2.ts"

const abi: PublicOutputAbiV2 = {
  schemaVersion: "skill-ir-public-output-abi/v2",
  additionalProperties: false,
  fields: {
    scannedFiles: {
      required: true,
      schema: {
        type: "array",
        nullable: false,
        order: "ordered",
        duplicates: "forbid",
        items: { type: "string", nullable: false },
      },
    },
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
    observations: {
      required: true,
      schema: {
        type: "array",
        nullable: false,
        order: "set-like",
        duplicates: "allow",
        items: { type: "string", nullable: false },
      },
    },
  },
}

describe("public output ABI v2 array semantics", () => {
  test("requires explicit order and duplicate policies", () => {
    expect(PublicOutputAbiV2Schema.parse(abi)).toEqual(abi)
    expect(() => PublicOutputAbiV2Schema.parse({
      ...abi,
      fields: {
        extractedKeys: {
          required: true,
          schema: {
            type: "array",
            nullable: false,
            uniqueItems: true,
            items: { type: "string", nullable: false },
          },
        },
      },
    })).toThrow()
  })

  test("validates duplicate policy independently from order semantics", () => {
    expect(validatePublicOutputRecordV2(abi, {
      scannedFiles: ["src/App.tsx"],
      extractedKeys: ["home.welcome", "home.save"],
      observations: ["same", "same"],
    })).toEqual({ status: "pass", issues: [] })

    expect(validatePublicOutputRecordV2(abi, {
      scannedFiles: ["src/App.tsx"],
      extractedKeys: ["home.save", "home.save"],
      observations: [],
    })).toEqual({
      status: "fail",
      issues: [{ code: "DUPLICATE_ARRAY_ITEM", path: "/extractedKeys/1" }],
    })
  })

  test("compares ordered arrays by position and set-like arrays by declared semantics", () => {
    const expected = {
      scannedFiles: ["src/App.tsx", "src/Panel.tsx"],
      extractedKeys: ["home.save", "home.welcome"],
      observations: ["a", "a", "b"],
    }
    expect(publicOutputRecordsEquivalent(abi, expected, {
      scannedFiles: ["src/App.tsx", "src/Panel.tsx"],
      extractedKeys: ["home.welcome", "home.save"],
      observations: ["b", "a", "a"],
    })).toBe(true)
    expect(publicOutputRecordsEquivalent(abi, expected, {
      scannedFiles: ["src/Panel.tsx", "src/App.tsx"],
      extractedKeys: ["home.welcome", "home.save"],
      observations: ["b", "a", "a"],
    })).toBe(false)
    expect(publicOutputRecordsEquivalent(abi, expected, {
      scannedFiles: ["src/App.tsx", "src/Panel.tsx"],
      extractedKeys: ["home.welcome", "home.save"],
      observations: ["a", "b"],
    })).toBe(false)
  })
})
