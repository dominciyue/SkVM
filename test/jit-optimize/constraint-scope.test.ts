import { describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { normalizeSubmission } from "../../src/jit-optimize/optimizer.ts"
import { serializeContext } from "../../src/jit-optimize/workspace.ts"
import { OptimizationActionSchema, type Evidence } from "../../src/jit-optimize/types.ts"

function actionWithConstraints(): Record<string, unknown> {
  return {
    id: "extract-confirmed-text",
    kind: "generate-script",
    evidenceIds: ["0"],
    sourceRefs: ["SKILL.md#placeholder-preservation"],
    dependsOn: [],
    inputs: ["task-declared React source"],
    outputs: ["task-declared locale files"],
    preconditions: ["the task supplies a React source"],
    constraints: [
      {
        description: "Preserve interpolation identifiers.",
        scope: "skill",
        sourceRef: "SKILL.md#placeholder-preservation",
      },
      {
        description: "Do not run the network for this task.",
        scope: "task",
        sourceRef: "trace.jsonl#line:3#taskPrompt",
      },
      {
        description: "The observed run used a Windows work directory.",
        scope: "environment",
        sourceRef: "trace.jsonl#line:3#workDirPath",
      },
      {
        description: "Whether this contract applies to other frameworks is not established.",
        scope: "unknown",
        sourceRef: "trace.jsonl#line:3",
      },
    ],
    changedPaths: ["scripts/i18n_extract.mjs", "SKILL.md"],
    residualDuties: ["Translate extracted values."],
    verification: ["Compare locale keys with the task contract."],
  }
}

function evidence(): Evidence {
  return {
    taskId: "i18n-dev-001",
    taskPrompt: "Modify src/App.tsx and do not install packages or run the network.",
    conversationLog: [],
    runMeta: {
      tokens: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 },
      costUsd: 0,
      durationMs: 1234,
      runStatus: "ok",
      skillLoaded: true,
    },
    trace: {
      format: "skill-ir-run-summary/v1",
      representation: "run-summary",
      sourcePath: "trace.jsonl",
      inputSha256: "a".repeat(64),
      recordLocator: "line:3",
      taskIdSource: "source",
      adapter: "pi",
      model: "provider/model",
      system: "windows",
      workDirPath: "D:/observed/run/workdir",
      unknownFields: [],
      diagnostics: [],
    },
  }
}

describe("optimization constraint scope", () => {
  test("normalization preserves evidence-backed scope without promoting task conditions", () => {
    const submission = normalizeSubmission({
      rootCause: "The bounded mechanical step has no reusable program.",
      reasoning: "The permanent skill rule and current task conditions have different sources.",
      confidence: 0.8,
      changedFiles: ["scripts/i18n_extract.mjs", "SKILL.md"],
      actions: [actionWithConstraints()] as never,
    })

    expect(submission.actions?.[0]?.constraints).toEqual([
      expect.objectContaining({ scope: "skill", sourceRef: "SKILL.md#placeholder-preservation" }),
      expect.objectContaining({ scope: "task", sourceRef: "trace.jsonl#line:3#taskPrompt" }),
      expect.objectContaining({ scope: "environment", sourceRef: "trace.jsonl#line:3#workDirPath" }),
      expect.objectContaining({ scope: "unknown", sourceRef: "trace.jsonl#line:3" }),
    ])
  })

  test("legacy actions without scoped constraints remain valid", () => {
    const legacy = actionWithConstraints()
    delete legacy.constraints
    const parsed = OptimizationActionSchema.parse(legacy)
    expect(parsed.constraints).toBeUndefined()
  })

  test("workspace writes structured provenance buckets for skill, task, environment and unknown", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "constraint-scope-"))
    const skillDir = path.join(root, "skill")
    const optimizeDir = path.join(root, "optimize")
    await mkdir(skillDir, { recursive: true })
    await mkdir(optimizeDir, { recursive: true })
    await writeFile(
      path.join(skillDir, "SKILL.md"),
      "# i18n\n\nAlways preserve interpolation identifiers.\n",
    )

    try {
      await serializeContext(optimizeDir, [evidence()], [], { skillDir })
      const sources = JSON.parse(
        await readFile(path.join(optimizeDir, "CONSTRAINT_SOURCES.json"), "utf8"),
      )
      expect(sources.skill.sourceRef).toBe("SKILL.md")
      expect(sources.skill.note).toContain("permanent")
      expect(sources.tasks[0]).toMatchObject({
        evidenceIndex: 0,
        taskId: "i18n-dev-001",
        sourceRef: "trace.jsonl#line:3#taskPrompt",
        text: "Modify src/App.tsx and do not install packages or run the network.",
      })
      expect(sources.environments[0]).toMatchObject({
        evidenceIndex: 0,
        sourceRef: "trace.jsonl#line:3#environment",
        facts: {
          adapter: "pi",
          model: "provider/model",
          system: "windows",
          workDirPath: "D:/observed/run/workdir",
          runStatus: "ok",
        },
      })
      expect(sources.unknown.note).toContain("unknown")

      const template = JSON.parse(
        await readFile(path.join(optimizeDir, "submission.template.json"), "utf8"),
      )
      expect(template._shape_1_edit.actions[0].constraints).toEqual([
        expect.objectContaining({ scope: "skill", sourceRef: expect.any(String) }),
        expect.objectContaining({ scope: "task", sourceRef: expect.any(String) }),
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
