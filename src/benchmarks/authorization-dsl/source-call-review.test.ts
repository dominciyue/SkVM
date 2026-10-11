import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createInquiryTools } from "./inquiry-tools.ts"
const api = await import("./source-call-review.ts").catch(() => ({} as any))

// An independent review fixture; no skill name or saved answer enters the core.
const source = `def response(pk, request):
    requested = lookup(pk, request, include_deleted=True)
    return select(requested, request)

def lookup(pk, request, include_deleted=False):
    return pk

def select(root, request):
    version_requested = version_param(request) is not None
    return resolve(root, request, include_deleted=version_requested)

def resolve(root, request, include_deleted=False):
    return root

def root(doc, root_doc):
    return root_doc or doc
`
test("review facts bind include_deleted at each actual call, including empty version", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "bf-call-review-"))
  await writeFile(path.join(sourceRoot, "app.py"), source)
  const tools = await createInquiryTools({ sourceRoot, repository: "anonymous", sourceRef: "r", allowedPaths: ["app.py"], structure: true, controlSemantics: "finite-control/v1" })
  try {
    await tools.execute("source_read", { path: "app.py", startLine: 1, endLine: 16 })
    const index = tools.structure!, owners = new Map<string, any>()
    for (const symbol of index.symbols.filter(s => s.kind === "function")) owners.set(symbol.id, await tools.sourceSkeleton(symbol.id))
    const calls = index.symbols.flatMap(s => index.relatedCalls(s.id)).filter(c => ["lookup", "resolve"].includes(c.expression))
    expect(typeof api.reviewSourceCallArgument).toBe("function")
    for (const version of [null, "", "3"]) {
      const context = { skeletons: [...owners.values()], callReturns: { "version_param(request)": version } }
      const lookup = api.reviewSourceCallArgument(index, calls.find(c => c.expression === "lookup")!.id, "include_deleted", context)
      const resolve = api.reviewSourceCallArgument(index, calls.find(c => c.expression === "resolve")!.id, "include_deleted", context)
      expect(lookup.value).toBe(true)
      expect(resolve.value).toBe(version !== null)
      expect(lookup.sourceCallId).not.toBe(resolve.sourceCallId)
      expect(resolve.trace.some((t: any) => t.expression === "version_param(request) is not None")).toBe(true)
      // The old review conflated lookup's literal True with resolver's argument.
      expect(api.compareSourceCallArgument(resolve, true).status).toBe(version === null ? "contradiction" : "consistent")
    }
    const unknown = api.reviewSourceCallArgument(index, calls.find(c => c.expression === "resolve")!.id, "include_deleted", { skeletons: [...owners.values()] })
    expect(unknown.known).toBe(false)
    expect(api.compareSourceCallArgument(unknown, true).status).toBe("unresolved")
    const root = [...owners.values()].find(s => s.source.startLine === 15)
    expect(api.reviewSourceReturn(root, 16, { doc: "request-document", root_doc: null }).value).toBe("request-document")
    expect(api.reviewSourceReturn(root, 16, { doc: "request-document", root_doc: "root-document" }).value).toBe("root-document")
  } finally { await tools.verifySnapshot() }
})
test("whole-answer review follows explicit cross-question references without a word checklist", () => {
  const requirements = { q1: ["selection"], q2: ["lookup", "selection"], q3: ["root-guard", "selection"], q4: ["unknown-grants"] }
  const answers = [{ questionId: "q1", facts: [{ id: "selection", status: "consistent" }] }, { questionId: "q2", references: ["q1"], facts: [{ id: "lookup", status: "consistent" }] }, { questionId: "q3", references: ["q1"], facts: [{ id: "root-guard", status: "consistent" }] }, { questionId: "q4", facts: [{ id: "unknown-grants", status: "consistent" }] }]
  expect(api.reviewWholeAnswerFacts(requirements, answers).equivalent).toBe(true)
  expect(api.reviewWholeAnswerFacts(requirements, [...answers.slice(0, 3), { ...answers[3], facts: [] }]).equivalent).toBe(false)
  expect(api.reviewWholeAnswerFacts(requirements, [...answers, { questionId: "q3", facts: [{ id: "selection", status: "contradiction" }] }]).equivalent).toBe(false)
  expect(api.reviewWholeAnswerFacts(requirements, answers.map(a => a.questionId === "q2" ? { ...a, references: ["missing"] } : a)).equivalent).toBe(false)
})
