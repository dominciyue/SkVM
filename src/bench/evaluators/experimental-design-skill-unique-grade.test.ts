import { createHash } from "node:crypto"
import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { RunResult } from "../../core/types.ts"
import {
  writeInitialWorkdirManifest,
  type InitialWorkdirManifestReference,
} from "../../core/workdir-manifest.ts"
import { customEvaluators } from "../../framework/types.ts"
import { customEvaluatorSourceDigests } from "./index.ts"
import {
  ExperimentalDesignSkillUniqueGradePayloadSchema,
  experimentalDesignSkillUniqueGrade,
} from "./experimental-design-skill-unique-grade.ts"

const temporaryDirectories = new Set<string>()
const initialManifestByWorkDir = new Map<string, InitialWorkdirManifestReference>()

const graph = {
  schemaVersion: "skill-ir-experimental-design-study-graph/v1",
  studyId: "nested-cells",
  question: "Does diet alter expression?",
  entities: [
    { type: "cage", parentType: null, totalCount: 8 },
    { type: "mouse", parentType: "cage", totalCount: 32 },
    { type: "cell", parentType: "mouse", totalCount: 3200 },
  ],
  treatment: { name: "diet", assignedToEntityType: "cage" },
  response: { name: "expression", observedOnEntityType: "cell" },
}

const publicInterface = {
  schemaVersion: "skill-ir-experimental-design-skill-unique-interface/v1",
  interfaceId: "experimental-design-skill-unique-interface-v1",
}

const checks = [
  "input-integrity",
  "artifact-contract",
  "independent-replication",
  "pseudoreplication-guard",
  "analysis-alignment",
] as const

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function payload(check: string, graphBytes: string, interfaceBytes: string): unknown {
  return {
    schemaVersion: "skill-ir-experimental-design-skill-unique-eval/v1",
    check,
    paths: {
      studyGraph: "study-graph.json",
      interface: "analysis-interface.json",
      replicationPlan: "design/replication-plan.json",
      analysisPlan: "design/analysis-plan.json",
    },
    protectedSha256: {
      studyGraph: sha256(graphBytes),
      interface: sha256(interfaceBytes),
    },
  }
}

function runResult(workDir: string): RunResult {
  return {
    text: "complete",
    steps: [],
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    cost: 0,
    durationMs: 0,
    llmDurationMs: 0,
    workDir,
    initialWorkdirManifest: initialManifestByWorkDir.get(workDir),
    runStatus: "ok",
  }
}

async function grade(check: string, fixture: {
  workDir: string
  graphBytes: string
  interfaceBytes: string
}) {
  return experimentalDesignSkillUniqueGrade.run({
    criterion: {
      method: "custom",
      evaluatorId: "skill-ir-experimental-design-skill-unique",
      payload: payload(check, fixture.graphBytes, fixture.interfaceBytes),
    },
    runResult: runResult(fixture.workDir),
  })
}

async function writeFixture(overrides: {
  replication?: Record<string, unknown>
  analysis?: Record<string, unknown>
  extraOutput?: boolean
} = {}) {
  const workDir = await mkdtemp(path.join(tmpdir(), "skvm-skill-unique-grade-"))
  temporaryDirectories.add(workDir)
  const graphBytes = json(graph)
  const interfaceBytes = json(publicInterface)
  await writeFile(path.join(workDir, "study-graph.json"), graphBytes, "utf8")
  await writeFile(path.join(workDir, "analysis-interface.json"), interfaceBytes, "utf8")
  const manifest = await writeInitialWorkdirManifest({
    workDir,
    manifestPath: `${workDir}-initial-workdir-manifest.json`,
  })
  initialManifestByWorkDir.set(workDir, manifest)
  await mkdir(path.join(workDir, "design"))
  await writeFile(path.join(workDir, "design/replication-plan.json"), json({
    studyId: graph.studyId,
    independentReplicateUnit: "cage",
    independentReplicateCount: 8,
    measurementUnit: "cell",
    pseudoreplicationRisk: true,
    rationale: "Independent treatment is applied to cages.",
    ...overrides.replication,
  }), "utf8")
  await writeFile(path.join(workDir, "design/analysis-plan.json"), json({
    rationale: "保留下层观测并尊重完整嵌套。",
    groupingFactors: ["mouse", "cage"],
    method: "任意层次模型",
    analysisUnit: "cell",
    studyId: graph.studyId,
    ...overrides.analysis,
  }), "utf8")
  if (overrides.extraOutput) {
    await writeFile(path.join(workDir, "debug.txt"), "unexpected\n", "utf8")
  }
  return { workDir, graphBytes, interfaceBytes }
}

afterEach(async () => {
  await Promise.all([...temporaryDirectories].map((directory) =>
    rm(directory, { recursive: true, force: true })
  ))
  temporaryDirectories.clear()
  initialManifestByWorkDir.clear()
})

describe("experimental-design skill-unique evaluator", () => {
  test("registers a closed payload without answer fields and binds source digest", async () => {
    expect(customEvaluators.get("skill-ir-experimental-design-skill-unique")).toBe(
      experimentalDesignSkillUniqueGrade,
    )
    expect(() => ExperimentalDesignSkillUniqueGradePayloadSchema.parse({
      ...(payload("input-integrity", "{}", "{}") as object),
      expected: { replicate: "cage" },
    })).toThrow()
    expect(customEvaluatorSourceDigests.get(
      "skill-ir-experimental-design-skill-unique",
    )).toBe(sha256(await readFile(
      path.join(process.cwd(), "src/bench/evaluators/experimental-design-skill-unique-grade.ts"),
      "utf8",
    )))
  })

  test("passes all five criteria for a hierarchical alternative", async () => {
    const fixture = await writeFixture()
    for (const check of checks) {
      expect(await grade(check, fixture)).toMatchObject({ pass: true, score: 1 })
    }
  })

  test("also accepts aggregate-to-replicate analysis", async () => {
    const fixture = await writeFixture({
      analysis: {
        analysisUnit: "cage",
        groupingFactors: [],
        method: "Aggregate first",
        rationale: "One response per independently treated cage.",
      },
    })
    expect(await grade("analysis-alignment", fixture)).toMatchObject({ pass: true, score: 1 })
  })

  test("separately rejects replicate, pseudoreplication, and grouping mistakes", async () => {
    const replicate = await writeFixture({
      replication: { independentReplicateUnit: "cell", independentReplicateCount: 3200 },
    })
    expect(await grade("independent-replication", replicate)).toMatchObject({ pass: false, score: 0 })

    const pseudoreplication = await writeFixture({
      replication: { pseudoreplicationRisk: false },
    })
    expect(await grade("pseudoreplication-guard", pseudoreplication)).toMatchObject({ pass: false, score: 0 })

    const grouping = await writeFixture({
      analysis: { groupingFactors: ["mouse"] },
    })
    expect(await grade("analysis-alignment", grouping)).toMatchObject({ pass: false, score: 0 })
  })

  test("rejects input mutation, missing output, and extra output", async () => {
    const mutated = await writeFixture()
    await writeFile(path.join(mutated.workDir, "study-graph.json"), "{}\n", "utf8")
    expect(await grade("input-integrity", mutated)).toMatchObject({ pass: false, score: 0 })

    const missing = await writeFixture()
    await rm(path.join(missing.workDir, "design/analysis-plan.json"))
    expect(await grade("artifact-contract", missing)).toMatchObject({ pass: false, score: 0 })

    const extra = await writeFixture({ extraOutput: true })
    expect(await grade("artifact-contract", extra)).toMatchObject({ pass: false, score: 0 })
  })

  test("classifies unsafe symlink paths as infrastructure", async () => {
    const fixture = await writeFixture()
    const outside = await mkdtemp(path.join(tmpdir(), "skvm-skill-unique-outside-"))
    temporaryDirectories.add(outside)
    const outsideFile = path.join(outside, "study-graph.json")
    await writeFile(outsideFile, fixture.graphBytes, "utf8")
    await rm(path.join(fixture.workDir, "study-graph.json"))
    try {
      await symlink(outsideFile, path.join(fixture.workDir, "study-graph.json"), "file")
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes((error as NodeJS.ErrnoException).code ?? "")) return
      throw error
    }
    const result = await grade("input-integrity", fixture)
    expect(result.infraError).toBeDefined()
  })
})
