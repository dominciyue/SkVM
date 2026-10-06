import path from "node:path"
import assert from "node:assert/strict"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { AuthorizationInquiryInputSchema, loadInquiryInput, compareLocalInquiry } from "../../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createInquiryTools } from "../../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { copySourceSnapshot } from "../../authorization-semantic-lowering-v1/source-snapshot.ts"
import { ManifestSchema } from "../types.ts"
import { root, sha } from "../study.ts"

const save = async (file: string, value: unknown) => {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", flag: "wx" })
}
const manifestFile = path.join(root, "manifest.json")
const manifest = ManifestSchema.parse(JSON.parse(await readFile(manifestFile, "utf8")))
const baselineFile = path.join(root, "verification/av14-retained-baseline.json")
const baseline = await loadInquiryInput(baselineFile)
assert.equal(baseline.value.inquiry?.schemaVersion, "authorization-inquiry/v2")
const declaration = baseline.value.inquiry!
const originalRegistration = manifest.inputs.find(i => i.id === "paperless-download-original")!
const original = await loadInquiryInput(path.join(root, originalRegistration.file))
const originalSource = await createInquiryTools({ ...original.context, maxReadBytes: manifest.budgets.maxReadBytes, maxFiles: manifest.budgets.maxFiles })
assert.deepEqual(originalSource.files, originalRegistration.sourceFiles)
const copiedRoot = path.join(root, "model/source/paperless-request-binding-v1")
await copySourceSnapshot({ ...original.context, maxReadBytes: manifest.budgets.maxReadBytes, maxFiles: manifest.budgets.maxFiles }, copiedRoot)

const sourcePath = "src/documents/views.py", originalBytes = await readFile(path.join(original.context.sourceRoot, sourcePath))
const sourceText = originalBytes.toString("utf8"), start = sourceText.indexOf("    def _resolve_request_and_root_doc("), end = sourceText.indexOf("    def file_response(", start)
assert.ok(start >= 0 && end > start)
const window = sourceText.slice(start, end), argument = /("view_document",\r?\n[ \t]*)root_doc,/
assert.equal([...window.matchAll(new RegExp(argument.source, "g"))].length, 1)
const patchedWindow = window.replace(argument, "$1request_doc,")
const patchedBytes = Buffer.from(sourceText.slice(0, start) + patchedWindow + sourceText.slice(end), "utf8")
assert.equal(patchedBytes.toString("utf8").split("\n").length, sourceText.split("\n").length)
await writeFile(path.join(copiedRoot, sourcePath), patchedBytes)

const previous = path.join(root, "positions/debug-paperless-download-D1/revision-final-diagnostics/raw/inquiry")
const rows = []
for (const variant of ["policy", "premise", "source"] as const) {
  const registration = manifest.inputs.find(i => i.id === `paperless-download-${variant}`)!
  assert.equal(registration.ready, false)
  const inputFile = path.join(root, registration.file)
  const value = structuredClone(baseline.value)
  value.sourceRoot = path.relative(path.dirname(inputFile), variant === "source" ? copiedRoot : baseline.context.sourceRoot).replaceAll("\\", "/")
  if (variant === "policy") {
    value.inquiry!.mode = "conformance"
    value.inquiry!.policy = manifest.policyVariants["paperless-download"]!
  }
  if (variant === "premise") {
    for (const question of value.inquiry!.questions) {
      question.premises = question.premises.filter(p => p.text !== "Ownership and object grants are unspecified.")
      question.premises.push({ text: "The authenticated caller owns the requested document. Ownership and object grants on related root documents and other versions are unspecified.", origin: "user" })
    }
  }
  const parsed = AuthorizationInquiryInputSchema.parse(value)
  assert.equal(parsed.repository, baseline.value.repository)
  assert.equal(parsed.sourceRef, baseline.value.sourceRef)
  assert.deepEqual(parsed.allowedPaths, baseline.value.allowedPaths)
  if (parsed.inquiry?.schemaVersion === "authorization-inquiry/v2" && declaration.schemaVersion === "authorization-inquiry/v2") assert.deepEqual(parsed.inquiry.operations, declaration.operations)
  assert.deepEqual(parsed.inquiry!.questions.map(({ premises: _p, ...q }) => q), declaration.questions.map(({ premises: _p, ...q }) => q))
  if (variant !== "premise") assert.deepEqual(parsed.inquiry!.questions, declaration.questions)
  if (variant !== "policy") { assert.equal(parsed.inquiry!.mode, declaration.mode); assert.deepEqual(parsed.inquiry!.policy, declaration.policy) }
  await save(inputFile, parsed)
  const loaded = await loadInquiryInput(inputFile), source = await createInquiryTools({ ...loaded.context, maxReadBytes: manifest.budgets.maxReadBytes, maxFiles: manifest.budgets.maxFiles })
  const changedFiles = source.files.filter(f => originalSource.files.find(old => old.path === f.path)?.sha256 !== f.sha256)
  assert.equal(source.files.length, originalSource.files.length)
  assert.deepEqual(changedFiles.map(f => f.path), variant === "source" ? [sourcePath] : [])
  registration.sha256 = sha(await readFile(inputFile)); registration.ready = true; registration.sourceFiles = source.files
  registration.changes = [
    "AV14 complete retained original declaration; operation and every original question request/intent unchanged; sourceRoot mechanically relocated",
    variant === "policy" ? "AV14 analysis mode conformance plus the pre-registered independent exact-object policy; original premises/source unchanged"
      : variant === "premise" ? "AV14 explicit user premise: caller owns requested document; related root/version ownership and grants remain unspecified; policy/source unchanged"
      : "AV14 developer source copy: one guard object argument root_doc to request_doc in _resolve_request_and_root_doc; base sourceRef retained with actual changed source-file SHA; original declaration/policy/premises unchanged",
  ]
  const comparison = await compareLocalInquiry(inputFile, previous, "operation-evidence-v2")
  assert.ok("reuseEligibility" in comparison)
  assert.equal(comparison.reuseEligibility.status, "reusable")
  assert.equal(comparison.reuseEligibility.info.answerReused, false)
  assert.equal(comparison.reuseEligibility.info.reusedMaterials?.length, variant === "source" ? 0 : 2)
  assert.equal(comparison.reuseEligibility.info.invalidatedMaterials?.length, variant === "source" ? 2 : 0)
  rows.push({ variant, input: registration.file, inputSha256: registration.sha256, changedFiles, comparison })
}
assert.equal(sha(await readFile(path.join(original.context.sourceRoot, sourcePath))), sha(originalBytes))
const checked = ManifestSchema.parse(manifest)
await writeFile(manifestFile, JSON.stringify(checked, null, 2) + "\n", "utf8")
await save(path.join(root, "verification/av14-input-registration.json"), {
  schemaVersion: "authorization-av14-input-registration/v1", at: new Date().toISOString(), baselineInput: "verification/av14-retained-baseline.json", baselineSha256: baseline.inputSha256,
  previousPosition: "debug-paperless-download-D1", previousAttempt: "revision-final-diagnostics", originalNaturalTask: original.value.brief, originalNaturalInputSha256: original.inputSha256,
  registeredSourceChange: { path: sourcePath, symbol: "DocumentViewSet._resolve_request_and_root_doc", line: 1424, originalSha256: sha(originalBytes), currentSha256: sha(patchedBytes), from: "root_doc", to: "request_doc", scope: "one guard argument only in the developer copy; not an authorization oracle" },
  rows, originalSourcePreserved: true, answersReused: false, semanticSupport: "unreviewed", providerCalls: 0, targetExecutions: 0,
})
console.log(JSON.stringify(rows.map(r => ({ variant: r.variant, comparison: r.comparison.status, reused: r.comparison.reuseEligibility.info.reusedMaterials?.length, invalidated: r.comparison.reuseEligibility.info.invalidatedMaterials?.length })), null, 2))
