import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  extractFinalOutput,
  parseCaseId,
  scoreRawRunRows,
  scoreRunOutput,
  type RawAgentRunRow,
} from "./scoring";
import type { SkillIRBenchmarkTask } from "./real-agent";

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

const findingOrderTask: SkillIRBenchmarkTask = {
  id: "review-finding-order-001",
  split: "development",
  prompt: "Review a small change with one obvious behavioral bug and one style issue.",
  successCriteria: [
    "Findings appear before summary.",
    "Behavioral bug is mentioned.",
    "Style-only issue is lower priority than behavioral bug.",
  ],
};

const missingTestTask: SkillIRBenchmarkTask = {
  id: "review-missing-test-001",
  split: "held-out",
  prompt: "Review a patch that changes validation logic without updating tests.",
  successCriteria: [
    "Findings appear before summary.",
    "Missing or insufficient tests are mentioned.",
    "The finding explains the user-visible or regression risk.",
  ],
};

describe("Skill IR real-agent scoring", () => {
  test("parseCaseId extracts benchmark dimensions", () => {
    expect(parseCaseId("skill-review:skvm:linux:clean:review-finding-order-001")).toEqual({
      skill: "skill-review",
      agent: "skvm",
      environment: "linux",
      context: "clean",
      task: "review-finding-order-001",
    });
  });

  test("extractFinalOutput prefers the SkVM final output block", () => {
    expect(extractFinalOutput("tool trace\nFinal output:\nFindings\n- bug")).toBe("Findings\n- bug");
    expect(extractFinalOutput("Findings\n- bug")).toBe("Findings\n- bug");
  });

  test("scoreRunOutput passes a review output that satisfies all task criteria", () => {
    const scored = scoreRunOutput({
      exitCode: 0,
      finalOutput: [
        "Findings",
        "- Behavioral bug: this change can regress validation for users.",
        "- Style issue: lower priority naming cleanup.",
      ].join("\n"),
      task: findingOrderTask,
    });

    expect(scored.success).toBe(true);
    expect(scored.ruleViolations).toBe(0);
    expect(scored.stepCoverage).toBe(1);
    expect(scored.failedCriteria).toEqual([]);
  });

  test("scoreRunOutput fails when review output is summary-first and omits required evidence", () => {
    const scored = scoreRunOutput({
      exitCode: 0,
      finalOutput: "Summary: looks fine overall.\nOne optional style nit.",
      task: missingTestTask,
    });

    expect(scored.success).toBe(false);
    expect(scored.failedCriteria).toEqual([
      "Findings appear before summary.",
      "Missing or insufficient tests are mentioned.",
      "The finding explains the user-visible or regression risk.",
    ]);
    expect(scored.ruleViolations).toBe(3);
  });

  test("scoreRawRunRows maps raw execution logs to analyzer-compatible result rows", () => {
    const rows: RawAgentRunRow[] = [
      {
        caseId: "skill-review:skvm:linux:clean:review-finding-order-001",
        system: "original",
        taskPath: "tmp/task.json",
        exitCode: 0,
        durationMs: 1250,
        stdout: [
          "trace",
          "Final output:",
          "Findings",
          "- Behavioral bug creates a regression risk.",
        ].join("\n"),
        stderr: "",
        successSource: "execution-only",
      },
    ];

    const scored = scoreRawRunRows(rows, new Map([[findingOrderTask.id, findingOrderTask]]));

    expect(scored).toEqual([
      {
        caseId: "skill-review:skvm:linux:clean:review-finding-order-001",
        system: "original",
        skill: "skill-review",
        agent: "skvm",
        environment: "linux",
        context: "clean",
        task: "review-finding-order-001",
        success: true,
        ruleViolations: 0,
        stepCoverage: 1,
        latencyMs: 1250,
        successSource: "heuristic-success-criteria",
        failedCriteria: [],
      },
    ]);
  });

  test("scoreRawRunRows classifies provider timeouts as infrastructure failures", () => {
    const scored = scoreRawRunRows(
      [
        {
          caseId: "skill-review:skvm:linux:clean:review-finding-order-001",
          system: "original",
          taskPath: "tmp/task.json",
          exitCode: 1,
          durationMs: 300000,
          stdout: "Task failed",
          stderr:
            "Run failed: ProviderNetworkError: openai-compatible(svip.xty.app) network error: The operation timed out.",
          successSource: "execution-only",
        },
      ],
      new Map([[findingOrderTask.id, findingOrderTask]]),
    );

    expect(scored[0]).toMatchObject({
      success: false,
      failureType: "infrastructure",
      failedCriteria: [
        "process exited with code 1",
        "Findings appear before summary.",
        "Behavioral bug is mentioned.",
      ],
    });
  });

  test("score-real-agent-runs CLI writes scored JSONL from raw execution logs", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "skill-ir-scoring-"));
    tempDirs.push(tempDir);
    const rawPath = join(tempDir, "raw-runs.jsonl");
    const tasksPath = join(tempDir, "tasks.json");
    const outPath = join(tempDir, "main-results.jsonl");

    await writeFile(
      rawPath,
      `${JSON.stringify({
        caseId: "skill-review:skvm:linux:clean:review-finding-order-001",
        system: "original",
        taskPath: "tmp/task.json",
        exitCode: 0,
        durationMs: 1250,
        stdout: "Final output:\nFindings\n- Behavioral bug creates a regression risk.",
        stderr: "",
        successSource: "execution-only",
      })}\n`,
      "utf8",
    );
    await writeFile(
      tasksPath,
      `${JSON.stringify({
        schemaVersion: "skill-ir-tasks/v1",
        skillId: "skill-review",
        tasks: [findingOrderTask],
      })}\n`,
      "utf8",
    );

    const proc = Bun.spawn([
      "bun",
      "./src/benchmarks/skill-ir/score-real-agent-runs.ts",
      `--raw=${rawPath}`,
      `--tasks=${tasksPath}`,
      `--out=${outPath}`,
    ]);
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    expect({ stdout, stderr, exitCode }).toMatchObject({ exitCode: 0 });
    expect(await Bun.file(outPath).json()).toMatchObject({
      caseId: "skill-review:skvm:linux:clean:review-finding-order-001",
      success: true,
      ruleViolations: 0,
      successSource: "heuristic-success-criteria",
    });
  });
});
