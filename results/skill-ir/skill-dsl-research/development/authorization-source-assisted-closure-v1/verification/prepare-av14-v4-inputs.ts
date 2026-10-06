import path from "node:path"
import assert from "node:assert/strict"
import { readFile, writeFile, stat } from "node:fs/promises"
import { AuthorizationInquiryInputSchema, loadInquiryInput, compareLocalInquiry } from "../../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createInquiryTools } from "../../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { root, sha } from "../study.ts"
import { ManifestSchema } from "../types.ts"

const save = async (file: string, value: unknown) => {
  const bytes = JSON.stringify(value, null, 2) + "\n"
  await writeFile(file, bytes, { encoding: "utf8", flag: "wx" }).catch(async error => {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
    assert.equal(await readFile(file, "utf8"), bytes, "An earlier partial preparation must retain exactly the same generated input bytes")
  })
}
const manifestFile = path.join(root, "manifest.json"), manifest = ManifestSchema.parse(JSON.parse(await readFile(manifestFile, "utf8")))
const baselineFile = path.join(root, "verification/av14-v4-retained-baseline.json"), baseline = await loadInquiryInput(baselineFile)
assert.equal(baseline.value.inquiry?.schemaVersion, "authorization-inquiry/v2")
const declaration = baseline.value.inquiry!
const originalRegistration = manifest.inputs.find(i => i.id === "paperless-download-original")!
const original = await loadInquiryInput(path.join(root, originalRegistration.file))
const previous = path.join(root, "positions/debug-paperless-download-D1/revision-module-instances/raw/inquiry")
const originalTools = await createInquiryTools({ ...original.context, structure: true, maxReadBytes: manifest.budgets.maxReadBytes, maxFiles: manifest.budgets.maxFiles })
assert.equal(originalTools.structure!.relationshipVersion, "source-bindings/v4")
assert.deepEqual(originalTools.files, originalRegistration.sourceFiles)
const sourceRegistration = manifest.inputs.find(i => i.id === "paperless-download-source")!
const copied = await loadInquiryInput(path.join(root, sourceRegistration.file))
const oldOriginalSha = sha(await readFile(path.join(original.context.sourceRoot, "src/documents/views.py")))
const rows = []
for (const variant of ["policy", "premise", "source"] as const) {
  const id = `paperless-download-v4-${variant}`, file = `model/inputs/${id}.json`, inputFile = path.join(root, file)
  assert.ok(!manifest.inputs.some(i => i.id === id))
  const value = structuredClone(baseline.value)
  value.sourceRoot = path.relative(path.dirname(inputFile), variant === "source" ? copied.context.sourceRoot : baseline.context.sourceRoot).replaceAll("\\", "/")
  if (variant === "policy") {
    value.inquiry!.mode = "conformance"
    value.inquiry!.policy = manifest.policyVariants["paperless-download"]!
  }
  if (variant === "premise") for (const q of value.inquiry!.questions) {
    q.premises = q.premises.filter(p => p.text !== "Ownership and object grants are unspecified: analyze relevant source branches rather than assuming a grant.")
    q.premises.push({ text: "The authenticated caller owns the requested document. Ownership and object grants on related root documents and other versions are unspecified.", origin: "user" })
  }
  const parsed = AuthorizationInquiryInputSchema.parse(value)
  assert.equal(parsed.repository, baseline.value.repository); assert.equal(parsed.sourceRef, baseline.value.sourceRef)
  assert.deepEqual(parsed.allowedPaths, baseline.value.allowedPaths)
  if (parsed.inquiry?.schemaVersion === "authorization-inquiry/v2" && declaration.schemaVersion === "authorization-inquiry/v2") assert.deepEqual(parsed.inquiry.operations, declaration.operations)
  assert.deepEqual(parsed.inquiry!.questions.map(({ premises: _p, ...q }) => q), declaration.questions.map(({ premises: _p, ...q }) => q))
  if (variant !== "premise") assert.deepEqual(parsed.inquiry!.questions, declaration.questions)
  if (variant !== "policy") { assert.equal(parsed.inquiry!.mode, declaration.mode); assert.deepEqual(parsed.inquiry!.policy, declaration.policy) }
  await save(inputFile, parsed)
  const loaded = await loadInquiryInput(inputFile), tools = await createInquiryTools({ ...loaded.context, maxReadBytes: manifest.budgets.maxReadBytes, maxFiles: manifest.budgets.maxFiles })
  const changedFiles = tools.files.filter(f => originalTools.files.find(old => old.path === f.path)?.sha256 !== f.sha256)
  assert.equal(tools.files.length, 95)
  assert.deepEqual(changedFiles.map(f => f.path), variant === "source" ? ["src/documents/views.py"] : [])
  manifest.inputs.push({ ...originalRegistration, id, file, sha256: loaded.inputSha256, parentFile: "verification/av14-v4-retained-baseline.json", parentSha256: baseline.inputSha256, ready: true, sourceFiles: tools.files,
    changes: ["AV14 v4 complete actual retained declaration; full operations/questions preserved; no source answer or control graph", variant === "policy" ? "AV14 independent exact-object policy and conformance mode only" : variant === "premise" ? "AV14 explicit requested-document ownership only; related root/version facts unspecified" : "AV14 same single guard object argument source copy, unchanged base ref and actual patch SHA", "AV14 old v3 inputs/material dependencies remain immutable"] })
  const paired = manifest.positions.filter(p => p.kind === "variation" && p.variant === variant)
  assert.equal(paired.length, 2)
  for (const p of paired) {
    assert.equal(await stat(path.join(root, "positions", p.id)).then(() => true, () => false), false)
    p.inputId = id
  }
  const comparison = await compareLocalInquiry(inputFile, previous, "operation-evidence-v2")
  assert.ok("reuseEligibility" in comparison)
  assert.equal(comparison.reuseEligibility.status, "reusable")
  assert.equal(comparison.reuseEligibility.info.answerReused, false)
  rows.push({ variant, input: file, sha256: loaded.inputSha256, positions: paired.map(p => ({ id: p.id, inputId: p.inputId, arm: p.arm })), changedFiles, comparison })
}
assert.equal(sha(await readFile(path.join(original.context.sourceRoot, "src/documents/views.py"))), oldOriginalSha)
await writeFile(manifestFile, JSON.stringify(ManifestSchema.parse(manifest), null, 2) + "\n", "utf8")
await save(path.join(root, "verification/av14-v4-input-registration.json"), { schemaVersion: "authorization-av14-input-registration/v2", at: new Date().toISOString(), baselineFile: "verification/av14-v4-retained-baseline.json", baselineSha256: baseline.inputSha256, baselineAttempt: "debug-paperless-download-D1/revision-module-instances", baselineImplementation: "8461bd34dbfdc4a1ed00d47726509aa52753042c", relationshipVersion: originalTools.structure!.relationshipVersion, originalNaturalTask: original.value.brief, originalNaturalInputSha256: original.inputSha256, preparationCorrection: "The initial expected one restored unit assertion failed (actual zero): accepted-unit metrics do not imply a retained source/fact dependency footprint. Record the actual comparisons without manufacturing a material footprint or changing previous to fresh.", rows, originalSourcePreserved: true, oldV3InputsPreserved: true, answersReused: false, semanticSupport: "unreviewed", providerCalls: 0, targetExecutions: 0 })
console.log(JSON.stringify(rows.map(r => ({ variant: r.variant, input: r.input, reused: r.comparison.reuseEligibility.info.reusedMaterials?.length, invalidated: r.comparison.reuseEligibility.info.invalidatedMaterials?.length })), null, 2))
