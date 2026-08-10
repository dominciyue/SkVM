import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  I18nContributionAuditReportSchema,
  runI18nContributionAudit,
} from "./i18n-helper-contribution-audit.ts"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("i18n-helper contribution-identifiable contract audit", () => {
  test("records all five contribution canaries and materialization isolation", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "i18n-contribution-audit-"))
    roots.push(root)
    const outputPath = path.join(root, "audit.json")
    const report = await runI18nContributionAudit({ repositoryRoot: process.cwd(), outputPath })

    expect(I18nContributionAuditReportSchema.parse(report)).toEqual(report)
    expect(report.canaries).toEqual({
      canonicalValid: true,
      alternativeValid: true,
      promptOnlyOmissionAccepted: false,
      reverseEvidenceRemovesConstraint: true,
      forbiddenSinkFree: true,
    })
    expect(report.materialization).toEqual({
      taskContractMatchesAuthority: true,
      protectedBaselinesPresent: true,
      evaluatorDoesNotReadHeldoutOrGold: true,
    })
    expect(JSON.parse(await readFile(outputPath, "utf8"))).toEqual(report)
  })
})
