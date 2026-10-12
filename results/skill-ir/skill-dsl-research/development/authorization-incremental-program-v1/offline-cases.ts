import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import assert from "node:assert/strict"
import { checkAuthorizationInquiry, saveLocalInquiryCheck, inspectLocalInquiry } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"

const base = import.meta.dir, repo = path.resolve(base, "../../../../.."), share = path.join(repo, "examples/authorization-assessment/share-create-workflow"), download = path.join(repo, "examples/authorization-assessment/download-workflow")
const load = async (p: string) => JSON.parse(await readFile(p, "utf8"))
const save = async (p: string, v: unknown) => { await mkdir(path.dirname(p), { recursive: true }); await writeFile(p, JSON.stringify(v, null, 2) + "\n") }
const cite = (file: string, startLine: number, endLine = startLine) => ({ path: `src/documents/${file}.py`, startLine, endLine })
const ref = (name: string) => ({ ref: name }), binding = (name: string) => ({ binding: name }), literal = (v: any) => ({ literal: v })
const eq = (a: string, b: string) => ({ op: "eq", left: binding(a), right: binding(b) })
const equals = (a: string, b: any) => ({ op: "eq", left: binding(a), right: literal(b) })
const nonnull = (name: string) => ({ op: "not", arg: { op: "is-null", value: binding(name) } })
const all = (...args: any[]) => ({ op: "all", args }), any = (...args: any[]) => ({ op: "any", args })
const root = { ...cite("serialisers", 2873, 2886), receiverClass: "ShareLinkSerializer" }
const steps: any[] = [
  { id: "authenticated", op: "guard", test: all(nonnull("actor"), equals("actor.authenticated", true)), failure: "endpoint-authentication-denied", source: cite("views", 4696, 4710), because: "IsAuthenticated is the first inherited endpoint permission; fixture authentication is an explicit fact." },
  { id: "endpoint_grant", op: "select", from: "model_grants", where: all(eq("row.actor_id", "actor.id"), equals("row.permission", "documents.add_sharelink")), source: cite("permissions", 30, 44), sources: [cite("views", 4696, 4710)], because: "POST maps to add_sharelink under the declared DRF inheritance assumption; select the supplied global grant for this actor." },
  { id: "endpoint_allowed", op: "guard", test: nonnull("endpoint_grant"), failure: "endpoint-model-permission-denied", principal: ref("actor"), permission: "documents.add_sharelink", source: cite("permissions", 30, 44), sources: [cite("views", 4696, 4710)], because: "A global model grant is necessary but does not prove exact-document access." },
  { id: "document", op: "select", from: "documents", where: eq("row.id", "request.document_id"), source: cite("serialisers", 2857, 2867), because: "Finite model of DRF's document relation validation; the supplied population represents eligible related documents." },
  { id: "document_found", op: "guard", test: nonnull("document"), failure: "document-validation-error", source: cite("serialisers", 2857, 2886), because: "The finite relation must resolve to the exact supplied document before field validation; DRF implementation is an explicit gap." },
  { id: "view_model_grant", op: "select", from: "model_grants", where: all(eq("row.actor_id", "actor.id"), equals("row.permission", "documents.view_document")), source: cite("serialisers", 2873, 2886), because: "The serializer separately requires the caller's global documents.view_document permission." },
  { id: "view_model_allowed", op: "guard", test: all(nonnull("actor"), nonnull("view_model_grant")), failure: "serializer-model-permission-denied", principal: ref("actor"), resource: ref("document"), permission: "documents.view_document", source: cite("serialisers", 2873, 2886), sources: [cite("views", 406, 428)], because: "PassUserMixin supplies request.user to the serializer; the global check short-circuits the exact-object helper." },
  { id: "object_grant", op: "select", from: "object_grants", where: all(eq("row.actor_id", "actor.id"), eq("row.document_id", "document.id"), equals("row.permission", "view_document")), source: cite("permissions", 624, 635), because: "Finite development facts represent effective Guardian grants for the exact actor and document, not a precomputed authorization boolean." },
  { id: "object_allowed", op: "guard", test: any({ op: "is-null", value: binding("document.owner_id") }, eq("document.owner_id", "actor.id"), nonnull("object_grant")), failure: "serializer-object-permission-denied", principal: ref("actor"), resource: ref("document"), permission: "view_document", source: cite("serialisers", 2873, 2886), sources: [cite("permissions", 624, 635)], because: "Owner-aware semantics: unowned OR actor is owner OR the exact object's effective grant; never substitute add_sharelink." },
  { id: "create_descriptor", op: "return", value: { record: { operation: literal("create-share-analysis-only"), actor_id: { field: { of: ref("actor"), key: "id" } }, document_id: { field: { of: ref("document"), key: "id" } }, effect: literal("serializer-valid; creation remains external") } }, source: cite("serialisers", 2869, 2886), because: "A read-only descriptor after validation; no slug, ORM write or share is created." },
]
const program = { schemaVersion: "authorization-executable-contract/v1", id: "share-create-workflow-v1", scope: { kind: "function-contract", questionId: "share-create", root, upstream: ["DRF inherited CreateModelMixin and relation field execution are declared assumptions, not supplied framework source in this task."] }, sourceDeclarations: [{ source: root, statements: [{ kind: "object", expression: "document", as: "resource", because: "Exact validated field formal." }, { kind: "object", expression: "self", as: "context", because: "Actual serializer instance formal." }] }], queries: [], assumptions: [{ origin: "development-premise", text: "Finite documents and grants are complete development populations; grant rows represent effective backend results, not a measured database. Standard DRF create/permission/related-field semantics and normal Guardian constructor completion are assumed." }], resourceWorkflow: { inputs: ["actor", "request", "documents", "model_grants", "object_grants"], steps, gaps: ["No target creation or storage access is executed.", "DRF inherited create and relation-field implementation is not included in this task's allowed snapshot.", "Effective grant rows and ORM user identity by primary key are supplied development facts; deployed authentication/backend state remains unknown."] } }

await save(path.join(share, "program.json"), program)
const original = await load(path.resolve(base, "../authorization-domain-execution-v1/model/inputs/paperless-share-create.json"))
const facts: any = { actor: { id: 7, authenticated: true }, request: { document_id: 10 }, documents: [{ id: 10, owner_id: 9 }, { id: 20, owner_id: 8 }], model_grants: [{ actor_id: 7, permission: "documents.add_sharelink" }, { actor_id: 7, permission: "documents.view_document" }], object_grants: [{ actor_id: 7, document_id: 10, permission: "view_document" }] }
const observations: any[] = []
for (const variant of ["allowed", "denied", "missing-principal", "wrong-resource", "wrong-actor", "unknown-grants"]) {
  const current = structuredClone(facts)
  if (variant === "denied") current.object_grants = []
  if (variant === "missing-principal") current.actor = null
  if (variant === "wrong-resource") current.request.document_id = 20
  if (variant === "wrong-actor") current.object_grants[0].actor_id = 8
  if (variant === "unknown-grants") delete current.object_grants
  const input = { ...original, sourceRoot: path.relative(path.join(share, "inputs"), path.resolve(base, "../authorization-domain-execution-v1/model/public-source/paperless")).split(path.sep).join("/"), inquiry: { schemaVersion: "authorization-inquiry/v1", mode: "conformance", policy: original.policy, questions: [{ id: "share-create", request: original.brief, premises: [], entryHint: "ShareLinkSerializer.validate_document" }] }, resourceInputs: { "share-create": current } }
  delete input.brief; delete input.mode; delete input.policy
  const file = path.join(share, `inputs/${variant}.json`); await save(file, input)
  const checked = await checkAuthorizationInquiry(file, "D1", "question-checked-v1", path.join(share, "program.json"), { executionPolicy: "progressive" })
  const archive = await saveLocalInquiryCheck(file, path.join(share, "program.json"), path.join(base, `zero-model/share-${variant}`), checked, { executionPolicy: "progressive" })
  const inspected = await inspectLocalInquiry(archive.sessionPath), execution = inspected.execution.resourceExecution
  assert.ok(execution, JSON.stringify(checked.executableContract?.diagnostics))
  if (variant === "allowed") assert.equal(execution.returned.document_id, 10)
  if (["denied", "wrong-resource", "wrong-actor"].includes(variant)) assert.equal(execution.termination, "serializer-object-permission-denied")
  if (variant === "missing-principal") assert.equal(execution.termination, "endpoint-authentication-denied")
  if (variant === "unknown-grants") assert.ok(execution.conditions.length > 0)
  observations.push({ task: "share-create", variant, providerCalls: 0, session: path.relative(repo, archive.sessionPath), returned: execution.returned, termination: execution.termination, conditions: execution.conditions, gaps: execution.gaps, guards: execution.events.filter((e: any) => e.op === "guard").map((e: any) => ({ id: e.id, inputs: e.inputs, outcome: e.outcome })) })
}
const q = "requested-document-and-returned-file", originalDownload = await load(path.join(download, "program.json"))
for (const variant of ["root-default", "empty-version", "denied", "missing-owner", "root-fallback", "explicit-version", "null-actor", "stale-helper"]) {
  const input = await load(path.join(download, `inputs/${["explicit-version", "null-actor", "stale-helper"].includes(variant) ? "root-default" : variant}.json`))
  input.sourceRoot = path.relative(path.join(base, "inputs"), path.resolve(path.join(download, "inputs"), input.sourceRoot)).split(path.sep).join("/")
  const authored = structuredClone(originalDownload)
  if (variant === "explicit-version") input.resourceInputs[q].request.version = "12"
  if (variant === "null-actor") input.resourceInputs[q].actor = null
  if (variant === "stale-helper") for (const s of authored.resourceWorkflow.steps) for (const c of [s.source, ...(s.sources ?? [])]) if (c.path === "src/documents/permissions.py") c.sha256 = "0".repeat(64)
  const file = path.join(base, `inputs/download-${variant}.json`), programFile = path.join(base, `authoring/download-${variant}.json`)
  await save(file, input); await save(programFile, authored)
  const checked = await checkAuthorizationInquiry(file, "D1", "question-checked-v1", programFile, { executionPolicy: "progressive" }), execution = (checked.executableContract as any).resourceExecution
  if (variant === "root-default") assert.equal((execution.returned as any).file_document_id, 11)
  if (["empty-version", "explicit-version"].includes(variant)) assert.equal((execution.returned as any).file_document_id, 12)
  if (variant === "denied") assert.equal(execution.termination, "HttpResponseForbidden")
  if (["missing-owner", "null-actor", "stale-helper"].includes(variant)) assert.ok(execution.conditions.length || execution.gaps.some((g: string) => g.includes("source")))
  observations.push({ task: "download", variant, providerCalls: 0, returned: execution.returned, termination: execution.termination, conditions: execution.conditions, gaps: execution.gaps, diagnostics: checked.executableContract!.diagnostics.map(d => ({ code: d.code, path: d.path })), guards: execution.events.filter((e: any) => e.op === "guard").map((e: any) => ({ id: e.id, inputs: e.inputs, outcome: e.outcome })) })
}
await save(path.join(base, "verification/offline-cases.json"), { providerCalls: 0, observations, interpretation: "Developer-authored finite development examples; no target effect or new-skill automatic transfer claim." })
console.log(JSON.stringify(observations.map(o => ({ task: o.task, variant: o.variant, returned: o.returned, termination: o.termination, conditions: o.conditions.length }))))
