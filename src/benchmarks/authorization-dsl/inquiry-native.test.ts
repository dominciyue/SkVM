import { expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { createNativeInquiryRuntime } from "./inquiry-native.ts"
import { AuthorizationInquirySchema } from "../../task-dsl/authorization/inquiry.ts"
test("ordinary skill receives the current declaration and independent policy from its input", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ao-native-policy-")); await mkdir(path.join(root, "source"))
  await writeFile(path.join(root, "source/entry.ts"), "export function entry() { return false; }\n")
  const inputFile = path.join(root, "input.json")
  const policy = { text: "Only the addressed document's reviewer may approve it.", origin: "user", location: "current-policy/v2" }
  const brief = "Can an ordinary member approve another member's document?"
  await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "current", repository: "synthetic", sourceRef: "fixed", sourceRoot: "source", allowedPaths: ["."], mode: "conformance", policy, brief }))
  const natural = await createNativeInquiryRuntime({ inputFile, workDir: root, domainTools: true })
  expect(natural.system).toContain(JSON.stringify({ brief, mode: "conformance", policy }))
  const inquiry = { schemaVersion: "authorization-inquiry/v1", mode: "conformance", policy, questions: [{ id: "review", request: brief, premises: [] }] }
  await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "current", repository: "synthetic", sourceRef: "fixed", sourceRoot: "source", allowedPaths: ["."], inquiry }))
  const declared = await createNativeInquiryRuntime({ inputFile, workDir: root, domainTools: false })
  expect(declared.system).toContain(JSON.stringify({ inquiry: AuthorizationInquirySchema.parse(inquiry) }))
})
test("ordinary skill runtime restricts common tools and actually executes domain checks", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ao-native-")); await mkdir(path.join(root, "source"))
  await writeFile(path.join(root, "source/entry.ts"), "export function entry() { return false; }\n")
  const input = path.join(root, "input.json")
  await writeFile(input, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "one", repository: "synthetic", sourceRef: "fixed", sourceRoot: "source", allowedPaths: ["."], brief: "Can anyone call entry?" }))
  const common = await createNativeInquiryRuntime({ inputFile: input, workDir: root, domainTools: false })
  expect(common.definitions.map(d => d.name)).not.toContain("authorization_compile")
  expect((await common.execute({ id: "no", name: "execute_command", arguments: {} })).exitCode).toBe(1)
  const traceDir = path.join(root, "trace")
  const domain = await createNativeInquiryRuntime({ inputFile: input, workDir: root, domainTools: true, traceDir })
  const inquiry = { schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q1", request: "Can anyone call entry?", premises: [] }] }
  await domain.execute({ id: "compile", name: "authorization_compile", arguments: { inquiry } })
  const read = JSON.parse((await domain.execute({ id: "read", name: "source_read", arguments: { path: "entry.ts", startLine: 1, endLine: 1 } })).output)
  const result = { schemaVersion: "authorization-inquiry-result/v1", questions: [{ questionId: "q1", behavior: { disposition: "deny", explanation: "Entry denies." }, branches: [], missing: [], evidenceIds: [read.evidence[0].id] }], observations: [], scope: "entry only" }
  const checked = JSON.parse((await domain.execute({ id: "check", name: "authorization_check_result", arguments: { result } })).output)
  expect(checked.valid).toBe(true)
  expect(checked.semanticSupport).toBe("unreviewed")
  expect(domain.report().domainCalls).toBe(2)
  expect(domain.report().result).toEqual(result)
  await domain.beforeDispatch({ messages: [{ role: "user", content: "current task" }] })
  expect(JSON.parse(await readFile(path.join(traceDir, "request-1.json"), "utf8")).params.messages[0].content).toBe("current task")
  expect((await readFile(path.join(traceDir, "tools.jsonl"), "utf8")).trim().split("\n").length).toBe(3)
  await expect(createNativeInquiryRuntime({ inputFile: input, workDir: root, domainTools: false, traceDir: path.join(root, "source/trace") })).rejects.toThrow("outside")
})
