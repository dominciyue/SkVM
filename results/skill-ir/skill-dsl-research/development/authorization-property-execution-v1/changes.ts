import path from "node:path"
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { AuthorizationInquiryInputSchema, editAuthorizationInquiry, initializeLocalInquiry, inspectLocalInquiry, loadInquiryInput, type AuthorizationInquiryInput } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import type { z } from "zod"
import type { InquiryPolicySchema } from "../../../../../src/task-dsl/authorization/inquiry.ts"

const sha = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex")
export function changeRegistrationPaths(root: string, registrationId?: string) {
  if (registrationId && !/^[a-z0-9-]+$/.test(registrationId)) throw new Error("Invalid named change registration")
  return { inputDirectory: path.join(root, "model", "inputs", ...(registrationId ? [registrationId] : [])), registrationFile: path.join(root, "model", ...(registrationId ? ["change-registrations", `${registrationId}.json`] : ["change-registration.json"])) }
}
export async function resolveChangeRun(root: string, positionId: string, runtimeTree: string, registrationId?: string) {
  const match = /^change-download-(policy|premise|source)-(fresh|previous)$/.exec(positionId)
  if (!match) throw new Error("Unregistered change shape")
  const locations = changeRegistrationPaths(root, registrationId), bytes = await readFile(locations.registrationFile), registration = JSON.parse(bytes.toString("utf8"))
  if (registration.schemaVersion !== "authorization-ax-changes/v1" || registrationId && registration.registrationId !== registrationId) throw new Error("Changed-input registration identity mismatch")
  if (registration.runtimeTree !== runtimeTree) throw new Error("Changed-input comparison requires the same baseline production tree")
  const inputFile = path.join(locations.inputDirectory, `download-${match[1]}.json`), expected = registration.inputSha256ByChange?.[match[1]!]
  if (registrationId && !expected || expected && sha(await readFile(inputFile)) !== expected) throw new Error("Registered changed input bytes changed or missing")
  return { inputFile, previous: match[2] === "previous" ? registration.previousSessionPath as string : undefined, binding: { change: match[1], changeArm: match[2], baselineAttemptId: registration.baselineAttemptId, qualityBasis: registration.qualityBasis, changeRegistrationId: registrationId ?? "original", changeRegistrationSha256: sha(bytes) } }
}

/** Change only independent registered data, retaining the current run's complete original declaration. */
export function changedInputs(base: AuthorizationInquiryInput, variation: { policy: z.infer<typeof InquiryPolicySchema>; premiseText: string; sourceRoot: string }) {
  if (!base.inquiry) throw new Error("Export the current public baseline declaration first")
  const policy = AuthorizationInquiryInputSchema.parse({ ...structuredClone(base), inquiry: { ...structuredClone(base.inquiry), mode: "conformance", policy: variation.policy } })
  const premise = editAuthorizationInquiry(base, { schemaVersion: "authorization-inquiry-edit/v1", reason: "Apply the independently registered ownership premise to the unchanged complete original task", operations: base.inquiry.questions.map(q => ({ kind: "premises", questionId: q.id, premises: [...q.premises, { text: variation.premiseText, origin: "user" }] })) })
  const source = AuthorizationInquiryInputSchema.parse({ ...structuredClone(base), sourceRoot: variation.sourceRoot })
  return { policy, premise, source }
}

export async function prepareChangeInputs(root: string, sessionPath: string, identity: { baselineAttemptId: string; runtimeTree: string }, registrationId?: string) {
  const locations = changeRegistrationPaths(root, registrationId)
  const prior = await inspectLocalInquiry(sessionPath)
  if (prior.completionUnknown || ["completion-unknown", "timeout-unknown", "initialized"].includes(prior.status)) throw new Error("Inspect unresolved baseline before preparing changes")
  const out = locations.inputDirectory; await mkdir(out, { recursive: true })
  const baseFile = path.join(out, "download-baseline.json"); await initializeLocalInquiry(prior.sessionPath, baseFile)
  const base = await loadInquiryInput(baseFile), registered = path.resolve(root, "../authorization-source-assisted-closure-v1/model/inputs")
  const policyFile = path.join(registered, "paperless-download-policy.json"), premiseFile = path.join(registered, "paperless-download-premise.json"), sourceFile = path.join(registered, "paperless-download-source.json")
  const policyInput = await loadInquiryInput(policyFile), premiseInput = await loadInquiryInput(premiseFile), sourceInput = await loadInquiryInput(sourceFile)
  const policy = policyInput.value.inquiry?.policy
  const premises = [...new Set(premiseInput.value.inquiry?.questions.flatMap(q => q.premises).map(p => p.text).filter(t => t.startsWith("The authenticated caller owns the requested document.")))]
  if (!policy || premises.length !== 1) throw new Error("Registered independent policy/premise is missing or ambiguous")
  const generated = changedInputs(base.value, { policy, premiseText: premises[0]!, sourceRoot: path.relative(out, sourceInput.context.sourceRoot).split(path.sep).join("/") })
  const inputSha256ByChange: Record<string, string> = {}
  for (const [name, value] of Object.entries(generated)) { const bytes = JSON.stringify(value, null, 2) + "\n"; await writeFile(path.join(out, `download-${name}.json`), bytes, { encoding: "utf8", flag: "wx" }); inputSha256ByChange[name] = sha(bytes) }
  const registration = { schemaVersion: "authorization-ax-changes/v1", registrationId: registrationId ?? "original", ...identity, previousSessionPath: prior.sessionPath, previousInputSha256: prior.inputSha256, baselineInputFile: baseFile, baselineInputSha256: base.inputSha256, inputSha256ByChange, qualityBasis: "material-only unless the complete original and changed answers independently pass", policyModeChange: "behavior to conformance, required by the independent normative policy", registeredInputs: [policyFile, premiseFile, sourceFile], importedFields: ["inquiry.policy", "ownership premise text only", "resolved sourceRoot only"], olderDeclarationsImported: false, oldAnswersImported: false }
  await mkdir(path.dirname(locations.registrationFile), { recursive: true })
  await writeFile(locations.registrationFile, JSON.stringify(registration, null, 2) + "\n", { encoding: "utf8", flag: "wx" })
  return registration
}
