import path from "node:path"
import os from "node:os"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { verifyOptimizedSkillPackage } from "../../../../src/jit-optimize/package.ts"

const h9Dir = path.resolve(import.meta.dir)
const packageDir = path.resolve(process.argv[2] ?? path.join(h9Dir, "package-attempt-001-revision-001"))
const reportPath = path.resolve(process.argv[3] ?? path.join(h9Dir, "variation-report-revision-001.json"))

function sha256(bytes: Uint8Array | string): string {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
}

function sourceCharacters(text: string): string {
  return text.replace(/^#{1,6}[ \t]*/gmu, "").replace(/\s+/gu, "")
}

const source = [
  "中华人民共和国示例消费者权益法",
  "第一章 总则",
  "第一条 为了保护消费者合法权益，制定本法。",
  "（一）诚实信用；（二）公平交易。",
  "第二条 经营者应当依法履行义务。",
  "",
].join("\n")

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "skvm-law-h9-"))
try {
  const callerDir = path.join(tempRoot, "caller", "nested")
  const inputDir = path.join(callerDir, "incoming")
  await mkdir(inputDir, { recursive: true })
  const inputPath = path.join(inputDir, "renamed-statute.txt")
  await writeFile(inputPath, source, "utf8")

  const verifiedBefore = await verifyOptimizedSkillPackage(packageDir)
  const program = path.join(packageDir, "scripts", "law_to_markdown.py")
  const proc = Bun.spawn([
    "python",
    "-B",
    program,
    "incoming/renamed-statute.txt",
    "--law-decision",
    "law",
    "--artifact-level",
    "minimal",
    "--out-dir",
    "outputs",
  ], { cwd: callerDir, stdout: "pipe", stderr: "pipe" })
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])

  const outputDir = path.join(callerDir, "outputs", "renamed-statute")
  const deliverablePath = path.join(outputDir, "renamed-statute+最终成果.md")
  const reviewPath = path.join(outputDir, "renamed-statute+审核报告.md")
  const deliverable = await readFile(deliverablePath, "utf8")
  const portableDeliverable = deliverable.replaceAll("\r\n", "\n")
  const review = await readFile(reviewPath, "utf8")
  const outputNames = (await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: outputDir, onlyFiles: true }))).sort()
  const verifiedAfter = await verifyOptimizedSkillPackage(packageDir)

  const checks = {
    exitZero: exitCode === 0,
    stdoutSummarizesApproval: stdout.includes("Result: APPROVED") && stdout.includes("Saved deliverable:"),
    stderrEmpty: stderr.length === 0,
    inputPreserved: await readFile(inputPath, "utf8") === source,
    characterStreamPreserved: sourceCharacters(portableDeliverable) === sourceCharacters(source),
    titleLevelPreserved: portableDeliverable.split("\n")[0] === "# 中华人民共和国示例消费者权益法",
    chapterLevelPreserved: portableDeliverable.includes("### 第一章 总则"),
    articleNumberOnlyHeadings: portableDeliverable.includes("##### 第一条\n")
      && portableDeliverable.includes("##### 第二条\n")
      && !portableDeliverable.includes("##### 第一条 为了"),
    enumeratedItemsSplit: portableDeliverable.includes("（一）诚实信用；\n（二）公平交易。"),
    minimalArtifactsOnly: JSON.stringify(outputNames) === JSON.stringify([
      "renamed-statute+审核报告.md",
      "renamed-statute+最终成果.md",
    ]),
    reviewOutcomeAccurate: review.includes("最终审核结论：通过") && review.includes("是否可交付：是"),
    packagePreserved: verifiedBefore.manifest.snapshots.selectedClosureSha256
      === verifiedAfter.manifest.snapshots.selectedClosureSha256,
  }
  const passed = Object.values(checks).every(Boolean)
  const report = {
    schemaVersion: "skill-optimization-production-closure-h9-variation/v1",
    exposure: "development",
    status: passed ? "passed" : "failed",
    source: {
      kind: "deterministic-synthetic-variation",
      sha256: sha256(source),
      bytes: new TextEncoder().encode(source).byteLength,
      relationship: "Renamed input and changed legal text were not supplied to the optimizer.",
    },
    invocation: {
      runtime: "python",
      suppressBytecode: true,
      cwdRelation: "temporary caller directory outside package and repository results",
      inputPath: "incoming/renamed-statute.txt",
      outputDirectory: "outputs",
      exitCode,
    },
    package: {
      identity: verifiedAfter.manifest.identity,
      selectedClosureSha256: verifiedAfter.manifest.snapshots.selectedClosureSha256,
      entry: "scripts/law_to_markdown.py",
    },
    checks,
    outputs: {
      files: outputNames,
      deliverableSha256: sha256(new Uint8Array(await Bun.file(deliverablePath).arrayBuffer())),
      reviewSha256: sha256(new Uint8Array(await Bun.file(reviewPath).arrayBuffer())),
    },
    claimBoundary: "One deterministic synthetic variation of a source-established TXT law path. It checks portability and declared formatting invariants, not whole-skill correctness or legal judgment quality.",
  }
  await Bun.write(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
  if (!passed) process.exitCode = 1
} finally {
  await rm(tempRoot, { recursive: true, force: true })
}
