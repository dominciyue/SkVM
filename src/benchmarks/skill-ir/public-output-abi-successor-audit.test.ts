import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { i18nHelperGradeV2 } from "../../bench/evaluators/i18n-helper-grade-v2.ts"
import { lawToMarkdownGradeV3 } from "../../bench/evaluators/law-to-markdown-grade-v3.ts"
import type { CustomEvaluator } from "../../framework/types.ts"
import {
  BenchmarkContractAuditManifestSchema,
  auditBenchmarkContract,
} from "./benchmark-contract-audit.ts"
import { runBenchmarkContractAudit } from "./benchmark-contract-audit-run.ts"

const rootDir = path.resolve(import.meta.dir, "../../..")

const cases: Array<{
  label: string
  root: string
  scorer: string
  evaluatorId: string
  evaluator: CustomEvaluator
}> = [
  {
    label: "Law v3",
    root: "benchmarks/skill-ir/pilots/law-to-markdown/v3",
    scorer: "src/bench/evaluators/law-to-markdown-grade-v3.ts",
    evaluatorId: "skill-ir-law-to-markdown-v3",
    evaluator: lawToMarkdownGradeV3,
  },
  {
    label: "i18n v2",
    root: "benchmarks/skill-ir/pilots/i18n-helper/v2",
    scorer: "src/bench/evaluators/i18n-helper-grade-v2.ts",
    evaluatorId: "skill-ir-i18n-helper-v2",
    evaluator: i18nHelperGradeV2,
  },
]

async function loadJson(relativePath: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(rootDir, relativePath), "utf8"))
}

describe("public output ABI successor contract audits", () => {
  for (const item of cases) {
    test(`${item.label} matches all development-only differential canaries`, async () => {
      const manifest = BenchmarkContractAuditManifestSchema.parse(
        await loadJson(`${item.root}/benchmark-contract-audit.json`),
      )
      const report = await runBenchmarkContractAudit(manifest, rootDir, {
        evaluatorSourcePaths: new Map([[item.evaluatorId, item.scorer]]),
        evaluatorSourceDigests: new Map([[item.evaluatorId, manifest.scorer.sha256]]),
        evaluatorImplementations: new Map([[item.evaluatorId, item.evaluator]]),
      })

      expect(manifest.scope.split).toBe("development")
      expect(JSON.stringify(manifest)).not.toMatch(/heldout|held-out|results\/skill-ir/iu)
      expect(report.staticStatus).toBe("passed")
      expect(report.status).toBe("passed")
      expect(report.issues).toEqual([])
      expect(report.canaries).toHaveLength(30)
      expect(report.canaries.every((canary) => canary.status === "matched")).toBe(true)
    })

    test(`${item.label} fails closed without public evidence and has no private sink`, async () => {
      const manifest = BenchmarkContractAuditManifestSchema.parse(
        await loadJson(`${item.root}/benchmark-contract-audit.json`),
      )
      const broken = structuredClone(manifest)
      broken.requirements[0]!.publicEvidence[0] = {
        kind: "skill-source",
        path: manifest.sources[0]!.path,
        quote: "TEST_ONLY_MISSING_PUBLIC_EVIDENCE",
      }
      const report = await auditBenchmarkContract(broken, rootDir)
      expect(report.status).toBe("failed")
      expect(report.issues.map((issue) => issue.code)).toContain("PUBLIC_EVIDENCE_MISSING")

      const [scorer, contract, tasks] = await Promise.all([
        readFile(path.join(rootDir, item.scorer), "utf8"),
        readFile(path.join(rootDir, item.root, "public-contract.json"), "utf8"),
        readFile(path.join(rootDir, item.root, "development/tasks.json"), "utf8"),
      ])
      expect(`${scorer}\n${contract}\n${tasks}`).not.toMatch(
        /TEST_ONLY_|expectedAnswer|historicalResult|modelOutput|results\/skill-ir/iu,
      )
    })
  }
})
