import { expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { plannedPositions } from "./study.ts"
import { naturalRunTaskId } from "../../../../../src/run/index.ts"
import * as ordinary from "./ordinary.ts"
import { skillBundleIdentity, verifySkillBundle, selectOrdinaryRow, ordinaryInvocation, classifyOrdinary } from "./ordinary.ts"
import { mechanicalReview } from "../authorization-guided-runtime-v1/study.ts"

test("complete skill identity includes the original SKILL and every deployed companion", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "au-skill-"))
  await mkdir(path.join(dir, "references"))
  await writeFile(path.join(dir, "SKILL.md"), "Original complete duty.\n")
  await writeFile(path.join(dir, "references", "guide.md"), "Original reference.\n")
  const original = await skillBundleIdentity(path.join(dir, "SKILL.md"))
  expect(original.files.map((f: any) => f.path)).toEqual(["SKILL.md", "references/guide.md"])
  expect(original.files.every((f: any) => /^[a-f0-9]{64}$/.test(f.sha256) && f.bytes > 0)).toBe(true)
  await verifySkillBundle(path.join(dir, "SKILL.md"), original)
  await writeFile(path.join(dir, "references", "guide.md"), "Changed companion.\n")
  await expect(verifySkillBundle(path.join(dir, "SKILL.md"), original)).rejects.toThrow("Complete skill bundle changed")
})

const manifest = () => ({ rows: plannedPositions(), inputs: [{ id: "paperless-share-create", file: "model/inputs/paperless-share-create.json", sha256: "input", skill: "original/SKILL.md" }], inheritedSeals: { sealedTasks: [] }, testedModel: "fixture/model", budgets: { maxDispatches: 24, maxToolCalls: 64, maxDisplayBytes: 786432, maxReadBytes: 33554432, maxTokens: 6000, sessionTimeoutMs: 1200000 } })
const registration = { inputs: [{ id: "paperless-share-create", inputSha256: "input", sourceSkill: "original/SKILL.md", bundleSha256: "bundle" }], changedPolicies: { "paperless-share-create": { text: "Only this owner", origin: "user", location: "public-user-policy" } } }
test("ordinary arms share original task/skill/budget and select their actual public frontend", () => {
  const m: any = manifest(), commands = ["N", "M-O", "D-O"].map(arm => {
    const selected = selectOrdinaryRow(m, `quality-paperless-share-create-${arm}`, registration)
    return ordinaryInvocation({ ...selected, manifest: m, value: { brief: "Original natural question", policy: { text: "Current policy" } }, scopeFile: "scope.json", skill: "SKILL.md", traceFile: "trace.json", workDir: "work" })
  })
  expect(new Set(commands.map(c => c.prompt)).size).toBe(1)
  for (const c of commands) {
    expect((c as any).taskKey).toBe(naturalRunTaskId(c.prompt))
    expect(c.args).toContain("--authorization-max-provider-calls=24")
    expect(c.args).toContain("--authorization-max-tool-calls=64")
    expect(c.args).toContain("--authorization-max-output-tokens=6000")
    expect(c.args).toContain("--skill=SKILL.md")
  }
  expect(commands[0]!.args).not.toContain("--authorization-domain-tools")
  expect(commands[1]!.args).toContain("--authorization-method=M")
  expect(commands[2]!.args).toContain("--authorization-method=D1")
})
test("ordinary selection refuses sealed tasks and non-ordinary or unregistered positions before dispatch", () => {
  const m: any = manifest()
  expect(() => selectOrdinaryRow(m, "debug-paperless-share-create", registration)).toThrow()
  expect(() => selectOrdinaryRow(m, "quality-gitea-create-issue-N", registration)).toThrow()
  const changed = selectOrdinaryRow(m, "native-paperless-share-create-changed", registration)
  expect(changed.policyOverride).toEqual(registration.changedPolicies["paperless-share-create"])
  m.inheritedSeals.sealedTasks.push("paperless-share-create")
  expect(() => selectOrdinaryRow(m, "quality-paperless-share-create-M-O", registration)).toThrow()
})
test("N completion means closed source-valid prose and never a fabricated formal check", () => {
  const trace = { attempts: [{ status: "response", response: { text: "Original answer", toolCalls: [] } }], telemetry: { providerCalls: 1, respondedCalls: 1 }, sourceVerification: { valid: true } }
  const n = classifyOrdinary(trace, 0, "N")
  expect(n.status).toBe("completed")
  expect(n.formalCheck).toBe("not-applicable")
  expect(classifyOrdinary({ ...trace, sourceVerification: { valid: false } }, 0, "N").status).toBe("completed-with-diagnostics")
  expect(classifyOrdinary(trace, 0, "M-O").status).toBe("completed-with-diagnostics")
})
test("raw ordinary conversation only matches known positive integral counts and fully responded native telemetry", () => {
  const matches = (ordinary as any).ordinaryAccountingMatches, valid = { providerCalls: 3, respondedCalls: 3 }
  expect(matches(valid, { telemetry: valid })).toBe(true)
  for (const invalid of [{}, { providerCalls: null, respondedCalls: null }, { providerCalls: 0, respondedCalls: 0 }, { providerCalls: 1.5, respondedCalls: 1.5 }, { providerCalls: 3, respondedCalls: 2 }]) expect(matches(invalid, { telemetry: invalid })).toBe(false)
  expect(matches(valid, {})).toBe(false)
  expect(matches(valid, { telemetry: { ...valid, providerCalls: 4 } })).toBe(false)
})

test("known native draft rejections do not pause the shared checker, while real or unknown failures retain their pause", () => {
  const diagnostics = [{ code: "inquiry-result-schema" }, { code: "observation-schema" }, { code: "focus-next-item-unavailable" }, { code: "semantic-argument-unbound" }, { code: "focus-result-stale" }]
  const report: any = { status: "completed-with-diagnostics", ordinaryEntry: "skvm run", finalProse: "Partial source answer", sourceVerification: { valid: true }, validation: { valid: false, diagnostics: [] }, domain: { closed: true, check: { diagnostics } }, telemetry: { providerCalls: 1, respondedCalls: 1 }, attempts: [{ status: "response", response: {} }], history: [{ call: { name: "authorization_check_result" }, exitCode: 0, output: { valid: false, diagnostics } }] }
  expect(mechanicalReview(report).failure?.category).toBe("semantic-extraction")
  expect(mechanicalReview(report).failure?.components).toEqual(["model-draft"])
  const withCheck = (extra: any) => ({ ...report, history: [{ ...report.history[0], ...extra }] })
  for (const broken of [
    { ...report, sourceVerification: { valid: false } },
    { ...report, error: "Internal checker exception" },
    { ...report, telemetry: { providerCalls: 1, respondedCalls: 0 }, attempts: [{ status: "pending" }] },
    withCheck({ output: { valid: false, diagnostics: [...diagnostics, { code: "control-structure-missing" }] } }),
    withCheck({ exitCode: 1, output: { phase: "unexpected-host-phase", diagnostics } }),
  ]) expect(mechanicalReview(broken).failure?.components).not.toEqual(["model-draft"])
})
