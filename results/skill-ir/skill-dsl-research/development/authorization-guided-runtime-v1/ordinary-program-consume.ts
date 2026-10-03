import path from "node:path"
import { mkdir, readFile, writeFile, cp } from "node:fs/promises"
import { execFileSync } from "node:child_process"
const root = import.meta.dir, repo = path.resolve(root, "../../../../.."), action = process.argv[2]
if (!["original", "changed"].includes(action ?? "")) throw new Error("Choose original or changed")
const output = path.join(root, `ordinary/program-consume-${action}`)
const workDir = path.resolve(repo, `../../ar-ordinary-use/program-consume-${action}`)
const packageDir = path.join(root, "ordinary/author-workflow-program-host-recovery/exported-package")
await mkdir(output, { recursive: true })
const inputDir = action === "original" ? "source" : "review-inputs/workflows"
const inventory = action === "original" ? "workflow-inventory.json" : "reports/workflows.json"
const report = action === "original" ? "REVIEW.md" : "reports/REVIEW.md"
const prompt = `Review the GitHub Actions workflows in ./${inputDir} offline using the supplied security-review skill. Produce ${inventory} with every workflow/job's declared token permissions, action uses references and file/line evidence; distinguish omitted permissions from explicitly empty permissions. Then produce ${report} with the skill's summary, scoped findings, confidence, self-verification and remaining review limits. Do not claim live CVE or deployment verification, execute workflows, change source files or apply patches. This task concerns workflow permissions and action references; unrelated whole-repository audit duties remain outside this scope.`
const args = ["run", `--prompt=${prompt}`, `--skill=${path.join(packageDir, "SKILL.md")}`, "--model=xty/gpt-5.6-sol", "--adapter=bare-agent", `--workdir=${workDir}`, "--max-steps=12", "--timeout-ms=1200000", `--execution-observation=${path.join(output, "execution-observation.json")}`]
await writeFile(path.join(output, "claim.json"), JSON.stringify({ at: new Date().toISOString(), revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(), action, packageDir, workDir, args, sameExportedPackage: true, packageChanges: false, source: ".github/workflows/release.yml", inputChanges: action === "original" ? [] : ["move original into nested/previous.yml", "add changed release.yml with top-level permission omitted and build.permissions explicitly empty"], actualUSD: null }, null, 2) + "\n", { flag: "wx" })
await mkdir(path.join(workDir, inputDir), { recursive: true })
const source = await readFile(path.join(repo, ".github/workflows/release.yml"), "utf8")
if (action === "original") await writeFile(path.join(workDir, inputDir, "release.yml"), source, { flag: "wx" })
else {
  await mkdir(path.join(workDir, inputDir, "nested"), { recursive: true })
  await writeFile(path.join(workDir, inputDir, "nested/previous.yml"), source, { flag: "wx" })
  const changed = source.replace(/permissions:\r?\n  contents: write[^\r\n]*\r?\n  id-token: write[^\r\n]*\r?\n/, "").replace(/  build:\r?\n/, "  build:\n    permissions: {}\n")
  if (changed === source) throw new Error("Input edit did not apply")
  await writeFile(path.join(workDir, inputDir, "release.yml"), changed, { flag: "wx" })
}
const child = Bun.spawn([process.execPath, path.join(repo, "src/index.ts"), ...args], { cwd: repo, env: process.env, stdout: "pipe", stderr: "pipe" })
const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
await writeFile(path.join(output, "stdout.txt"), stdout)
await writeFile(path.join(output, "stderr.txt"), stderr)
await cp(workDir, path.join(output, "workdir"), { recursive: true })
await writeFile(path.join(output, "process-result.json"), JSON.stringify({ at: new Date().toISOString(), exitCode, actualUSD: null, requiresInspection: true }, null, 2) + "\n")
console.log(JSON.stringify({ action, exitCode, output }))
