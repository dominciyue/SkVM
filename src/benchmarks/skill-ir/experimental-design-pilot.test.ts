import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { ResourceContractSchema } from "./resource-contract.ts"
import type { SkillIRBenchmarkTask } from "./real-agent.ts"
import { SkillIRSourceAuditSchema, verifySkillIRSourceAudit } from "../../skill-ir/source-audit.ts"
import { SkillIRSchema } from "../../skill-ir/schema.ts"
import { validateSkillIR } from "../../skill-ir/validate.ts"

const pilotDir = path.join(
  import.meta.dir,
  "../../../benchmarks/skill-ir/pilots/experimental-design",
)

describe("experimental-design pilot authoring contract", () => {
  test("freezes two development and two held-out tasks without evaluator gold in prompts", async () => {
    const taskSet = JSON.parse(await readFile(path.join(pilotDir, "tasks.json"), "utf8")) as {
      schemaVersion: string
      skillId: string
      tasks: SkillIRBenchmarkTask[]
    }
    expect(taskSet.schemaVersion).toBe("skill-ir-tasks/v1")
    expect(taskSet.skillId).toBe("experimental-design")
    expect(taskSet.tasks).toHaveLength(4)
    expect(taskSet.tasks.filter((task) => task.split === "development")).toHaveLength(2)
    expect(taskSet.tasks.filter((task) => task.split === "held-out")).toHaveLength(2)

    for (const task of taskSet.tasks) {
      expect(task.passThreshold).toBe(0.85)
      expect(task.hardGateIds).toEqual([
        "design-protected-input",
        "design-required-artifacts",
        "design-assignment-safety",
      ])
      expect(task.prompt).toContain("design/design-plan.json")
      expect(task.prompt).toContain("design/allocation.csv")
      expect(task.prompt).toContain("design/design-report.md")
      expect(task.prompt).not.toContain('"check"')
      expect(task.prompt).not.toContain("expected")
    }
  })

  test("uses a standard-library-only Python resource contract", async () => {
    const contract = ResourceContractSchema.parse(
      JSON.parse(await readFile(path.join(pilotDir, "resource-contract.json"), "utf8")),
    )
    expect(contract.network).toBe("forbidden")
    expect(contract.packageInstall).toBe("forbidden")
    expect(contract.interpreter.minimumVersion).toBe("3.10")
    expect(contract.probe.requiredModules).toEqual([])
  })

  test("has a profile-empty source-audited base IR before becoming runnable", async () => {
    const [irValue, auditValue, corpusValue] = await Promise.all([
      readFile(path.join(pilotDir, "base-ir.json"), "utf8").then(JSON.parse),
      readFile(path.join(pilotDir, "base-ir-source-audit.json"), "utf8").then(JSON.parse),
      readFile(path.join(pilotDir, "../../corpus/corpora/pilot.json"), "utf8").then(JSON.parse),
    ])
    const ir = SkillIRSchema.parse(irValue)
    const audit = SkillIRSourceAuditSchema.parse(auditValue)
    expect(ir.profile).toEqual([])
    expect(validateSkillIR(ir)).toEqual({ errors: [], warnings: [] })
    expect(await verifySkillIRSourceAudit(ir, audit, path.join(pilotDir, "../../../.."))).toEqual({
      errors: [],
      warnings: [],
    })

    const pilot = (corpusValue as {
      skills: Array<Record<string, unknown> & { id: string }>
    }).skills.find((candidate) => candidate.id === "experimental-design")
    expect(pilot).toMatchObject({
      status: "runnable",
      tasksPath: "benchmarks/skill-ir/pilots/experimental-design/tasks.json",
      irPath: "benchmarks/skill-ir/pilots/experimental-design/base-ir.json",
      sourceAuditPath: "benchmarks/skill-ir/pilots/experimental-design/base-ir-source-audit.json",
      resourceContractPath: "benchmarks/skill-ir/pilots/experimental-design/resource-contract.json",
    })
  })
})
