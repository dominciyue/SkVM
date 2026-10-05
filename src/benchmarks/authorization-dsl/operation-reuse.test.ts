import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { createInquiryTools } from "./inquiry-tools.ts"
import { planInquiryReuse } from "./inquiry-reuse.ts"
import { compileAuthorizationInquiry } from "../../task-dsl/authorization/inquiry-program.ts"
import { createOperationFacts } from "../../task-dsl/authorization/operation-facts.ts"
import { createControlSlice, mergeControlSlice } from "../../task-dsl/authorization/control-slice.ts"
import { createInquiryDomainRuntime } from "./inquiry-domain-runtime.ts"

async function fixture() {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "au-reuse-"))
  await writeFile(path.join(sourceRoot, "base.py"), "class Base:\n    def create(self):\n        return True\n")
  await writeFile(path.join(sourceRoot, "view.py"), "from base import Base\nclass View(Base):\n    pass\n")
  await writeFile(path.join(sourceRoot, "other.py"), "def unrelated():\n    return False\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "fixture", sourceRef: "r", allowedPaths: ["."], structure: true })
  const inquiry: any = { schemaVersion: "authorization-inquiry/v2", mode: "conformance", operations: [{ id: "op", request: "Inspect create", entryHint: "View" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect create", premises: [{ text: "caller is enabled", origin: "user" }] }], policy: { text: "No caller may create.", origin: "user", location: "policy" } }
  const input: any = { schemaVersion: "authorization-inquiry-input/v1", taskId: "fixture", sourceRoot: ".", repository: "fixture", sourceRef: "r", allowedPaths: ["."], inquiry }
  const program = compileAuthorizationInquiry(inquiry), entry = tools.structure!.symbols.find(s => s.qualifiedName === "view.View")!, helper = tools.structure!.symbols.find(s => s.qualifiedName === "base.Base.create")!
  const unit = (s: any, role: string): any => ({ itemId: role === "entry" ? "q::entry" : "helper", questionId: "q", handle: role, op: "add", role, start: "body", complete: true, parameters: [], blocks: [{ name: "body", steps: [{ kind: "return", name: "ret", claim: "shown source return", ...(role === "entry" ? { outcome: "allow" } : { value: true }) }] }], source: { id: s.id, path: s.path, sha256: s.sha256, startLine: s.startLine, endLine: s.endLine }, evidenceIds: [] })
  const units = [unit(entry, "entry"), unit(helper, "helper")]
  for (const u of units) u.evidenceIds = (await tools.execute("source_read", { path: u.source.path, startLine: u.source.startLine, endLine: u.source.endLine })).evidence.map(e => e.id)
  const facts = createOperationFacts(program, tools.identity); facts.bind("op", units[0].source)
  for (const u of units) facts.accept("op", u, [{ kind: "source-span", key: u.source.path, revision: u.source.sha256 }, { kind: "candidate-set", key: "view.View:create", revision: tools.structure!.candidateRevision("view.View", "create") }])
  const slice = mergeControlSlice(createControlSlice(), { schemaVersion: "authorization-control-slice/v1", bindings: [{ key: "enabled", questionId: "q", value: true, origin: "user", text: "caller is enabled" }] }, program, { questionIds: ["q"], shownEvidenceIds: [] }).state; slice.policyRules = [{ key: "old-policy", questionId: "q" }] as any
  const prior: any = { status: "completed-with-diagnostics", final: { text: "OLD ANSWER" }, sourceFiles: tools.files, evidence: tools.evidence, domain: { slice, operationFacts: facts.snapshot(), semantic: { units } } }
  const args: any = { currentInput: input, previousInput: input, previousRun: prior, previousSessionId: "prior", currentFiles: tools.files, currentStructure: tools.structure, currentMethod: "D1", previousMethod: "D1", currentStrategy: "operation-evidence-v1", previousStrategy: "operation-evidence-v1", currentModel: "mock", previousModel: "mock" }
  return { sourceRoot, tools, input, args, prior, program }
}

test("partial operation materials restore unreviewed source templates and recompute rules without old answer/check/policy", async () => {
  const f = await fixture(), plan: any = planInquiryReuse(f.args)
  expect(plan.status).toBe("reusable")
  expect(plan.info.reuseLevel).toBe("materials")
  expect(plan.seed.semanticUnits).toHaveLength(2)
  expect(plan.seed.delta.rules).toEqual([])
  expect(plan.seed.delta.policyRules).toEqual([])
  expect(JSON.stringify(plan.seed)).not.toContain("OLD ANSWER")
  const domain = createInquiryDomainRuntime({ program: f.program, tools: f.tools, strategy: "operation-evidence-v1", initialDelta: plan.seed.delta, initialSemanticUnits: plan.seed.semanticUnits })
  await domain.sync(false)
  expect(domain.report().slice.rules.some(r => r.kind === "entry")).toBe(true)
  expect(domain.report().check).toBeUndefined()
  expect(domain.report().operationFacts!.facts.every(f => f.semanticSupport === "unreviewed")).toBe(true)
})

test("an unrelated file change preserves materials but an added override invalidates old MRO while read base bytes stay identical", async () => {
  const f = await fixture()
  await writeFile(path.join(f.sourceRoot, "other.py"), "def unrelated():\n    return True\n")
  const same = await createInquiryTools({ sourceRoot: f.sourceRoot, repository: "fixture", sourceRef: "r", allowedPaths: ["."], structure: true })
  const retained: any = planInquiryReuse({ ...f.args, currentFiles: same.files, currentStructure: same.structure })
  expect(retained.status).toBe("reusable")
  expect(retained.seed.semanticUnits).toHaveLength(2)
  await writeFile(path.join(f.sourceRoot, "view.py"), "from base import Base\nclass View(Base):\n    def create(self):\n        return False\n")
  const changed = await createInquiryTools({ sourceRoot: f.sourceRoot, repository: "fixture", sourceRef: "r", allowedPaths: ["."], structure: true })
  const invalid: any = planInquiryReuse({ ...f.args, currentFiles: changed.files, currentStructure: changed.structure })
  expect(invalid.seed.semanticUnits).toEqual([])
  expect(invalid.info.invalidatedMaterials.some((m: any) => m.handle === "helper" && m.reasons.some((r: string) => r.includes("candidate-set")))).toBe(true)
  expect(changed.files.find(f => f.path === "base.py")!.sha256).toBe(f.tools.files.find(f => f.path === "base.py")!.sha256)
})

test("policy and premise changes retain valid source while dropping old mappings and changed values; unknown calls remain sealed", async () => {
  const f = await fixture(), current = structuredClone(f.input)
  current.inquiry.policy.text = "Enabled callers may create."
  let plan: any = planInquiryReuse({ ...f.args, currentInput: current })
  expect(plan.seed.delta.policyRules).toEqual([])
  expect(plan.info.invalidatedPolicyKeys).toEqual(["q.old-policy"])
  current.inquiry.questions[0].premises = [{ text: "caller is disabled", origin: "user" }]
  plan = planInquiryReuse({ ...f.args, currentInput: current })
  expect(plan.seed.semanticUnits).toHaveLength(2)
  expect(plan.seed.delta.bindings).toEqual([])
  expect(plan.info.invalidatedPremiseKeys).toEqual(["q.enabled"])
  expect(planInquiryReuse({ ...f.args, previousRun: { ...f.prior, attempts: [{ status: "pending" }] } }).status).toBe("needs-fresh-analysis")
})
