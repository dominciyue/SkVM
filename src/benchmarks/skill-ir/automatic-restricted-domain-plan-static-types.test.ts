import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { RestrictedDomainPlanSchema } from "./automatic-restricted-domain-plan";
import {
  assertRestrictedDomainPlanStaticTypes,
  auditRestrictedDomainPlanStaticTypes,
} from "./automatic-restricted-domain-plan-static-types";

describe("restricted Domain Plan static dataflow types", () => {
  test("rejects the attributed schema-valid plan before its deterministic runtime type error", async () => {
    const plan = RestrictedDomainPlanSchema.parse(JSON.parse(await readFile(
      "results/skill-ir/automatic-domain-plan-attribution-v1/generated-plan.json",
      "utf8",
    )));

    expect(auditRestrictedDomainPlanStaticTypes(plan)).toEqual([
      {
        code: "text-binding-not-string",
        stepId: "write-example",
        registerId: "defined-keys",
        actualType: "string-array",
      },
    ]);
    expect(() => assertRestrictedDomainPlanStaticTypes(plan)).toThrow("restricted Domain Plan static type check failed");
  });

  test("accepts a text register bound to a text template", () => {
    const plan = RestrictedDomainPlanSchema.parse({
      schemaVersion: "skill-ir-restricted-domain-plan/v1",
      planId: "valid-text-flow",
      steps: [
        { id: "source-text", op: "read-text", path: "input.txt" },
        {
          id: "write-output",
          op: "write-text-template",
          path: "output.txt",
          template: "{{content}}",
          bindings: [{ token: "content", value: { kind: "ref", ref: "source-text" }, encoding: "text" }],
        },
      ],
      audit: { paidCalls: 1, retries: 0, heldOutAccesses: 0, evaluatorPayloadAccesses: 0, skillSpecificBranches: 0 },
    });

    expect(auditRestrictedDomainPlanStaticTypes(plan)).toEqual([]);
  });
});
