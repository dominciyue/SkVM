import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { parse as parseYaml } from "yaml"
import {
  assessApiTesterPlan,
  deriveApiTesterOracle,
  type ApiTesterConfirmedOracle,
} from "./api-tester-oracle.ts"

const rootDir = process.cwd()

async function developmentDocuments(): Promise<unknown[]> {
  const taskSet = JSON.parse(await readFile(
    path.join(rootDir, "benchmarks/skill-ir/pilots/api-tester/development/tasks.json"),
    "utf8",
  )) as { tasks: Array<{ fixtures: Record<string, string> }> }
  return taskSet.tasks.map((task) => {
    const entry = Object.entries(task.fixtures).find(([name]) => /openapi\.(?:json|yaml)$/u.test(name))!
    return entry[0].endsWith(".json") ? JSON.parse(entry[1]) : parseYaml(entry[1])
  })
}

function setRequestValue(
  request: Record<string, Record<string, unknown>>,
  location: "body" | "path" | "query" | "header",
  name: string,
  value: unknown,
): void {
  const target = location === "header" ? "headers" : location
  request[target] ??= {}
  request[target]![name] = value
}

function deleteRequestValue(
  request: Record<string, Record<string, unknown>>,
  location: "body" | "path" | "query" | "header",
  name: string,
): void {
  const target = location === "header" ? "headers" : location
  delete request[target]?.[name]
}

function validValue(constraint: ApiTesterConfirmedOracle["operations"][number]["constraints"][number]): unknown {
  if (constraint.enumValues?.length) return constraint.enumValues[0]
  if (constraint.format === "email") return "person@example.test"
  if (constraint.format === "uri") return "https://example.test/callback"
  if (constraint.type === "integer" || constraint.type === "number") return constraint.minimum ?? 1
  return "x".repeat(Math.max(1, constraint.minLength ?? 1))
}

function planFor(oracle: ApiTesterConfirmedOracle, strategy: "valid-edge" | "invalid-outside") {
  return {
    schemaVersion: "api-test-plan/v1",
    source: "public-openapi",
    framework: strategy === "valid-edge" ? "node:test" : "custom-runner",
    endpoints: oracle.operations.map((operation) => {
      const baseRequest: Record<string, Record<string, unknown>> = {}
      for (const constraint of operation.constraints) {
        setRequestValue(baseRequest, constraint.location, constraint.name, validValue(constraint))
      }
      for (const header of operation.securityHeaders) {
        setRequestValue(baseRequest, "header", header, "${API_TEST_TOKEN}")
      }
      const success = operation.successStatuses[0]!
      const error = operation.errorStatuses[0] ?? 400
      const cases: Array<Record<string, unknown>> = [{
        id: `${operation.method}-${operation.path}-happy`,
        category: "happy",
        request: structuredClone(baseRequest),
        expectedStatus: success,
        assertions: ["status", "response-shape"],
        independent: true,
        timeoutMs: 5000,
      }]
      operation.constraints.forEach((constraint, index) => {
        const request = structuredClone(baseRequest)
        let category: "boundary" | "error" = "boundary"
        let expectedStatus = success
        if (constraint.required) {
          deleteRequestValue(request, constraint.location, constraint.name)
          category = "error"
          expectedStatus = error
        } else if (strategy === "invalid-outside") {
          category = "error"
          expectedStatus = error
          if (constraint.minLength !== undefined) {
            setRequestValue(request, constraint.location, constraint.name, "x".repeat(Math.max(0, constraint.minLength - 1)))
          } else if (constraint.maxLength !== undefined) {
            setRequestValue(request, constraint.location, constraint.name, "x".repeat(constraint.maxLength + 1))
          } else if (constraint.minimum !== undefined) {
            setRequestValue(request, constraint.location, constraint.name, constraint.minimum - 1)
          } else if (constraint.maximum !== undefined) {
            setRequestValue(request, constraint.location, constraint.name, constraint.maximum + 1)
          } else if (constraint.enumValues?.length) {
            setRequestValue(request, constraint.location, constraint.name, "TEST_ONLY_INVALID_ENUM")
          } else if (constraint.format) {
            setRequestValue(request, constraint.location, constraint.name, "invalid-format")
          }
        } else if (constraint.maxLength !== undefined) {
          setRequestValue(request, constraint.location, constraint.name, "x".repeat(constraint.maxLength))
        } else if (constraint.maximum !== undefined) {
          setRequestValue(request, constraint.location, constraint.name, constraint.maximum)
        }
        cases.push({
          id: `${operation.method}-${operation.path}-constraint-${index}`,
          category,
          request,
          expectedStatus,
          assertions: ["status"],
          independent: true,
          timeoutMs: 5000,
        })
      })
      if (operation.securityHeaders.length > 0) {
        const request = structuredClone(baseRequest)
        for (const header of operation.securityHeaders) deleteRequestValue(request, "header", header)
        cases.push({
          id: `${operation.method}-${operation.path}-unauthorized`,
          category: "error",
          request,
          expectedStatus: operation.errorStatuses.find((status) => status === 401 || status === 403) ?? error,
          assertions: ["status"],
          independent: true,
          timeoutMs: 5000,
        })
      }
      return { method: operation.method, path: operation.path, cases }
    }),
  }
}

describe("api-tester source-derived oracle", () => {
  test("derives operations, constraints, security, and statuses from YAML and JSON", async () => {
    const oracles = (await developmentDocuments()).map(deriveApiTesterOracle)
    expect(oracles.every((oracle) => oracle.status === "confirmed")).toBe(true)
    const confirmed = oracles as ApiTesterConfirmedOracle[]
    expect(confirmed.map((oracle) => oracle.operations.length)).toEqual([2, 2])
    expect(confirmed[0]!.operations.find((operation) => operation.path === "/users")?.securityHeaders)
      .toEqual(["Authorization"])
    expect(confirmed[1]!.operations.find((operation) => operation.path === "/inventory")?.securityHeaders)
      .toEqual(["X-API-Key"])
    expect(confirmed.flatMap((oracle) => oracle.operations).flatMap((operation) => operation.constraints).length)
      .toBeGreaterThan(8)
  })

  test("returns unconfirmed when public OpenAPI evidence is missing or malformed", () => {
    expect(deriveApiTesterOracle({}).status).toBe("unconfirmed")
    expect(deriveApiTesterOracle({ openapi: "3.0.3", paths: { "/x": { get: {} } } }).status)
      .toBe("unconfirmed")
  })

  test("removes a constraint when its public evidence is removed", async () => {
    const document = structuredClone((await developmentDocuments())[0]) as {
      paths: Record<string, { post: { requestBody: { content: Record<string, { schema: { properties: Record<string, Record<string, unknown>> } }> } } }>
    }
    const before = deriveApiTesterOracle(document)
    delete document.paths["/users"]!.post.requestBody.content["application/json"]!.schema.properties.name!.minLength
    const after = deriveApiTesterOracle(document)
    if (before.status !== "confirmed" || after.status !== "confirmed") throw new Error("fixtures must be confirmed")
    expect(after.operations.flatMap((operation) => operation.constraints).length)
      .toBe(before.operations.flatMap((operation) => operation.constraints).length - 1)
  })

  test("accepts valid-edge and invalid-outside boundary strategies", async () => {
    for (const document of await developmentDocuments()) {
      const oracle = deriveApiTesterOracle(document)
      if (oracle.status !== "confirmed") throw new Error("fixture oracle must be confirmed")
      for (const strategy of ["valid-edge", "invalid-outside"] as const) {
        const assessment = assessApiTesterPlan(oracle, planFor(oracle, strategy))
        expect(assessment).toEqual({
          artifactShape: true,
          operationCoverage: true,
          schemaDerivedCases: true,
          securityResponse: true,
          independenceVerification: true,
          issues: [],
        })
      }
    }
  })

  test("separately rejects missing operation, boundary, auth, response, secret, and dependence", async () => {
    const document = (await developmentDocuments())[0]!
    const oracle = deriveApiTesterOracle(document)
    if (oracle.status !== "confirmed") throw new Error("fixture oracle must be confirmed")
    const base = planFor(oracle, "valid-edge")

    const missingOperation = structuredClone(base)
    missingOperation.endpoints.pop()
    expect(assessApiTesterPlan(oracle, missingOperation).operationCoverage).toBe(false)

    const missingBoundary = structuredClone(base)
    missingBoundary.endpoints[0]!.cases = missingBoundary.endpoints[0]!.cases.filter((entry) => entry.category === "happy")
    expect(assessApiTesterPlan(oracle, missingBoundary).schemaDerivedCases).toBe(false)

    const missingAuth = structuredClone(base)
    missingAuth.endpoints[0]!.cases = missingAuth.endpoints[0]!.cases.filter((entry) => !String(entry.id).includes("unauthorized"))
    expect(assessApiTesterPlan(oracle, missingAuth).securityResponse).toBe(false)

    const undocumentedResponse = structuredClone(base)
    undocumentedResponse.endpoints[0]!.cases[0]!.expectedStatus = 299
    expect(assessApiTesterPlan(oracle, undocumentedResponse).securityResponse).toBe(false)

    const secret = structuredClone(base)
    ;(secret.endpoints[0]!.cases[0]!.request as Record<string, Record<string, unknown>>).headers!.Authorization = "hardcoded-secret"
    expect(assessApiTesterPlan(oracle, secret).securityResponse).toBe(false)

    const dependent = structuredClone(base)
    dependent.endpoints[0]!.cases[0]!.independent = false
    expect(assessApiTesterPlan(oracle, dependent).independenceVerification).toBe(false)
  })
})
