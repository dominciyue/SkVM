import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseScoringArgs } from "./score-real-agent-runs";

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe("score-real-agent-runs arguments", () => {
  test("accepts an explicit corpus for registry-backed multi-skill scoring", () => {
    expect(parseScoringArgs(["--corpus=pilot"])).toMatchObject({ corpus: "pilot" });
  });

  test("parses the explicit tasks-authored scoring opt-in and rejects ambiguous use", () => {
    expect(parseScoringArgs(["--corpus=pilot", "--allow-tasks-authored"])).toMatchObject({
      corpus: "pilot",
      allowTasksAuthored: true,
    });
    expect(() => parseScoringArgs(["--corpus=calibration", "--allow-tasks-authored"])).toThrow(
      "requires --corpus=pilot",
    );
    expect(() => parseScoringArgs(["--manifest=tmp/pilot.json", "--allow-tasks-authored"])).toThrow(
      "requires --corpus=pilot",
    );
  });

  test("requires the pre-IR runtime normalizer to stay on the tasks-authored pilot path", () => {
    expect(parseScoringArgs([
      "--corpus=pilot",
      "--allow-tasks-authored",
      "--normalize-pre-ir-runtime",
    ]).normalizePreIrRuntime).toBe(true);
    expect(() => parseScoringArgs(["--corpus=pilot", "--normalize-pre-ir-runtime"]))
      .toThrow("requires --corpus=pilot and --allow-tasks-authored");
    expect(() => parseScoringArgs(["--corpus=calibration", "--normalize-pre-ir-runtime"]))
      .toThrow("requires --corpus=pilot and --allow-tasks-authored");
  });

  test("rejects unknown corpora and corpus/manifest ambiguity", () => {
    expect(() => parseScoringArgs(["--corpus=unknown"])).toThrow("Unknown Skill IR corpus");
    expect(() => parseScoringArgs(["--corpus=pilot", "--manifest=tmp/pilot.json"])).toThrow(
      "mutually exclusive",
    );
  });

  test("CLI awaits explicit evaluators and writes deterministic scored rows", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "skill-ir-score-cli-"));
    tempDirs.push(tempDir);
    const workDir = join(tempDir, "workdir");
    const rawPath = join(tempDir, "raw-runs.jsonl");
    const tasksPath = join(tempDir, "tasks.json");
    const outPath = join(tempDir, "scored.jsonl");
    await mkdir(workDir, { recursive: true });
    await Bun.write(join(workDir, "output.txt"), "artifact ok\n");
    await writeFile(rawPath, `${JSON.stringify({
      caseId: "artifact-skill:skvm:windows:clean:artifact-task",
      system: "original",
      taskPath: "tmp/task.json",
      workDir,
      exitCode: 0,
      durationMs: 20,
      stdout: "Final output:\nCreated output.txt.",
      stderr: "",
      successSource: "execution-only",
    })}\n`, "utf8");
    await writeFile(tasksPath, `${JSON.stringify({
      skillId: "artifact-skill",
      tasks: [{
        id: "artifact-task",
        split: "development",
        prompt: "Create output.txt.",
        successCriteria: [],
        eval: [{
          method: "file-check",
          id: "output-ok",
          path: "output.txt",
          mode: "contains",
          expected: "artifact ok",
        }],
        hardGateIds: ["output-ok"],
      }],
    })}\n`, "utf8");

    const proc = Bun.spawn([
      "bun",
      "./src/benchmarks/skill-ir/score-real-agent-runs.ts",
      `--raw=${rawPath}`,
      `--tasks=${tasksPath}`,
      `--out=${outPath}`,
    ]);
    const [stderr, exitCode] = await Promise.all([
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    expect({ stderr, exitCode }).toMatchObject({ exitCode: 0 });
    expect(await Bun.file(outPath).json()).toMatchObject({
      success: true,
      successSource: "deterministic-evaluator",
      evaluatorScore: 1,
      failedCriteria: [],
      evaluationSummary: [{ id: "output-ok", method: "file-check", pass: true, score: 1 }],
    });
  });

  test("CLI rejects workdirs outside the raw-run root and symlinks escaping it", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "skill-ir-score-workdir-boundary-"));
    tempDirs.push(tempDir);
    const runRoot = join(tempDir, "run-root");
    const outsideDir = join(tempDir, "outside");
    const tasksPath = join(runRoot, "tasks.json");
    await Promise.all([
      mkdir(runRoot, { recursive: true }),
      mkdir(outsideDir, { recursive: true }),
    ]);
    await writeFile(join(outsideDir, "output.txt"), "ok\n", "utf8");
    await writeFile(tasksPath, `${JSON.stringify({
      skillId: "artifact-skill",
      tasks: [{
        id: "artifact-task",
        split: "development",
        prompt: "Create output.txt.",
        successCriteria: [],
        eval: [{ method: "file-check", id: "output-ok", path: "output.txt", mode: "contains", expected: "ok" }],
      }],
    })}\n`, "utf8");

    const runCli = async (workDir: string, suffix: string) => {
      const rawPath = join(runRoot, `raw-${suffix}.jsonl`);
      const outPath = join(runRoot, `scored-${suffix}.jsonl`);
      await writeFile(rawPath, `${JSON.stringify({
        caseId: "artifact-skill:skvm:windows:clean:artifact-task",
        system: "original",
        taskPath: "tmp/task.json",
        workDir,
        exitCode: 0,
        durationMs: 20,
        stdout: "Final output:\nDone.",
        stderr: "",
        successSource: "execution-only",
      })}\n`, "utf8");
      const proc = Bun.spawn([
        "bun",
        "./src/benchmarks/skill-ir/score-real-agent-runs.ts",
        `--raw=${rawPath}`,
        `--tasks=${tasksPath}`,
        `--out=${outPath}`,
      ], { stdout: "pipe", stderr: "pipe" });
      const [stderr, exitCode] = await Promise.all([
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      return { stderr, exitCode };
    };

    expect(await runCli(outsideDir, "outside")).toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining("outside raw-run output root"),
    });

    const escapingLink = join(runRoot, "escaping-workdir-link");
    await symlink(outsideDir, escapingLink, process.platform === "win32" ? "junction" : "dir");
    expect(await runCli(escapingLink, "symlink")).toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining("outside raw-run output root"),
    });
  });

  test("CLI opt-in scores tasks-authored development rows but keeps held-out tasks unavailable", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "skill-ir-score-tasks-authored-"));
    tempDirs.push(tempDir);
    const runRoot = join(tempDir, "results", "run");
    const workDir = join(runRoot, "artifacts", "case", "workdir");
    const tasksPath = "benchmarks/skill-ir/pilots/env-manager/tasks.json";
    await mkdir(workDir, { recursive: true });
    await writeFile(join(workDir, "output.txt"), "artifact ok\n", "utf8");
    await mkdir(join(tempDir, "benchmarks/skill-ir/corpus/corpora"), { recursive: true });
    await mkdir(join(tempDir, "benchmarks/skill-ir/pilots/env-manager"), { recursive: true });
    await writeFile(join(tempDir, "benchmarks/skill-ir/corpus/manifest.json"), JSON.stringify({
      schemaVersion: "skill-ir-corpus-registry/v1",
      corpora: {
        calibration: { manifestPath: "benchmarks/skill-ir/corpus/corpora/calibration.json", role: "test" },
        pilot: { manifestPath: "benchmarks/skill-ir/corpus/corpora/pilot.json", role: "test" },
      },
    }), "utf8");
    await writeFile(join(tempDir, "benchmarks/skill-ir/corpus/corpora/pilot.json"), JSON.stringify({
      schemaVersion: "skill-ir-corpus/v2",
      corpusId: "pilot",
      skills: [{ id: "env-manager", status: "tasks-authored", tasksPath }],
    }), "utf8");
    await writeFile(join(tempDir, tasksPath), JSON.stringify({
      schemaVersion: "skill-ir-tasks/v1",
      skillId: "env-manager",
      tasks: [
        {
          id: "env-dev",
          split: "development",
          prompt: "Create output.txt.",
          successCriteria: [],
          eval: [{ method: "file-check", id: "output-ok", path: "output.txt", mode: "contains", expected: "artifact ok" }],
        },
        {
          id: "env-heldout",
          split: "held-out",
          prompt: "Create output.txt.",
          successCriteria: [],
          eval: [{ method: "file-check", id: "output-ok", path: "output.txt", mode: "contains", expected: "artifact ok" }],
        },
      ],
    }), "utf8");

    const runCli = async (taskId: string, suffix: string, allowTasksAuthored: boolean) => {
      const rawPath = join(runRoot, `raw-${suffix}.jsonl`);
      const outPath = join(runRoot, `scored-${suffix}.jsonl`);
      await writeFile(rawPath, `${JSON.stringify({
        caseId: `env-manager:skvm:windows:clean:${taskId}`,
        system: "original",
        taskPath: "task.json",
        workDir,
        exitCode: 0,
        durationMs: 20,
        stdout: "Final output:\nCreated output.txt.",
        stderr: "",
        successSource: "execution-only",
      })}\n`, "utf8");
      const command = [
        "bun",
        "./src/benchmarks/skill-ir/score-real-agent-runs.ts",
        "--corpus=pilot",
        `--root-dir=${tempDir}`,
        `--raw=${rawPath}`,
        `--out=${outPath}`,
      ];
      if (allowTasksAuthored) {
        command.push("--allow-tasks-authored");
      }
      const proc = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" });
      const [stderr, exitCode] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
      return { stderr, exitCode, outPath };
    };

    expect(await runCli("env-dev", "default", false)).toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining("was not found while scoring"),
    });
    const development = await runCli("env-dev", "development", true);
    expect(development).toMatchObject({ exitCode: 0 });
    expect(await Bun.file(development.outPath).json()).toMatchObject({
      taskSplit: "development",
      success: true,
      successSource: "deterministic-evaluator",
    });
    expect(await runCli("env-heldout", "heldout", true)).toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining("was not found while scoring"),
    });
  });
});
