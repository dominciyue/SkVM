import { z } from "zod"
import { AuthorizationAuthoringContextSchema, createAuthorizationAuthoringDraft } from "./authoring-assist.ts"
import { AuthorizationAuthoringInputV2Schema, type AuthorizationAuthoringInputV2 } from "./authoring-v2.ts"
import { normalizeAuthorizationAuthoringInput, type AuthorizationAuthoringDiagnostic } from "./authoring.ts"

const Text = z.string().trim().min(1)
const Name = Text.refine(value => !/[\u0000-\u001f\u007f]/.test(value) && !["__proto__", "prototype", "constructor"].includes(value), "Use a safe declared name.")
const Policy = z.object({ text: Text, location: Text, revision: Text, acceptance: z.enum(["accepted", "conflicted", "unresolved"]), reason: Text }).strict()
const Premise = z.object({ name: Name, statement: Text }).strict()
const Case = z.object({
  name: Name, entry: Name,
  principal: z.object({ role: Text, facts: z.array(Text).optional(), capabilities: z.array(Text).optional() }).strict(),
  resource: z.object({ type: Text, facts: z.array(Text).optional() }).strict(),
  relation: Text, operation: Text, expectation: z.enum(["allow", "deny", "conditional"]),
  boundary: z.enum(["declared-entry", "supplied-path", "deployment"]),
  premises: z.array(Premise).default([]),
  conditions: z.record(Name, z.object({ basis: Text }).strict()).optional(),
  branches: z.array(z.object({ name: Name, assumptions: z.record(Name, z.union([z.boolean(), z.literal("unknown")])) }).strict()).max(12).default([]),
  responseDetails: z.array(Text).default([]),
  analyzeConditions: z.object({ names: z.array(Name).min(1), maxBranches: z.number().int().min(1).max(12).optional() }).strict().optional(),
}).strict()

export const AuthorizationTaskAuthoringV1Schema = z.object({
  schemaVersion: z.literal("authorization-task-authoring/v1"), request: Text,
  policy: Policy, cases: z.array(Case).min(1), publicInstruction: Text.optional(),
  additionalQuestions: z.array(Text).optional(), additionalConstraints: z.array(Text).optional(),
}).strict()
export type AuthorizationTaskAuthoringV1 = z.infer<typeof AuthorizationTaskAuthoringV1Schema>

export const AuthorizationTaskChangeV1Schema = z.object({
  schemaVersion: z.literal("authorization-task-change/v1"), reason: Text,
  request: Text.optional(), policy: Policy.optional(),
  cases: z.array(z.object({ name: Name, expectation: z.enum(["allow", "deny", "conditional"]).optional(),
    premises: z.array(Premise).optional() }).strict()).optional(),
}).strict()
export type AuthorizationTaskChangeV1 = z.infer<typeof AuthorizationTaskChangeV1Schema>

export interface TaskAuthoringDiagnostic { code: string; path: string; message: string; fix: string }
type NeedsInput = { status: "needs-input"; diagnostics: TaskAuthoringDiagnostic[] }
const invalid = (path: string, message: string, code = "task-authoring-invalid"): TaskAuthoringDiagnostic => ({ code, path, message, fix: `Correct the explicit current-task field ${path}; no policy or source behavior is inferred.` })
const schemaDiagnostics = (issues: z.ZodIssue[]): TaskAuthoringDiagnostic[] => issues.map(issue => invalid(issue.path.join(".") || "$", issue.message))
const sorted = <T>(record: Record<string, T>) => Object.entries(record).sort(([a], [b]) => a.localeCompare(b))
const fieldPointer = (...parts: Array<string | number>) => `/${parts.map(part => String(part).replaceAll("~", "~0").replaceAll("/", "~1")).join("/")}`
type FieldOrigin = "user-explicit" | "model-authored" | "host-derived"

/** Rejects future fields and returns an isolated current snapshot. */
export function projectCurrentTask(input: unknown): { status: "ready"; current: AuthorizationTaskAuthoringV1; diagnostics: [] } | NeedsInput {
  const parsed = AuthorizationTaskAuthoringV1Schema.safeParse(input)
  return parsed.success ? { status: "ready", current: structuredClone(parsed.data), diagnostics: [] } : { status: "needs-input", diagnostics: schemaDiagnostics(parsed.error.issues) }
}

/** A named domain change is distinct from a draft correction; policy-linked expectations require review. */
export function applyTaskChange(currentInput: unknown, changeInput: unknown): { status: "ready"; current: AuthorizationTaskAuthoringV1; changedPaths: string[]; diagnostics: [] } | NeedsInput {
  const current = projectCurrentTask(currentInput)
  const change = AuthorizationTaskChangeV1Schema.safeParse(changeInput)
  if (current.status !== "ready" || !change.success) return { status: "needs-input", diagnostics: [
    ...(current.status === "needs-input" ? current.diagnostics : []), ...(!change.success ? schemaDiagnostics(change.error.issues) : []),
  ] }
  const next = structuredClone(current.current)
  const diagnostics: TaskAuthoringDiagnostic[] = []
  const changedPaths: string[] = []
  if (change.data.request !== undefined) { next.request = change.data.request; changedPaths.push("request") }
  if (change.data.policy !== undefined) { next.policy = change.data.policy; changedPaths.push("policy") }
  const seen = new Set<string>()
  for (const [index, edit] of (change.data.cases ?? []).entries()) {
    if (seen.has(edit.name)) diagnostics.push(invalid(`cases.${index}.name`, `Case ${edit.name} is changed twice.`, "duplicate-task-change"))
    seen.add(edit.name)
    const target = next.cases.find(item => item.name === edit.name)
    if (!target) { diagnostics.push(invalid(`cases.${index}.name`, `Case ${edit.name} is not declared.`, "unknown-task-change")); continue }
    if (edit.expectation !== undefined) { target.expectation = edit.expectation; changedPaths.push(`cases.${edit.name}.expectation`) }
    if (edit.premises) {
      const seenPremises = new Set<string>()
      for (const [premiseIndex, premise] of edit.premises.entries()) {
        if (seenPremises.has(premise.name)) diagnostics.push(invalid(`cases.${index}.premises.${premiseIndex}.name`, `Premise ${premise.name} is changed twice.`, "duplicate-task-change"))
        seenPremises.add(premise.name)
        const targetPremise = target.premises.find(item => item.name === premise.name)
        if (!targetPremise) diagnostics.push(invalid(`cases.${index}.premises.${premiseIndex}.name`, `Premise ${premise.name} is not declared.`, "unknown-task-change"))
        else { targetPremise.statement = premise.statement; changedPaths.push(`cases.${edit.name}.premises.${premise.name}.statement`) }
      }
    }
  }
  if (change.data.policy) for (const item of next.cases) if (!(change.data.cases ?? []).some(edit => edit.name === item.name && edit.expectation !== undefined)) diagnostics.push(invalid(`cases.${item.name}.expectation`, "A policy change requires an explicit expectation review for every linked case.", "policy-expectation-review-required"))
  if (diagnostics.length) return { status: "needs-input", diagnostics }
  return { status: "ready", current: next, changedPaths, diagnostics: [] }
}

/** Compiles scoped author facts to ordinary authoring/v2; its existing lowerer creates canonical IDs. */
export function compileAuthorizationTaskAuthoring(contextInput: unknown, taskInput: unknown, options: { fieldOrigin?: Exclude<FieldOrigin, "host-derived"> } = {}): { status: "ready"; authoring: AuthorizationAuthoringInputV2; entrySeed: ReturnType<typeof createAuthorizationAuthoringDraft>["entrySeed"]; provenance: { fieldOrigin: Exclude<FieldOrigin, "host-derived">; userExplicit: string[]; modelAuthored: string[]; hostDerived: string[]; fieldSources: Record<string, FieldOrigin> }; diagnostics: [] } | NeedsInput {
  const context = AuthorizationAuthoringContextSchema.safeParse(contextInput)
  const current = projectCurrentTask(taskInput)
  if (!context.success || current.status !== "ready") return { status: "needs-input", diagnostics: [
    ...(!context.success ? schemaDiagnostics(context.error.issues.map(issue => ({ ...issue, path: ["context", ...issue.path] }))) : []),
    ...(current.status === "needs-input" ? current.diagnostics : []),
  ] }
  const task = current.current
  const diagnostics: TaskAuthoringDiagnostic[] = []
  const seed = createAuthorizationAuthoringDraft(context.data)
  const caseNames = new Set<string>()
  for (const [index, item] of task.cases.entries()) {
    if (caseNames.has(item.name)) diagnostics.push(invalid(`cases.${index}.name`, `Case ${item.name} repeats.`, "duplicate-case"))
    caseNames.add(item.name)
    if (!Object.hasOwn(seed.draft.entries, item.entry)) diagnostics.push(invalid(`cases.${index}.entry`, `Entry ${item.entry} is not declared in the supplied context.`, "unknown-case-entry"))
    const premiseNames = new Set<string>()
    for (const [premiseIndex, premise] of item.premises.entries()) {
      if (premiseNames.has(premise.name)) diagnostics.push(invalid(`cases.${index}.premises.${premiseIndex}.name`, `Premise ${premise.name} repeats.`, "duplicate-case-premise"))
      premiseNames.add(premise.name)
    }
    for (const [branchIndex, branch] of item.branches.entries()) for (const name of Object.keys(branch.assumptions)) {
      if (!Object.hasOwn(item.conditions ?? {}, name)) diagnostics.push(invalid(`cases.${index}.branches.${branchIndex}.assumptions.${name}`, `Condition ${name} is not declared in case ${item.name}.`, "unknown-case-condition"))
    }
  }
  if (diagnostics.length) return { status: "needs-input", diagnostics }
  const policies = { current: task.policy }
  const principals = Object.fromEntries(task.cases.map(item => [`principal-${item.name}`, item.principal]))
  const resources = Object.fromEntries(task.cases.map(item => [`resource-${item.name}`, item.resource]))
  const scenarios = Object.fromEntries(task.cases.map(item => [item.name, {
    principal: `principal-${item.name}`, resource: `resource-${item.name}`, policy: "current", entries: [item.entry],
    relation: item.relation, operation: item.operation, expectation: item.expectation,
    ...(item.conditions ? { conditions: item.conditions } : {}), ...(item.analyzeConditions ? { analyzeConditions: item.analyzeConditions } : {}),
  }]))
  const contract = { schemaVersion: "authorization-analysis-contract/v1" as const,
    ...(task.publicInstruction ? { publicInstruction: task.publicInstruction } : {}),
    scenarios: Object.fromEntries(task.cases.map(item => [item.name, {
      boundary: item.boundary,
      premises: item.premises.map(premise => ({ id: premise.name, statement: premise.statement, atEntry: item.entry, provenance: "task-assumption" as const })),
      requestedBranches: item.branches.map(branch => ({ id: branch.name, kind: "counterfactual" as const,
        assumptions: sorted(branch.assumptions).map(([condition, value]) => ({ condition, value })) })),
      requiredResponseDetails: item.responseDetails,
    }])),
  }
  const authoring = AuthorizationAuthoringInputV2Schema.parse({ ...seed.draft, request: task.request,
    policies, principals, resources, scenarios, analysisContract: contract,
    ...(task.additionalQuestions ? { additionalQuestions: task.additionalQuestions } : {}),
    ...(task.additionalConstraints ? { additionalConstraints: task.additionalConstraints } : {}),
  })
  const normalized = normalizeAuthorizationAuthoringInput(authoring)
  if (normalized.status !== "ready") return { status: "needs-input", diagnostics: normalized.diagnostics.map((item: AuthorizationAuthoringDiagnostic) => ({ ...item, fix: item.fix ?? "Correct the explicit scoped case declaration." })) }
  const fieldOrigin = options.fieldOrigin ?? "user-explicit"
  const fieldSources: Record<string, FieldOrigin> = {}
  const mark = (origin: FieldOrigin, ...parts: Array<string | number>) => { fieldSources[fieldPointer(...parts)] = origin }
  for (const field of ["request", "additionalQuestions", "additionalConstraints"]) if (Object.hasOwn(task, field)) mark(fieldOrigin, field)
  if (task.publicInstruction) mark(fieldOrigin, "analysisContract", "publicInstruction")
  for (const field of Object.keys(task.policy)) mark(fieldOrigin, "policies", "current", field)
  for (const item of task.cases) {
    const scope = ["scenarios", item.name] as const
    for (const field of ["relation", "operation", "expectation", "conditions", "analyzeConditions"]) if (Object.hasOwn(item, field)) mark(fieldOrigin, ...scope, field)
    for (const field of ["principal", "resource"]) mark("host-derived", ...scope, field)
    mark("host-derived", ...scope, "policy"); mark("host-derived", ...scope, "entries")
    for (const field of Object.keys(item.principal)) mark(fieldOrigin, "principals", `principal-${item.name}`, field)
    for (const field of Object.keys(item.resource)) mark(fieldOrigin, "resources", `resource-${item.name}`, field)
    const contractScope = ["analysisContract", "scenarios", item.name] as const
    mark(fieldOrigin, ...contractScope, "boundary")
    for (const [index] of item.premises.entries()) {
      mark(fieldOrigin, ...contractScope, "premises", index, "id")
      mark(fieldOrigin, ...contractScope, "premises", index, "statement")
      mark("host-derived", ...contractScope, "premises", index, "atEntry")
      mark("host-derived", ...contractScope, "premises", index, "provenance")
    }
    for (const [index, branch] of item.branches.entries()) {
      mark(fieldOrigin, ...contractScope, "requestedBranches", index, "id")
      mark("host-derived", ...contractScope, "requestedBranches", index, "kind")
      for (const [assumptionIndex] of sorted(branch.assumptions).entries()) {
        mark("host-derived", ...contractScope, "requestedBranches", index, "assumptions", assumptionIndex, "condition")
        mark(fieldOrigin, ...contractScope, "requestedBranches", index, "assumptions", assumptionIndex, "value")
      }
    }
    for (const [index] of item.responseDetails.entries()) mark(fieldOrigin, ...contractScope, "requiredResponseDetails", index)
  }
  mark("host-derived", "entries"); mark("host-derived", "sources"); mark("host-derived", "sourceRoot")
  return { status: "ready", authoring, entrySeed: seed.entrySeed, diagnostics: [], provenance: {
    fieldOrigin,
    userExplicit: fieldOrigin === "user-explicit" ? ["request", "policy", "cases", "publicInstruction", "additionalQuestions", "additionalConstraints"] : [],
    modelAuthored: fieldOrigin === "model-authored" ? ["request", "policy", "cases", "publicInstruction", "additionalQuestions", "additionalConstraints"] : [],
    hostDerived: ["context metadata", "entry seed", "case-local principal/resource keys", "premise entry references", "branch condition references", "canonical IDs by existing v2 lowerer"],
    fieldSources,
  } }
}
