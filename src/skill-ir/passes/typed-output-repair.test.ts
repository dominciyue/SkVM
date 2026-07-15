import { describe, expect, test } from "bun:test";
import type { SkillIR } from "../schema";
import { applyTypedOutputRepairs, type TypedRepairDirective } from "./typed-output-repair";

function baseIR(): SkillIR {
  return {
    schemaVersion: "skill-ir/v1",
    id: "env-manager",
    name: "Environment Variable Manager",
    category: ["tool-use", "constraint-heavy", "environment-sensitive"],
    intent: "Audit environment variables safely.",
    source: { kind: "inline", text: "Audit environment variables safely." },
    inputs: [],
    outputs: [],
    preconditions: [],
    steps: [],
    rules: [],
    tools: [],
    environment: [{
      id: "env-host",
      description: "Host paths vary.",
      platforms: ["linux", "macos", "windows"],
      checkability: "runtime",
    }],
    checks: [],
    recovery: [],
    profile: [],
  };
}

const directives: TypedRepairDirective[] = [
  {
    id: "repair-json-schema-contract",
    kind: "json-schema-contract",
    targetRef: "rule-json-schema-contract",
    observationCount: 4,
    distinctTaskCount: 2,
    evidenceIds: ["evidence-schema-1", "evidence-schema-2"],
  },
  {
    id: "repair-source-qualified-finding",
    kind: "source-qualified-finding",
    targetRef: "rule-source-qualified-findings",
    observationCount: 4,
    distinctTaskCount: 2,
    evidenceIds: ["evidence-location-1", "evidence-location-2"],
  },
];

describe("typed output repair", () => {
  test("lowers generic schema and source-location repairs into stable rules and checks", () => {
    const source = baseIR();
    const repaired = applyTypedOutputRepairs(source, directives);

    expect(repaired.rules.map((rule) => rule.id)).toEqual([
      "rule-json-schema-contract",
      "rule-source-qualified-findings",
    ]);
    expect(repaired.checks.map((check) => check.id)).toEqual([
      "check-json-schema-contract",
      "check-source-qualified-findings",
    ]);
    expect(repaired.rules[0]).toMatchObject({
      level: "must",
      scope: "output",
      checkability: "runtime",
      severity: "high",
    });
    expect(repaired.rules[0]!.normalizedForm).toContain("canonical JSON Schema vocabulary");
    expect(repaired.rules[0]!.normalizedForm).toContain("current workspace evidence");
    expect(repaired.rules[1]!.normalizedForm).toContain("repository-relative source path");
    expect(repaired.rules[1]!.normalizedForm).toContain("current workspace");
    expect(source.rules).toEqual([]);
    expect(source.checks).toEqual([]);

    const serialized = JSON.stringify(repaired);
    for (const forbidden of ["APP_PORT", "SENDGRID_API_KEY", "src/auth.js", "TEST_ONLY_"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  test("is idempotent for the same typed directives", () => {
    const once = applyTypedOutputRepairs(baseIR(), directives);
    const twice = applyTypedOutputRepairs(once, directives);

    expect(twice).toEqual(once);
  });

  test("v2 gives the explicit runtime contract precedence and stabilizes finding serialization", () => {
    const repaired = applyTypedOutputRepairs(baseIR(), directives, "typed-output-repair/v2");
    const schemaRule = repaired.rules.find((rule) => rule.id === "rule-json-schema-contract")!;
    const findingRule = repaired.rules.find((rule) => rule.id === "rule-source-qualified-findings")!;

    expect(schemaRule.normalizedForm).toContain("explicit runtime output contract takes precedence");
    expect(schemaRule.normalizedForm).toContain("exact top-level shape");
    expect(schemaRule.normalizedForm).not.toContain("canonical JSON Schema vocabulary");
    expect(findingRule.normalizedForm).toContain("path:symbol");
    expect(findingRule.normalizedForm).toContain("does not define an object item schema");
  });

  test("rejects unsupported repair kinds and mismatched target refs", () => {
    expect(() => applyTypedOutputRepairs(baseIR(), [{
      ...directives[0]!,
      kind: "gold-answer-copy" as TypedRepairDirective["kind"],
    }])).toThrow("Unsupported typed repair kind");

    expect(() => applyTypedOutputRepairs(baseIR(), [{
      ...directives[0]!,
      targetRef: "rule-wrong-target",
    }])).toThrow("targetRef");
  });
});
