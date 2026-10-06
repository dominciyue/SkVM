import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { prepareConsumerInput } from "./consumer.ts"
import { normalizeNaturalOperation } from "../../../../../src/task-dsl/authorization/operation-program.ts"
import { checkAuthorizationInquiry, loadInquiryInput } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"

test("consumer uses the admitted author bytes and identical source, refusing a changed original draft", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ax-consumer-")), author = path.join(root, "author")
  await mkdir(path.join(root, "source")); await mkdir(author)
  await writeFile(path.join(root, "source/app.py"), "def entry():\r\n    return False\r\n")
  const metadata = { schemaVersion: "authorization-inquiry-input/v1" as const, taskId: "t", repository: "anonymous", sourceRef: "r", sourceRoot: "source", allowedPaths: ["app.py"] }
  const original = path.join(root, "input.json"), brief = "Inspect the whole entry and all original distinctions."
  await writeFile(original, JSON.stringify({ ...metadata, brief }))
  const authored = JSON.stringify({ ...metadata, inquiry: normalizeNaturalOperation(brief, "behavior") }, null, 3) + "\r\n"
  const rawFile = path.join(author, "authored-inquiry.json"); await writeFile(rawFile, authored); await writeFile(path.join(author, "authored-USAGE.md"), "Use the full original task and skill.")
  const loaded = await loadInquiryInput(original), checked = await checkAuthorizationInquiry(original, "M", "operation-evidence-v4")
  if (checked.status !== "valid") throw new Error("Invalid anonymous fixture")
  await writeFile(path.join(author, "source-snapshot.json"), JSON.stringify(checked.sourceFiles))
  await writeFile(path.join(author, "author-admission.json"), JSON.stringify({ status: "valid", inputSha256: createHash("sha256").update(authored).digest("hex"), sourceInputSha256: loaded.inputSha256, reviewer: "test-only" }))
  const packageDir = path.join(root, "package"), prepared = await prepareConsumerInput({ originalInputFile: original, authorAttempt: author, destination: packageDir })
  expect(await readFile(prepared.inputFile, "utf8")).toBe(authored)
  expect(await readFile(path.join(packageDir, "source/app.py"), "utf8")).toBe("def entry():\r\n    return False\r\n")
  expect((await checkAuthorizationInquiry(prepared.inputFile, "M", "operation-evidence-v4")).status).toBe("valid")
  await writeFile(rawFile, authored.replace("whole entry", "narrow entry"))
  await expect(prepareConsumerInput({ originalInputFile: original, authorAttempt: author, destination: packageDir })).rejects.toThrow("identity")
})
