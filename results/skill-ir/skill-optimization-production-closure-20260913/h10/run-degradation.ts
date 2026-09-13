import { createHash } from "node:crypto"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { verifyOptimizedSkillPackage } from "../../../../src/jit-optimize/package.ts"

const h10Dir = path.resolve(import.meta.dir)
const rootDir = path.resolve(h10Dir, "../../../..")
const h8Package = path.join(rootDir, "results/skill-ir/skill-optimization-production-closure-20260913/h8/package-attempt-008-revision-001")
const h9Package = path.join(rootDir, "results/skill-ir/skill-optimization-production-closure-20260913/h9/package-attempt-001-revision-001")
const runDir = path.resolve(process.argv[2] ?? path.join(h10Dir, "degradation-run-001-revision-001"))

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex")
}

async function filesUnder(directory: string): Promise<string[]> {
  try {
    if (!(await stat(directory)).isDirectory()) return []
  } catch {
    return []
  }
  return Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: directory, onlyFiles: true }))
    .then((files) => files.map((file) => file.replaceAll("\\", "/")).sort())
}

async function runProgram(id: string, command: string[], cwd: string) {
  const caseDir = path.join(runDir, id)
  await mkdir(caseDir, { recursive: true })
  const proc = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe" })
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const stdoutPath = path.join(caseDir, "stdout.txt")
  const stderrPath = path.join(caseDir, "stderr.txt")
  await writeFile(stdoutPath, stdout, "utf8")
  await writeFile(stderrPath, stderr, "utf8")
  return {
    command: command.map((part, index) => index === 2 ? path.relative(rootDir, part).replaceAll("\\", "/") : part),
    cwd: path.relative(rootDir, cwd).replaceAll("\\", "/"),
    exitCode,
    stdout: { path: path.relative(runDir, stdoutPath).replaceAll("\\", "/"), bytes: Buffer.byteLength(stdout), sha256: sha256(stdout) },
    stderr: { path: path.relative(runDir, stderrPath).replaceAll("\\", "/"), bytes: Buffer.byteLength(stderr), sha256: sha256(stderr) },
    stdoutText: stdout,
    stderrText: stderr,
  }
}

if (await Bun.file(runDir).exists()) throw new Error(`refusing to overwrite existing H10 run: ${runDir}`)
await mkdir(runDir, { recursive: true })
const [h8Before, h9Before] = await Promise.all([
  verifyOptimizedSkillPackage(h8Package),
  verifyOptimizedSkillPackage(h9Package),
])

const emptyDir = path.join(runDir, "legal-empty-no-contract", "caller")
await mkdir(emptyDir, { recursive: true })
await writeFile(path.join(emptyDir, "en.json"), "{}\n", "utf8")
await writeFile(path.join(emptyDir, "zh.json"), "{}\n", "utf8")
const emptyRun = await runProgram("legal-empty-no-contract", [
  "python", "-B", path.join(h8Package, "scripts/check_json_locales.py"),
  "--reference", "en=en.json", "--locale", "zh=zh.json",
], emptyDir)
let emptySummary: Record<string, unknown> | null = null
try { emptySummary = JSON.parse(emptyRun.stdoutText) } catch {}
const emptyChecks = {
  exitZero: emptyRun.exitCode === 0,
  reportsOk: emptySummary?.ok === true,
  referenceHasZeroLeaves: emptySummary?.keyCount === 0,
  localeHasNoDifferences: ["missingKeys", "extraKeys"].every((key) => {
    const record = emptySummary?.[key] as Record<string, unknown> | undefined
    return record !== undefined && Object.values(record).every((items) => Array.isArray(items) && items.length === 0)
  }) && Array.isArray(emptySummary?.placeholderMismatches) && emptySummary.placeholderMismatches.length === 0,
}

const optionalDir = path.join(runDir, "optional-decision-omitted", "caller")
await mkdir(path.join(optionalDir, "incoming"), { recursive: true })
const lawSource = [
  "中华人民共和国目录变化示例法",
  "第一章 总则",
  "第一条 为验证目录变化，制定本法。",
  "第二条 本法适用于确定性开发验证。",
  "",
].join("\n")
const lawInput = path.join(optionalDir, "incoming", "renamed-law.txt")
await writeFile(lawInput, lawSource, "utf8")
const optionalRun = await runProgram("optional-decision-omitted", [
  "python", "-B", path.join(h9Package, "scripts/law_to_markdown.py"),
  "incoming/renamed-law.txt", "--artifact-level", "minimal", "--out-dir", "outputs",
], optionalDir)
const optionalOutputDir = path.join(optionalDir, "outputs", "renamed-law")
const optionalFiles = await filesUnder(optionalOutputDir)
const deliverablePath = path.join(optionalOutputDir, "renamed-law+最终成果.md")
const reviewPath = path.join(optionalOutputDir, "renamed-law+审核报告.md")
const deliverable = await Bun.file(deliverablePath).exists() ? await readFile(deliverablePath, "utf8") : ""
const review = await Bun.file(reviewPath).exists() ? await readFile(reviewPath, "utf8") : ""
const optionalChecks = {
  exitZero: optionalRun.exitCode === 0,
  autoDecisionReported: /decision.*auto|auto.*decision|自动/iu.test(optionalRun.stdoutText + review),
  minimalOutputsPresent: optionalFiles.includes("renamed-law+最终成果.md") && optionalFiles.includes("renamed-law+审核报告.md"),
  checkedApproval: /通过|APPROVED/iu.test(optionalRun.stdoutText + review),
  inputContentPreserved: deliverable.replace(/^#{1,6}[ \t]*/gmu, "").replace(/\s+/gu, "")
    === lawSource.replace(/\s+/gu, ""),
}

const missingDir = path.join(runDir, "required-input-missing", "caller")
await mkdir(missingDir, { recursive: true })
const missingRun = await runProgram("required-input-missing", [
  "python", "-B", path.join(h9Package, "scripts/law_to_markdown.py"),
  "incoming/does-not-exist.txt", "--artifact-level", "minimal", "--out-dir", "outputs",
], missingDir)
const missingFiles = await filesUnder(path.join(missingDir, "outputs"))
const missingChecks = {
  exitNonzero: missingRun.exitCode !== 0,
  preciseDiagnostic: /not found|does not exist|no such file|不存在/iu.test(missingRun.stderrText + missingRun.stdoutText),
  noOutputArtifacts: missingFiles.length === 0,
}

const dependencyDir = path.join(runDir, "optional-docx-dependency-missing", "caller")
await mkdir(path.join(dependencyDir, "incoming"), { recursive: true })
await writeFile(path.join(dependencyDir, "incoming", "sample.docx"), "not-a-docx\n", "utf8")
const dependencyRun = await runProgram("optional-docx-dependency-missing", [
  "python", "-B", path.join(h9Package, "scripts/law_to_markdown.py"),
  "incoming/sample.docx", "--allow-fallback", "--skip-mineru-ocr-skill", "--docx-engine", "python-docx",
  "--artifact-level", "minimal", "--out-dir", "outputs",
], dependencyDir)
const dependencyFiles = await filesUnder(path.join(dependencyDir, "outputs"))
const dependencyChecks = {
  exitNonzero: dependencyRun.exitCode !== 0,
  dependencySpecificDiagnostic: /python-docx|docx.*required|No module named ['"]docx/iu.test(dependencyRun.stderrText + dependencyRun.stdoutText),
  noOutputArtifacts: dependencyFiles.length === 0,
  txtRouteStillPassed: Object.values(optionalChecks).every(Boolean),
}

const [h8After, h9After] = await Promise.all([
  verifyOptimizedSkillPackage(h8Package),
  verifyOptimizedSkillPackage(h9Package),
])
const packageChecks = {
  h8Preserved: h8Before.manifest.snapshots.selectedClosureSha256 === h8After.manifest.snapshots.selectedClosureSha256,
  h9Preserved: h9Before.manifest.snapshots.selectedClosureSha256 === h9After.manifest.snapshots.selectedClosureSha256,
}
const cases = [
  {
    id: "legal-empty-no-contract",
    classification: "applicable-success",
    status: Object.values(emptyChecks).every(Boolean) ? "passed" : "failed",
    checks: emptyChecks,
    invocation: { ...emptyRun, stdoutText: undefined, stderrText: undefined },
    parsedSummary: emptySummary,
  },
  {
    id: "optional-decision-omitted",
    classification: "applicable-success",
    status: Object.values(optionalChecks).every(Boolean) ? "passed" : "failed",
    checks: optionalChecks,
    invocation: { ...optionalRun, stdoutText: undefined, stderrText: undefined },
    outputs: {
      files: optionalFiles,
      deliverableSha256: deliverable ? sha256(deliverable) : null,
      reviewSha256: review ? sha256(review) : null,
    },
  },
  {
    id: "required-input-missing",
    classification: "applicable-error",
    status: Object.values(missingChecks).every(Boolean) ? "passed" : "failed",
    checks: missingChecks,
    invocation: { ...missingRun, stdoutText: undefined, stderrText: undefined },
    outputs: { files: missingFiles },
  },
  {
    id: "optional-docx-dependency-missing",
    classification: "branch-local-error",
    status: Object.values(dependencyChecks).every(Boolean) ? "passed" : "failed",
    checks: dependencyChecks,
    invocation: { ...dependencyRun, stdoutText: undefined, stderrText: undefined },
    outputs: { files: dependencyFiles },
    residualDuty: "Install/configure mineru-ocr, or install python-docx only after explicit fallback authorization; do not claim a DOCX deliverable.",
  },
  {
    id: "business-network-condition",
    classification: "not-applicable",
    status: "passed",
    checks: { noBusinessNetworkRoute: true, noManufacturedCall: true },
    reason: "The selected H8/H9 helpers are local file processors. Removing an offline restriction does not create a network branch.",
  },
]
const passed = cases.every((item) => item.status === "passed") && Object.values(packageChecks).every(Boolean)
const report = {
  schemaVersion: "skill-optimization-production-closure-h10-degradation/v1",
  identity: "skill-optimization-production-closure-20260913-h10-degradation-run-001-revision-001",
  exposure: "development",
  status: passed ? "passed" : "failed",
  plan: { path: "../plan.json", sha256: sha256(await readFile(path.join(h10Dir, "plan.json"))) },
  packages: {
    h8: { identity: h8After.manifest.identity, selectedClosureSha256: h8After.manifest.snapshots.selectedClosureSha256 },
    h9: { identity: h9After.manifest.identity, selectedClosureSha256: h9After.manifest.snapshots.selectedClosureSha256 },
    checks: packageChecks,
  },
  cases,
  accounting: { programRuns: 4, businessApiCalls: 0, modelCalls: 0, paidCalls: 0 },
  claimBoundary: "Five predeclared local conditions, including one not-applicable network condition. Expected errors count as passes only when the responsible layer emitted the specified diagnostic and no artifact was produced.",
}
await writeFile(path.join(runDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8")
console.log(JSON.stringify(report, null, 2))
if (!passed) process.exitCode = 1
