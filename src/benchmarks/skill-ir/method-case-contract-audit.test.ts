import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import {
  BenchmarkContractAuditManifestSchema,
  auditBenchmarkContract,
} from "./benchmark-contract-audit.ts"
import { runBenchmarkContractAudit } from "./benchmark-contract-audit-run.ts"
import { MethodCaseTaskSplitFreezeSchema } from "./method-case-task-split-freeze.ts"
import { lawToMarkdownGradeV2 } from "../../bench/evaluators/law-to-markdown-grade-v2.ts"
import { i18nHelperGrade } from "../../bench/evaluators/i18n-helper-grade.ts"

const rootDir = path.resolve(import.meta.dir, "../../..")

const cases = [
  {
    label: "law v2",
    root: "benchmarks/skill-ir/pilots/law-to-markdown/v2",
    scorer: "src/bench/evaluators/law-to-markdown-grade-v2.ts",
    evaluatorId: "skill-ir-law-to-markdown-v2",
    evaluator: lawToMarkdownGradeV2,
    report: "results/skill-ir/benchmark-contract-audit/law-to-markdown-v2.json",
    expectedCanaries: 30,
  },
  {
    label: "i18n helper",
    root: "benchmarks/skill-ir/pilots/i18n-helper",
    scorer: "src/bench/evaluators/i18n-helper-grade.ts",
    evaluatorId: "skill-ir-i18n-helper",
    evaluator: i18nHelperGrade,
    report: "results/skill-ir/benchmark-contract-audit/i18n-helper.json",
    expectedCanaries: 30,
  },
] as const

async function loadJson(relativePath: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(rootDir, relativePath), "utf8"))
}

describe("Law v2 and i18n-helper development-only contract audits", () => {
  for (const item of cases) {
    test(`${item.label} passes static traceability and differential canaries`, async () => {
      const manifest = BenchmarkContractAuditManifestSchema.parse(
        await loadJson(`${item.root}/benchmark-contract-audit.json`),
      )
      const report = await runBenchmarkContractAudit(manifest, rootDir, {
        evaluatorSourcePaths: new Map([[item.evaluatorId, item.scorer]]),
        evaluatorSourceDigests: new Map([[item.evaluatorId, manifest.scorer.sha256]]),
        evaluatorImplementations: new Map([[item.evaluatorId, item.evaluator]]),
      })
      const persisted = await loadJson(item.report)

      expect(persisted).toEqual(report)
      expect(report.staticStatus).toBe("passed")
      expect(report.status).toBe("passed")
      expect(report.issues).toEqual([])
      expect(report.canaries).toHaveLength(item.expectedCanaries)
      expect(report.canaries.every((canary) => canary.status === "matched")).toBe(true)
    })

    test(`${item.label} audit is development-only and fails closed on missing evidence`, async () => {
      const manifest = BenchmarkContractAuditManifestSchema.parse(
        await loadJson(`${item.root}/benchmark-contract-audit.json`),
      )
      const freeze = MethodCaseTaskSplitFreezeSchema.parse(
        await loadJson(`${item.root}/task-split-freeze.json`),
      )
      const serialized = JSON.stringify(manifest)
      for (const taskId of freeze.heldoutTasks.taskIds) expect(serialized).not.toContain(taskId)
      expect(serialized).not.toContain(freeze.heldoutTasks.sha256)

      const broken = structuredClone(manifest)
      broken.requirements[0]!.publicEvidence[0] = {
        kind: "skill-source",
        path: manifest.sources[0]!.path,
        quote: "TEST_ONLY_MISSING_PUBLIC_EVIDENCE",
      }
      const report = await auditBenchmarkContract(broken, rootDir)
      expect(report.status).toBe("failed")
      expect(report.issues.map((issue) => issue.code)).toContain("PUBLIC_EVIDENCE_MISSING")

      const scorer = await readFile(path.join(rootDir, item.scorer), "utf8")
      expect(scorer).not.toMatch(/(?:heldout|results\/skill-ir|task-registry|artifact-package|model-output)/iu)
      expect(scorer).not.toContain("TEST_ONLY_")
    })
  }
})
