import { describe, expect, test } from "bun:test";
import {
  buildPromotionReport,
  inferModelFamily,
  summarizeModelFamily,
  type ModelRunInput,
} from "./promotion-policy";
import type { ScoredAgentRunRow } from "./scoring";

function row(
  task: string,
  system: ScoredAgentRunRow["system"],
  success: boolean,
  opts: Partial<ScoredAgentRunRow> = {},
): ScoredAgentRunRow {
  return {
    caseId: `skill-${task}:skvm:linux:compressed:${task}`,
    system,
    skill: `skill-${task}`,
    agent: "skvm",
    environment: "linux",
    context: "compressed",
    task,
    taskSplit: "held-out",
    success,
    ruleViolations: success ? 0 : 1,
    stepCoverage: 1,
    latencyMs: opts.latencyMs ?? 1000,
    tokenCost: opts.tokenCost ?? 1000,
    successSource: "heuristic-success-criteria",
    failedCriteria: success ? [] : ["criterion failed"],
    ...opts,
  };
}

function pairedTask(task: string, profileSuccess: boolean, pgoSuccess: boolean): ScoredAgentRunRow[] {
  return [
    row(task, "original", false),
    row(task, "ir-profile", profileSuccess, { tokenCost: 1000, latencyMs: 1000 }),
    row(task, "ir-pgo", pgoSuccess, { tokenCost: 1200, latencyMs: 900 }),
  ];
}

describe("promotion policy", () => {
  test("inferModelFamily maps common route names to stable families", () => {
    expect(inferModelFamily("xty/gpt-4.1-nano")).toBe("gpt");
    expect(inferModelFamily("xty/gemini-2.5-flash")).toBe("gemini");
    expect(inferModelFamily("xty/claude-3.7-sonnet")).toBe("claude");
    expect(inferModelFamily("xty/deepseek-v3")).toBe("deepseek");
    expect(inferModelFamily("xty/qwen3-8b")).toBe("qwen");
    expect(inferModelFamily("xty/grok-3-mini")).toBe("grok");
    expect(inferModelFamily("xty/llama-3.1")).toBe("llama");
    expect(inferModelFamily("xty/glm-4")).toBe("glm");
    expect(inferModelFamily("custom/my-model")).toBe("my");
  });

  test("summarizeModelFamily pairs repeated cases by complete run identity", () => {
    const identity = {
      model: "xty/gpt-4.1-mini",
      modelFamily: "gpt",
      adapter: "bare-agent",
      adapterVersion: "workspace",
      panelConfigId: "pilot-v1",
    };
    const profile = summarizeModelFamily({
      modelFamily: "gpt",
      modelLabels: ["gpt41mini"],
      rows: [
        row("task-repeat", "ir-profile", true, { ...identity, runIndex: 1 }),
        row("task-repeat", "ir-profile", false, { ...identity, runIndex: 2 }),
        row("task-repeat", "ir-pgo", false, { ...identity, runIndex: 1 }),
        row("task-repeat", "ir-pgo", true, { ...identity, runIndex: 2 }),
      ],
      options: { minPairedCases: 2 },
    });

    expect(profile.pairedCases).toBe(2);
    expect(profile.pairedDelta).toBe(0);
    expect(profile.irPgoGains).toBe(1);
    expect(profile.irPgoRegressions).toBe(1);
  });

  test("summarizeModelFamily does not pair partial identity with complete identity", () => {
    const profile = summarizeModelFamily({
      modelFamily: "gpt",
      modelLabels: ["gpt41mini"],
      rows: [
        row("task-partial", "ir-profile", true, {
          model: "xty/gpt-4.1-mini",
          adapter: "bare-agent",
          adapterVersion: "workspace",
          panelConfigId: "pilot-v1",
          runIndex: 1,
        }),
        row("task-partial", "ir-pgo", false, {
          model: "xty/gpt-4.1-mini",
          runIndex: 1,
        }),
      ],
    });

    expect(profile.pairedCases).toBe(0);
  });

  test("summarizeModelFamily promotes ir-pgo when held-out paired evidence improves without regressions", () => {
    const profile = summarizeModelFamily({
      modelFamily: "gpt",
      modelLabels: ["gpt41nano"],
      rows: [
        ...pairedTask("task-a", true, true),
        ...pairedTask("task-b", true, true),
        ...pairedTask("task-c", true, true),
        ...pairedTask("task-d", false, true),
      ],
    });

    expect(profile.decision).toBe("promote-ir-pgo");
    expect(profile.pairedCases).toBe(4);
    expect(profile.irPgoGains).toBe(1);
    expect(profile.irPgoRegressions).toBe(0);
    expect(profile.confidence).toBeGreaterThanOrEqual(0.7);
    expect(profile.riskScore).toBeLessThan(0.35);
  });

  test("summarizeModelFamily keeps static ir-profile when ir-pgo underperforms for a model family", () => {
    const profile = summarizeModelFamily({
      modelFamily: "qwen",
      modelLabels: ["qwen38b"],
      rows: [
        ...pairedTask("task-a", true, true),
        ...pairedTask("task-b", true, false),
        ...pairedTask("task-c", true, false),
        ...pairedTask("task-d", false, true),
      ],
    });

    expect(profile.decision).toBe("keep-ir-profile");
    expect(profile.irPgoGains).toBe(1);
    expect(profile.irPgoRegressions).toBe(2);
    expect(profile.bestSystem).toBe("ir-profile");
    expect(profile.riskScore).toBeGreaterThanOrEqual(0.35);
  });

  test("summarizeModelFamily withholds promotion when infrastructure dominates evidence", () => {
    const rows = [
      ...pairedTask("task-a", true, true),
      row("task-b", "original", false, { failureType: "infrastructure" }),
      row("task-b", "ir-profile", false, { failureType: "infrastructure" }),
      row("task-b", "ir-pgo", false, { failureType: "infrastructure" }),
      row("task-c", "original", false, { failureType: "infrastructure" }),
      row("task-c", "ir-profile", false, { failureType: "infrastructure" }),
      row("task-c", "ir-pgo", false, { failureType: "infrastructure" }),
    ];

    const profile = summarizeModelFamily({
      modelFamily: "gemini",
      modelLabels: ["gemini25flash"],
      rows,
    });

    expect(profile.decision).toBe("hold-for-more-validation");
    expect(profile.infraRows).toBe(6);
    expect(profile.reasons).toContain("infrastructure rate 0.67 exceeds 0.25");
  });

  test("buildPromotionReport groups multiple route inputs by model family", () => {
    const inputs: ModelRunInput[] = [
      {
        modelLabel: "gpt41nano",
        model: "xty/gpt-4.1-nano",
        rows: [...pairedTask("task-a", true, true), ...pairedTask("task-b", false, true)],
      },
      {
        modelLabel: "qwen38b",
        model: "xty/qwen3-8b",
        rows: [...pairedTask("task-a", true, false), ...pairedTask("task-b", true, true)],
      },
    ];

    const report = buildPromotionReport(inputs, { minPairedCases: 2 });

    expect(report.schemaVersion).toBe("skill-ir-promotion/v1");
    expect(report.modelFamilies.map((profile) => profile.modelFamily)).toEqual(["gpt", "qwen"]);
    expect(report.modelFamilies[0]?.decision).toBe("promote-ir-pgo");
    expect(report.modelFamilies[1]?.decision).toBe("keep-ir-profile");
  });
});
