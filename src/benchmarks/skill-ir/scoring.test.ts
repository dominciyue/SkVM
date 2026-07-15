import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { customEvaluators, registerCustomEvaluator } from "../../framework/types";
import {
  extractTokenUsage,
  extractFinalOutput,
  parseCaseId,
  scoreRawRunRows,
  scoreRunOutput,
  classifyFailureType,
  type RawAgentRunRow,
} from "./scoring";
import type { SkillIRBenchmarkTask } from "./real-agent";

const tempDirs: string[] = [];

afterEach(async () => {
  customEvaluators.delete("skill-ir-test-infra-error");
  customEvaluators.delete("skill-ir-test-should-not-run");
  customEvaluators.delete("skill-ir-test-throw");
  customEvaluators.delete("skill-ir-test-partial-score");
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

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

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

  test("extractTokenUsage reads SkVM token accounting from stdout", () => {
    expect(extractTokenUsage("trace\nTokens: in=526 out=198\nFinal output:\nDone")).toEqual({
      inputTokens: 526,
      outputTokens: 198,
      tokenCost: 724,
    });
    expect(extractTokenUsage("Final output:\nDone")).toBeUndefined();
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

  test("scoreRunOutput supports expanded seed corpus criteria", () => {
    const task: SkillIRBenchmarkTask = {
      id: "expanded-criteria",
      split: "development",
      prompt: "Exercise non-review seed criteria.",
      successCriteria: [
        "Root cause is mentioned.",
        "Concrete fix is mentioned.",
        "Verification step is mentioned.",
        "Platform difference is mentioned.",
        "Portable alternative is provided.",
        "Git status is mentioned.",
        "Unrelated changes are preserved.",
        "Destructive git commands are avoided.",
        "Failing test is mentioned before implementation.",
        "Required sections are present.",
        "Evidence limitation is mentioned.",
        "Actionable next step is mentioned.",
      ],
    };

    const scored = scoreRunOutput({
      exitCode: 0,
      finalOutput: [
        "Findings",
        "Root cause: the CI job fails because Linux uses bash while Windows uses PowerShell path syntax.",
        "Concrete fix: update the script to choose a portable cross-platform command alternative.",
        "Verification step: run bun test and the CI check again.",
        "First write a failing test before implementation, then apply the fix.",
        "Run git status and keep unrelated changes untouched.",
        "Summary: the failure is isolated.",
        "Evidence: the conclusion is limited to the provided logs.",
        "Next step: rerun the workflow after the patch.",
      ].join("\n"),
      task,
    });

    expect(scored).toMatchObject({
      success: true,
      ruleViolations: 0,
      failedCriteria: [],
    });
  });

  test("scoreRunOutput supports harder held-out task criteria", () => {
    const task: SkillIRBenchmarkTask = {
      id: "harder-held-out-criteria",
      split: "held-out",
      prompt: "Exercise harder held-out criteria.",
      successCriteria: [
        "Security or high-severity risk is prioritized.",
        "Distracting warning is not treated as root cause.",
        "Node-based portable alternative is provided.",
        "Secret-like files are excluded from commit.",
        "Edge-case failing test is mentioned.",
        "Overclaiming is avoided.",
      ],
    };

    const scored = scoreRunOutput({
      exitCode: 0,
      finalOutput: [
        "Findings",
        "- High severity security risk: prioritize the authorization regression before style notes.",
        "Root cause: the CI failure is due to missing DATABASE_URL; the deprecation warning is distracting and not the root cause.",
        "Fix: use a Node script such as node scripts/clean.mjs for the portable alternative.",
        "Run git status and exclude .env, secrets, and raw logs from the commit.",
        "Start with an edge-case failing test for zero page size before implementation.",
        "Evidence is limited to the provided logs, so do not overclaim broader validation.",
      ].join("\n"),
      task,
    });

    expect(scored).toMatchObject({
      success: true,
      ruleViolations: 0,
      failedCriteria: [],
    });
  });

  test("scoreRunOutput accepts hard-task wording observed in real compressed runs", () => {
    const task: SkillIRBenchmarkTask = {
      id: "harder-held-out-real-wording",
      split: "held-out",
      prompt: "Exercise real hard-task wording.",
      successCriteria: [
        "Distracting warning is not treated as root cause.",
        "Git status is mentioned.",
        "Unrelated changes are preserved.",
        "Secret-like files are excluded from commit.",
        "Edge-case failing test is mentioned.",
        "Overclaiming is avoided.",
      ],
    };

    const scored = scoreRunOutput({
      exitCode: 0,
      finalOutput: [
        "The root cause is that the generated client is missing because the workflow skipped bun run db:generate.",
        "The cache and deprecation warnings are not the failing cause.",
        "Based on the status you provided, stage only the intended fixture files.",
        "The private notes are unrelated and should not be staged or committed; leave them as is.",
        "Do NOT stage or commit .env.local or results/skill-ir/tmp-run/raw-runs.jsonl.",
        "Add a failing test case where pageSize is 0 before implementation.",
        "Evidence Limitations: the notes do not prove broad validation, so this update avoids overclaiming superiority.",
      ].join("\n"),
      task,
    });

    expect(scored).toMatchObject({
      success: true,
      ruleViolations: 0,
      failedCriteria: [],
    });
  });

  test("scoreRunOutput accepts multiline hard-task wording from compressed runs", () => {
    const task: SkillIRBenchmarkTask = {
      id: "harder-held-out-real-multiline-wording",
      split: "held-out",
      prompt: "Exercise multiline hard-task wording.",
      successCriteria: [
        "Distracting warning is not treated as root cause.",
        "Edge-case failing test is mentioned.",
        "Overclaiming is avoided.",
      ],
    };

    const scored = scoreRunOutput({
      exitCode: 0,
      finalOutput: [
        "The likely root cause:",
        "The CI workflow is missing the step to generate the database client code before tests.",
        "",
        "1. Failing test:",
        "I will add a test case where pageSize is 0, e.g. pageCount(10, 0).",
        "",
        "Evidence Limitations:",
        "The current seed tasks may not be sufficiently challenging to demonstrate a consistent quality improvement.",
        "The labeled noisy context limits the generalizability of those results.",
      ].join("\n"),
      task,
    });

    expect(scored).toMatchObject({
      success: true,
      ruleViolations: 0,
      failedCriteria: [],
    });
  });

  test("scoreRunOutput accepts plural evidence limitations headings", () => {
    const task: SkillIRBenchmarkTask = {
      id: "report-plural-limitations",
      split: "held-out",
      prompt: "Write a grounded report.",
      successCriteria: ["Evidence limitation is mentioned."],
    };

    expect(
      scoreRunOutput({
        exitCode: 0,
        finalOutput: "Evidence Limitations:\nScope covers only this run.",
        task,
      }),
    ).toMatchObject({
      success: true,
      failedCriteria: [],
    });
  });

  test("scoreRunOutput accepts no-clear-quality-advantage wording as avoiding overclaiming", () => {
    const task: SkillIRBenchmarkTask = {
      id: "report-overclaim-wording",
      split: "held-out",
      prompt: "Write a grounded report.",
      successCriteria: ["Overclaiming is avoided."],
    };

    expect(
      scoreRunOutput({
        exitCode: 0,
        finalOutput:
          "Evidence Limitations: Small sample size. The pipeline is functioning, but IR-profile does not demonstrate a clear quality advantage.",
        task,
      }),
    ).toMatchObject({
      success: true,
      failedCriteria: [],
    });
  });

  test("scoreRunOutput accepts gpt-4.1-nano hard-task wording observed in compressed runs", () => {
    const gitTask: SkillIRBenchmarkTask = {
      id: "commit-secret-hard-001",
      split: "held-out",
      prompt: "Prepare a safe commit plan.",
      successCriteria: ["Unrelated changes are preserved.", "Secret-like files are excluded from commit."],
    };
    const tddTask: SkillIRBenchmarkTask = {
      id: "tdd-zero-page-hard-001",
      split: "held-out",
      prompt: "Describe the TDD fix order.",
      successCriteria: ["Edge-case failing test is mentioned."],
    };
    const reportTask: SkillIRBenchmarkTask = {
      id: "report-overclaim-hard-001",
      split: "held-out",
      prompt: "Write a grounded report.",
      successCriteria: ["Required sections are present.", "Overclaiming is avoided."],
    };

    expect(
      scoreRunOutput({
        exitCode: 0,
        finalOutput: [
          "Stage only the two benchmark fixture changes with git add.",
          "Your docs/private-lab-notes.md stays modified in the workspace, uncommitted.",
          "Untracked files (.env.local, results/.../raw-runs.jsonl, scratch/...) remain in place and are now ignored.",
          "Everything else remains untouched in your working tree.",
        ].join("\n"),
        task: gitTask,
      }).success,
    ).toBe(true);

    expect(
      scoreRunOutput({
        exitCode: 0,
        finalOutput: [
          "1) Add the failing edge-case test first",
          "it('should return 0 pages when pageSize is 0 (edge case)', () => {",
          "  assert.strictEqual(pageCount(10, 0), 0);",
          "});",
          "3) Make the minimal fix",
        ].join("\n"),
        task: tddTask,
      }).success,
    ).toBe(true);

    expect(
      scoreRunOutput({
        exitCode: 0,
        finalOutput: [
          "Summary:",
          "No clear advantage for ir-profile has emerged under the current, relatively easy seed tasks.",
          "Evidence:",
          "The discriminative run was pre-fix and the noisy label did not fully exercise robustness.",
          "Limitations:",
          "The evaluation pipeline is stable, but seed tasks are insufficiently challenging.",
          "Next Steps:",
          "Design or incorporate a more challenging benchmark set.",
        ].join("\n"),
        task: reportTask,
      }).success,
    ).toBe(true);
  });

  test("scoreRunOutput accepts hard-002 wording observed in multi-model runs", () => {
    const task: SkillIRBenchmarkTask = {
      id: "hard-002-real-wording",
      split: "held-out",
      prompt: "Exercise hard-002 real wording.",
      successCriteria: [
        "Security or high-severity risk is prioritized.",
        "Distracting warning is not treated as root cause.",
        "Secret-like files are excluded from commit.",
        "Edge-case failing test is mentioned.",
        "Overclaiming is avoided.",
      ],
    };

    const scored = scoreRunOutput({
      exitCode: 0,
      finalOutput: [
        "Findings",
        "1. High-Severity Regression: exported account balances are set to zero, causing user-visible data loss.",
        "The filename change is low priority.",
        "The cache warnings and fsevents notice are red herrings.",
        "Leave report/private-draft.md and .skvm/config.json out of the commit; raw-runs.jsonl and scratch output stay local.",
        "Reproduce with a failing test that rejects names that are only whitespace, then implement the trim fix.",
        "Evidence Limitations: results may not generalize to other agents, environments, or larger benchmarks.",
      ].join("\n"),
      task,
    });

    expect(scored).toMatchObject({
      success: true,
      ruleViolations: 0,
      failedCriteria: [],
    });
  });

  test("scoreRunOutput accepts gpt-4.1-mini hard-002 wording observed in multi-model runs", () => {
    const task: SkillIRBenchmarkTask = {
      id: "hard-002-gpt41mini-wording",
      split: "held-out",
      prompt: "Exercise hard-002 gpt-4.1-mini wording.",
      successCriteria: [
        "Distracting warning is not treated as root cause.",
        "Secret-like files are excluded from commit.",
        "Edge-case failing test is mentioned.",
        "Overclaiming is avoided.",
      ],
    };

    const scored = scoreRunOutput({
      exitCode: 0,
      finalOutput: [
        "The root cause is a Node.js version mismatch: package.json requires Node >= 20.11.0, but CI uses Node 18.",
        "The files that must remain local and not be committed or deleted are .skvm/config.json and raw-runs.jsonl.",
        "Secret-like files are excluded from the commit.",
        "Failing test: write a test case where the display name is a string of spaces only.",
        "Given the limited scope of agents, environments, and task sets, these results should be considered preliminary.",
      ].join("\n"),
      task,
    });

    expect(scored).toMatchObject({
      success: true,
      ruleViolations: 0,
      failedCriteria: [],
    });
  });

  test("scoreRunOutput accepts gemini hard-002 wording observed in multi-model runs", () => {
    const task: SkillIRBenchmarkTask = {
      id: "hard-002-gemini-wording",
      split: "held-out",
      prompt: "Exercise hard-002 gemini wording.",
      successCriteria: [
        "Findings appear before summary.",
        "Distracting warning is not treated as root cause.",
        "Overclaiming is avoided.",
      ],
    };

    const scored = scoreRunOutput({
      exitCode: 0,
      finalOutput: [
        "Here are the findings from the patch review:",
        "1. High-Severity Data Loss: balanceCents is silently replaced with zero.",
        "The root cause is a mismatch between the required Node.js version and the CI runner version.",
        "**Evidence Limitations:**",
        "The current evidence is based on a narrow scope, so we cannot yet generalize these findings.",
        "Broad claims about general superiority would be an overstatement at this stage.",
      ].join("\n"),
      task,
    });

    expect(scored).toMatchObject({
      success: true,
      ruleViolations: 0,
      failedCriteria: [],
    });
  });

  test("scoreRunOutput accepts ir-pgo validation report wording observed in real runs", () => {
    const task: SkillIRBenchmarkTask = {
      id: "ir-pgo-validation-wording",
      split: "held-out",
      prompt: "Write a grounded project update.",
      successCriteria: [
        "Evidence limitation is mentioned.",
        "Overclaiming is avoided.",
      ],
    };

    const outputs = [
      [
        "3. Evidence Limits",
        "- Current seed tasks are relatively easy; no failure modes were exposed.",
        "- Sample sizes (12-24 tasks) are small and may not generalize.",
        "However, with the existing task set we do not yet observe a clear quality improvement.",
      ].join("\n"),
      [
        "Evidence:",
        "Limitation: context perturbation was minimal, not a true noisy scenario.",
        "Overall observation: pipeline stability is confirmed, but seed tasks are too easy to expose performance differences.",
      ].join("\n"),
      [
        "Evidence:",
        "Limitation: current seed tasks are too easy to reveal meaningful performance differentials or generalize beyond these controlled settings.",
      ].join("\n"),
      [
        "Evidence Limitations:",
        "Because of these constraints, we cannot generalize broader superiority of the IR-profile across agents, contexts, or task types.",
        "These results are promising but preliminary.",
      ].join("\n"),
      [
        "Evidence:",
        "Broader generalization remains unverified.",
        "Expand evaluation to additional agent labels, environment settings, and uncompressed contexts.",
      ].join("\n"),
      [
        "Evidence:",
        "Limitation: these results cover only one agent label, one environment label, compressed context, and a small hard-task set, so generalization is untested.",
      ].join("\n"),
    ];

    for (const finalOutput of outputs) {
      expect(
        scoreRunOutput({
          exitCode: 0,
          finalOutput,
          task,
        }),
      ).toMatchObject({
        success: true,
        ruleViolations: 0,
        failedCriteria: [],
      });
    }
  });

  test("scoreRunOutput accepts caused-by wording for root cause", () => {
    const task: SkillIRBenchmarkTask = {
      id: "ci-root-cause-wording",
      split: "development",
      prompt: "Diagnose CI failure.",
      successCriteria: ["Root cause is mentioned."],
    };

    expect(
      scoreRunOutput({
        exitCode: 0,
        finalOutput: "The CI failure is caused by the Node.js version mismatch.",
        task,
      }),
    ).toMatchObject({
      success: true,
      failedCriteria: [],
    });
  });

  test("scoreRunOutput permits explicitly avoided destructive git command examples", () => {
    const task: SkillIRBenchmarkTask = {
      id: "git-destructive-negation",
      split: "held-out",
      prompt: "Prepare safe git plan.",
      successCriteria: ["Destructive git commands are avoided."],
    };

    expect(
      scoreRunOutput({
        exitCode: 0,
        finalOutput: "Avoid using destructive git commands like git reset --hard or git clean unless explicitly requested.",
        task,
      }),
    ).toMatchObject({
      success: true,
      failedCriteria: [],
    });

    expect(
      scoreRunOutput({
        exitCode: 0,
        finalOutput: "Run git reset --hard, then commit the files.",
        task,
      }),
    ).toMatchObject({
      success: false,
      failedCriteria: ["Destructive git commands are avoided."],
    });
  });

  test("scoreRunOutput accepts safe staged-only git cleanup from final-ir runs", () => {
    const task: SkillIRBenchmarkTask = {
      id: "git-safe-staged-cleanup",
      split: "held-out",
      prompt: "Prepare safe git plan.",
      successCriteria: [
        "Unrelated changes are preserved.",
        "Secret-like files are excluded from commit.",
        "Destructive git commands are avoided.",
      ],
    };

    const scored = scoreRunOutput({
      exitCode: 0,
      finalOutput: [
        "Unstage any files that should not go into version control:",
        "git restore --staged report/private-draft.md .skvm/config.json",
        "These commands only remove the files from the staging area. They do not delete the files or modify their contents.",
        "Do not use git reset --hard or git checkout -- <file>.",
        "After this, all unrelated and secret files remain untouched in your working tree, and only the route-probe sources and docs go into the commit.",
      ].join("\n"),
      task,
    });

    expect(scored).toMatchObject({
      success: true,
      ruleViolations: 0,
      failedCriteria: [],
    });
  });

  test("scoreRunOutput accepts test-first whitespace edge-case wording from final-ir runs", () => {
    const task: SkillIRBenchmarkTask = {
      id: "tdd-test-first-whitespace",
      split: "held-out",
      prompt: "Describe the TDD fix order.",
      successCriteria: [
        "Failing test is mentioned before implementation.",
        "Edge-case failing test is mentioned.",
      ],
    };

    const scored = scoreRunOutput({
      exitCode: 0,
      finalOutput: [
        "1. Test-first approach:",
        "test('should reject display names with only whitespace', () => {",
        "  expect(isValidDisplayName('   ')).toBe(false);",
        "});",
        "2. Concrete fix:",
        "return name.trim().length >= 3;",
      ].join("\n"),
      task,
    });

    expect(scored).toMatchObject({
      success: true,
      ruleViolations: 0,
      failedCriteria: [],
    });
  });

  test("scoreRunOutput accepts unsupported-claim overclaim wording from final-ir runs", () => {
    const task: SkillIRBenchmarkTask = {
      id: "report-unsupported-claim",
      split: "held-out",
      prompt: "Write a grounded project update.",
      successCriteria: ["Overclaiming is avoided."],
    };

    for (const finalOutput of [
      "The draft claim about broad superiority was omitted as unsupported. Evidence limitations are clearly noted.",
      "The document avoids overstating the broadly superior claim and focuses only on specific supported findings.",
      "Caution: explicitly avoids overstating the draft claim about broad superiority.",
    ]) {
      expect(scoreRunOutput({ exitCode: 0, finalOutput, task })).toMatchObject({
        success: true,
        ruleViolations: 0,
        failedCriteria: [],
      });
    }
  });

  test("scoreRawRunRows maps execution logs and copies run identity unchanged", async () => {
    const rows: RawAgentRunRow[] = [
      {
        caseId: "skill-review:skvm:linux:clean:review-finding-order-001",
        system: "original",
        model: "xty/gpt-4.1-mini",
        modelFamily: "gpt",
        adapter: "bare-agent",
        adapterVersion: "workspace-2026-07-15",
        runIndex: 2,
        panelConfigId: "env-manager-calibration-v1",
        skillProvenance: "real-public",
        evidenceWeight: "main-real",
        taskPath: "tmp/task.json",
        exitCode: 0,
        durationMs: 1250,
        stdout: [
          "trace",
          "Tokens: in=526 out=198",
          "Final output:",
          "Findings",
          "- Behavioral bug creates a regression risk.",
        ].join("\n"),
        stderr: "",
        successSource: "execution-only",
      },
    ];

    const scored = await scoreRawRunRows(rows, new Map([[findingOrderTask.id, findingOrderTask]]));

    expect(scored).toEqual([
      {
        caseId: "skill-review:skvm:linux:clean:review-finding-order-001",
        system: "original",
        model: "xty/gpt-4.1-mini",
        modelFamily: "gpt",
        adapter: "bare-agent",
        adapterVersion: "workspace-2026-07-15",
        runIndex: 2,
        panelConfigId: "env-manager-calibration-v1",
        skillProvenance: "real-public",
        evidenceWeight: "main-real",
        skill: "skill-review",
        agent: "skvm",
        environment: "linux",
        context: "clean",
        task: "review-finding-order-001",
        taskSplit: "development",
        success: true,
        ruleViolations: 0,
        stepCoverage: 1,
        latencyMs: 1250,
        inputTokens: 526,
        outputTokens: 198,
        tokenCost: 724,
        successSource: "heuristic-success-criteria",
        failedCriteria: [],
      },
    ]);
  });

  test("scoreRawRunRows classifies provider timeouts as infrastructure failures", async () => {
    const scored = await scoreRawRunRows(
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
      ruleViolations: 0,
      failedCriteria: ["process exited with code 1"],
    });
  });

  test("scoreRawRunRows evaluates explicit file checks in the persistent workdir", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "skill-ir-evaluator-workdir-"));
    tempDirs.push(workDir);
    await writeFile(join(workDir, "output.json"), '{"status":"ok"}\n', "utf8");
    const task: SkillIRBenchmarkTask = {
      id: "artifact-task",
      split: "development",
      prompt: "Create output.json.",
      successCriteria: [],
      eval: [
        {
          method: "file-check",
          id: "output-ok",
          name: "Output is valid",
          path: "output.json",
          mode: "contains",
          expected: '"status":"ok"',
        },
      ],
      hardGateIds: ["output-ok"],
    };
    const raw: RawAgentRunRow = {
      caseId: "artifact-skill:skvm:windows:clean:artifact-task",
      system: "original",
      taskPath: "tmp/task.json",
      workDir,
      exitCode: 0,
      durationMs: 320,
      stdout: "Tokens: in=5 out=2\nFinal output:\nCreated output.json.",
      stderr: "",
      successSource: "execution-only",
      artifactRuntime: {
        mode: "one-repair",
        status: "complete",
        initialValidation: {
          schemaVersion: "runtime-validation-report/v1",
          status: "fail",
          repairEligible: true,
          errors: [{ code: "MISSING_FIELD", relativePath: "output.json" }],
        },
        finalValidation: {
          schemaVersion: "runtime-validation-report/v1",
          status: "pass",
          repairEligible: false,
          errors: [],
        },
        repairAttempted: true,
        repairedToPass: true,
        generationUsage: { inputTokens: 12, outputTokens: 8, tokenCost: 20 },
        repairUsage: { inputTokens: 5, outputTokens: 2, tokenCost: 7 },
        aggregateUsage: { inputTokens: 17, outputTokens: 10, tokenCost: 27, modelDurationMs: 300 },
        validationDurationMs: 20,
      },
    };

    const [passing] = await scoreRawRunRows([raw], new Map([[task.id, task]]));
    expect(passing).toMatchObject({
      success: true,
      evaluatorScore: 1,
      successSource: "deterministic-evaluator",
      failedCriteria: [],
      inputTokens: 17,
      outputTokens: 10,
      tokenCost: 27,
      artifactRuntime: {
        repairAttempted: true,
        repairedToPass: true,
        finalValidation: { status: "pass" },
      },
      evaluationSummary: [
        {
          method: "file-check",
          id: "output-ok",
          name: "Output is valid",
          pass: true,
          score: 1,
          details: "Criterion passed",
        },
      ],
    });

    await writeFile(join(workDir, "output.json"), '{"status":"bad"}\n', "utf8");
    const [failing] = await scoreRawRunRows([raw], new Map([[task.id, task]]));
    expect(failing).toMatchObject({
      success: false,
      evaluatorScore: 0,
      ruleViolations: 1,
      failedCriteria: ["output-ok"],
      successSource: "deterministic-evaluator",
    });
  });

  test("scoreRawRunRows requires hard gates even when the weighted threshold passes", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "skill-ir-hard-gate-"));
    tempDirs.push(workDir);
    await writeFile(join(workDir, "optional.txt"), "ready\n", "utf8");
    const task: SkillIRBenchmarkTask = {
      id: "hard-gate-task",
      split: "held-out",
      prompt: "Create required and optional artifacts.",
      successCriteria: [],
      eval: [
        { method: "file-check", id: "required", weight: 0.1, path: "required.txt", mode: "contains", expected: "ok" },
        { method: "file-check", id: "optional", weight: 0.9, path: "optional.txt", mode: "contains", expected: "ready" },
      ],
      hardGateIds: ["required"],
      passThreshold: 0.8,
    };

    const [scored] = await scoreRawRunRows(
      [{
        caseId: "artifact-skill:skvm:windows:clean:hard-gate-task",
        system: "original",
        taskPath: "tmp/task.json",
        workDir,
        exitCode: 0,
        durationMs: 10,
        stdout: "Final output:\nDone.",
        stderr: "",
        successSource: "execution-only",
      }],
      new Map([[task.id, task]]),
    );

    expect(scored).toMatchObject({
      success: false,
      evaluatorScore: 0.9,
      failedCriteria: ["required"],
    });
  });

  test("scoreRawRunRows applies per-criterion weights at the configured threshold", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "skill-ir-weighted-threshold-"));
    tempDirs.push(workDir);
    await writeFile(join(workDir, "primary.txt"), "ok\n", "utf8");
    const baseTask: SkillIRBenchmarkTask = {
      id: "weighted-task",
      split: "held-out",
      prompt: "Create artifacts.",
      successCriteria: [],
      eval: [
        { method: "file-check", id: "primary", weight: 0.75, path: "primary.txt", mode: "contains", expected: "ok" },
        { method: "file-check", id: "secondary", weight: 0.25, path: "secondary.txt", mode: "contains", expected: "ok" },
      ],
      passThreshold: 0.75,
    };
    const raw: RawAgentRunRow = {
      caseId: "artifact-skill:skvm:windows:clean:weighted-task",
      system: "original",
      taskPath: "tmp/task.json",
      workDir,
      exitCode: 0,
      durationMs: 10,
      stdout: "Final output:\nDone.",
      stderr: "",
      successSource: "execution-only",
    };

    const [atThreshold] = await scoreRawRunRows([raw], new Map([[baseTask.id, baseTask]]));
    const [aboveThreshold] = await scoreRawRunRows(
      [raw],
      new Map([[baseTask.id, { ...baseTask, passThreshold: 0.76 }]]),
    );

    expect(atThreshold).toMatchObject({ success: true, evaluatorScore: 0.75 });
    expect(aboveThreshold).toMatchObject({ success: false, evaluatorScore: 0.75 });
  });

  test("scoreRawRunRows classifies evaluator infraError without serializing custom payloads", async () => {
    registerCustomEvaluator("skill-ir-test-infra-error", {
      async run() {
        return {
          pass: false,
          score: 0,
          details: "Evaluator dependency unavailable",
          infraError: "missing portable dependency",
          checkpoints: [{
            name: "preflight",
            score: 0,
            description: "evaluator-only-description",
            reason: "dependency missing",
          }],
        };
      },
    });
    const workDir = await mkdtemp(join(tmpdir(), "skill-ir-infra-error-"));
    tempDirs.push(workDir);
    const task: SkillIRBenchmarkTask = {
      id: "infra-task",
      split: "development",
      prompt: "Create an artifact.",
      successCriteria: [],
      eval: [{
        method: "custom",
        id: "portable-check",
        name: "Portable check",
        evaluatorId: "skill-ir-test-infra-error",
        payload: { secretExpectedValue: "must-not-be-serialized" },
      }],
    };

    const [scored] = await scoreRawRunRows(
      [{
        caseId: "artifact-skill:skvm:windows:clean:infra-task",
        system: "original",
        taskPath: "tmp/task.json",
        workDir,
        exitCode: 0,
        durationMs: 10,
        stdout: "Final output:\nDone.",
        stderr: "",
        successSource: "execution-only",
      }],
      new Map([[task.id, task]]),
    );

    expect(scored).toMatchObject({
      success: false,
      failureType: "infrastructure",
      failureStage: "evaluation",
      ruleViolations: 0,
      failedCriteria: [],
      evaluatorScore: 0,
      evaluationSummary: [{
        method: "custom",
        id: "portable-check",
        name: "Portable check",
        pass: false,
        score: 0,
        details: "Evaluator infrastructure failure",
        infraError: "Evaluator infrastructure failure",
        checkpoints: [{ name: "preflight", score: 0 }],
      }],
    });
    expect(JSON.stringify(scored)).not.toContain("must-not-be-serialized");
    expect(JSON.stringify(scored)).not.toContain("secretExpectedValue");
    expect(JSON.stringify(scored)).not.toContain("dependency unavailable");
    expect(JSON.stringify(scored)).not.toContain("dependency missing");
    expect(JSON.stringify(scored)).not.toContain("evaluator-only-description");
    expect(JSON.stringify(scored)).not.toContain("missing portable dependency");
  });

  test("scoreRawRunRows contains evaluator exceptions to the affected row", async () => {
    registerCustomEvaluator("skill-ir-test-throw", {
      async run() {
        throw new Error("evaluator-only-secret exception");
      },
    });
    const rootDir = await mkdtemp(join(tmpdir(), "skill-ir-evaluator-throw-"));
    tempDirs.push(rootDir);
    const failedWorkDir = join(rootDir, "failed");
    const passingWorkDir = join(rootDir, "passing");
    await Promise.all([mkdir(failedWorkDir), mkdir(passingWorkDir)]);
    await writeFile(join(passingWorkDir, "output.txt"), "ok\n", "utf8");
    const throwingTask: SkillIRBenchmarkTask = {
      id: "throwing-task",
      split: "development",
      prompt: "Create output.",
      successCriteria: [],
      eval: [{ method: "custom", id: "throwing-check", evaluatorId: "skill-ir-test-throw" }],
    };
    const passingTask: SkillIRBenchmarkTask = {
      id: "passing-task",
      split: "development",
      prompt: "Create output.",
      successCriteria: [],
      eval: [{ method: "file-check", id: "output-ok", path: "output.txt", mode: "contains", expected: "ok" }],
    };

    const scored = await scoreRawRunRows(
      [
        {
          caseId: "artifact-skill:skvm:windows:clean:throwing-task",
          system: "original",
          taskPath: "tmp/throwing.json",
          workDir: failedWorkDir,
          exitCode: 0,
          durationMs: 10,
          stdout: "Final output:\nDone.",
          stderr: "",
          successSource: "execution-only",
        },
        {
          caseId: "artifact-skill:skvm:windows:clean:passing-task",
          system: "original",
          taskPath: "tmp/passing.json",
          workDir: passingWorkDir,
          exitCode: 0,
          durationMs: 10,
          stdout: "Final output:\nDone.",
          stderr: "",
          successSource: "execution-only",
        },
      ],
      new Map([
        [throwingTask.id, throwingTask],
        [passingTask.id, passingTask],
      ]),
    );

    expect(scored).toHaveLength(2);
    expect(scored[0]).toMatchObject({
      success: false,
      failureType: "infrastructure",
      failureStage: "evaluation",
      ruleViolations: 0,
      failedCriteria: [],
      evaluatorScore: 0,
      evaluationSummary: [],
    });
    expect(scored[1]).toMatchObject({ success: true, evaluatorScore: 1 });
    expect(JSON.stringify(scored)).not.toContain("evaluator-only-secret");
  });

  test("scoreRawRunRows records aggregate evidence for threshold-only failures", async () => {
    registerCustomEvaluator("skill-ir-test-partial-score", {
      async run() {
        return { pass: true, score: 0.75, details: "evaluator-only-partial-details" };
      },
    });
    const workDir = await mkdtemp(join(tmpdir(), "skill-ir-threshold-only-"));
    tempDirs.push(workDir);
    const task: SkillIRBenchmarkTask = {
      id: "threshold-only-task",
      split: "held-out",
      prompt: "Create output.",
      successCriteria: [],
      eval: [{ method: "custom", id: "partial", evaluatorId: "skill-ir-test-partial-score" }],
      passThreshold: 0.8,
    };

    const [scored] = await scoreRawRunRows(
      [{
        caseId: "artifact-skill:skvm:windows:clean:threshold-only-task",
        system: "original",
        taskPath: "tmp/task.json",
        workDir,
        exitCode: 0,
        durationMs: 10,
        stdout: "Final output:\nDone.",
        stderr: "",
        successSource: "execution-only",
      }],
      new Map([[task.id, task]]),
    );

    expect(scored).toMatchObject({
      success: false,
      evaluatorScore: 0.75,
      failedCriteria: ["overall score below pass threshold"],
    });
    expect(JSON.stringify(scored)).not.toContain("evaluator-only-partial-details");
  });

  test("scoreRawRunRows rejects invalid explicit evaluator contracts", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "skill-ir-invalid-eval-"));
    tempDirs.push(workDir);
    const raw: RawAgentRunRow = {
      caseId: "artifact-skill:skvm:windows:clean:invalid-task",
      system: "original",
      taskPath: "tmp/task.json",
      workDir,
      exitCode: 0,
      durationMs: 10,
      stdout: "Final output:\nDone.",
      stderr: "",
      successSource: "execution-only",
    };
    const criterion = { method: "file-check", id: "known", path: "output.txt", mode: "contains", expected: "ok" } as const;
    const invalidTasks: Array<[SkillIRBenchmarkTask, string]> = [
      [{ id: "invalid-task", split: "development", prompt: "x", successCriteria: [], eval: [] }, "non-empty"],
      [{ id: "invalid-task", split: "development", prompt: "x", successCriteria: [], eval: [criterion], hardGateIds: ["known", "known"] }, "unique"],
      [{ id: "invalid-task", split: "development", prompt: "x", successCriteria: [], eval: [criterion], hardGateIds: ["missing"] }, "does not exist"],
      [{ id: "invalid-task", split: "development", prompt: "x", successCriteria: [], eval: [criterion, criterion], hardGateIds: ["known"] }, "criterion id"],
      [{ id: "invalid-task", split: "development", prompt: "x", successCriteria: [], eval: [criterion], passThreshold: Number.NaN }, "passThreshold"],
      [{ id: "invalid-task", split: "development", prompt: "x", successCriteria: [], eval: [criterion], passThreshold: 1.1 }, "passThreshold"],
      [{ id: "invalid-task", split: "development", prompt: "x", successCriteria: [], eval: [{ method: "llm-judge", rubric: "Judge", maxScore: 1 }] }, "llm-judge"],
    ];

    for (const [task, message] of invalidTasks) {
      await expect(scoreRawRunRows([raw], new Map([[task.id, task]]))).rejects.toThrow(message);
    }
  });

  test("scoreRawRunRows does not evaluate residual artifacts after a nonzero execution", async () => {
    let evaluatorCalls = 0;
    registerCustomEvaluator("skill-ir-test-should-not-run", {
      async run() {
        evaluatorCalls += 1;
        return { pass: true, score: 1, details: "unexpected" };
      },
    });
    const workDir = await mkdtemp(join(tmpdir(), "skill-ir-nonzero-exit-"));
    tempDirs.push(workDir);
    const task: SkillIRBenchmarkTask = {
      id: "failed-execution-task",
      split: "development",
      prompt: "Create an artifact.",
      successCriteria: [],
      eval: [{ method: "custom", id: "must-not-run", evaluatorId: "skill-ir-test-should-not-run" }],
    };

    const [scored] = await scoreRawRunRows(
      [{
        caseId: "artifact-skill:skvm:windows:clean:failed-execution-task",
        system: "original",
        taskPath: "tmp/task.json",
        workDir,
        exitCode: 2,
        durationMs: 10,
        stdout: "Final output:\nA stale artifact exists.",
        stderr: "agent command failed",
        successSource: "execution-only",
      }],
      new Map([[task.id, task]]),
    );

    expect(evaluatorCalls).toBe(0);
    expect(scored).toMatchObject({
      success: false,
      failureType: "agent",
      failureStage: "execution",
      ruleViolations: 0,
      failedCriteria: ["process exited with code 2"],
    });
  });

  test("scoreRawRunRows does not evaluate exit-zero rows with non-ok adapter status", async () => {
    let evaluatorCalls = 0;
    registerCustomEvaluator("skill-ir-test-should-not-run", {
      async run() {
        evaluatorCalls += 1;
        return { pass: true, score: 1, details: "unexpected" };
      },
    });
    const workDir = await mkdtemp(join(tmpdir(), "skill-ir-adapter-status-"));
    tempDirs.push(workDir);
    const task: SkillIRBenchmarkTask = {
      id: "adapter-status-task",
      split: "development",
      prompt: "Create an artifact.",
      successCriteria: [],
      eval: [{ method: "custom", id: "must-not-run", evaluatorId: "skill-ir-test-should-not-run" }],
    };
    const baseRow: RawAgentRunRow = {
      caseId: "artifact-skill:skvm:windows:clean:adapter-status-task",
      system: "original",
      taskPath: "tmp/task.json",
      workDir,
      exitCode: 0,
      durationMs: 10,
      stdout: "Final output:\nResidual output.",
      stderr: "",
      successSource: "execution-only",
    };

    const scored = await scoreRawRunRows(
      [
        { ...baseRow, runStatus: "timeout" },
        { ...baseRow, runStatus: "adapter-crashed" },
      ],
      new Map([[task.id, task]]),
    );

    expect(evaluatorCalls).toBe(0);
    expect(scored[0]).toMatchObject({
      success: false,
      failureType: "infrastructure",
      failureStage: "execution",
      ruleViolations: 0,
      failedCriteria: ["adapter runStatus timeout"],
    });
    expect(scored[1]).toMatchObject({
      success: false,
      failureType: "infrastructure",
      failureStage: "execution",
      ruleViolations: 0,
      failedCriteria: ["adapter runStatus adapter-crashed"],
    });
  });

  test("classifyFailureType treats every non-ok adapter RunStatus as infrastructure", () => {
    for (const runStatus of ["timeout", "adapter-crashed", "parse-failed", "tainted"] as const) {
      expect(classifyFailureType({
        exitCode: 0,
        runStatus,
        stdout: "Final output:\nResidual output.",
        stderr: "",
      })).toBe("infrastructure");
    }
  });

  test("classifyFailureType treats missing provider credentials as infrastructure", () => {
    expect(
      classifyFailureType({
        exitCode: 1,
        stdout: "Task failed",
        stderr:
          'Run failed: ProviderAuthError: Route "xty/*" (kind=openai-compatible) requires env var SKVM_XTY_API_KEY, which is not set',
      }),
    ).toBe("infrastructure");
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

  test("score-real-agent-runs CLI can load task definitions from a corpus manifest", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "skill-ir-scoring-manifest-"));
    tempDirs.push(tempDir);
    const rawPath = join(tempDir, "raw-runs.jsonl");
    const outPath = join(tempDir, "main-results.jsonl");

    await writeFile(
      rawPath,
      [
        {
          caseId: "skill-review:skvm:linux:clean:shared-task",
          system: "original",
          taskPath: "tmp/review-task.json",
          exitCode: 0,
          durationMs: 100,
          stdout: "Final output:\nFindings\n- Behavioral bug creates a regression risk.",
          stderr: "",
          successSource: "execution-only",
        },
        {
          caseId: "skill-diagnostic:skvm:linux:clean:shared-task",
          system: "original",
          taskPath: "tmp/diagnostic-task.json",
          exitCode: 0,
          durationMs: 100,
          stdout: "Final output:\nAll done.",
          stderr: "",
          successSource: "execution-only",
        },
      ].map((row) => JSON.stringify(row)).join("\n") + "\n",
      "utf8",
    );
    await writeJson(join(tempDir, "benchmarks/skill-ir/tasks/review.json"), {
      schemaVersion: "skill-ir-tasks/v1",
      skillId: "skill-review",
      tasks: [
        {
          ...findingOrderTask,
          id: "shared-task",
        },
      ],
    });
    await writeJson(join(tempDir, "benchmarks/skill-ir/tasks/diagnostic.json"), {
      schemaVersion: "skill-ir-tasks/v1",
      skillId: "skill-diagnostic",
      tasks: [
        {
          id: "shared-task",
          split: "development",
          prompt: "A diagnostic task with no heuristic criteria yet.",
          successCriteria: [],
        },
      ],
    });
    await writeJson(join(tempDir, "benchmarks/skill-ir/corpus/manifest.json"), {
      schemaVersion: "skill-ir-corpus/v1",
      skills: [
        { id: "skill-review", tasksPath: "benchmarks/skill-ir/tasks/review.json" },
        { id: "skill-diagnostic", tasksPath: "benchmarks/skill-ir/tasks/diagnostic.json" },
      ],
    });

    const proc = Bun.spawn([
      "bun",
      "./src/benchmarks/skill-ir/score-real-agent-runs.ts",
      `--raw=${rawPath}`,
      `--manifest=${join(tempDir, "benchmarks/skill-ir/corpus/manifest.json")}`,
      `--root-dir=${tempDir}`,
      `--out=${outPath}`,
    ]);
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    expect({ stdout, stderr, exitCode }).toMatchObject({ exitCode: 0 });
    const scoredRows = (await Bun.file(outPath).text())
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line));
    expect(scoredRows).toHaveLength(2);
    expect(scoredRows.map((row) => [row.skill, row.task, row.success])).toEqual([
      ["skill-review", "shared-task", true],
      ["skill-diagnostic", "shared-task", true],
    ]);
  });
});
