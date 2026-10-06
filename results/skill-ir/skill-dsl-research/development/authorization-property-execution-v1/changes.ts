import path from "node:path"
import { mkdir, writeFile } from "node:fs/promises"
import { AuthorizationInquiryInputSchema, editAuthorizationInquiry, initializeLocalInquiry, inspectLocalInquiry, loadInquiryInput, type AuthorizationInquiryInput } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import type { z } from "zod"
import type { InquiryPolicySchema } from "../../../../../src/task-dsl/authorization/inquiry.ts"

/** Change only independent registered data, retaining the current run's complete original declaration. */
export function changedInputs(base: AuthorizationInquiryInput, variation: { policy: z.infer<typeof InquiryPolicySchema>; premiseText: string; sourceRoot: string }) {
  if (!base.inquiry) throw new Error("Export the current public baseline declaration first")
  const policy = AuthorizationInquiryInputSchema.parse({ ...structuredClone(base), inquiry: { ...structuredClone(base.inquiry), mode: "conformance", policy: variation.policy } })
  const premise = editAuthorizationInquiry(base, { schemaVersion: "authorization-inquiry-edit/v1", reason: "Apply the independently registered ownership premise to the unchanged complete original task", operations: base.inquiry.questions.map(q => ({ kind: "premises", questionId: q.id, premises: [...q.premises, { text: variation.premiseText, origin: "user" }] })) })
  const source = AuthorizationInquiryInputSchema.parse({ ...structuredClone(base), sourceRoot: variation.sourceRoot })
  return { policy, premise, source }
}

export async function prepareChangeInputs(root: string, sessionPath: string, identity: { baselineAttemptId: string; runtimeTree: string }) {
  const prior = await inspectLocalInquiry(sessionPath)
  if (prior.completionUnknown || ["completion-unknown", "timeout-unknown", "initialized"].includes(prior.status)) throw new Error("Inspect unresolved baseline before preparing changes")
  const out = path.join(root, "model", "inputs"); await mkdir(out, { recursive: true })
  const baseFile = path.join(out, "download-baseline.json"); await initializeLocalInquiry(prior.sessionPath, baseFile)
  const base = await loadInquiryInput(baseFile), registered = path.resolve(root, "../authorization-source-assisted-closure-v1/model/inputs")
  const policyFile = path.join(registered, "paperless-download-policy.json"), premiseFile = path.join(registered, "paperless-download-premise.json"), sourceFile = path.join(registered, "paperless-download-source.json")
  const policyInput = await loadInquiryInput(policyFile), premiseInput = await loadInquiryInput(premiseFile), sourceInput = await loadInquiryInput(sourceFile)
  const policy = policyInput.value.inquiry?.policy
  const premises = [...new Set(premiseInput.value.inquiry?.questions.flatMap(q => q.premises).map(p => p.text).filter(t => t.startsWith("The authenticated caller owns the requested document.")))]
  if (!policy || premises.length !== 1) throw new Error("Registered independent policy/premise is missing or ambiguous")
  const generated = changedInputs(base.value, { policy, premiseText: premises[0]!, sourceRoot: path.relative(out, sourceInput.context.sourceRoot).split(path.sep).join("/") })
  for (const [name, value] of Object.entries(generated)) await writeFile(path.join(out, `download-${name}.json`), JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", flag: "wx" })
  const registration = { schemaVersion: "authorization-ax-changes/v1", ...identity, previousSessionPath: prior.sessionPath, previousInputSha256: prior.inputSha256, baselineInputFile: baseFile, baselineInputSha256: base.inputSha256, qualityBasis: "material-only unless the complete original and changed answers independently pass", policyModeChange: "behavior to conformance, required by the independent normative policy", registeredInputs: [policyFile, premiseFile, sourceFile], importedFields: ["inquiry.policy", "ownership premise text only", "resolved sourceRoot only"], olderDeclarationsImported: false, oldAnswersImported: false }
  await writeFile(path.join(root, "model", "change-registration.json"), JSON.stringify(registration, null, 2) + "\n", { encoding: "utf8", flag: "wx" })
  return registration
}
