import { expect, test } from "bun:test"
import { buildStructureIndex } from "./evidence-preparation/structure-index.ts"
import { createSourceMaterials } from "../../task-dsl/authorization/source-materials.ts"
import { planInquiryReuse } from "./inquiry-reuse.ts"
import { sourceRelationRevision } from "./operation-work.ts"

const content = "def helper(actor):\n    return actor\n"
async function fixture(strategy: "operation-evidence-v3" | "operation-evidence-v4" = "operation-evidence-v3") {
  const index = await buildStructureIndex([{ path: "app.py", content }, { path: "other.py", content: "x = 1\n" }], { repository: "anonymous", sourceRef: "r" })
  const s = index.symbols.find(s => s.name === "helper")!
  const unit: any = { questionId: "q", itemId: "work", handle: "helper", op: "add", role: "helper", evidenceIds: ["ev"], source: { id: s.id, path: s.path, sha256: s.sha256, startLine: s.startLine, endLine: s.endLine }, coverage: "path", start: "body", complete: true, parameters: [{ name: "actor", type: "principal" }], blocks: [{ name: "body", steps: [{ kind: "return", name: "done", claim: "Test-authored actual source", object: "actor" }] }] }
  const store = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: strategy === "operation-evidence-v4" ? "property-control/v1" : "finite-control/v1" })
  store.accept(unit, [{ kind: "source-span", key: s.path, revision: s.sha256 }, { kind: "symbol-resolution", key: s.id, revision: s.sha256 }, { kind: "candidate-set", key: `relations:${s.id}:`, revision: sourceRelationRevision(index, s.id)! }], "test-authored")
  const input: any = { schemaVersion: "authorization-inquiry-input/v1", taskId: "t", sourceRoot: "one", repository: "anonymous", sourceRef: "r", allowedPaths: ["."], inquiry: { schemaVersion: "authorization-inquiry/v2", mode: "conformance", policy: { text: "Policy A", origin: "user" }, operations: [{ id: "op", request: "Inspect entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect entry", premises: [] }] } }
  const files = [{ path: s.path, sha256: s.sha256 }, { path: "other.py", sha256: "old-other" }]
  const prior: any = { domain: { closed: true, sourceMaterials: store.snapshot(), semantic: { units: [unit] }, slice: { bindings: [], policyRules: [{ questionId: "q", key: "old" }] } }, sourceFiles: files, evidence: [{ id: "ev", repository: "anonymous", sourceRef: "r", path: s.path, sha256: s.sha256 }], sourceVerification: { valid: true }, attempts: [{ status: "completed", localConsumer: "closed" }] }
  const run = (currentInput = input, currentStructure = index, previousRun = prior) => planInquiryReuse({ currentInput, previousInput: input, previousRun, previousSessionId: "prior", currentFiles: files as any, currentStructure, currentMethod: "D1", previousMethod: "D1", currentStrategy: strategy, previousStrategy: strategy, currentModel: "mock", previousModel: "mock" }) as any
  return { run, input, index, prior, files }
}
for (const strategy of ["operation-evidence-v3", "operation-evidence-v4"] as const) test(`${strategy} policy-only helper material restores without an entry, old answers or policy conclusions`, async () => {
  const f = await fixture(strategy), changed = structuredClone(f.input); changed.inquiry.policy.text = "Policy B"; changed.sourceRoot = "moved"
  const r = f.run(changed)
  expect(r.status).toBe("reusable")
  expect(r.info).toMatchObject({ eligible: true, materialsAvailable: 1, materialsRestored: 1, materialsUsed: 0, answerReused: false })
  expect(r.seed.sourceMaterials.materials).toHaveLength(1)
  expect(r.seed.delta.rules).toEqual([]); expect(r.seed.delta.policyRules).toEqual([])
})
for (const strategy of ["operation-evidence-v3", "operation-evidence-v4"] as const) test(`${strategy} unrelated source changes preserve a material but a changed actual candidate footprint retires it`, async () => {
  const f = await fixture(strategy)
  const unrelated = await buildStructureIndex([{ path: "app.py", content }, { path: "other.py", content: "import unused\nx = 2\n" }], { repository: "anonymous", sourceRef: "r" })
  expect(f.run(f.input, unrelated).info.materialsRestored).toBe(1)
  const changed = await buildStructureIndex([{ path: "app.py", content: content.replace("return actor", "return None") }], { repository: "anonymous", sourceRef: "r" })
  const r = f.run(f.input, changed)
  expect(r.status).toBe("reusable"); expect(r.info.materialsRestored).toBe(0)
  expect(r.info.invalidatedMaterials[0].reasons.length).toBeGreaterThan(0)
})
test("missing historical footprints and altered material identities never acquire reconstructed evidence", async () => {
  const f = await fixture(), missing = structuredClone(f.prior); delete missing.domain.sourceMaterials
  expect(f.run(f.input, f.index, missing).status).toBe("needs-fresh-analysis")
  const changed = structuredClone(f.prior); changed.domain.sourceMaterials.materials[0].unit.blocks[0].steps[0].claim = "tampered"
  expect(f.run(f.input, f.index, changed).info.materialsRestored).toBe(0)
})
