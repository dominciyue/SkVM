import { mkdir, readFile } from "node:fs/promises"
import path from "node:path"
import { bbRoot, root, sha, write } from "./study.ts"
export type ChangeKind = "policy" | "premise" | "source"
export function deriveChange(original: any, retainedChange: any, kind: ChangeKind, sourceRoot: string) {
  const input = structuredClone(original); input.sourceRoot = sourceRoot
  if (kind === "policy") { input.inquiry.mode = "conformance"; input.inquiry.policy = structuredClone(retainedChange.inquiry.policy) }
  if (kind === "premise") for (const q of input.inquiry.questions) {
    q.premises = q.premises.filter((p: any) => p.text !== "Ownership and object grants are unspecified.")
    q.premises.push(structuredClone(retainedChange.inquiry.questions[0].premises[0]))
  }
  return input
}
export async function prepareChanges() {
  const originalFile = path.join(bbRoot, "model/packages/download/inquiry.json"), originalBytes = await readFile(originalFile), original = JSON.parse(originalBytes.toString("utf8")), directory = path.join(root, "model/inputs"), entries = []
  await mkdir(directory, { recursive: true })
  for (const kind of ["policy", "premise", "source"] as const) {
    const retainedFile = path.join(bbRoot, `model/inputs/download-${kind}.json`), retainedBytes = await readFile(retainedFile), retained = JSON.parse(retainedBytes.toString("utf8")), sourceDirectory = kind === "source" ? path.resolve(path.dirname(retainedFile), retained.sourceRoot) : path.resolve(path.dirname(originalFile), original.sourceRoot)
    const input = deriveChange(original, retained, kind, path.relative(directory, sourceDirectory).replaceAll("\\", "/")), inputFile = path.join(directory, `download-${kind}.json`)
    await write(inputFile, input, true)
    entries.push({ kind, inputFile, sha256: sha(await readFile(inputFile)), originalFile, originalSha256: sha(originalBytes), factsFrom: retainedFile, factsSha256: sha(retainedBytes), originalQuestionIds: input.inquiry.questions.map((q: any) => q.id), importedHistoricalProperties: false, sourceRoot: input.sourceRoot })
  }
  await write(path.join(root, "verification/changed-inputs.json"), { schemaVersion: "authorization-bc-changes/v1", modelCalls: 0, originalBytesUnchanged: sha(await readFile(originalFile)) === sha(originalBytes), entries }, true)
  return entries
}
