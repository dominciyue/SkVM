import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { projectProgramCallRelations } from "../../../../../src/task-dsl/authorization/program-obligations.ts"
import { assessScopedTrace } from "./scope-assessment.ts"
import { downloadTraceExpectation } from "../authorization-purpose-scoped-program-v1/behavior-assessment.ts"
const base = import.meta.dir, prior = path.resolve(base, "../authorization-purpose-scoped-program-v1"), repo = path.resolve(base, "../../../../..")
const load = async (p: string) => JSON.parse(await readFile(p, "utf8")), rows = []
for (const [purpose, track] of [["A0", "selected"], ["A1", "a1"]]) {
  const file = path.join(prior, `authoring/automatic-program-${purpose}-first.json`), bytes = await readFile(file), raw = JSON.parse(bytes.toString("utf8"))
  const matrix = await load(path.join(prior, `evaluation/${track}/variation-matrix.json`)), traces = await load(path.join(prior, `evaluation/${track}/additional-traces.json`))
  const cases = []
  for (const row of [...matrix.results, ...traces.rows]) {
    const input = await load(path.resolve(repo, row.input)), q = "requested-document-and-returned-file"
    const scoped = assessScopedTrace(row.actual, downloadTraceExpectation(input.resourceInputs[q], input.externalAssumptions?.[q] ?? []))
    cases.push({ variant: row.variant, callRelations: projectProgramCallRelations(raw, row.actual), local: scoped.local, originalStrict: scoped.originalStrict, upstream: scoped.upstream })
  }
  rows.push({ purpose, rawFile: path.relative(repo, file).split(path.sep).join("/"), rawSha256: createHash("sha256").update(bytes).digest("hex"), layers: { sourceRead: "Original author process retained in BN; precise source spans inspected again by BO developer", judgmentWritten: "A0 explicitly states construction before short circuit; A1 explicitly states upstream global permission", programAdopted: raw.resourceWorkflow.steps.length, executionEffect: "Retained actual events below; source citation alone does not connect control" }, relevantRawSteps: raw.resourceWorkflow.steps.filter((s: any) => s.op === "external" || /permission_allows|global_authorization|owner_allows/.test(s.id)), cases })
}
await writeFile(path.join(base, "diagnosis.json"), JSON.stringify({ providerCalls: 0, oldRawAndScoresUnchanged: true, originalSourceRoot: "results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/model/packages/download/source", sourceFindings: [
  { source: "src/documents/permissions.py:634-635", text: "checker = ObjectPermissionChecker(user); return obj.owner is None or obj.owner == user or checker.has_perm(perms, obj)", distinction: "Normal construction before owner shortcuts; permission call only on non-owner/non-null path." },
  { source: "src/documents/views.py:1421-1427", distinction: "request.user is not None gates the entire helper; exact root and permission arguments; false denies before selection." },
  { source: "framework/rest_framework-3.18.1/rest_framework/views.py:418-421; framework/rest_framework-3.18.1/rest_framework/permissions.py:233-246; src/documents/permissions.py:30-44", distinction: "Upstream global check is source-supported and outside local-download finite oracle; no grant supplied." },
], rows }, null, 2) + "\n")
console.log(JSON.stringify(rows.map(r => ({ purpose: r.purpose, cases: r.cases.length, localPass: r.cases.filter(c => c.local.pass).length }))))
