import { readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import {
  BidsAuditReportSchema,
  BidsDatasetManifestSchema,
  deriveBidsAuditOracle,
  type BidsAuditReport,
  type BidsSourceRules,
} from "./bids-contract"

declare const __BIDS_RUNTIME_CONFIG__: {
  protectedInputs: ["dataset-manifest.json", "bids-audit-interface.json"]
  outputs: ["bids-audit.json"]
  sourceRules: BidsSourceRules
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

function normalized(report: BidsAuditReport): BidsAuditReport {
  return {
    ...report,
    issues: report.issues.map((issue) => ({
      ...issue,
      evidencePaths: [...issue.evidencePaths].sort((left, right) => left.localeCompare(right)),
    })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
  }
}

async function expectedReport(workDir: string): Promise<BidsAuditReport> {
  const manifest = BidsDatasetManifestSchema.parse(JSON.parse(await readFile(
    contained(workDir, "dataset-manifest.json"),
    "utf8",
  )))
  return deriveBidsAuditOracle(manifest, __BIDS_RUNTIME_CONFIG__.sourceRules)
}

async function generate(workDir: string): Promise<void> {
  const report = await expectedReport(workDir)
  await writeFile(contained(workDir, "bids-audit.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8")
}

async function validate(workDir: string): Promise<void> {
  const errors: Array<{ code: string; relativePath?: string; contractRef: string }> = []
  try {
    const publicInterface = JSON.parse(await readFile(
      contained(workDir, "bids-audit-interface.json"),
      "utf8",
    )) as { protectedInputs?: unknown; outputs?: unknown }
    const actual = BidsAuditReportSchema.parse(JSON.parse(await readFile(
      contained(workDir, "bids-audit.json"),
      "utf8",
    )))
    const expected = await expectedReport(workDir)
    if (!isDeepStrictEqual(normalized(actual), normalized(expected))) {
      errors.push({ code: "BIDS_AUDIT_SEMANTIC_MISMATCH", relativePath: "bids-audit.json", contractRef: "bids-public-interface-v1" })
    }
    if (!isDeepStrictEqual(publicInterface.protectedInputs, __BIDS_RUNTIME_CONFIG__.protectedInputs)
      || !isDeepStrictEqual(publicInterface.outputs, __BIDS_RUNTIME_CONFIG__.outputs)) {
      errors.push({ code: "BIDS_PUBLIC_INTERFACE_MISMATCH", relativePath: "bids-audit-interface.json", contractRef: "bids-public-interface-v1" })
    }
    const expectedFiles = [...__BIDS_RUNTIME_CONFIG__.protectedInputs, ...__BIDS_RUNTIME_CONFIG__.outputs].sort()
    if (!isDeepStrictEqual(await listFiles(workDir), expectedFiles)) {
      errors.push({ code: "EXACT_OUTPUT_SET_MISMATCH", contractRef: "bids-public-interface-v1" })
    }
  } catch {
    errors.push({ code: "BIDS_ARTIFACT_VALIDATION_FAILED", contractRef: "bids-public-interface-v1" })
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
