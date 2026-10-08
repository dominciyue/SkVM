import { expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, writeFile, stat } from "node:fs/promises"
import { createHash } from "node:crypto"
import os from "node:os"
import path from "node:path"
import { checkAuthorizationInquiry } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { prepareConsumerPackage } from "./study.ts"

test("checked-out original metadata recreates only a missing reproducible consumer source tree", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ba-consumer-restore-")), originalSource = path.join(root, "original-source"), author = path.join(root, "author"), destination = path.join(root, "consumer")
  for (const directory of [originalSource, author, destination]) await mkdir(directory)
  const source = "def entry():\n    return False\n", usage = "Use the original complete task.\n", metadata = { schemaVersion: "authorization-inquiry-input/v1", taskId: "t", repository: "anonymous", sourceRef: "r", allowedPaths: ["app.py"] }
  await writeFile(path.join(originalSource, "app.py"), source)
  const inputFile = path.join(root, "original.json"), original = JSON.stringify({ ...metadata, sourceRoot: "original-source", brief: "Inspect entry", mode: "behavior" })
  await writeFile(inputFile, original)
  const authored = JSON.stringify({ ...metadata, sourceRoot: "source", inquiry: { schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "Inspect entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect entry", premises: [] }] } })
  const sha = (text: string) => createHash("sha256").update(text).digest("hex"), checked = await checkAuthorizationInquiry(inputFile, "M", "operation-evidence-v6")
  if (checked.status !== "valid") throw new Error(JSON.stringify(checked))
  for (const directory of [author, destination]) { await writeFile(path.join(directory, directory === author ? "authored-inquiry.json" : "inquiry.json"), authored); await writeFile(path.join(directory, directory === author ? "authored-USAGE.md" : "USAGE.md"), usage) }
  await writeFile(path.join(author, "author-admission.json"), JSON.stringify({ status: "valid", inputSha256: sha(authored), sourceInputSha256: sha(original) }))
  await writeFile(path.join(author, "source-snapshot.json"), JSON.stringify(checked.sourceFiles))
  const options = { originalInputFile: inputFile, authorAttempt: author, destination }
  const prepared = await prepareConsumerPackage(options)
  expect(prepared.originalBytesConsumed).toBe(true)
  expect(prepared.semanticRepair).toBe(false)
  expect(await readFile(path.join(destination, "inquiry.json"), "utf8")).toBe(authored)
  expect(await readFile(path.join(destination, "USAGE.md"), "utf8")).toBe(usage)
  expect(await readFile(path.join(destination, "source/app.py"), "utf8")).toBe(source)
  expect((await prepareConsumerPackage(options)).sourceFiles).toEqual(checked.sourceFiles)
  const invalid = path.join(root, "foreign-metadata"); await mkdir(invalid); await writeFile(path.join(invalid, "inquiry.json"), "{}"); await writeFile(path.join(invalid, "USAGE.md"), usage)
  await expect(prepareConsumerPackage({ ...options, destination: invalid })).rejects.toThrow("identity mismatch")
  expect(await stat(path.join(invalid, "source")).then(() => true, () => false)).toBe(false)
})
