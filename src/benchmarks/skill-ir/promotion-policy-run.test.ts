import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPromotionReportFromArgs, parsePromotionPolicyArgs, parseRunSpec } from "./promotion-policy-run";
import type { ScoredAgentRunRow } from "./scoring";

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

function scored(system: ScoredAgentRunRow["system"], success: boolean): ScoredAgentRunRow {
  return {
    caseId: "skill-review:skvm:linux:compressed:review-task",
    system,
    skill: "skill-review",
    agent: "skvm",
    environment: "linux",
    context: "compressed",
    task: "review-task",
    taskSplit: "held-out",
    success,
    ruleViolations: success ? 0 : 1,
    stepCoverage: 1,
    latencyMs: 1000,
    tokenCost: system === "ir-pgo" ? 1100 : 1000,
    successSource: "heuristic-success-criteria",
    failedCriteria: success ? [] : ["criterion failed"],
  };
}

describe("promotion-policy-run", () => {
  test("parseRunSpec reads label, model, path, and optional explicit family", () => {
    expect(parseRunSpec("gpt41nano,xty/gpt-4.1-nano,results/gpt.jsonl")).toEqual({
      modelLabel: "gpt41nano",
      model: "xty/gpt-4.1-nano",
      path: "results/gpt.jsonl",
      modelFamily: undefined,
    });
    expect(parseRunSpec("qwen38b,xty/qwen3-8b,results/qwen.jsonl,qwen")).toEqual({
      modelLabel: "qwen38b",
      model: "xty/qwen3-8b",
      path: "results/qwen.jsonl",
      modelFamily: "qwen",
    });
  });

  test("parsePromotionPolicyArgs supports repeated run specs and policy thresholds", () => {
    const args = parsePromotionPolicyArgs([
      "--run=gpt41nano,xty/gpt-4.1-nano,results/gpt.jsonl",
      "--run=qwen38b,xty/qwen3-8b,results/qwen.jsonl,qwen",
      "--min-paired-cases=2",
      "--max-infrastructure-rate=0.4",
      "--out=results/promotion.json",
    ]);

    expect(args.runs).toHaveLength(2);
    expect(args.options.minPairedCases).toBe(2);
    expect(args.options.maxInfrastructureRate).toBe(0.4);
    expect(args.out).toBe("results/promotion.json");
  });

  test("buildPromotionReportFromArgs reads JSONL inputs and writes a promotion report", async () => {
    const dir = await mkdtemp(join(tmpdir(), "skill-ir-promotion-"));
    tempDirs.push(dir);
    const inputPath = join(dir, "gpt.jsonl");
    const outPath = join(dir, "promotion.json");
    await writeFile(
      inputPath,
      [scored("ir-profile", false), scored("ir-pgo", true)]
        .map((row) => JSON.stringify(row))
        .join("\n") + "\n",
      "utf8",
    );

    const report = await buildPromotionReportFromArgs({
      runs: [{ modelLabel: "gpt41nano", model: "xty/gpt-4.1-nano", path: inputPath }],
      options: { minPairedCases: 1 },
      out: outPath,
    });

    expect(report.modelFamilies[0]?.decision).toBe("promote-ir-pgo");
    expect(JSON.parse(await Bun.file(outPath).text()).schemaVersion).toBe("skill-ir-promotion/v1");
  });
});
