import { afterEach, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  SkillContributionIdentifiabilityManifestSchema,
  analyzeSkillContribution,
  verifyContributionManifest,
  type SkillContributionIdentifiabilityManifest,
} from "./skill-contribution-identifiability.ts"
import {
  contributionIdentifiabilityExitCode,
  parseSkillContributionIdentifiabilityArgs,
  runSkillContributionIdentifiability,
} from "./skill-contribution-identifiability-run.ts"

const roots: string[] = []
const REPO_ROOT = join(import.meta.dir, "..", "..", "..")

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

async function fixture(): Promise<{
  rootDir: string
  manifest: SkillContributionIdentifiabilityManifest
}> {
  const rootDir = await mkdtemp(join(tmpdir(), "skvm-contribution-audit-"))
  roots.push(rootDir)
  await mkdir(join(rootDir, "pilot"), { recursive: true })

  const tasks = JSON.stringify({
    tasks: [
      {
        id: "demo-dev-a",
        split: "development",
        prompt: "Produce the public output ABI.",
        fixtures: { "src/App.tsx": "const greeting = `Hello ${name}`" },
      },
      {
        id: "demo-dev-b",
        split: "development",
        prompt: "Preserve observable behavior.",
        fixtures: { "src/Other.tsx": "const repeated = ['Save', 'Save']" },
      },
    ],
  })
  const source = [
    "Reject interpolation variables that disappear during extraction.",
    "Reuse one stable key when repeated text has the same meaning.",
  ].join("\n")
  const scorer = [
    "const interpolationCriterion = 'interpolation-safety'",
    "const reuseCriterion = 'stable-key-reuse'",
  ].join("\n")
  const canaries = JSON.stringify({
    canonical: true,
    alternative: true,
    promptOnlyOmission: true,
    reverseEvidence: true,
    forbiddenSink: true,
  })

  const files = {
    "pilot/tasks.json": tasks,
    "pilot/SKILL.md": source,
    "pilot/scorer.ts": scorer,
    "pilot/canaries.json": canaries,
  } as const
  await Promise.all(Object.entries(files).map(([path, text]) => writeFile(join(rootDir, path), text)))

  const bound = (path: keyof typeof files) => ({ path, sha256: sha256(files[path]) })
  const canary = (
    id: string,
    role: "canonical-valid" | "alternative-valid" | "prompt-only-omission" | "reverse-evidence" | "forbidden-sink",
    jsonPointer: string,
    taskIds = ["demo-dev-a", "demo-dev-b"],
    claimIds = ["interpolation-rule", "stable-key-rule"],
    expected: boolean = true,
  ) => ({
    id,
    role,
    taskIds,
    claimIds,
    observation: { ...bound("pilot/canaries.json"), jsonPointer, expected },
  })

  const manifest = SkillContributionIdentifiabilityManifestSchema.parse({
    schemaVersion: "skill-contribution-identifiability/v1",
    auditId: "demo-contribution-v1",
    skillId: "demo-skill",
    taskSetId: "demo-task-set-v1",
    scope: {
      split: "development",
      taskIds: ["demo-dev-a", "demo-dev-b"],
    },
    criteria: [
      {
        id: "public-output-a",
        taskId: "demo-dev-a",
        weight: 0.6,
        hardGate: false,
        claimIds: ["public-output"],
        provenance: ["task-outcome"],
      },
      {
        id: "interpolation-safety",
        taskId: "demo-dev-a",
        weight: 0.4,
        hardGate: true,
        claimIds: ["interpolation-rule"],
        provenance: ["skill-derived"],
      },
      {
        id: "public-output-b",
        taskId: "demo-dev-b",
        weight: 0.65,
        hardGate: false,
        claimIds: ["public-output"],
        provenance: ["task-outcome"],
      },
      {
        id: "stable-key-reuse",
        taskId: "demo-dev-b",
        weight: 0.35,
        hardGate: false,
        claimIds: ["stable-key-rule"],
        provenance: ["skill-derived"],
      },
    ],
    claims: [
      {
        id: "public-output",
        summary: "The task requests public outputs.",
        taskIds: ["demo-dev-a", "demo-dev-b"],
        failureMode: "missing-output",
        answerBearingDuplication: false,
        evidence: [{
          source: "task-outcome",
          kind: "task-set",
          ...bound("pilot/tasks.json"),
          quote: "Produce the public output ABI.",
        }],
      },
      {
        id: "interpolation-rule",
        summary: "Interpolation variables remain present after extraction.",
        taskIds: ["demo-dev-a"],
        failureMode: "lost-interpolation-variable",
        answerBearingDuplication: false,
        evidence: [{
          source: "skill-derived",
          kind: "skill-source",
          ...bound("pilot/SKILL.md"),
          quote: "Reject interpolation variables that disappear during extraction.",
        }, {
          source: "fixture-derived",
          kind: "task-set",
          ...bound("pilot/tasks.json"),
          quote: "const greeting = `Hello ${name}`",
        }, {
          source: "fixture-derived",
          kind: "scorer",
          ...bound("pilot/scorer.ts"),
          quote: "interpolation-safety",
        }],
      },
      {
        id: "stable-key-rule",
        summary: "Repeated text with the same meaning reuses one key.",
        taskIds: ["demo-dev-b"],
        failureMode: "duplicate-semantic-key",
        answerBearingDuplication: false,
        evidence: [{
          source: "skill-derived",
          kind: "skill-source",
          ...bound("pilot/SKILL.md"),
          quote: "Reuse one stable key when repeated text has the same meaning.",
        }, {
          source: "fixture-derived",
          kind: "task-set",
          ...bound("pilot/tasks.json"),
          quote: "const repeated = ['Save', 'Save']",
        }, {
          source: "fixture-derived",
          kind: "scorer",
          ...bound("pilot/scorer.ts"),
          quote: "stable-key-reuse",
        }],
      },
    ],
    canaries: [
      canary("canonical", "canonical-valid", "/canonical"),
      canary("alternative", "alternative-valid", "/alternative"),
      canary("omission", "prompt-only-omission", "/promptOnlyOmission"),
      canary("reverse", "reverse-evidence", "/reverseEvidence"),
      canary("sink", "forbidden-sink", "/forbiddenSink"),
    ],
    forbiddenEvidenceClasses: [
      "evaluation-split-task",
      "evaluator-expected",
      "historical-raw-model-text",
      "package-generated-answer",
      "secret",
      "absolute-path",
    ],
  })
  return { rootDir, manifest }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("skill contribution identifiability", () => {
  test("verifies bound evidence and grants baseline eligibility", async () => {
    const { rootDir, manifest } = await fixture()
    const verified = await verifyContributionManifest(manifest, rootDir)
    const report = analyzeSkillContribution(verified)

    expect(report.status).toBe("eligible-for-baseline")
    expect(report.counts).toMatchObject({
      tasks: 2,
      criteria: 4,
      claims: 3,
      independentSkillDerivedClaims: 2,
      answerBearingDuplications: 0,
      provenanceClaims: {
        taskOutcome: 1,
        fixtureDerived: 2,
        skillDerived: 2,
        overlap: 0,
        unmeasuredSkillDerived: 0,
      },
    })
    expect(report.coverage.taskSetSkillDerivedWeight).toBe(0.375)
    expect(report.coverage.byTask).toEqual([
      { taskId: "demo-dev-a", skillDerivedClaims: 1, skillDerivedWeight: 0.4 },
      { taskId: "demo-dev-b", skillDerivedClaims: 1, skillDerivedWeight: 0.35 },
    ])
    expect(report.gates).toEqual({
      enoughIndependentClaims: true,
      everyTaskMeasuresSkillClaim: true,
      enoughSkillDerivedWeightOrHardGate: true,
      noAnswerBearingDuplication: true,
      requiredCanariesPassed: true,
    })
    expect(JSON.stringify(report)).not.toMatch(
      /TEST_ONLY_HELDOUT|expectedAnswer|goldAnswer|raw-runs|model-output|sk-[A-Za-z0-9_-]{20,}/u,
    )
  })

  test("treats an expected false omission observation as a passing canary", async () => {
    const { rootDir, manifest } = await fixture()
    const canaryText = JSON.stringify({
      canonical: true,
      alternative: true,
      promptOnlyOmission: false,
      reverseEvidence: true,
      forbiddenSink: true,
    })
    await writeFile(join(rootDir, "pilot", "canaries.json"), canaryText)
    for (const canary of manifest.canaries) {
      canary.observation.sha256 = sha256(canaryText)
    }
    const omission = manifest.canaries.find((canary) => canary.role === "prompt-only-omission")!
    omission.observation.expected = false

    const report = analyzeSkillContribution(
      await verifyContributionManifest(manifest, rootDir),
    )

    expect(report.gates.requiredCanariesPassed).toBe(true)
    expect(report.canaries.find((canary) => canary.role === "prompt-only-omission")?.passed).toBe(true)
  })

  test("rejects unsafe paths, symlinks, digest drift, and quote drift", async () => {
    const { rootDir, manifest } = await fixture()
    const unsafe = structuredClone(manifest)
    unsafe.claims[0]!.evidence[0]!.path = "../tasks.json"
    expect(SkillContributionIdentifiabilityManifestSchema.safeParse(unsafe).success).toBe(false)

    const digestDrift = structuredClone(manifest)
    digestDrift.claims[0]!.evidence[0]!.sha256 = "0".repeat(64)
    await expect(verifyContributionManifest(digestDrift, rootDir)).rejects.toThrow("digest mismatch")

    const quoteDrift = structuredClone(manifest)
    quoteDrift.claims[1]!.evidence[0]!.quote = "TEST_ONLY_MISSING_SOURCE_QUOTE"
    await expect(verifyContributionManifest(quoteDrift, rootDir)).rejects.toThrow("evidence quote missing")

    await writeFile(join(rootDir, "outside.md"), "outside")
    await symlink(join(rootDir, "outside.md"), join(rootDir, "pilot", "linked.md"), "file")
    const linked = structuredClone(manifest)
    linked.claims[1]!.evidence[0] = {
      ...linked.claims[1]!.evidence[0]!,
      path: "pilot/linked.md",
      sha256: sha256("outside"),
      quote: "outside",
    }
    await expect(verifyContributionManifest(linked, rootDir)).rejects.toThrow("unsafe bound file")
  })

  test("rejects duplicate IDs, unknown sources, and non-normalized task weights", async () => {
    const { manifest } = await fixture()
    const duplicateClaim = structuredClone(manifest)
    duplicateClaim.claims.push(structuredClone(duplicateClaim.claims[0]!))
    expect(SkillContributionIdentifiabilityManifestSchema.safeParse(duplicateClaim).success).toBe(false)

    const duplicateCriterion = structuredClone(manifest)
    duplicateCriterion.criteria.push(structuredClone(duplicateCriterion.criteria[0]!))
    expect(SkillContributionIdentifiabilityManifestSchema.safeParse(duplicateCriterion).success).toBe(false)

    const unknownSource = structuredClone(manifest) as any
    unknownSource.claims[0].evidence[0].source = "model-derived"
    expect(SkillContributionIdentifiabilityManifestSchema.safeParse(unknownSource).success).toBe(false)

    const mislabeledKind = structuredClone(manifest) as any
    mislabeledKind.claims[1].evidence[0].source = "fixture-derived"
    expect(SkillContributionIdentifiabilityManifestSchema.safeParse(mislabeledKind).success).toBe(false)

    const badWeight = structuredClone(manifest)
    badWeight.criteria[0]!.weight = 0.5
    expect(SkillContributionIdentifiabilityManifestSchema.safeParse(badWeight).success).toBe(false)
  })

  test("removing source evidence removes skill-derived coverage", async () => {
    const { rootDir, manifest } = await fixture()
    const withoutSource = structuredClone(manifest)
    withoutSource.claims[1]!.evidence = withoutSource.claims[1]!.evidence.filter(
      (entry) => entry.source !== "skill-derived",
    )

    const verified = await verifyContributionManifest(withoutSource, rootDir)
    const report = analyzeSkillContribution(verified)
    expect(report.status).toBe("benchmark-underidentified")
    expect(report.counts.independentSkillDerivedClaims).toBe(1)
    expect(report.coverage.byTask[0]).toEqual({
      taskId: "demo-dev-a",
      skillDerivedClaims: 0,
      skillDerivedWeight: 0,
    })
    expect(report.gates.enoughIndependentClaims).toBe(false)
    expect(report.gates.everyTaskMeasuresSkillClaim).toBe(false)
  })

  test("fails the gate for answer-bearing overlap or an unobserved canary", async () => {
    const { rootDir, manifest } = await fixture()
    const duplicated = structuredClone(manifest)
    duplicated.claims[1]!.answerBearingDuplication = true
    const duplicatedReport = analyzeSkillContribution(
      await verifyContributionManifest(duplicated, rootDir),
    )
    expect(duplicatedReport.status).toBe("benchmark-underidentified")
    expect(duplicatedReport.gates.noAnswerBearingDuplication).toBe(false)

    await writeFile(join(rootDir, "pilot", "canaries.json"), JSON.stringify({
      canonical: true,
      alternative: true,
      promptOnlyOmission: false,
      reverseEvidence: true,
      forbiddenSink: true,
    }))
    const failedCanary = structuredClone(manifest)
    const canaryText = JSON.stringify({
      canonical: true,
      alternative: true,
      promptOnlyOmission: false,
      reverseEvidence: true,
      forbiddenSink: true,
    })
    for (const canary of failedCanary.canaries) {
      canary.observation.sha256 = sha256(canaryText)
    }
    const canaryReport = analyzeSkillContribution(
      await verifyContributionManifest(failedCanary, rootDir),
    )
    expect(canaryReport.status).toBe("benchmark-underidentified")
    expect(canaryReport.gates.requiredCanariesPassed).toBe(false)
  })

  test("rejects forbidden evidence sinks before they reach a report", async () => {
    const { rootDir, manifest } = await fixture()
    for (const forbidden of [
      "TEST_ONLY_HELDOUT_DO_NOT_CONSUME",
      "expectedAnswer",
      "goldAnswer",
      "raw-runs.jsonl",
      "model-output",
      "sk-TEST_ONLY_SECRET",
      "C:/private/absolute/path",
    ]) {
      const poisoned = structuredClone(manifest)
      poisoned.claims[0]!.summary = forbidden
      await expect(verifyContributionManifest(poisoned, rootDir)).rejects.toThrow(
        "forbidden evidence sink",
      )
    }
  })

  test("runs from explicit paths and maps the gate status to a process exit code", async () => {
    const { rootDir, manifest } = await fixture()
    const manifestPath = join(rootDir, "pilot", "contribution.json")
    const outPath = join(rootDir, "results", "report.json")
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

    expect(parseSkillContributionIdentifiabilityArgs([
      `--manifest=${manifestPath}`,
      `--out=${outPath}`,
    ])).toEqual({ manifestPath, outPath })
    expect(() => parseSkillContributionIdentifiabilityArgs(["--unknown=x"])).toThrow(
      "Unknown argument",
    )
    expect(() => parseSkillContributionIdentifiabilityArgs(["--manifest=only.json"])).toThrow(
      "--out is required",
    )

    const report = await runSkillContributionIdentifiability({
      rootDir,
      manifestPath,
      outPath,
    })
    expect(JSON.parse(await readFile(outPath, "utf8"))).toEqual(report)
    expect(contributionIdentifiabilityExitCode(report)).toBe(0)

    const underidentified = structuredClone(report)
    underidentified.status = "benchmark-underidentified"
    expect(contributionIdentifiabilityExitCode(underidentified)).toBe(1)
  })

  test("classifies the frozen i18n and Experimental Design development surfaces", async () => {
    const cases = [{
      path: "benchmarks/skill-ir/pilots/i18n-helper/v3/contribution-identifiability.json",
      expectedStatus: "benchmark-underidentified",
    }, {
      path: "benchmarks/skill-ir/pilots/experimental-design/v2/contribution-identifiability.json",
      expectedStatus: "benchmark-underidentified",
    }, {
      path: "benchmarks/skill-ir/pilots/experimental-design/v2/skill-unique/contribution-identifiability.json",
      expectedStatus: "eligible-for-baseline",
    }] as const

    const reports = new Map<string, ReturnType<typeof analyzeSkillContribution>>()
    for (const entry of cases) {
      const manifest = JSON.parse(await readFile(join(REPO_ROOT, entry.path), "utf8")) as unknown
      const report = analyzeSkillContribution(
        await verifyContributionManifest(manifest, REPO_ROOT),
      )
      expect(report.status).toBe(entry.expectedStatus)
      expect(JSON.stringify(report)).not.toMatch(
        /TEST_ONLY_HELDOUT|expectedAnswer|goldAnswer|raw-runs|model-output|sk-[A-Za-z0-9_-]{20,}/u,
      )
      reports.set(entry.path, report)
    }

    const i18n = reports.get(cases[0].path)!
    expect(i18n.counts.answerBearingDuplications).toBeGreaterThan(0)

    const legacy = reports.get(cases[1].path)!
    expect(legacy.counts.provenanceClaims).toMatchObject({
      fixtureDerived: 13,
      skillDerived: 6,
      overlap: 4,
      unmeasuredSkillDerived: 6,
    })
    expect(legacy.counts.independentSkillDerivedClaims).toBe(0)

    const skillUnique = reports.get(cases[2].path)!
    expect(skillUnique.counts.independentSkillDerivedClaims).toBe(3)
    expect(skillUnique.coverage.taskSetSkillDerivedWeight).toBe(0.8)
    expect(skillUnique.gates.requiredCanariesPassed).toBe(true)
  })
})
