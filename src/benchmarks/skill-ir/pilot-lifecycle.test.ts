import { describe, expect, test } from "bun:test";

function minimalAdapter() {
  return {
    schemaVersion: "skill-ir-pilot-adapter/v1",
    adapterId: "fixture-adapter",
    skillId: "fixture-skill",
    phenotype: "fixture-phenotype",
    source: {
      closure: ["fixtures/source/SKILL.md"],
      licensePath: "fixtures/source/LICENSE",
    },
    contract: {
      taskBuilder: {
        modulePath: "src/fixtures/task-builder.ts",
        exportName: "buildFixturePlan",
      },
      taskRegistryPath: "fixtures/tasks.json",
      publicInterfacePath: "fixtures/public-interface.json",
      audit: {
        path: "fixtures/contract-audit.json",
        statusPointer: "/status",
        passValue: "passed",
      },
    },
    scorer: {
      entryPath: "src/fixtures/scorer.ts",
      sourceAnchors: [{ path: "fixtures/source/SKILL.md", lineStart: 1 }],
      disclosure: {
        path: "fixtures/disclosure.json",
        statusPointer: "/status",
        passValue: "passed",
        blockerPointer: "/blocker",
      },
    },
    runtime: {
      resourceContractPath: "fixtures/resource-contract.json",
      platforms: ["windows"],
      requiredEnvironment: ["FIXTURE_API_KEY"],
    },
    budgets: {
      qualificationCalls: 1,
      calibrationCalls: 4,
      staticCalls: 4,
      dynamicCalls: 0,
      heldOutCalls: 0,
    },
    stopPolicy: {
      stopOnDisclosureFailure: true,
      stopOnStageFailure: true,
    },
    shadow: {
      kind: "negative-disclosure-canary",
      expectedDecision: "measurement-invalid",
      expectedBlocker: "fixture-blocker",
    },
  };
}

describe("pilot lifecycle adapter contract", () => {
  test("accepts the first public adapter contract without rolling successor versions", async () => {
    const module = await import("./pilot-lifecycle");
    expect(module.PilotAdapterSchema.parse(minimalAdapter()).schemaVersion)
      .toBe("skill-ir-pilot-adapter/v1");
  });

  test("rejects repository path escape before lifecycle work begins", async () => {
    const module = await import("./pilot-lifecycle");
    const escaped = minimalAdapter();
    escaped.source.closure[0] = "../outside.md";
    expect(module.PilotAdapterSchema.safeParse(escaped).success).toBe(false);
  });

  test("freezes the common stage order", async () => {
    const module = await import("./pilot-lifecycle");
    expect(module.PILOT_LIFECYCLE_STAGES).toEqual([
      "import",
      "contract",
      "disclosure",
      "freeze",
      "qualification",
      "calibrate",
      "base-ir-static",
      "residual-admission",
      "artifact",
      "report",
    ]);
  });
});
