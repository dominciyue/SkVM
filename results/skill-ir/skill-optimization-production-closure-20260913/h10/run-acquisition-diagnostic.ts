import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { planPublicSkillResourceClosure } from "../../../../src/benchmarks/skill-ir/public-skill-responsibility-corpus-archive.ts"

const h10Dir = path.resolve(import.meta.dir)
const rootDir = path.resolve(h10Dir, "../../../..")
const reportPath = path.resolve(process.argv[2] ?? path.join(h10Dir, "acquisition-diagnostic.json"))
const sourceReports = [
  "results/skill-ir/skill-family-deepening-20260911/sources.json",
  "results/skill-ir/skill-family-new-members-20260911/sources.json",
  "results/skill-ir/skill-family-new-members-20260911-r2/sources.json",
  "results/skill-ir/skill-family-new-members-20260911-r3/sources.json",
  "results/skill-ir/skill-family-new-members-20260911-r4/sources.json",
  "results/skill-ir/skill-family-new-members-20260911-r5/sources.json",
]
const observedCommandReferences = new Set([
  "curl -X POST https://...",
  "POST /api/v1/users",
  "npx playwright test tests/{文件名}.spec.ts",
  "pytest tests/test_gateway.py -v",
  "pytest tests/test_gateway.py -n 4",
  "npx tsx tests/fixtures/mock-backend/server.ts",
  "npx swagger2openapi --outfile openapi.yaml swagger.yaml",
  "python scripts/validate-skills.py",
])

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function oid(seed: string): string {
  return createHash("sha1").update(seed).digest("hex")
}

function entry(
  sourcePath: string,
  type: "blob" | "tree" = "blob",
  mode: "040000" | "100644" | "100755" = "100644",
  size: number | null = 128,
) {
  return { path: sourcePath, type, mode, size, oid: oid(`${sourcePath}:${mode}`) }
}

const historical = []
const observed = []
const totals: Record<string, number> = {}
for (const sourcePath of sourceReports) {
  const absolutePath = path.join(rootDir, sourcePath)
  const bytes = new Uint8Array(await Bun.file(absolutePath).arrayBuffer())
  const source = JSON.parse(new TextDecoder().decode(bytes)) as {
    skills: Array<{ skillId: string, issues?: Array<{ code: string, reference: string, paths: string[] }> }>
  }
  const issues = source.skills.flatMap((skill) => (skill.issues ?? []).map((issue) => ({ skillId: skill.skillId, ...issue })))
  const counts: Record<string, number> = {}
  for (const issue of issues) {
    counts[issue.code] = (counts[issue.code] ?? 0) + 1
    totals[issue.code] = (totals[issue.code] ?? 0) + 1
    if (observedCommandReferences.has(issue.reference)) observed.push({ sourceReport: sourcePath, ...issue })
  }
  historical.push({ path: sourcePath, bytes: bytes.byteLength, sha256: sha256(bytes), issues: issues.length, counts })
}

const skillBody = [
  "Run `python scripts/validate-skills.py`.",
  "Run `pytest tests/test_gateway.py -v` or `pytest tests/test_gateway.py -n 4`.",
  "Try `npx playwright test tests/{文件名}.spec.ts`.",
  "Start `npx tsx tests/fixtures/mock-backend/server.ts`.",
  "Convert with `npx swagger2openapi --outfile openapi.yaml swagger.yaml`.",
  "Call `curl -X POST https://...`.",
  "The API example is `POST /api/v1/users`.",
  "Read `references/schema.json#/components/schemas/Foo`.",
  "A developer-local example is `D:\\work\\input.json`.",
  "A single explicit missing file is `references/not-there.json`.",
].join("\n")
const postFix = planPublicSkillResourceClosure({
  skillPath: "skills/demo/SKILL.md",
  skillBody,
  treeEntries: [
    entry("skills/demo/scripts", "tree", "040000", null),
    entry("skills/demo/scripts/validate-skills.py", "blob", "100755"),
    entry("skills/demo/tests/test_gateway.py"),
    entry("skills/demo/tests/fixtures/mock-backend/server.ts"),
    entry("skills/demo/swagger.yaml"),
    entry("skills/demo/references", "tree", "040000", null),
    entry("skills/demo/references/schema.json"),
  ],
  directlyNamedDirectories: ["scripts", "references", "templates", "assets", "examples"],
  maximumFiles: 100,
  maximumTotalBytes: 5 * 1024 * 1024,
  maximumBytesPerResource: 1024 * 1024,
})
const expectedResources = [
  "skills/demo/references/schema.json",
  "skills/demo/scripts/validate-skills.py",
  "skills/demo/swagger.yaml",
  "skills/demo/tests/fixtures/mock-backend/server.ts",
  "skills/demo/tests/test_gateway.py",
]
const checks = {
  exactHistoricalIssueTotal: historical.reduce((sum, item) => sum + item.issues, 0) === 635,
  exactHistoricalMissingTotal: totals["missing-resource"] === 580,
  allEightRecordedCommandPatternsLocated: observedCommandReferences.size === new Set(observed.map((item) => item.reference)).size,
  noWholeCommandMissingAfterFix: !postFix.issues.some((issue) => issue.code === "missing-resource" && /\s/u.test(issue.reference)),
  apiRouteExampleIgnored: !postFix.issues.some((issue) => issue.reference === "POST /api/v1/users" || issue.paths.includes("skills/demo/POST /api/v1/users")),
  jsonPointerResolvedToFile: postFix.resources.some((resource) => resource.path === "skills/demo/references/schema.json"),
  exactTreeBackedResourcesCollected: JSON.stringify(postFix.resources.map((resource) => resource.path)) === JSON.stringify(expectedResources),
  remoteAndLocalExternalDiagnosticsPreserved: postFix.issues.filter((issue) => issue.code === "external-resource").length === 2
    && postFix.issues.some((issue) => issue.reference === "https://...")
    && postFix.issues.some((issue) => issue.reference === "D:\\work\\input.json"),
  singleExplicitMissingFilePreserved: postFix.issues.some((issue) => issue.code === "missing-resource"
    && issue.reference === "references/not-there.json"
    && issue.paths.includes("skills/demo/references/not-there.json")),
}
const passed = Object.values(checks).every(Boolean)
const report = {
  schemaVersion: "skill-optimization-production-closure-h10-acquisition-diagnostic/v1",
  identity: "skill-optimization-production-closure-20260913-h10-acquisition-diagnostic",
  exposure: "development",
  status: passed ? "passed" : "failed",
  actualCallChain: [
    "scripts/skill-ir/skill-family-acquire.ts",
    "src/benchmarks/skill-ir/public-skill-responsibility-corpus-archive.ts#planPublicSkillResourceClosure",
  ],
  historical: {
    immutableReadOnlyEvidence: true,
    reports: historical,
    totals: { issues: historical.reduce((sum, item) => sum + item.issues, 0), byCode: totals },
    observedMisclassifiedCommands: observed,
  },
  correction: {
    behavior: "Multi-token inline commands contribute only external references and tokens that resolve to actual Git tree entries. Single explicit missing references retain their diagnostic. HTTP method-plus-route examples are ignored as API syntax, and file JSON pointers bind to the file before #.",
    productionCode: "src/benchmarks/skill-ir/public-skill-responsibility-corpus-archive.ts",
    regressionTest: "src/benchmarks/skill-ir/public-skill-responsibility-corpus-archive.test.ts",
    postFixPlan: postFix,
    checks,
  },
  accounting: { sourceReportsRead: historical.length, sourceFilesModified: 0, networkCalls: 0, modelCalls: 0, paidCalls: 0 },
  claimBoundary: "The historical count describes captured development reports, including issues unrelated to this bug. The post-fix result is a deterministic diagnostic fixture, not a rewritten historical scan or a claim that all 580 historical missing-resource issues were false.",
}
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
console.log(JSON.stringify(report, null, 2))
if (!passed) process.exitCode = 1
