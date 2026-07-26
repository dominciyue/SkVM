import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import {
  ExperimentalDesignV2PublicContractSourceAuditSchema,
  assessExperimentalDesignV2Allocation,
  deriveExperimentalDesignV2LimitationFlags,
  parseExperimentalDesignV2AllocationCsv,
  parseExperimentalDesignV2Study,
  type ExperimentalDesignV2AllocationRow,
  type ExperimentalDesignV2Study,
} from "./experimental-design-v2-contract.ts"

const v2Dir = path.join(
  import.meta.dir,
  "../../../benchmarks/skill-ir/pilots/experimental-design/v2",
)
const rootDir = path.join(import.meta.dir, "../../..")

const supportedCases = [
  ["individual", false, false],
  ["individual", true, false],
  ["individual", false, true],
  ["individual", true, true],
  ["cluster", false, false],
  ["cluster", true, false],
  ["cluster", false, true],
  ["cluster", true, true],
] as const

function studyValue(
  assignmentLevel: "individual" | "cluster",
  hasStrata: boolean,
  sequentialEnrollment: boolean,
): Record<string, unknown> {
  const unitPrefix = assignmentLevel === "cluster" ? "cluster" : "unit"
  return {
    studyId: `${assignmentLevel}-${hasStrata ? "stratified" : "plain"}-${
      sequentialEnrollment ? "sequential" : "final"
    }`,
    question: "Which arm improves the public response?",
    assignmentLevel,
    assignmentUnit: assignmentLevel === "cluster" ? "clinic" : "participant",
    analysisUnit: assignmentLevel === "cluster" ? "clinic" : "participant",
    response: "outcome",
    arms: ["control", "intervention"],
    seed: 17,
    nuisanceFactors: hasStrata ? ["site"] : [],
    sequentialEnrollment,
    units: Array.from({ length: 6 }, (_, index) => ({
      id: `${unitPrefix}-${index + 1}`,
      ...(hasStrata ? { stratum: index % 2 === 0 ? "north" : "south" } : {}),
    })),
  }
}

function legalAllocation(
  study: ExperimentalDesignV2Study,
  variant: 0 | 1,
): ExperimentalDesignV2AllocationRow[] {
  const offsets = new Map<string, number>()
  const rows = study.units.map((unit, inputIndex) => {
    const stratum = unit.stratum ?? ""
    const partitionIndex = offsets.get(stratum) ?? 0
    offsets.set(stratum, partitionIndex + 1)
    return {
      order: inputIndex + 1,
      unitId: unit.id,
      stratum,
      arm: study.arms[(partitionIndex + variant) % study.arms.length]!,
    }
  })
  return variant === 0 ? rows : rows.reverse()
}

function expectSemanticallyValid(
  study: ExperimentalDesignV2Study,
  rows: ExperimentalDesignV2AllocationRow[],
  hasStrata: boolean,
  sequentialEnrollment: boolean,
): void {
  expect(assessExperimentalDesignV2Allocation(study, rows)).toEqual({
    coverageValid: true,
    armsValid: true,
    strataValid: true,
    sequentialValid: true,
    properties: {
      preservesAssignmentUnits: true,
      balancesGlobally: !hasStrata,
      balancesWithinStrata: hasStrata,
      supportsSequentialEnrollment: sequentialEnrollment,
    },
  })
}

describe("experimental-design v2 public study and allocation semantics", () => {
  for (const [assignmentLevel, hasStrata, sequentialEnrollment] of supportedCases) {
    test(`accepts alternative ${assignmentLevel} strata=${hasStrata} sequential=${sequentialEnrollment} allocations`, () => {
      const study = parseExperimentalDesignV2Study(
        studyValue(assignmentLevel, hasStrata, sequentialEnrollment),
      )
      const first = legalAllocation(study, 0)
      const second = legalAllocation(study, 1)

      const assignments = (rows: ExperimentalDesignV2AllocationRow[]) => Object.fromEntries(
        rows.map((row) => [row.unitId, row.arm]),
      )
      expect(assignments(first)).not.toEqual(assignments(second))
      expect(first.map((row) => row.unitId)).not.toEqual(second.map((row) => row.unitId))
      expectSemanticallyValid(study, first, hasStrata, sequentialEnrollment)
      expectSemanticallyValid(study, second, hasStrata, sequentialEnrollment)
    })
  }

  test("rejects duplicate and empty assignment unit IDs", () => {
    const duplicate = studyValue("individual", false, false)
    duplicate.units = [{ id: "unit-1" }, { id: "unit-1" }]
    const empty = studyValue("individual", false, false)
    empty.units = [{ id: "unit-1" }, { id: "   " }]

    expect(() => parseExperimentalDesignV2Study(duplicate)).toThrow()
    expect(() => parseExperimentalDesignV2Study(empty)).toThrow()
  })

  test("rejects fewer than two, duplicate, and empty arms", () => {
    for (const arms of [["control"], ["control", "control"], ["control", " "]]) {
      expect(() => parseExperimentalDesignV2Study({
        ...studyValue("individual", false, false),
        arms,
      })).toThrow()
    }
  })

  test("rejects partial or empty strata", () => {
    const partial = studyValue("individual", true, false)
    partial.units = [{ id: "unit-1", stratum: "north" }, { id: "unit-2" }]
    const empty = studyValue("individual", true, false)
    empty.units = [{ id: "unit-1", stratum: "north" }, { id: "unit-2", stratum: " " }]

    expect(() => parseExperimentalDesignV2Study(partial)).toThrow()
    expect(() => parseExperimentalDesignV2Study(empty)).toThrow()
  })

  test("rejects a non-boolean sequential enrollment declaration", () => {
    expect(() => parseExperimentalDesignV2Study({
      ...studyValue("individual", false, false),
      sequentialEnrollment: "false",
    })).toThrow()
  })

  test("accepts a one-unit public study and its balanced sequential tail", () => {
    const study = parseExperimentalDesignV2Study({
      ...studyValue("individual", false, true),
      units: [{ id: "only-unit" }],
    })

    expect(assessExperimentalDesignV2Allocation(study, [
      { order: 1, unitId: "only-unit", stratum: "", arm: "control" },
    ])).toEqual({
      coverageValid: true,
      armsValid: true,
      strataValid: true,
      sequentialValid: true,
      properties: {
        preservesAssignmentUnits: true,
        balancesGlobally: true,
        balancesWithinStrata: false,
        supportsSequentialEnrollment: true,
      },
    })
  })

  test("rejects explicit nested member structures in cluster units", () => {
    for (const nestedField of ["members", "memberAssignments"] as const) {
      const nested = studyValue("cluster", false, false)
      nested.units = [
        { id: "cluster-1", [nestedField]: ["member-1"] },
        { id: "cluster-2" },
      ]
      expect(() => parseExperimentalDesignV2Study(nested)).toThrow()
    }
  })

  test("keeps cluster assignmentUnit free text and assesses units as indivisible assignments", () => {
    const study = parseExperimentalDesignV2Study({
      ...studyValue("cluster", false, false),
      assignmentUnit: "arbitrary public cohort label",
      units: [{ id: "cohort-a" }, { id: "cohort-b" }],
    })
    const rows = [
      { order: 2, unitId: "cohort-b", stratum: "", arm: "intervention" },
      { order: 1, unitId: "cohort-a", stratum: "", arm: "control" },
    ]

    expect(assessExperimentalDesignV2Allocation(study, rows)).toMatchObject({
      coverageValid: true,
      armsValid: true,
      properties: { preservesAssignmentUnits: true },
    })
    expect(assessExperimentalDesignV2Allocation(study, [rows[0]!, rows[0]!])).toMatchObject({
      coverageValid: false,
      properties: { preservesAssignmentUnits: false },
    })
  })

  test("treats global imbalance as diagnostic when strata are valid", () => {
    const study = parseExperimentalDesignV2Study(studyValue("individual", true, true))
    const assessment = assessExperimentalDesignV2Allocation(study, legalAllocation(study, 0))

    expect(assessment.strataValid).toBe(true)
    expect(assessment.sequentialValid).toBe(true)
    expect(assessment.properties.balancesWithinStrata).toBe(true)
    expect(assessment.properties.balancesGlobally).toBe(false)
  })

  test("reports coverage, arm, stratum, and sequential failures independently", () => {
    const plain = parseExperimentalDesignV2Study(studyValue("individual", false, false))
    const plainRows = legalAllocation(plain, 0)
    expect(assessExperimentalDesignV2Allocation(plain, [
      ...plainRows.slice(0, -1),
      { ...plainRows[0]!, order: plainRows.length },
    ])).toMatchObject({
      coverageValid: false,
      properties: { preservesAssignmentUnits: false },
    })
    expect(assessExperimentalDesignV2Allocation(plain, [
      { ...plainRows[0]!, arm: "unknown" },
      ...plainRows.slice(1),
    ])).toMatchObject({ armsValid: false })

    const stratified = parseExperimentalDesignV2Study(studyValue("individual", true, false))
    const stratifiedRows = legalAllocation(stratified, 0)
    expect(assessExperimentalDesignV2Allocation(stratified, [
      { ...stratifiedRows[0]!, stratum: "south" },
      ...stratifiedRows.slice(1),
    ])).toMatchObject({ strataValid: false })

    const sequential = parseExperimentalDesignV2Study(studyValue("cluster", false, true))
    const sequentialRows = legalAllocation(sequential, 0)
    sequentialRows[1] = { ...sequentialRows[1]!, arm: sequentialRows[0]!.arm }
    expect(assessExperimentalDesignV2Allocation(sequential, sequentialRows)).toMatchObject({
      sequentialValid: false,
      properties: { supportsSequentialEnrollment: false },
    })
  })

  test("parses quoted allocation CSV and rejects malformed rows", () => {
    expect(parseExperimentalDesignV2AllocationCsv([
      "order,unit_id,stratum,arm",
      "1,\"unit,1\",north,control",
      "2,unit-2,north,intervention",
    ].join("\n"))).toEqual([
      { order: 1, unitId: "unit,1", stratum: "north", arm: "control" },
      { order: 2, unitId: "unit-2", stratum: "north", arm: "intervention" },
    ])
    expect(() => parseExperimentalDesignV2AllocationCsv("unit_id,arm\nu1,control")).toThrow()
    expect(() => parseExperimentalDesignV2AllocationCsv(
      "order,unit_id,stratum,arm\n1.5,u1,,control",
    )).toThrow()
    expect(() => parseExperimentalDesignV2AllocationCsv(
      "order,unit_id,stratum,arm\n1,\"u1,,control",
    )).toThrow()
  })

  test("derives sorted unique limitation flags only from the public study", () => {
    const plain = parseExperimentalDesignV2Study(studyValue("individual", false, false))
    expect(deriveExperimentalDesignV2LimitationFlags(plain)).toEqual([
      "randomness-not-statistically-audited",
    ])

    const allFlags = parseExperimentalDesignV2Study({
      ...studyValue("cluster", true, true),
      analysisUnit: "participant",
    })
    expect(deriveExperimentalDesignV2LimitationFlags(allFlags)).toEqual([
      "analysis-unit-differs",
      "cluster-assignment",
      "randomness-not-statistically-audited",
      "sequential-enrollment",
      "stratified-assignment",
    ])
  })
})

type PublicContract = {
  contractId: string
  protectedInputs: string[]
  outputs: string[]
  passThreshold: number
  criterionWeights: Record<string, number>
  designPropertyKeys: string[]
  reportEvidenceOpening: string
  reportEvidenceClosing: string
  reportEvidenceGrammar: {
    blockCount: number
    openingMarker: string
    closingMarker: string
    topLevelType: string
    jsonMode: string
    encoding: string
    allowComments: boolean
    allowTrailingCommas: boolean
    allowDuplicateKeys: boolean
  }
  sourceClaimIds: string[]
}

type TaskSet = {
  schemaVersion: string
  skillId: string
  tasks: Array<{
    id: string
    split: string
    prompt: string
    fixtures: Record<string, string>
    successCriteria: string[]
    eval: Array<{
      method: string
      id: string
      name: string
      weight: number
      evaluatorId: string
      payload: {
        schemaVersion: string
        check: string
        paths: Record<string, string>
        protectedSha256: Record<string, string>
      }
    }>
    hardGateIds: string[]
    passThreshold: number
  }>
}

const criterionIds = [
  "design-input-integrity",
  "design-artifact-contract",
  "design-semantics",
  "design-allocation-safety",
  "design-report-consistency",
]
const criterionWeights = [0.1, 0.1, 0.25, 0.35, 0.2]
const criterionChecks = [
  "input-integrity",
  "artifact-contract",
  "design-semantics",
  "allocation-safety",
  "report-consistency",
]

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex")
}

async function loadJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T
}

describe("experimental-design v2 public contract provenance", () => {
  test("exposes only the approved public scoring contract", async () => {
    const contract = await loadJson<PublicContract>(path.join(v2Dir, "public-contract.json"))
    expect(contract.contractId).toBe("experimental-design-public-contract-v2")
    expect(contract.protectedInputs).toEqual(["study.json", "design-contract.json"])
    expect(contract.outputs).toEqual([
      "design/design-plan.json",
      "design/allocation.csv",
      "design/design-report.md",
    ])
    expect(contract.passThreshold).toBe(0.95)
    expect(contract.criterionWeights).toEqual({
      "design-input-integrity": 0.1,
      "design-artifact-contract": 0.1,
      "design-semantics": 0.25,
      "design-allocation-safety": 0.35,
      "design-report-consistency": 0.2,
    })
    expect(contract.designPropertyKeys).toEqual([
      "preservesAssignmentUnits",
      "balancesGlobally",
      "balancesWithinStrata",
      "supportsSequentialEnrollment",
    ])
    expect(contract.reportEvidenceOpening).toBe("```json design-evidence")
    expect(contract.reportEvidenceClosing).toBe("```")
    expect(contract.reportEvidenceGrammar).toEqual({
      blockCount: 1,
      openingMarker: contract.reportEvidenceOpening,
      closingMarker: contract.reportEvidenceClosing,
      topLevelType: "object",
      jsonMode: "strict",
      encoding: "UTF-8",
      allowComments: false,
      allowTrailingCommas: false,
      allowDuplicateKeys: false,
    })
    expect(contract.sourceClaimIds.length).toBeGreaterThan(0)
    expect(new Set(contract.sourceClaimIds).size).toBe(contract.sourceClaimIds.length)
    expect(JSON.stringify(contract)).not.toMatch(
      /expected|gold|canonical.?allocation|allocation.?schedule|prng|method.?enum|allowed.?methods/i,
    )
  })

  test("binds every public claim to licensed source bytes and exact quotes", async () => {
    const [contract, auditValue] = await Promise.all([
      loadJson<PublicContract>(path.join(v2Dir, "public-contract.json")),
      loadJson<unknown>(path.join(v2Dir, "public-contract-source-audit.json")),
    ])
    const audit = ExperimentalDesignV2PublicContractSourceAuditSchema.parse(auditValue)
    expect(new Set(audit.entries.map((entry) => entry.claimId))).toEqual(
      new Set(contract.sourceClaimIds),
    )
    expect(await readFile(path.join(
      rootDir,
      "benchmarks/skill-ir/pilots/experimental-design/source/LICENSE.upstream.md",
    ), "utf8")).toContain("MIT License")

    for (const entry of audit.entries) {
      expect(entry.source.path).toStartWith(
        "benchmarks/skill-ir/pilots/experimental-design/source/",
      )
      const bytes = await readFile(path.join(rootDir, ...entry.source.path.split("/")))
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(entry.source.sha256)
      expect(bytes.toString("utf8")).toContain(entry.quote)
    }
  })

  test("rejects duplicate claims, unsafe source paths, and empty quotes", async () => {
    const original = await loadJson<{
      schemaVersion: string
      contractId: string
      entries: Array<Record<string, unknown> & {
        claimId: string
        source: { path: string; sha256: string }
        quote: string
      }>
    }>(path.join(v2Dir, "public-contract-source-audit.json"))
    const duplicate = structuredClone(original)
    duplicate.entries[1]!.claimId = duplicate.entries[0]!.claimId
    const unsafe = structuredClone(original)
    unsafe.entries[0]!.source.path = "../private-gold.md"
    const emptyQuote = structuredClone(original)
    emptyQuote.entries[0]!.quote = ""

    expect(() => ExperimentalDesignV2PublicContractSourceAuditSchema.parse(duplicate)).toThrow()
    expect(() => ExperimentalDesignV2PublicContractSourceAuditSchema.parse(unsafe)).toThrow()
    expect(() => ExperimentalDesignV2PublicContractSourceAuditSchema.parse(emptyQuote)).toThrow()
  })
})

describe("experimental-design v2 physically separated task manifests", () => {
  test("authors the fixed 2+2 identities with split isolation", async () => {
    const [development, heldout] = await Promise.all([
      loadJson<TaskSet>(path.join(v2Dir, "development/tasks.json")),
      loadJson<TaskSet>(path.join(v2Dir, "heldout/tasks.json")),
    ])
    expect(development.schemaVersion).toBe("skill-ir-tasks/v1")
    expect(heldout.schemaVersion).toBe("skill-ir-tasks/v1")
    expect(development.skillId).toBe("experimental-design-v2")
    expect(heldout.skillId).toBe("experimental-design-v2")
    expect(development.tasks.map((task) => task.id)).toEqual([
      "experimental-design-v2-stratified-dev-001",
      "experimental-design-v2-cluster-sequential-dev-002",
    ])
    expect(heldout.tasks.map((task) => task.id)).toEqual([
      "experimental-design-v2-stratified-sequential-heldout-001",
      "experimental-design-v2-cluster-stratified-heldout-002",
    ])
    expect(development.tasks.every((task) => task.split === "development")).toBe(true)
    expect(heldout.tasks.every((task) => task.split === "held-out")).toBe(true)

    const developmentText = JSON.stringify(development)
    const heldoutText = JSON.stringify(heldout)
    for (const task of development.tasks) {
      const study = JSON.parse(task.fixtures["study.json"]!) as { studyId: string }
      expect(heldoutText).not.toContain(task.id)
      expect(heldoutText).not.toContain(study.studyId)
    }
    for (const task of heldout.tasks) {
      const study = JSON.parse(task.fixtures["study.json"]!) as { studyId: string }
      expect(developmentText).not.toContain(task.id)
      expect(developmentText).not.toContain(study.studyId)
    }
  })

  test("embeds intact studies and the semantically identical public contract", async () => {
    const [contract, development, heldout] = await Promise.all([
      loadJson<PublicContract>(path.join(v2Dir, "public-contract.json")),
      loadJson<TaskSet>(path.join(v2Dir, "development/tasks.json")),
      loadJson<TaskSet>(path.join(v2Dir, "heldout/tasks.json")),
    ])
    for (const task of [...development.tasks, ...heldout.tasks]) {
      expect(Object.keys(task.fixtures).sort()).toEqual(["design-contract.json", "study.json"])
      expect(JSON.parse(task.fixtures["design-contract.json"]!)).toEqual(contract)
      expect(JSON.parse(task.fixtures["design-contract.json"]!)).toMatchObject({
        reportEvidenceGrammar: {
          blockCount: 1,
          openingMarker: "```json design-evidence",
          closingMarker: "```",
          topLevelType: "object",
          jsonMode: "strict",
          encoding: "UTF-8",
          allowComments: false,
          allowTrailingCommas: false,
          allowDuplicateKeys: false,
        },
      })
      expect(() => parseExperimentalDesignV2Study(JSON.parse(task.fixtures["study.json"]!))).not
        .toThrow()
      expect(task.prompt).toContain("design-contract.json")
      for (const output of contract.outputs) expect(task.prompt).toContain(output)
      expect(task.prompt).toContain("exactly three output files")
    }
  })

  test("uses the v2 evaluator, exact weights, all hard gates, and protected fixture digests", async () => {
    const [development, heldout] = await Promise.all([
      loadJson<TaskSet>(path.join(v2Dir, "development/tasks.json")),
      loadJson<TaskSet>(path.join(v2Dir, "heldout/tasks.json")),
    ])
    for (const task of [...development.tasks, ...heldout.tasks]) {
      expect(task.successCriteria).toEqual([])
      expect(task.passThreshold).toBe(0.95)
      expect(task.hardGateIds).toEqual(criterionIds)
      expect(task.eval.map((criterion) => criterion.id)).toEqual(criterionIds)
      expect(task.eval.map((criterion) => criterion.weight)).toEqual(criterionWeights)
      expect(task.eval.map((criterion) => criterion.payload.check)).toEqual(criterionChecks)
      for (const criterion of task.eval) {
        expect(criterion.method).toBe("custom")
        expect(criterion.evaluatorId).toBe("skill-ir-experimental-design-v2")
        expect(criterion.payload.schemaVersion).toBe("skill-ir-experimental-design-eval/v2")
        expect(criterion.payload.paths).toEqual({
          study: "study.json",
          contract: "design-contract.json",
          plan: "design/design-plan.json",
          allocation: "design/allocation.csv",
          report: "design/design-report.md",
        })
        expect(criterion.payload.protectedSha256).toEqual({
          study: sha256(task.fixtures["study.json"]!),
          contract: sha256(task.fixtures["design-contract.json"]!),
        })
      }
    }
  })

  test("contains no evaluator answers, hidden allocations, PRNG choice, or closed method list", async () => {
    const [contract, development, heldout] = await Promise.all([
      readFile(path.join(v2Dir, "public-contract.json"), "utf8"),
      readFile(path.join(v2Dir, "development/tasks.json"), "utf8"),
      readFile(path.join(v2Dir, "heldout/tasks.json"), "utf8"),
    ])
    const publicBytes = `${contract}\n${development}\n${heldout}`
    expect(publicBytes).not.toMatch(
      /expected|gold|canonical.?allocation|allocation.?schedule|prng|method.?enum|allowed.?methods/i,
    )
    expect(publicBytes).not.toContain("task-split-freeze")
    expect(publicBytes).not.toContain("benchmark-contract-audit")
    expect(publicBytes).not.toContain("base-ir")
  })
})
