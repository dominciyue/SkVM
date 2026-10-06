import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { authorizationInquiryAuthoringSchema, checkAuthorizationInquiry, loadInquiryInput } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { copySourceSnapshot } from "../authorization-semantic-lowering-v1/source-snapshot.ts"

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
/** Portable source binding only; never reserialize or repair the admitted model declaration. */
export async function prepareConsumerInput(options: { originalInputFile: string; authorAttempt: string; destination: string }) {
  const original = await loadInquiryInput(options.originalInputFile), author = path.resolve(options.authorAttempt), destination = path.resolve(options.destination)
  const bytes = await readFile(path.join(author, "authored-inquiry.json")), usage = await readFile(path.join(author, "authored-USAGE.md"))
  const admission = JSON.parse(await readFile(path.join(author, "author-admission.json"), "utf8")), sourceFiles = JSON.parse(await readFile(path.join(author, "source-snapshot.json"), "utf8"))
  if (admission.status !== "valid" || admission.inputSha256 !== sha(bytes) || admission.sourceInputSha256 !== original.inputSha256) throw new Error("Author admission/original-byte identity mismatch")
  const mode = original.value.mode ?? "behavior", value = authorizationInquiryAuthoringSchema(mode, "v2").parse(JSON.parse(bytes.toString("utf8")))
  if (value.sourceRoot !== "source" || value.taskId !== original.value.taskId || value.repository !== original.value.repository || value.sourceRef !== original.value.sourceRef || !isDeepStrictEqual(value.allowedPaths, original.value.allowedPaths) || !isDeepStrictEqual(value.inquiry.policy, original.value.policy)) throw new Error("Authored metadata identity mismatch")
  const checked = await checkAuthorizationInquiry(options.originalInputFile, "M", "operation-evidence-v4")
  if (checked.status !== "valid" || !isDeepStrictEqual(checked.sourceFiles, sourceFiles)) throw new Error("Author source snapshot identity mismatch")
  await mkdir(path.dirname(destination), { recursive: true })
  let created = true
  try { await mkdir(destination) } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; created = false }
  const inputFile = path.join(destination, "inquiry.json")
  if (created) {
    const copied = await copySourceSnapshot({ ...original.context, maxReadBytes: 33554432 }, path.join(destination, "source"))
    if (!isDeepStrictEqual(copied, sourceFiles)) throw new Error("Copied source identity mismatch")
    await writeFile(inputFile, bytes, { flag: "wx" }); await writeFile(path.join(destination, "USAGE.md"), usage, { flag: "wx" })
  } else if (!(await readFile(inputFile)).equals(bytes) || !(await readFile(path.join(destination, "USAGE.md"))).equals(usage)) throw new Error("Existing consumer package identity mismatch")
  const consumerCheck = await checkAuthorizationInquiry(inputFile, "M", "operation-evidence-v4")
  if (consumerCheck.status !== "valid" || !isDeepStrictEqual(consumerCheck.sourceFiles, sourceFiles)) throw new Error("Consumer source/declaration public check failed")
  return { inputFile, authorAttempt: author, authoredInputSha256: sha(bytes), sourceFiles, originalBytesConsumed: true, semanticRepair: false }
}
