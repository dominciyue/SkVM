import path from "node:path"
import os from "node:os"
import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { verifyOptimizedSkillPackage } from "../../../../src/jit-optimize/package.ts"

const [packageArg, inputArg, outputArg] = process.argv.slice(2)
if (!packageArg || !inputArg || !outputArg) throw new Error("Expected package, observed completed input and new result directory")
const packageDir = path.resolve(packageArg)
const sourceRoot = path.resolve(inputArg)
const output = path.resolve(outputArg)
await mkdir(output, { recursive: false })
const isolated = await mkdtemp(path.join(os.tmpdir(), "skvm-f9-isolated-"))
const deployed = path.join(isolated, "package")
const project = path.join(isolated, "project with spaces")
await cp(packageDir, deployed, { recursive: true })
await mkdir(project)
const files = ["i18n-contract.json", "src/App.tsx", "src/i18n.ts", "src/locales/zh-CN.json", "src/locales/en-US.json"]
for (const file of files) {
  await mkdir(path.dirname(path.join(project, file)), { recursive: true })
  await cp(path.join(sourceRoot, file), path.join(project, file))
}
const original = await verifyOptimizedSkillPackage(packageDir)
const before = await verifyOptimizedSkillPackage(deployed)
const node = Bun.which("node")
if (!node) throw new Error("Node unavailable")
const argv = [node, path.join(deployed, "scripts/i18n-contract-tool.mjs"), "finalize", "--contract", path.join(project, "i18n-contract.json"), "--root", project]
const run = Bun.spawnSync(argv, {
  cwd: isolated,
  env: { SystemRoot: process.env.SystemRoot ?? "", TEMP: isolated, TMP: isolated, PATH: path.dirname(node) },
})
const after = await verifyOptimizedSkillPackage(deployed)
const report = await Bun.file(path.join(project, "i18n-report.json")).json()
await writeFile(path.join(output, "verification.json"), JSON.stringify({
  checkedAt: new Date().toISOString(), isolated, argv, cwd: isolated,
  nodeVersion: Bun.spawnSync([node, "--version"]).stdout.toString().trim(),
  exitCode: run.exitCode, stdout: run.stdout.toString(), stderr: run.stderr.toString(), report,
  packageIdentity: original.manifest.identity,
  packagePreserved: JSON.stringify(before.manifest) === JSON.stringify(after.manifest),
  scope: "Same-host clean directory, moved package and paths, minimal environment, Node standard library only. Not another OS or fresh Node installation.",
  dependencies: "No external modules declared or used; no repository or NODE_PATH provided.",
  actualUsd: 0, paidCalls: 0,
}, null, 2) + "\n")
console.log(JSON.stringify({ output, exitCode: run.exitCode, report }))
