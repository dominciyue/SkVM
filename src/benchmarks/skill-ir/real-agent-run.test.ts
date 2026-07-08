import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { SkillIR } from "../../skill-ir/schema";
import { buildPlan, type RealAgentRunArgs } from "./real-agent-run";

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

function irFixture(id: string, name: string, sourceText: string): SkillIR {
  return {
    schemaVersion: "skill-ir/v1",
    id,
    name,
    category: ["workflow"],
    intent: `Execute ${name} consistently.`,
    source: { kind: "inline", text: sourceText },
    inputs: [],
    outputs: [],
    preconditions: [],
    steps: [
      {
        id: "step-main",
        title: "Main step",
        description: "Perform the main benchmark action.",
        kind: "execute",
        required: true,
        dependsOn: [],
        toolRefs: [],
        produces: ["result"],
        successCheckRefs: [],
        failureModes: [],
      },
    ],
    rules: [],
    tools: [],
    environment: [],
    checks: [],
    recovery: [],
    profile: [],
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function createMultiSkillRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "skill-ir-real-agent-run-"));
  tempDirs.push(root);

  await writeJson(join(root, "benchmarks/skill-ir/contexts/standard-contexts.json"), {
    schemaVersion: "skill-ir-contexts/v1",
    contexts: [{ id: "clean", description: "Clean context." }],
  });
  await writeJson(
    join(root, "benchmarks/skill-ir/ir/review.json"),
    irFixture("skill-review", "Review Skill", "Review source text."),
  );
  await writeJson(
    join(root, "benchmarks/skill-ir/ir/diagnostic.json"),
    irFixture("skill-diagnostic", "Diagnostic Skill", "Diagnostic source text."),
  );
  await writeJson(join(root, "benchmarks/skill-ir/tasks/review.json"), {
    schemaVersion: "skill-ir-tasks/v1",
    skillId: "skill-review",
    tasks: [{ id: "review-task", split: "development", prompt: "Review task prompt.", successCriteria: [] }],
  });
  await writeJson(join(root, "benchmarks/skill-ir/tasks/diagnostic.json"), {
    schemaVersion: "skill-ir-tasks/v1",
    skillId: "skill-diagnostic",
    tasks: [{ id: "diagnostic-task", split: "development", prompt: "Diagnostic task prompt.", successCriteria: [] }],
  });
  await writeJson(join(root, "benchmarks/skill-ir/corpus/manifest.json"), {
    schemaVersion: "skill-ir-corpus/v1",
    categories: ["workflow"],
    targetCounts: { taxonomySkills: 2, fullIRSkills: 2, deepBenchmarkSkills: 2 },
    skills: [
      {
        id: "skill-review",
        name: "Review Skill",
        category: ["workflow"],
        depth: "deep-benchmark",
        irPath: "benchmarks/skill-ir/ir/review.json",
        tasksPath: "benchmarks/skill-ir/tasks/review.json",
      },
      {
        id: "skill-diagnostic",
        name: "Diagnostic Skill",
        category: ["workflow"],
        depth: "deep-benchmark",
        irPath: "benchmarks/skill-ir/ir/diagnostic.json",
        tasksPath: "benchmarks/skill-ir/tasks/diagnostic.json",
      },
    ],
  });

  return root;
}

describe("real-agent-run manifest loading", () => {
  test("buildPlan materializes each skill with its own IR and task file", async () => {
    const rootDir = await createMultiSkillRoot();
    const args: RealAgentRunArgs = {
      model: "test/model",
      adapter: "bare-agent",
      outDir: join(rootDir, "out"),
      limit: 10,
      execute: false,
      retries: 0,
      retryDelayMs: 1000,
      rootDir,
      systems: new Set(["original"]),
      contexts: new Set(["clean"]),
    };

    const plan = await buildPlan(args);

    expect(plan.map((entry) => entry.caseId)).toContain("skill-review:skvm:linux:clean:review-task");
    expect(plan.map((entry) => entry.caseId)).toContain("skill-diagnostic:skvm:linux:clean:diagnostic-task");
    expect(plan.every((entry) => !entry.caseId.includes("skill-review:skvm:linux:clean:diagnostic-task"))).toBe(true);
    expect(plan.every((entry) => !entry.caseId.includes("skill-diagnostic:skvm:linux:clean:review-task"))).toBe(true);

    const skillTexts = await Promise.all(plan.map((entry) => Bun.file(entry.skillPath!).text()));
    expect(skillTexts.some((text) => text.includes("Review source text."))).toBe(true);
    expect(skillTexts.some((text) => text.includes("Diagnostic source text."))).toBe(true);
  });
});
