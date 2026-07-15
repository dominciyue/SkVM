import { describe, expect, test } from "bun:test";
import * as dormantModule from "./classification-evidence";
import {
  ClassificationCandidateSchema,
  ObservedDefinitionSchema,
  ObservedHardcodedSecretSchema,
  ObservedReferenceSchema,
} from "./classification-evidence";

describe("dormant classification evidence", () => {
  test("parses type-level B evidence without accepting file values", () => {
    expect(ObservedDefinitionSchema.parse({
      name: "APP_PORT",
      relativePath: ".env",
    })).toEqual({ name: "APP_PORT", relativePath: ".env" });
    expect(ObservedReferenceSchema.parse({
      name: "APP_PORT",
      relativePath: "src/config.ts",
      symbol: "APP_PORT",
    }).symbol).toBe("APP_PORT");
    expect(ObservedHardcodedSecretSchema.parse({
      relativePath: "src/auth.ts",
      symbol: "INTERNAL_TOKEN",
    }).symbol).toBe("INTERNAL_TOKEN");

    const candidate = ClassificationCandidateSchema.parse({
      value: "APP_PORT",
      evidenceRefs: [{ relativePath: "src/config.ts", symbol: "APP_PORT" }],
      confidence: 0.9,
      disposition: "confirmed",
    });
    expect(candidate.disposition).toBe("confirmed");
    expect(() => ClassificationCandidateSchema.parse({
      ...candidate,
      actualValue: "TEST_ONLY_B_VALUE_CANARY",
    })).toThrow();
  });

  test("exports no B producer, writer, or serializer", () => {
    const runtimeExports = Object.keys(dormantModule).sort();
    expect(runtimeExports).toEqual([
      "ClassificationCandidateSchema",
      "ObservedDefinitionSchema",
      "ObservedHardcodedSecretSchema",
      "ObservedReferenceSchema",
    ]);
    expect(runtimeExports.some((name) => /derive|produce|serialize|write/i.test(name))).toBe(false);
  });
});
