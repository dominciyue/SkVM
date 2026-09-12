import { describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  buildTraceGuidedApiTesterPackage,
  verifyTraceGuidedSkillPackage,
} from "../../src/jit-optimize/solidification.ts"

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

async function makeProposal(root: string): Promise<string> {
  const proposal = join(root, "proposal")
  await Promise.all([
    mkdir(join(proposal, "original", "references"), { recursive: true }),
    mkdir(join(proposal, "round-1", "references"), { recursive: true }),
    mkdir(join(proposal, "round-1-optimizer"), { recursive: true }),
  ])
  await writeFile(join(proposal, "original", "SKILL.md"), "# API Tester\n\nOriginal workflow.\n")
  await writeFile(join(proposal, "original", "LICENSE.upstream"), "MIT\n")
  await writeFile(join(proposal, "original", "references", "existing.md"), "Existing reference.\n")
  await writeFile(join(proposal, "round-1", "SKILL.md"), "# API Tester\n\nOptimized workflow.\n")
  await writeFile(join(proposal, "round-1", "LICENSE.upstream"), "MIT\n")
  await writeFile(join(proposal, "round-1", "references", "existing.md"), "Existing reference.\n")
  await writeFile(join(proposal, "round-1", "optimizer-scratch.log"), "accidental shell output\n")
  await writeJson(join(proposal, "meta.json"), {
    schemaVersion: 1,
    skillName: "api-tester",
    bestRound: 1,
    bestRoundReason: "test",
  })
  await writeJson(join(proposal, "round-1-optimizer", "submission.json"), {
    rootCause: "The original workflow made contract precedence implicit.",
    reasoning: "The edit applies to multiple API descriptions.",
    confidence: 0.9,
    changedFiles: ["SKILL.md"],
    changes: [{
      file: "SKILL.md",
      description: "Clarify contract precedence.",
      generality: "Applies to JSON and YAML OpenAPI tasks.",
    }],
    opportunities: [],
    noChanges: false,
  })
  return proposal
}

async function makePackage(): Promise<{ root: string; packageDir: string }> {
  const root = await mkdtemp(join(tmpdir(), "skvm-solidification-"))
  const proposalDir = await makeProposal(root)
  const packageDir = join(root, "package")
  await buildTraceGuidedApiTesterPackage({ proposalDir, packageDir })
  return { root, packageDir }
}

async function runPackage(input: {
  packageDir: string
  caseRoot: string
  openapi: unknown
  bindingId: string
}): Promise<{ exitCode: number; stdout: string; stderr: string; workDir: string; outDir: string }> {
  const bindingDir = join(input.caseRoot, "binding")
  const workDir = join(input.caseRoot, "work")
  const outDir = join(input.caseRoot, "out")
  await Promise.all([
    mkdir(bindingDir, { recursive: true }),
    mkdir(join(workDir, "input"), { recursive: true }),
  ])
  const bindingPath = join(bindingDir, "binding.json")
  await writeJson(bindingPath, {
    schemaVersion: "skill-ir-api-tester-production-binding/v2",
    bindingId: input.bindingId,
    input: { path: "input/openapi.json", format: "json" },
    outputs: { plan: "plan.json", report: "report.md" },
  })
  await writeJson(join(workDir, "input", "openapi.json"), input.openapi)
  const child = Bun.spawn([
    process.execPath,
    join(input.packageDir, "scripts", "api-task-solidify.js"),
    "--binding", bindingPath,
    "--workdir", workDir,
    "--out-dir", outDir,
    "--node", "node",
  ], { stdout: "pipe", stderr: "pipe" })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  return { exitCode, stdout, stderr, workDir, outDir }
}

describe("trace-guided API Tester package", () => {
  test("copies the declared proposal, records and excludes undeclared artifacts, and verifies exact closure", async () => {
    const { packageDir } = await makePackage()
    const verified = await verifyTraceGuidedSkillPackage(packageDir)
    expect(verified.manifest.proposal.bestRound).toBe(1)
    expect(verified.manifest.excludedProposalFiles).toEqual([
      expect.objectContaining({ path: "optimizer-scratch.log", reason: "undeclared-round-only-file" }),
    ])
    expect(await Bun.file(join(packageDir, "optimizer-scratch.log")).exists()).toBe(false)
    expect(await Bun.file(join(packageDir, "references", "existing.md")).text()).toBe("Existing reference.\n")
    const skill = await Bun.file(join(packageDir, "SKILL.md")).text()
    expect(skill).toContain("api-tester-openapi-subset-v2")
    expect(skill).toContain("scripts/api-task-solidify.js")
    expect(skill).toContain("continue the residual workflow")

    await writeFile(join(packageDir, "unexpected.txt"), "not declared\n")
    await expect(verifyTraceGuidedSkillPackage(packageDir)).rejects.toThrow("closure mismatch")
  })

  test("runs the bundled helper on an original and a parameterized variation", async () => {
    const { root, packageDir } = await makePackage()
    const original = await runPackage({
      packageDir,
      caseRoot: join(root, "original-case"),
      bindingId: "original-api",
      openapi: {
        openapi: "3.0.3",
        paths: {
          "/users/{id}": {
            get: {
              parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", minLength: 1 } }],
              responses: { "200": { description: "ok" }, "404": { description: "missing" } },
            },
          },
        },
      },
    })
    expect(original.exitCode).toBe(0)
    expect(JSON.parse(original.stdout).status).toBe("passed")
    expect(await Bun.file(join(original.workDir, "plan.json")).exists()).toBe(true)
    expect(await Bun.file(join(original.outDir, "run-report.json")).exists()).toBe(true)

    const variation = await runPackage({
      packageDir,
      caseRoot: join(root, "variation-case"),
      bindingId: "variation-api",
      openapi: {
        openapi: "3.0.3",
        paths: {
          "/inventory": {
            post: {
              parameters: [
                { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 5 } },
                { name: "enabled", in: "query", schema: { type: "boolean" } },
                { name: "tags", in: "query", style: "form", explode: true, schema: { type: "array", items: { type: "string" }, minItems: 1 } },
              ],
              responses: { "201": { description: "created" }, "400": { description: "invalid" } },
            },
          },
        },
      },
    })
    expect(variation.exitCode).toBe(0)
    const plan = JSON.parse(await readFile(join(variation.workDir, "plan.json"), "utf8"))
    expect(plan.endpoints[0]).toMatchObject({ method: "POST", path: "/inventory" })
    expect(JSON.stringify(plan)).toContain("tags")
  })

  test("returns an explicit unsupported result so the skill can use its fallback", async () => {
    const { root, packageDir } = await makePackage()
    const result = await runPackage({
      packageDir,
      caseRoot: join(root, "unsupported-case"),
      bindingId: "unsupported-api",
      openapi: {
        openapi: "3.0.3",
        paths: {
          "/session": {
            get: {
              parameters: [{ name: "session", in: "cookie", schema: { type: "string" } }],
              responses: { "200": { description: "ok" }, "400": { description: "bad" } },
            },
          },
        },
      },
    })
    expect(result.exitCode).not.toBe(0)
    const failure = JSON.parse(result.stderr)
    expect(failure).toMatchObject({
      status: "unsupported",
      code: "UNSUPPORTED_PARAMETER",
      fallbackRequired: true,
    })
    expect(await Bun.file(join(result.workDir, "plan.json")).exists()).toBe(false)
  })
})
