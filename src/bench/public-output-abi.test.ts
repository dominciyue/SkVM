import { describe, expect, test } from "bun:test"
import {
  PublicOutputAbiSchema,
  validatePublicOutputRecord,
} from "./public-output-abi.ts"
import type { PublicOutputAbi } from "./public-output-abi.ts"

const lawAbi: PublicOutputAbi = {
  schemaVersion: "skill-ir-public-output-abi/v1",
  additionalProperties: false,
  fields: {
    inputPath: {
      required: true,
      schema: { type: "string", nullable: false, enum: ["document.txt"] },
    },
    documentClass: {
      required: true,
      schema: { type: "string", nullable: false, enum: ["law", "non-law"] },
    },
    deliverablePath: {
      required: true,
      schema: {
        type: "string",
        nullable: true,
        enum: ["markdown/document/document+最终成果.md"],
      },
    },
  },
}

const i18nAbi: PublicOutputAbi = {
  schemaVersion: "skill-ir-public-output-abi/v1",
  additionalProperties: false,
  fields: {
    framework: {
      required: true,
      schema: { type: "string", nullable: false, enum: ["react-i18next"] },
    },
    scannedFiles: {
      required: true,
      schema: {
        type: "array",
        nullable: false,
        uniqueItems: true,
        items: { type: "string", nullable: false },
      },
    },
    extractedKeys: {
      required: true,
      schema: {
        type: "array",
        nullable: false,
        uniqueItems: true,
        items: { type: "string", nullable: false },
      },
    },
    missingKeys: {
      required: true,
      schema: {
        type: "object",
        nullable: false,
        additionalProperties: false,
        fields: {
          "zh-CN": {
            required: true,
            schema: {
              type: "array",
              nullable: false,
              uniqueItems: true,
              items: { type: "string", nullable: false },
            },
          },
          "en-US": {
            required: true,
            schema: {
              type: "array",
              nullable: false,
              uniqueItems: true,
              items: { type: "string", nullable: false },
            },
          },
        },
      },
    },
  },
}

describe("public output ABI", () => {
  test("parses recursive field schemas for two unrelated skill phenotypes", () => {
    expect(PublicOutputAbiSchema.parse(lawAbi)).toEqual(lawAbi)
    expect(PublicOutputAbiSchema.parse(i18nAbi)).toEqual(i18nAbi)
  })

  test("validates Law nullable paths and i18n locale-keyed missing arrays", () => {
    expect(validatePublicOutputRecord(lawAbi, {
      inputPath: "document.txt",
      documentClass: "law",
      deliverablePath: "markdown/document/document+最终成果.md",
    })).toEqual({ status: "pass", issues: [] })
    expect(validatePublicOutputRecord(lawAbi, {
      inputPath: "document.txt",
      documentClass: "non-law",
      deliverablePath: null,
    })).toEqual({ status: "pass", issues: [] })
    expect(validatePublicOutputRecord(i18nAbi, {
      framework: "react-i18next",
      scannedFiles: ["src/App.tsx"],
      extractedKeys: ["home.save", "home.welcome"],
      missingKeys: { "zh-CN": [], "en-US": [] },
    })).toEqual({ status: "pass", issues: [] })
  })

  test("reports stable paths for missing, extra, type, enum, and duplicate failures", () => {
    const result = validatePublicOutputRecord(i18nAbi, {
      framework: "other",
      scannedFiles: ["src/App.tsx", "src/App.tsx"],
      missingKeys: { "zh-CN": "none", extra: [] },
      privateGold: true,
    })
    expect(result.status).toBe("fail")
    expect(result.issues).toEqual([
      { code: "ENUM_MISMATCH", path: "/framework" },
      { code: "DUPLICATE_ARRAY_ITEM", path: "/scannedFiles/1" },
      { code: "MISSING_REQUIRED_FIELD", path: "/extractedKeys" },
      { code: "TYPE_MISMATCH", path: "/missingKeys/zh-CN" },
      { code: "MISSING_REQUIRED_FIELD", path: "/missingKeys/en-US" },
      { code: "UNDECLARED_FIELD", path: "/missingKeys/extra" },
      { code: "UNDECLARED_FIELD", path: "/privateGold" },
    ])
  })

  test("rejects field-name-only and ambiguous object contracts", () => {
    expect(() => PublicOutputAbiSchema.parse({
      schemaVersion: "skill-ir-public-output-abi/v1",
      fields: ["framework", "missingKeys"],
    })).toThrow()
    expect(() => PublicOutputAbiSchema.parse({
      schemaVersion: "skill-ir-public-output-abi/v1",
      additionalProperties: false,
      fields: {
        missingKeys: {
          required: true,
          schema: { type: "object", nullable: false, fields: {} },
        },
      },
    })).toThrow()
  })
})
