import path from "node:path"
import { mkdir, readFile, writeFile, readdir, cp } from "node:fs/promises"
import { execFileSync } from "node:child_process"

const root = import.meta.dir, repo = path.resolve(root, "../../../../.."), historical = path.join(path.dirname(root), "authorization-domain-execution-v1")
const model = "xty/gpt-5.6-sol", action = process.argv[2]
if (!["native-memos", "native-memos-repaired", "native-memos-policy-change", "native-memos-policy-change-repaired", "author-workflows", "author-workflows-repaired"].includes(action ?? "")) throw new Error("Unknown ordinary action")
const output = path.join(root, "ordinary", action!), workDir = path.join(output, "workdir")
await mkdir(workDir, { recursive: true })
const skill = path.join(historical, "model/source-skills/github-security-review/SKILL.md")
let prompt: string, extras: string[]
if (action!.startsWith("native-memos")) {
  const inputFile = path.join(historical, `model/inputs/${action!.includes("policy-change") ? "memos-remove-policy-change" : "memos-remove"}.json`), input = JSON.parse(await readFile(inputFile, "utf8"))
  prompt = `${input.brief}\nIndependent current policy: ${input.policy.text}\nUse the complete original security-review skill for this bounded source-visible authorization question. Whole audits, target execution, network calls and patch application are outside this task. Preserve its normal reporting format, cite original lines, separate source behavior from policy and explicitly retain unresolved facts.`
  extras = [`--authorization-scope=${inputFile}`, "--authorization-domain-tools", "--authorization-strategy=guided-evidence-v2", `--authorization-trace=${path.join(output, "native-trace.json")}`]
} else {
  const source = path.join(repo, ".github/workflows"), files = (await readdir(source)).filter(f => /\.ya?ml$/.test(f)).sort()
  await mkdir(path.join(workDir, "source"), { recursive: true })
  for (const file of files) await cp(path.join(source, file), path.join(workDir, "source", file), { errorOnExist: true, force: false })
  await writeFile(path.join(output, "source-inventory.json"), JSON.stringify({ repository: "current SkVM checkout", files, copiedBeforeRun: true }, null, 2) + "\n", { flag: "wx" })
  prompt = "Review the GitHub Actions workflows in ./source offline using the supplied security-review skill. Produce workflow-inventory.json with every workflow/job's declared token permissions, action uses references and file/line evidence; distinguish omitted permissions from explicitly empty permissions. Then produce REVIEW.md with the skill's summary, scoped findings, confidence, self-verification and remaining review limits. Do not claim live CVE or deployment verification, execute workflows, change source files or apply patches. This task concerns workflow permissions and action references; unrelated whole-repository audit duties remain outside this scope."
  extras = ["--optimize", `--package-out=${path.join(output, "exported-package")}`]
}
const args = ["run", `--prompt=${prompt}`, `--skill=${skill}`, `--model=${model}`, "--adapter=bare-agent", `--workdir=${workDir}`, "--max-steps=12", "--timeout-ms=1200000", ...extras]
await writeFile(path.join(output, "claim.json"), JSON.stringify({ at: new Date().toISOString(), revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(), action, model, args, originalSkill: skill, purpose: action!.startsWith("native-memos") ? "AR10/AR13 ordinary full-skill use and targeted shared-repair verification; main quality panel remains paused" : "New non-API original-skill run/capture/proposal/export chain", sourceSkillUnmodified: true, noAutomaticResend: true }, null, 2) + "\n", { flag: "wx" })
const child = Bun.spawn([process.execPath, path.join(repo, "src/index.ts"), ...args], { cwd: repo, env: process.env, stdout: "pipe", stderr: "pipe" })
const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
await writeFile(path.join(output, "stdout.txt"), stdout)
await writeFile(path.join(output, "stderr.txt"), stderr)
await writeFile(path.join(output, "process-result.json"), JSON.stringify({ at: new Date().toISOString(), action, exitCode, actualUSD: null, status: exitCode === 0 ? "process-completed-inspection-required" : "process-failed-inspection-required", noAutomaticResend: true }, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify({ action, exitCode, output }))
