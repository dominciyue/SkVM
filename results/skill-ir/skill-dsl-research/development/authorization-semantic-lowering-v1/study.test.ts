import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { loadInquiryInput } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
const api = await import("./study.ts").catch(() => ({} as any))
const row = { id: "quality-a-D-S", task: "a", kind: "quality", studyArm: "D-S", method: "D1", strategy: "semantic-flow-v1", admission: "eligible", components: ["wire"] }
const manifest = { rows: [row], tasks: [{ id: "a", admission: "eligible" }], arms: [{ studyArm: "D-S", method: "D1", strategy: "semantic-flow-v1" }] }
test("AS admission preserves logical seals despite row names and refuses arm/core asymmetry", () => {
  expect(typeof api.selectQualityRow).toBe("function")
  expect(api.selectQualityRow(manifest, row.id)).toEqual(row)
  expect(() => api.selectQualityRow({ ...manifest, tasks: [{ id: "a", admission: "blocked-sealed-logical-task" }] }, row.id)).toThrow("sealed")
  expect(() => api.selectQualityRow({ ...manifest, rows: [{ ...row, method: "M" }] }, row.id)).toThrow("arm")
  expect(() => api.selectQualityRow(manifest, "renamed-a-D-S")).toThrow("registered")
})
test("ordinary skill admission requires the registered native scope and full original skill contract", async () => {
  const native = await import("./native.ts").catch(() => ({} as any))
  const entry = { id: "native-a-original", task: "a", kind: "native", admission: "eligible", method: "D1", strategy: "semantic-flow-v1", sourceSkill: "original/SKILL.md", completeSkillAndReferencesRequired: true, originalBriefAndOtherDutiesPreserved: true, totalProviderBudget: 12, totalToolBudget: 24 }
  const registered = { rows: [entry], tasks: [{ id: "a", admission: "eligible" }] }
  expect(typeof native.selectNativeRow).toBe("function")
  expect(native.selectNativeRow(registered, entry.id)).toEqual(entry)
  expect(() => native.selectNativeRow({ ...registered, tasks: [{ id: "a", admission: "blocked-sealed-logical-task" }] }, entry.id)).toThrow("sealed")
  expect(() => native.selectNativeRow({ ...registered, rows: [{ ...entry, completeSkillAndReferencesRequired: false }] }, entry.id)).toThrow("original skill")
  expect(() => native.selectNativeRow(registered, "renamed")).toThrow("registered")
})
test("variation admission binds a registered semantic base and cannot bypass an inherited seal", async () => {
  const variations = await import("./variations.ts").catch(() => ({} as any))
  const base = { ...row, id: "quality-a-D-S" }, changed = { id: "variation-a-policy-previous", task: "a", kind: "variation", method: "D1", strategy: "semantic-flow-v1", admission: "depends-on-checked-bounded-base", blockedBy: null, baseRow: base.id, change: "policy", route: "previous" }
  const registered = { rows: [base, changed], tasks: [{ id: "a", admission: "eligible" }] }
  expect(typeof variations.selectVariationRow).toBe("function")
  expect(variations.selectVariationRow(registered, changed.id)).toEqual(changed)
  expect(() => variations.selectVariationRow({ ...registered, rows: [base, { ...changed, blockedBy: "inherited-unknown" }] }, changed.id)).toThrow("sealed")
  expect(() => variations.selectVariationRow({ ...registered, rows: [{ ...base, strategy: "legacy" }, changed] }, changed.id)).toThrow("base")
  expect(() => variations.selectVariationRow(registered, "renamed")).toThrow("registered")
})
test("native delivery requires the actual final response and a bounded current check", async () => {
  const native = await import("./native.ts").catch(() => ({} as any))
  const trace = { status: "completed", domain: { check: { structureValid: true, sourceBound: true, ruleConsistency: true, taskResolution: "bounded" } }, attempts: [{ state: "responded", response: { text: "Earlier explanation", toolCalls: [] } }, { state: "responded", response: { text: "Now checking", toolCalls: [{ name: "authorization_check_result" }] } }] }
  expect(typeof native.nativeDelivery).toBe("function")
  expect(native.nativeDelivery(trace, 0).status).toBe("completed-with-diagnostics")
  const final = { ...trace, attempts: [...trace.attempts, { state: "responded", response: { text: "Final user-facing answer", toolCalls: [] } }] }
  expect(native.nativeDelivery(final, 0)).toMatchObject({ status: "completed", finalProse: "Final user-facing answer" })
  expect(native.nativeDelivery({ ...final, domain: { check: { ...trace.domain.check, taskResolution: "partial" } } }, 0).status).toBe("completed-with-diagnostics")
})
test("derived native scope resolves the exact original source through the public relative-root contract", async () => {
  const native = await import("./native.ts").catch(() => ({} as any)), base = await mkdtemp(path.join(os.tmpdir(), "authorization-native-scope-")), source = path.join(base, "source"), scopeFile = path.join(base, "output", "scope.json")
  await mkdir(source); await mkdir(path.dirname(scopeFile)); await writeFile(path.join(source, "entry.ts"), "export function entry() { return true }\n")
  const original = { schemaVersion: "authorization-inquiry-input/v1", taskId: "anonymous", repository: "anonymous", sourceRef: "fixture", sourceRoot: "source", allowedPaths: ["entry.ts"], mode: "conformance", brief: "Explain the entry", policy: { text: "Caller must own the addressed object.", origin: "user", location: "current user policy" } }, changed = { ...original.policy, text: "Caller must hold access to the addressed object." }
  expect(typeof native.makeNativeScope).toBe("function")
  const scope = native.makeNativeScope(original, source, scopeFile, changed)
  await writeFile(scopeFile, JSON.stringify(scope))
  expect((await loadInquiryInput(scopeFile)).context.sourceRoot).toBe(source)
  expect(scope.sourceRoot).toBe("../source")
  expect(scope.policy).toEqual(changed)
  expect(original.sourceRoot).toBe("source")
  expect(original.policy.text).toContain("own")
})
test("a native zero-dispatch inspection needs the exact loader failure and bound independent order proof", async () => {
  const { inspectNativeZeroDispatch } = await import("./zero-dispatch.ts"), base = await mkdtemp(path.join(os.tmpdir(), "authorization-native-inspection-")), output = path.join(base, "runs", "native-anonymous", "attempt-1")
  await mkdir(path.join(output, "source-capture"), { recursive: true })
  const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex"), prompt = "Explain the exact addressed object", taskKey = `natural-${hash(prompt).slice(0, 12)}`, identity = { row: { id: "native-anonymous", task: "anonymous", kind: "native" }, attempt: 1, revision: "fixture" }, args = [`--prompt=${prompt}`, "--authorization-scope=scope.json"]
  const records: Record<string, unknown> = { "claim.json": identity, "report.json": { identity, report: { status: "completion-unknown", exitCode: 1 } }, "ordinary-claim.json": { revision: identity.revision, args }, "scope.json": { schemaVersion: "authorization-inquiry-input/v1", taskId: "anonymous", repository: "anonymous", sourceRef: "fixture", sourceRoot: base, allowedPaths: ["entry.ts"], brief: prompt }, "source-capture/cli-session.json": { argv: ["bun", "index.ts", ...args] }, "source-capture/initialization-order.json": { revision: identity.revision, kind: "independent-code-order-review", loadInquiryInputBeforeProviderComplete: true, providerConstructionDispatches: false, reviewers: ["reviewer-a", "reviewer-b"], anchors: [{}, {}, {}] } }
  for (const [name, value] of Object.entries(records)) await writeFile(path.join(output, name), JSON.stringify(value))
  await writeFile(path.join(output, "stdout.txt"), `Starting task ${taskKey}\nTask ${taskKey} failed  (0s)\n`); await writeFile(path.join(output, "stderr.txt"), 'Run failed: [{"message":"Use a relative sourceRoot","path":["sourceRoot"]}]')
  const evidence = await Promise.all([...Object.keys(records), "stdout.txt", "stderr.txt"].map(async name => ({ path: name, sha256: hash(await readFile(path.join(output, name))) }))), proof = { schemaVersion: "authorization-native-zero-dispatch/v1", verifiedStatus: "input-invalid-before-dispatch", providerDispatches: 0, implementationRevision: identity.revision, taskKey, claimSha256: evidence.find(e => e.path === "claim.json")!.sha256, reportSha256: evidence.find(e => e.path === "report.json")!.sha256, evidence }
  await writeFile(path.join(output, "zero-dispatch-inspection.json"), JSON.stringify(proof))
  expect(await inspectNativeZeroDispatch(output)).toMatchObject({ status: "input-invalid-before-dispatch", providerDispatches: 0 })
  await api.assertNoUnknownTask(base, "anonymous")
  const order = records["source-capture/initialization-order.json"] as any
  delete order.reviewers
  await writeFile(path.join(output, "source-capture/initialization-order.json"), JSON.stringify(order)); evidence.find(e => e.path === "source-capture/initialization-order.json")!.sha256 = hash(await readFile(path.join(output, "source-capture/initialization-order.json")))
  await writeFile(path.join(output, "zero-dispatch-inspection.json"), JSON.stringify(proof))
  await expect(inspectNativeZeroDispatch(output)).rejects.toThrow(/pre-provider failure/)
})
test("authors bind their unchanged original skill and the registered variant policy without filling model questions", async () => {
  const author = await import("./authors.ts").catch(() => ({} as any)), entry = { id: "author-original", task: "a", skill: "original", variant: "original", sourceSkill: "original/SKILL.md", fieldOrigin: "model-authored", hostFillsOnlyMechanicalMetadata: true }, native = { id: "native-original", kind: "native", task: "a", skill: "original", variant: "original", sourceSkill: entry.sourceSkill, policyOverride: null, admission: "eligible", method: "D1", strategy: "semantic-flow-v1", completeSkillAndReferencesRequired: true, originalBriefAndOtherDutiesPreserved: true, totalProviderBudget: 12, totalToolBudget: 24 }, manifest = { authors: [entry], rows: [native], tasks: [{ id: "a", admission: "eligible" }] }
  expect(typeof author.selectAuthor).toBe("function")
  expect(author.selectAuthor(manifest, entry.id)).toMatchObject({ author: entry, native })
  expect(() => author.selectAuthor({ ...manifest, tasks: [{ id: "a", admission: "blocked-sealed-logical-task" }] }, entry.id)).toThrow("sealed")
  expect(() => author.selectAuthor({ ...manifest, rows: [{ ...native, sourceSkill: "replacement/SKILL.md" }] }, entry.id)).toThrow("original")
  expect(() => author.selectAuthor({ ...manifest, authors: [{ ...entry, hostFillsOnlyMechanicalMetadata: false }] }, entry.id)).toThrow("model")
  expect(() => author.selectAuthor({ ...manifest, rows: [{ ...native, completeSkillAndReferencesRequired: false }] }, entry.id)).toThrow("original skill")
  expect(() => author.selectAuthor({ ...manifest, rows: [{ ...native, strategy: "legacy" }] }, entry.id)).toThrow("original skill")
})
test("author consumption rejects edited drafts and changed original skill identities before provider dispatch", async () => {
  const api = await import("./authors.ts").catch(() => ({} as any)), author = { id: "author-anonymous", task: "anonymous", sourceSkill: "original/SKILL.md", variant: "original" }, claim = { row: { ...author, kind: "author", method: "D1", strategy: "semantic-flow-v1" }, originalSkill: "original/SKILL.md", originalSkillSha256: "original-sha", originalInputSha256: "task-sha" }, report = { sourceSkillUnmodified: true, originalSkillSha256: "original-sha", authoredArtifacts: { inputSha256: "draft-sha", usageSha256: "usage-sha" } }, actual = { originalSkill: "original/SKILL.md", originalSkillSha256: "original-sha", originalInputSha256: "task-sha", inputSha256: "draft-sha", usageSha256: "usage-sha" }
  expect(typeof api.assertAuthorConsumeIdentity).toBe("function")
  expect(() => api.assertAuthorConsumeIdentity(author, claim, report, actual)).not.toThrow()
  expect(() => api.assertAuthorConsumeIdentity(author, claim, { ...report, sourceSkillUnmodified: false }, actual)).toThrow("identity")
  expect(() => api.assertAuthorConsumeIdentity(author, claim, report, { ...actual, inputSha256: "host-edited" })).toThrow("identity")
  expect(() => api.assertAuthorConsumeIdentity(author, claim, report, { ...actual, originalSkillSha256: "replacement" })).toThrow("identity")
})
test("source change requires the entire current source index to match its one declared byte edit", async () => {
  const api = await import("./source-changes.ts").catch(() => ({} as any)), original = [{ path: "selected.py", sha256: "before", bytes: 100 }, { path: "route.py", sha256: "unchanged", bytes: 200 }], edit = { path: "selected.py", beforeSha256: "before", afterSha256: "after", afterBytes: 80 }
  expect(typeof api.assertOneSourceEdit).toBe("function")
  expect(() => api.assertOneSourceEdit(original, [{ ...original[0], sha256: "after", bytes: 80 }, original[1]], edit)).not.toThrow()
  expect(() => api.assertOneSourceEdit(original, [{ ...original[0], sha256: "after", bytes: 80 }, { ...original[1], sha256: "stale-unregistered-edit" }], edit)).toThrow("source")
  expect(() => api.assertOneSourceEdit(original, [{ ...original[0], sha256: "after", bytes: 80 }], edit)).toThrow("source")
  expect(() => api.assertOneSourceEdit(original, [...original, { path: "new.py", sha256: "extra", bytes: 1 }], edit)).toThrow("source")
})
test("source change admission requires its registered semantic base and edits one source-local clause only", async () => {
  const source = await import("./source-changes.ts").catch(() => ({} as any)), base = { ...row, id: "quality-a-D-S" }, changed = { id: "source-change-a-fresh", kind: "source-change", task: "a", method: "D1", strategy: "semantic-flow-v1", baseRow: base.id, sourceIntent: "Remove the exact object clause", admission: "depends-on-checked-bounded-base", blockedBy: null }, manifest = { rows: [base, changed], tasks: [{ id: "a", admission: "eligible" }] }
  expect(typeof source.selectSourceChangeRow).toBe("function")
  expect(source.selectSourceChangeRow(manifest, changed.id)).toEqual(changed)
  expect(() => source.selectSourceChangeRow({ ...manifest, rows: [base, { ...changed, blockedBy: "unknown-base" }] }, changed.id)).toThrow("sealed")
  const clause = "            and exact_object_check(\n                caller,\n                object,\n            )\n", original = `class Other:\n${clause}\nclass Selected:\n    def validate(self, object):\n        if caller is not None and global_permission:\n${clause}            return object\n        raise Rejected()\n\nclass After:\n    pass\n`
  expect(source.removeOneScopedClause(original, "Selected", clause)).toBe(original.replace(`global_permission:\n${clause}`, "global_permission:\n"))
  expect(() => source.removeOneScopedClause(original, "Selected", "missing")).toThrow("unique")
  expect(() => source.removeOneScopedClause(original.replace("class After:", `class Selected:\n${clause}\nclass After:`), "Selected", clause)).toThrow("unique")
})
