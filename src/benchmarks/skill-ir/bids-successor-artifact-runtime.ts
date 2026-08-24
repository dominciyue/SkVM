import { readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import { BidsDatasetManifestSchema } from "./bids-contract.ts"
import {
  BidsSuccessorAuditReportSchema,
  deriveBidsSuccessorAuditOracle,
  type BidsSuccessorAuditReport,
  type BidsSuccessorSourceRules,
} from "./bids-successor-contract.ts"

declare const __BIDS_SUCCESSOR_RUNTIME_CONFIG__: {
  protectedInputs: ["dataset-manifest.json", "bids-audit-interface.json"]
  outputs: ["bids-audit.json"]
  publicInterface: unknown
  sourceRules: BidsSuccessorSourceRules
}

function contained(root: string, relativePath: string): string {
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes("\\")
    || relativePath.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("unsafe relative path")
  }
  const base = path.resolve(root)
  const target = path.resolve(base, ...relativePath.split("/"))
  const relative = path.relative(base, target)
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("path escapes workdir")
  }
  return target
}

async function listFiles(root: string, current = ""): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(path.join(root, current), { withFileTypes: true })) {
    const relative = current ? `${current}/${entry.name}` : entry.name
    if (entry.isDirectory()) files.push(...await listFiles(root, relative))
    else if (entry.isFile()) files.push(relative)
    else throw new Error("unsupported workdir entry")
  }
  return files.sort()
}

function normalized(report: BidsSuccessorAuditReport): BidsSuccessorAuditReport {
  return {
    ...report,
    issues: report.issues.map((issue) => ({
      ...issue,
      evidencePaths: [...issue.evidencePaths].sort((left, right) => left.localeCompare(right)),
    })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
  }
}

async function expectedReport(workDir: string): Promise<BidsSuccessorAuditReport> {
  const manifest = BidsDatasetManifestSchema.parse(JSON.parse(await readFile(
    contained(workDir, "dataset-manifest.json"), "utf8",
  )))
  return deriveBidsSuccessorAuditOracle(manifest, __BIDS_SUCCESSOR_RUNTIME_CONFIG__.sourceRules)
}

async function generate(workDir: string): Promise<void> {
  await writeFile(
    contained(workDir, "bids-audit.json"),
    `${JSON.stringify(await expectedReport(workDir), null, 2)}\n`,
    "utf8",
  )
}

async function validate(workDir: string): Promise<void> {
  const errors: Array<{ code: string; relativePath?: string; contractRef: string }> = []
  try {
    const publicInterface = JSON.parse(await readFile(
      contained(workDir, "bids-audit-interface.json"), "utf8",
    ))
    const actual = BidsSuccessorAuditReportSchema.parse(JSON.parse(await readFile(
      contained(workDir, "bids-audit.json"), "utf8",
    )))
    const expected = await expectedReport(workDir)
    if (!isDeepStrictEqual(normalized(actual), normalized(expected))) {
      errors.push({
        code: "BIDS_AUDIT_SEMANTIC_MISMATCH",
        relativePath: "bids-audit.json",
        contractRef: "bids-successor-public-interface-v2",
      })
    }
    if (!isDeepStrictEqual(publicInterface, __BIDS_SUCCESSOR_RUNTIME_CONFIG__.publicInterface)) {
      errors.push({
        code: "BIDS_PUBLIC_INTERFACE_MISMATCH",
        relativePath: "bids-audit-interface.json",
        contractRef: "bids-successor-public-interface-v2",
      })
    }
    const expectedFiles = [
      ...__BIDS_SUCCESSOR_RUNTIME_CONFIG__.protectedInputs,
      ...__BIDS_SUCCESSOR_RUNTIME_CONFIG__.outputs,
    ].sort()
    if (!isDeepStrictEqual(await listFiles(workDir), expectedFiles)) {
      errors.push({ code: "EXACT_OUTPUT_SET_MISMATCH", contractRef: "bids-successor-public-interface-v2" })
    }
  } catch {
    errors.push({ code: "BIDS_ARTIFACT_VALIDATION_FAILED", contractRef: "bids-successor-public-interface-v2" })
  }
  process.stdout.write(`${JSON.stringify({
    schemaVersion: "skill-artifact-validation-report/v1",
    status: errors.length === 0 ? "pass" : "fail",
    errors,
  })}\n`)
}

const [mode, flag, workDir] = process.argv.slice(2)
if ((mode !== "generate" && mode !== "validate") || flag !== "--workdir" || !workDir) {
  throw new Error("usage: <generate|validate> --workdir <path>")
}
if (mode === "generate") await generate(workDir)
else await validate(workDir)
