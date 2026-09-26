import { createHash } from "node:crypto"
import { cp, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import assert from "node:assert/strict"

const checkout = path.resolve(import.meta.dir, "../../..")
const temporary = await mkdtemp(path.join(os.tmpdir(), "af-ordinary-evidence-"))
const digest = (value: string) => createHash("sha256").update(value).digest("hex")
async function command(args: string[]) {
  const child = Bun.spawn([process.execPath, ...args], { cwd: os.tmpdir(), stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  assert.equal(exitCode, 0, stderr || stdout)
  return { exitCode, report: JSON.parse(stdout), stderr }
}
try {
  await cp(path.join(checkout, "examples/authorization-assessment/scenario-workspace"), temporary, { recursive: true })
  const workspace = path.join(temporary, "workspace.json"), out = path.join(temporary, "generated")
  const compose = path.join(checkout, "src/cli/authorization-compose.ts"), cli = path.join(checkout, "src/index.ts")
  const source = path.join(temporary, "project/src/records.ts"), sourceBefore = await readFile(source, "utf8")
  const baseBefore = await readFile(path.join(temporary, "base.json"), "utf8")
  const preview = await command([compose, `--workspace=${workspace}`, `--out=${out}`, "--check-only"])
  const generated = await command([compose, `--workspace=${workspace}`, `--out=${out}`])
  assert.equal(preview.report.status, "valid"); assert.equal(generated.report.status, "created")
  const checks = []
  for (const variant of generated.report.variants) {
    const checked = await command([cli, "authorization", "check", `--input=${variant.inputPath}`])
    assert.equal(checked.report.status, "valid")
    checks.push({ id: variant.id, taskId: checked.report.taskId, status: checked.report.status, diagnostics: checked.report.diagnostics, inputSha256: digest(await readFile(variant.inputPath, "utf8")), sourceRoot: variant.input.sourceRoot, changedFields: variant.provenance.changedFields })
  }
  assert.equal(await readFile(source, "utf8"), sourceBefore)
  assert.equal(await readFile(path.join(temporary, "base.json"), "utf8"), baseBefore)
  const base = JSON.parse(baseBefore)
  const updatedPolicy = "Only an authenticated owner or supervisor may archive a record; an unauthenticated caller must be denied."
  base.policies.archive.text = updatedPolicy
  await writeFile(path.join(temporary, "base.json"), JSON.stringify(base, null, 2))
  const revised = await command([compose, `--workspace=${workspace}`, `--out=${path.join(temporary, "generated-policy-update")}`])
  const revisedChecks = []
  for (const variant of revised.report.variants) {
    assert.equal(variant.input.policies.archive.text, updatedPolicy)
    const checked = await command([cli, "authorization", "check", `--input=${variant.inputPath}`])
    assert.equal(checked.report.status, "valid")
    revisedChecks.push({ id: variant.id, status: checked.report.status, policyText: variant.input.policies.archive.text })
  }
  for (const check of checks) assert.equal(digest(await readFile(path.join(out, `${check.id}.json`), "utf8")), check.inputSha256)
  const result = { schemaVersion: "authorization-workspace-ordinary-verification/v1", verifiedAt: new Date().toISOString(), platform: process.platform, runtime: Bun.version, cwd: os.tmpdir(), temporaryWorkspace: temporary, temporaryWorkspaceRemovedAfterVerification: true, standaloneCli: true, mainCliOrdinaryCheck: true, previewStatus: preview.report.status, generationStatus: generated.report.status, checks, revisedChecks, sourceUnchanged: true, baseUnchangedByGeneration: true, oldGeneratedBytesUnchangedByPolicyUpdate: true, sourceSha256: digest(sourceBefore), maintenance: { authoredJsonFiles: 5, configFiles: 1, sharedBaseFiles: 1, explicitReplacementFiles: 3, generatedInputs: 3, nonSemanticSidecars: 3, sharedFields: ["repository", "sourceRef", "sourceRoot", "sources", "policies", "entries"], perVariantReplacementFields: ["taskId", "request", "principals", "resources", "scenarios"] }, businessModelCalls: 0, targetExecutions: 0, researchSamplesAdded: 0, humanMinutesSaved: "unmeasured", runtimeTokenSavings: "unmeasured", answerReuse: false }
  const target = path.join(import.meta.dir, "ordinary-verification.json"), pending = `${target}.tmp`
  await writeFile(pending, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" })
  await rename(pending, target)
  console.log(JSON.stringify({ status: "passed", variants: checks.length, changedPolicyVariants: revisedChecks.length, result: target }))
} finally {
  const parent = await realpath(os.tmpdir()), resolved = await realpath(temporary)
  assert.equal(path.dirname(resolved).toLowerCase(), parent.toLowerCase())
  assert.ok(path.basename(resolved).startsWith("af-ordinary-evidence-"))
  await rm(resolved, { recursive: true, force: false })
}
