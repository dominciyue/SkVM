import Ajv from "ajv"
import { z } from "zod"
import fixture from "../../../../examples/authorization-assessment/authoring-v2.json"
import { AuthorizationAuthoringInputV2Schema } from "../authoring-v2.ts"
import { normalizeAuthorizationAuthoringInput } from "../authoring.ts"
import { loadAuthoringEditorSchema } from "./schema.ts"

type Diagnostic = { path: string; message: string }
type JsonSchema = Record<string, any>
type Mutation = (value: any) => void

/** Exceptions are evidence boundaries, not alternate schema validation rules. */
export const runtimeOnlyChecks = [
  { id: "line-order", stage: "v2-parser", description: "endLine must not precede startLine." },
  { id: "reference-existence", stage: "normalization", description: "Scenario principal/resource/policy/entry and requested condition names must exist." },
  { id: "repeated-references", stage: "normalization", description: "Scenario entry references and requested condition names must be unique." },
  { id: "policy-readiness", stage: "normalization", description: "Every referenced policy must have author acceptance accepted." },
  { id: "unicode-well-formedness", stage: "v2-parser", description: "Dictionary names and references must be encodable as well-formed Unicode (no lone surrogates)." },
  { id: "source-paths-and-files", stage: "authorization-check", description: "sourceRoot and source paths must be safe, resolve within the permitted root (including symlinks/junctions), and identify readable supplied files." },
  { id: "source-locations", stage: "authorization-check", description: "Entry locations must identify supplied source and fit its actual line range." },
] as const

export function createStructuralFixtures(): Array<{ name: string; value: unknown; valid: boolean }> {
  const cases: Array<{ name: string; value: unknown; valid: boolean }> = []
  const add = (name: string, valid: boolean, mutate: Mutation = () => {}) => {
    const value: any = structuredClone(fixture)
    mutate(value)
    cases.push({ name, value, valid })
  }
  add("minimal optional fields omitted", true, v => { delete v.principals.support.facts; delete v.principals.support.capabilities; delete v.resources.record.facts })
  add("existing complete v2", true)
  add("multiple named entities and non-ASCII names", true, v => {
    v.principals["所有者 😀"] = { role: "owner" }
    v.resources["记录"] = { type: "record" }
    v.policies["归档政策"] = { ...v.policies.archive }
    v.entries["入口"] = { ...v.entries.archive }
    v.scenarios["归档:副本"] = { ...v.scenarios.archive, principal: "所有者 😀", resource: "记录", policy: "归档政策", entries: ["入口"], expectation: "allow" }
  })
  add("conditions and all optional fields", true, v => {
    v.additionalQuestions = ["Explain both branches"]
    v.additionalConstraints = ["Use supplied source only"]
    v.scenarios.archive.expectation = "conditional"
    v.scenarios.archive.conditions = { owner: { basis: "Ownership can differ" }, supervisor: { basis: "Role can differ" } }
    v.scenarios.archive.analyzeConditions = { names: ["owner", "supervisor"], maxBranches: 12 }
  })
  add("empty optional arrays and conditions", true, v => {
    v.additionalQuestions = []; v.additionalConstraints = []
    v.principals.support.facts = []; v.principals.support.capabilities = []; v.resources.record.facts = []
    v.scenarios.archive.conditions = {}
  })
  add("branch minimum and default", true, v => {
    v.scenarios.archive.conditions = { owner: { basis: "User-provided" } }
    v.scenarios.archive.analyzeConditions = { names: ["owner"], maxBranches: 1 }
    v.scenarios.default = { ...v.scenarios.archive, analyzeConditions: { names: ["owner"] } }
  })
  add("text trimming is valid without editor mutation", true, v => { v.request = "\u00a0 Query \t" })
  for (const acceptance of ["conflicted", "unresolved"]) add(`structurally valid ${acceptance} policy`, true, v => { v.policies.archive.acceptance = acceptance })
  for (const key of Object.keys(fixture)) add(`missing required ${key}`, false, v => { delete v[key] })
  for (const key of ["policies", "principals", "resources", "entries", "scenarios"]) add(`empty ${key} dictionary`, false, v => { v[key] = {} })
  const objects = [
    ["$", (v: any) => v], ["policy", (v: any) => v.policies.archive],
    ["principal", (v: any) => v.principals.support], ["resource", (v: any) => v.resources.record],
    ["entry", (v: any) => v.entries.archive], ["location", (v: any) => v.entries.archive.locations[0]],
    ["scenario", (v: any) => v.scenarios.archive],
  ] as const
  for (const [name, get] of objects) add(`unknown field in ${name}`, false, v => { get(v).guessedField = true })
  add("$schema rejected by strict declaration", false, v => { v.$schema = "./authoring-v2.schema.json" })
  add("unknown condition field", false, v => { v.scenarios.archive.conditions = { owner: { basis: "Declared", guessedField: true } } })
  add("unknown analysis field", false, v => { v.scenarios.archive.analyzeConditions = { names: ["owner"], guessedField: true } })
  for (const value of ["wrong", 2, null]) add(`wrong schemaVersion ${value}`, false, v => { v.schemaVersion = value })
  add("wrong expectation enum", false, v => { v.scenarios.archive.expectation = "permitted" })
  add("wrong acceptance enum", false, v => { v.policies.archive.acceptance = "approved" })
  for (const value of ["", " \t\r\n", "\u00a0\uFEFF", 12, null]) add(`invalid text ${JSON.stringify(value)}`, false, v => { v.request = value })
  for (const field of ["startLine", "endLine"]) {
    for (const value of [0, -1, 1.5, "1", null]) add(`invalid ${field} ${value}`, false, v => { v.entries.archive.locations[0][field] = value })
  }
  for (const value of [0, 13, 1.5, "8", null]) add(`invalid maxBranches ${value}`, false, v => { v.scenarios.archive.analyzeConditions = { names: ["owner"], maxBranches: value } })
  for (const [name, mutate] of [
    ["sources empty", (v: any) => { v.sources = [] }],
    ["sources not array", (v: any) => { v.sources = "src/record.ts" }],
    ["source item wrong type", (v: any) => { v.sources = [false] }],
    ["locations empty", (v: any) => { v.entries.archive.locations = [] }],
    ["entries empty", (v: any) => { v.scenarios.archive.entries = [] }],
    ["condition names empty", (v: any) => { v.scenarios.archive.analyzeConditions = { names: [] } }],
    ["missing nested role", (v: any) => { delete v.principals.support.role }],
    ["missing policy reason", (v: any) => { delete v.policies.archive.reason }],
    ["missing scenario expectation", (v: any) => { delete v.scenarios.archive.expectation }],
    ["condition missing basis", (v: any) => { v.scenarios.archive.conditions = { owner: {} } }],
    ["dictionary wrong type", (v: any) => { v.principals = [] }],
    ["dictionary member null", (v: any) => { v.resources.record = null }],
    ["optional array wrong type", (v: any) => { v.additionalQuestions = "Explain" }],
    ["facts item wrong type", (v: any) => { v.resources.record.facts = [false] }],
  ] as Array<[string, Mutation]>) add(name, false, mutate)
  for (const key of ["", " leading", "trailing ", "\u00a0name", "name\uFEFF", "a\n", "a\u2028", "a\u2029", "a\u0000b", "a\u007fb", "__proto__", "prototype", "constructor"]) {
    add(`invalid dictionary name ${JSON.stringify(key)}`, false, v => { v.principals = JSON.parse(JSON.stringify({ [key]: { role: "member" } })) })
    add(`invalid reference name ${JSON.stringify(key)}`, false, v => { v.scenarios.archive.principal = key })
  }
  for (const value of [null, [], true, "declaration"]) cases.push({ name: `invalid root ${JSON.stringify(value)}`, value, valid: false })
  return cases
}

export function createRuntimeOnlyFixtures(): Array<{ name: string; check: string; value: unknown }> {
  const cases: Array<{ name: string; check: string; value: unknown }> = []
  const add = (name: string, check: string, mutate: Mutation) => {
    const value: any = structuredClone(fixture); mutate(value); cases.push({ name, check, value })
  }
  add("reversed line range", "line-order", v => { v.entries.archive.locations[0].endLine = 1 })
  for (const field of ["principal", "resource", "policy"]) add(`missing ${field}`, "reference-existence", v => { v.scenarios.archive[field] = "missing" })
  add("missing entry", "reference-existence", v => { v.scenarios.archive.entries = ["missing"] })
  add("missing condition", "reference-existence", v => { v.scenarios.archive.analyzeConditions = { names: ["missing"] } })
  add("repeated entry", "repeated-references", v => { v.scenarios.archive.entries = ["archive", "archive"] })
  add("repeated condition", "repeated-references", v => { v.scenarios.archive.conditions = { owner: { basis: "Author" } }; v.scenarios.archive.analyzeConditions = { names: ["owner", "owner"] } })
  for (const acceptance of ["conflicted", "unresolved"]) add(`${acceptance} policy`, "policy-readiness", v => { v.policies.archive.acceptance = acceptance })
  add("lone surrogate dictionary name", "unicode-well-formedness", v => { v.scenarios["\ud800"] = { ...v.scenarios.archive } })
  add("lone surrogate reference", "unicode-well-formedness", v => { v.scenarios.archive.principal = "\udfff" })
  return cases
}

function unwrap(value: z.ZodTypeAny): z.ZodTypeAny {
  if (value instanceof z.ZodOptional) return unwrap(value.unwrap())
  if (value instanceof z.ZodEffects) return unwrap(value.innerType())
  return value
}

/** Compare the actual Zod tree, including nested keys; do not duplicate a key manifest. */
export function findStructuralDrift(
  schema: Record<string, unknown>,
  runtime: z.ZodTypeAny = AuthorizationAuthoringInputV2Schema,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const resolve = (node: JsonSchema): JsonSchema => {
    if (typeof node.$ref === "string") {
      if (!node.$ref.startsWith("#/definitions/")) throw new Error(`Non-local schema reference: ${node.$ref}`)
      const definition = (schema.definitions as JsonSchema)?.[node.$ref.slice("#/definitions/".length)]
      if (!definition) throw new Error(`Missing schema definition: ${node.$ref}`)
      return resolve(definition)
    }
    if (Array.isArray(node.allOf) && node.allOf.length === 1) return { ...resolve(node.allOf[0]), ...node }
    return node
  }
  const compare = (path: string, key: string, expected: unknown, actual: unknown) => {
    if (JSON.stringify(expected) !== JSON.stringify(actual)) diagnostics.push({ path, message: `${key}: runtime ${JSON.stringify(expected)}, editor ${JSON.stringify(actual)}` })
  }
  const visit = (raw: z.ZodTypeAny, candidate: JsonSchema | undefined, path: string) => {
    if (!candidate) { diagnostics.push({ path, message: "Missing editor schema node" }); return }
    const node = resolve(candidate), type = unwrap(raw)
    if (type instanceof z.ZodObject) {
      compare(path, "type", "object", node.type)
      const shape = type.shape as Record<string, z.ZodTypeAny>
      const keys = Object.keys(shape).sort(), properties = node.properties ?? {}
      compare(path, "properties", keys, Object.keys(properties).sort())
      compare(path, "required", keys.filter(key => !shape[key]!.isOptional()), [...(node.required ?? [])].sort())
      compare(path, "additionalProperties", type._def.unknownKeys !== "strict", node.additionalProperties)
      for (const key of keys) visit(shape[key]!, properties[key], `${path}.${key}`)
    } else if (type instanceof z.ZodRecord) {
      compare(path, "type", "object", node.type)
      compare(path, "minProperties", raw.safeParse({}).success ? 0 : 1, node.minProperties ?? 0)
      visit(type.keySchema, node.propertyNames, `${path}.[name]`)
      visit(type.valueSchema, node.additionalProperties, `${path}.*`)
    } else if (type instanceof z.ZodArray) {
      compare(path, "type", "array", node.type)
      compare(path, "minItems", type._def.minLength?.value ?? 0, node.minItems ?? 0)
      compare(path, "maxItems", type._def.maxLength?.value, node.maxItems)
      visit(type.element, node.items, `${path}[]`)
    } else if (type instanceof z.ZodString) {
      compare(path, "type", "string", node.type)
      compare(path, "minLength", type.minLength ?? 0, node.minLength ?? 0)
      compare(path, "maxLength", type.maxLength, node.maxLength ?? null)
    } else if (type instanceof z.ZodNumber) {
      compare(path, "type", type.isInt ? "integer" : "number", node.type)
      // Zod positive integer (> 0) and draft-07 minimum: 1 are equivalent.
      if (type.isInt) {
        const lower = type._def.checks.filter(c => c.kind === "min").map(c => c.inclusive ? Math.ceil(c.value) : Math.floor(c.value) + 1)
        const upper = type._def.checks.filter(c => c.kind === "max").map(c => c.inclusive ? Math.floor(c.value) : Math.ceil(c.value) - 1)
        const editorLower = [node.minimum === undefined ? -Infinity : Math.ceil(node.minimum), node.exclusiveMinimum === undefined ? -Infinity : Math.floor(node.exclusiveMinimum) + 1]
        const editorUpper = [node.maximum === undefined ? Infinity : Math.floor(node.maximum), node.exclusiveMaximum === undefined ? Infinity : Math.ceil(node.exclusiveMaximum) - 1]
        compare(path, "minimum", Math.max(-Infinity, ...lower), Math.max(...editorLower))
        compare(path, "maximum", Math.min(Infinity, ...upper), Math.min(...editorUpper))
      } else {
        compare(path, "minimum", type.minValue, node.minimum ?? node.exclusiveMinimum ?? null)
        compare(path, "maximum", type.maxValue, node.maximum ?? node.exclusiveMaximum ?? null)
        compare(path, "exclusiveMinimum", type._def.checks.some(c => c.kind === "min" && !c.inclusive), node.exclusiveMinimum !== undefined)
        compare(path, "exclusiveMaximum", type._def.checks.some(c => c.kind === "max" && !c.inclusive), node.exclusiveMaximum !== undefined)
      }
    } else if (type instanceof z.ZodEnum) {
      compare(path, "type", "string", node.type)
      compare(path, "enum", [...type.options].sort(), [...(node.enum ?? [])].sort())
    } else if (type instanceof z.ZodLiteral) {
      compare(path, "type", typeof type.value, node.type)
      compare(path, "const", type.value, node.const)
    } else diagnostics.push({ path, message: `Unsupported runtime schema node ${type._def.typeName}; update editor coverage.` })
    if (typeof node.description !== "string" || !node.description.trim()) diagnostics.push({ path, message: "Missing field description" })
  }
  try { visit(runtime, schema, "$") } catch (error) { diagnostics.push({ path: "$", message: String(error) }) }
  return diagnostics
}

export function verifyEditorSupport(schema: Record<string, unknown> = loadAuthoringEditorSchema()) {
  const diagnostics = findStructuralDrift(schema)
  const structural = createStructuralFixtures(), runtimeOnly = createRuntimeOnlyFixtures()
  const runtimeDiagnostics: Array<{ name: string; check: string; diagnostics: unknown }> = []
  try {
    const validate = new Ajv({ strict: true, allErrors: true, ownProperties: true }).compile(schema)
    for (const test of structural) {
      const editorValid = !!validate(test.value), runtimeValid = AuthorizationAuthoringInputV2Schema.safeParse(test.value).success
      if (editorValid !== test.valid || runtimeValid !== test.valid) diagnostics.push({ path: test.name, message: `expected ${test.valid}; editor=${editorValid}; parser=${runtimeValid}` })
    }
    for (const test of runtimeOnly) {
      const editorValid = !!validate(test.value), normalized = normalizeAuthorizationAuthoringInput(test.value)
      if (!editorValid || normalized.status !== "needs-input" || normalized.diagnostics.length === 0) diagnostics.push({ path: test.name, message: `Expected editor-valid/runtime-needs-input; editor=${editorValid}; runtime=${normalized.status}` })
      runtimeDiagnostics.push({ name: test.name, check: test.check, diagnostics: normalized.diagnostics })
    }
  } catch (error) { diagnostics.push({ path: "$", message: `Schema compilation or verification failed: ${String(error)}` }) }
  return { schemaVersion: "authorization-editor-verification/v1", valid: diagnostics.length === 0, structuralCases: structural.length, runtimeOnlyCases: runtimeOnly.length, runtimeOnlyChecks, runtimeDiagnostics, providerCalls: 0, targetExecutions: 0, diagnostics }
}

if (import.meta.main) {
  try {
    const report = verifyEditorSupport()
    console.log(JSON.stringify(report, null, 2))
    process.exitCode = report.valid ? 0 : 1
  } catch (error) {
    console.error(`Editor support verification failed: ${String(error)}`)
    process.exitCode = 1
  }
}
