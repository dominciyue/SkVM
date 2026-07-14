import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
});
