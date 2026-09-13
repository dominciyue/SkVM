import path from "node:path"
import { spawn } from "node:child_process"

interface CaseDefinition {
  id: string
  locale: string
  file: string
  expectedExitCode: number
  expected: Record<string, unknown>
}

interface CaseManifest {
  schemaVersion: string
  exposure: "development"
  parent: Record<string, unknown>
  derivation: string
  cases: CaseDefinition[]
  claimBoundary: string
}

function sha256(bytes: Uint8Array): string {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
}

async function bytes(file: string): Promise<Uint8Array> {
  return new Uint8Array(await Bun.file(file).arrayBuffer())
}

function matches(actual: unknown, expected: unknown): boolean {
  if (expected === null || typeof expected !== "object") return Object.is(actual, expected)
  if (Array.isArray(expected)) {
    return Array.isArray(actual)
      && actual.length === expected.length
      && expected.every((item, index) => matches(actual[index], item))
  }
  if (actual === null || typeof actual !== "object" || Array.isArray(actual)) return false
  return Object.entries(expected).every(([key, value]) => matches((actual as Record<string, unknown>)[key], value))
}

async function execute(command: string, args: string[], cwd: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true })
    let stdout = ""
    let stderr = ""
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk })
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk })
    child.on("error", reject)
    child.on("close", (exitCode) => resolve({ exitCode: exitCode ?? -1, stdout, stderr }))
  })
}

const scriptDir = path.dirname(path.resolve(process.argv[1]!))
const packageDir = path.resolve(process.argv[2] ?? path.join(scriptDir, "package-attempt-008-revision-001"))
const manifestPath = path.resolve(process.argv[3] ?? path.join(scriptDir, "variation-cases.json"))
const reportPath = path.resolve(process.argv[4] ?? path.join(scriptDir, "variation-report.json"))
const inputDir = path.join(scriptDir, "variation-inputs")
const programPath = path.join(packageDir, "scripts", "check_json_locales.py")
const packageManifestPath = path.join(packageDir, "optimization-manifest.json")
const manifest = await Bun.file(manifestPath).json() as CaseManifest
const packageManifest = await Bun.file(packageManifestPath).json() as { identity: string }
const manifestBytes = await bytes(manifestPath)
const packageManifestBytes = await bytes(packageManifestPath)
const programBytes = await bytes(programPath)
const referencePath = path.join(inputDir, "reference.json")
const inputBindings: Array<{ path: string; bytes: number; sha256: string }> = []
for (const name of ["reference.json", ...manifest.cases.map((item) => item.file)]) {
  const file = path.join(inputDir, name)
  const content = await bytes(file)
  inputBindings.push({ path: path.relative(scriptDir, file).split(path.sep).join("/"), bytes: content.byteLength, sha256: sha256(content) })
}
const results = []
for (const item of manifest.cases) {
  const executed = await execute("python", [
    "-B",
    programPath,
    "--reference",
    `base=${referencePath}`,
    "--locale",
    `${item.locale}=${path.join(inputDir, item.file)}`,
  ], inputDir)
  let parsed: Record<string, unknown> | null = null
  let parseError: string | null = null
  try { parsed = JSON.parse(executed.stdout) as Record<string, unknown> } catch (error) { parseError = String(error) }
  const expected = { ...item.expected }
  const errorIncludes = typeof expected.errorIncludes === "string" ? expected.errorIncludes : undefined
  delete expected.errorIncludes
  const passed = executed.exitCode === item.expectedExitCode
    && parsed !== null
    && parseError === null
    && matches(parsed, expected)
    && (errorIncludes === undefined || String(parsed.error ?? "").includes(errorIncludes))
  results.push({
    id: item.id,
    expectedExitCode: item.expectedExitCode,
    actualExitCode: executed.exitCode,
    expected: item.expected,
    parsed,
    stdout: executed.stdout,
    stderr: executed.stderr,
    parseError,
    passed,
  })
}
const report = {
  schemaVersion: "skill-optimization-h8-variation-validation/v1",
  exposure: "development",
  createdAt: new Date().toISOString(),
  status: results.every((item) => item.passed) ? "passed" : "failed",
  parent: manifest.parent,
  derivation: manifest.derivation,
  binding: {
    packageIdentity: packageManifest.identity,
    packageManifest: { path: packageManifestPath, bytes: packageManifestBytes.byteLength, sha256: sha256(packageManifestBytes) },
    program: { path: programPath, bytes: programBytes.byteLength, sha256: sha256(programBytes) },
    caseManifest: { path: manifestPath, bytes: manifestBytes.byteLength, sha256: sha256(manifestBytes) },
    inputs: inputBindings,
  },
  counts: {
    total: results.length,
    passed: results.filter((item) => item.passed).length,
    failed: results.filter((item) => !item.passed).length,
    positive: results.filter((item) => item.expectedExitCode === 0).length,
    injectedErrors: results.filter((item) => item.expectedExitCode !== 0).length,
    correctlyDetectedErrors: results.filter((item) => item.expectedExitCode !== 0 && item.passed).length,
  },
  cases: results,
  claimBoundary: manifest.claimBoundary,
}
await Bun.write(reportPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({ status: report.status, counts: report.counts, reportPath }, null, 2))
if (report.status !== "passed") process.exitCode = 1
