const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const

type JsonRecord = Record<string, unknown>
type ConstraintLocation = "body" | "path" | "query" | "header"

export interface ApiTesterConstraint {
  location: ConstraintLocation
  name: string
  type?: string
  required: boolean
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
  enumValues?: unknown[]
  format?: string
}

export interface ApiTesterOperation {
  method: string
  path: string
  successStatuses: number[]
  errorStatuses: number[]
  securityHeaders: string[]
  constraints: ApiTesterConstraint[]
}

export interface ApiTesterConfirmedOracle {
  status: "confirmed"
  operations: ApiTesterOperation[]
}

export interface ApiTesterUnconfirmedOracle {
  status: "unconfirmed"
  reason: string
}

export type ApiTesterOracle = ApiTesterConfirmedOracle | ApiTesterUnconfirmedOracle

export interface ApiTesterPlanAssessment {
  artifactShape: boolean
  operationCoverage: boolean
  schemaDerivedCases: boolean
  securityResponse: boolean
  independenceVerification: boolean
  issues: string[]
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function statusCodes(responses: unknown): { success: number[]; error: number[] } | undefined {
  if (!isRecord(responses)) return undefined
  const codes = Object.keys(responses)
    .filter((key) => /^\d{3}$/u.test(key))
    .map(Number)
  const success = codes.filter((code) => code >= 200 && code < 300).sort((a, b) => a - b)
  if (success.length === 0) return undefined
  return {
    success,
    error: codes.filter((code) => code >= 400 && code < 600).sort((a, b) => a - b),
  }
}

function constraintBase(location: ConstraintLocation, name: string, schema: JsonRecord): Omit<ApiTesterConstraint, "required"> {
  const type = stringValue(schema.type)
  return { location, name, ...(type ? { type } : {}) }
}

function deriveConstraints(
  location: ConstraintLocation,
  name: string,
  schema: JsonRecord,
  required: boolean,
): ApiTesterConstraint[] {
  const base = constraintBase(location, name, schema)
  const constraints: ApiTesterConstraint[] = []
  if (required) constraints.push({ ...base, required: true })

  const numericKeys = ["minLength", "maxLength", "minimum", "maximum"] as const
  for (const key of numericKeys) {
    const value = finiteNumber(schema[key])
    if (value !== undefined) constraints.push({ ...base, required: false, [key]: value })
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    constraints.push({ ...base, required: false, enumValues: structuredClone(schema.enum) })
  }
  const format = stringValue(schema.format)
  if (format) constraints.push({ ...base, required: false, format })
  return constraints
}

function parameterConstraints(parameters: unknown): ApiTesterConstraint[] | undefined {
  if (parameters === undefined) return []
  if (!Array.isArray(parameters)) return undefined
  const result: ApiTesterConstraint[] = []
  for (const parameter of parameters) {
    if (!isRecord(parameter) || !isRecord(parameter.schema)) return undefined
    const name = stringValue(parameter.name)
    const location = parameter.in === "headers" ? "header" : parameter.in
    if (!name || !["path", "query", "header"].includes(String(location))) return undefined
    result.push(...deriveConstraints(
      location as Exclude<ConstraintLocation, "body">,
      name,
      parameter.schema,
      parameter.required === true,
    ))
  }
  return result
}

function bodyConstraints(requestBody: unknown): ApiTesterConstraint[] | undefined {
  if (requestBody === undefined) return []
  if (!isRecord(requestBody) || !isRecord(requestBody.content)) return undefined
  const media = requestBody.content["application/json"]
  if (!isRecord(media) || !isRecord(media.schema)) return undefined
  const schema = media.schema
  if (!isRecord(schema.properties)) return undefined
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((entry): entry is string => typeof entry === "string") : [])
  const result: ApiTesterConstraint[] = []
  for (const [name, property] of Object.entries(schema.properties)) {
    if (!isRecord(property)) return undefined
    result.push(...deriveConstraints("body", name, property, required.has(name)))
  }
  return result
}

function securityHeaders(document: JsonRecord, operation: JsonRecord): string[] | undefined {
  const security = operation.security ?? document.security
  if (security === undefined || (Array.isArray(security) && security.length === 0)) return []
  if (!Array.isArray(security)) return undefined
  const components = isRecord(document.components) ? document.components : {}
  const schemes = isRecord(components.securitySchemes) ? components.securitySchemes : {}
  const names = new Set<string>()
  for (const requirement of security) {
    if (!isRecord(requirement)) return undefined
    for (const schemeName of Object.keys(requirement)) {
      const scheme = schemes[schemeName]
      if (!isRecord(scheme)) return undefined
      if (scheme.type === "http" && String(scheme.scheme).toLowerCase() === "bearer") {
        names.add("Authorization")
      } else if (scheme.type === "apiKey" && scheme.in === "header" && stringValue(scheme.name)) {
        names.add(String(scheme.name))
      } else {
        return undefined
      }
    }
  }
  return [...names].sort()
}

export function deriveApiTesterOracle(value: unknown): ApiTesterOracle {
  if (!isRecord(value) || !stringValue(value.openapi) || !isRecord(value.paths)) {
    return { status: "unconfirmed", reason: "invalid-public-openapi" }
  }
  const operations: ApiTesterOperation[] = []
  for (const [route, pathItem] of Object.entries(value.paths)) {
    if (!route.startsWith("/") || !isRecord(pathItem)) {
      return { status: "unconfirmed", reason: "invalid-path-item" }
    }
    const sharedParameters = parameterConstraints(pathItem.parameters)
    if (!sharedParameters) return { status: "unconfirmed", reason: "unsupported-parameter" }
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method]
      if (operation === undefined) continue
      if (!isRecord(operation)) return { status: "unconfirmed", reason: "invalid-operation" }
      const statuses = statusCodes(operation.responses)
      if (!statuses) return { status: "unconfirmed", reason: "operation-without-success-response" }
      const operationParameters = parameterConstraints(operation.parameters)
      const body = bodyConstraints(operation.requestBody)
      const headers = securityHeaders(value, operation)
      if (!operationParameters || !body || !headers) {
        return { status: "unconfirmed", reason: "unsupported-operation-evidence" }
      }
      operations.push({
        method,
        path: route,
        successStatuses: statuses.success,
        errorStatuses: statuses.error,
        securityHeaders: headers,
        constraints: [...sharedParameters, ...operationParameters, ...body],
      })
    }
  }
  if (operations.length === 0) return { status: "unconfirmed", reason: "no-public-operations" }
  operations.sort((left, right) => `${left.path}:${left.method}`.localeCompare(`${right.path}:${right.method}`))
  return { status: "confirmed", operations }
}

function requestSection(request: unknown, location: ConstraintLocation): JsonRecord | undefined {
  if (!isRecord(request)) return undefined
  const key = location === "header" ? "headers" : location
  return isRecord(request[key]) ? request[key] : undefined
}

function requestValue(testCase: JsonRecord, constraint: ApiTesterConstraint): { present: boolean; value?: unknown } {
  const section = requestSection(testCase.request, constraint.location)
  if (!section || !Object.prototype.hasOwnProperty.call(section, constraint.name)) return { present: false }
  return { present: true, value: section[constraint.name] }
}

function isDocumentedCase(testCase: JsonRecord, statuses: number[], categories?: string[]): boolean {
  return typeof testCase.expectedStatus === "number"
    && statuses.includes(testCase.expectedStatus)
    && (!categories || categories.includes(String(testCase.category)))
}

function isOutsideEnum(value: unknown, allowed: unknown[]): boolean {
  return !allowed.some((entry) => JSON.stringify(entry) === JSON.stringify(value))
}

function isValidFormat(format: string, value: unknown): boolean {
  if (typeof value !== "string") return false
  if (format === "email") return /^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(value)
  if (format === "uri") {
    try {
      new URL(value)
      return true
    } catch {
      return false
    }
  }
  return value.length > 0
}

function witnessesConstraint(
  constraint: ApiTesterConstraint,
  testCase: JsonRecord,
  successStatuses: number[],
  errorStatuses: number[],
): boolean {
  const observed = requestValue(testCase, constraint)
  if (constraint.required) {
    return !observed.present && isDocumentedCase(testCase, errorStatuses, ["error"])
  }
  const valid = isDocumentedCase(testCase, successStatuses, ["boundary"])
  const invalid = isDocumentedCase(testCase, errorStatuses, ["error"])
  if (!observed.present) return false
  const value = observed.value
  if (constraint.minLength !== undefined && typeof value === "string") {
    return (valid && value.length === constraint.minLength) || (invalid && value.length < constraint.minLength)
  }
  if (constraint.maxLength !== undefined && typeof value === "string") {
    return (valid && value.length === constraint.maxLength) || (invalid && value.length > constraint.maxLength)
  }
  if (constraint.minimum !== undefined && typeof value === "number") {
    return (valid && value === constraint.minimum) || (invalid && value < constraint.minimum)
  }
  if (constraint.maximum !== undefined && typeof value === "number") {
    return (valid && value === constraint.maximum) || (invalid && value > constraint.maximum)
  }
  if (constraint.enumValues) {
    return (valid && !isOutsideEnum(value, constraint.enumValues)) || (invalid && isOutsideEnum(value, constraint.enumValues))
  }
  if (constraint.format) {
    return (valid && isValidFormat(constraint.format, value)) || (invalid && !isValidFormat(constraint.format, value))
  }
  return false
}

function validCaseShape(testCase: unknown): testCase is JsonRecord {
  if (!isRecord(testCase)) return false
  return typeof testCase.id === "string"
    && ["happy", "boundary", "error"].includes(String(testCase.category))
    && isRecord(testCase.request)
    && Number.isInteger(testCase.expectedStatus)
    && Array.isArray(testCase.assertions)
    && testCase.assertions.length > 0
    && testCase.assertions.every((entry) => typeof entry === "string" && entry.length > 0)
    && typeof testCase.independent === "boolean"
    && Number.isInteger(testCase.timeoutMs)
    && Number(testCase.timeoutMs) > 0
}

export function assessApiTesterPlan(oracle: ApiTesterConfirmedOracle, value: unknown): ApiTesterPlanAssessment {
  const issues: string[] = []
  const artifactShape = isRecord(value)
    && typeof value.schemaVersion === "string"
    && typeof value.source === "string"
    && typeof value.framework === "string"
    && Array.isArray(value.endpoints)
    && value.endpoints.every((endpoint) => isRecord(endpoint)
      && typeof endpoint.method === "string"
      && typeof endpoint.path === "string"
      && Array.isArray(endpoint.cases)
      && endpoint.cases.every(validCaseShape))
  if (!artifactShape || !isRecord(value) || !Array.isArray(value.endpoints)) {
    return {
      artifactShape: false,
      operationCoverage: false,
      schemaDerivedCases: false,
      securityResponse: false,
      independenceVerification: false,
      issues: ["invalid-plan-shape"],
    }
  }

  const endpoints = value.endpoints as JsonRecord[]
  const expectedKeys = oracle.operations.map((operation) => `${operation.method}:${operation.path}`)
  const actualKeys = endpoints.map((endpoint) => `${String(endpoint.method).toLowerCase()}:${String(endpoint.path)}`)
  const operationCoverage = actualKeys.length === expectedKeys.length
    && new Set(actualKeys).size === actualKeys.length
    && expectedKeys.every((key) => actualKeys.includes(key))
  if (!operationCoverage) issues.push("operation-coverage")

  let schemaDerivedCases = operationCoverage
  let securityResponse = operationCoverage
  let independenceVerification = operationCoverage
  const allCaseIds = new Set<string>()

  for (const operation of oracle.operations) {
    const endpoint = endpoints.find((entry) => String(entry.method).toLowerCase() === operation.method && entry.path === operation.path)
    const cases = endpoint && Array.isArray(endpoint.cases) ? endpoint.cases.filter(isRecord) : []
    if (!cases.some((testCase) => testCase.category === "happy" && isDocumentedCase(testCase, operation.successStatuses))) {
      schemaDerivedCases = false
    }
    if (!operation.constraints.every((constraint) => cases.some((testCase) =>
      witnessesConstraint(constraint, testCase, operation.successStatuses, operation.errorStatuses)))) {
      schemaDerivedCases = false
    }

    for (const header of operation.securityHeaders) {
      const unauthorized = cases.some((testCase) => {
        const headers = requestSection(testCase.request, "header")
        return !headers?.[header]
          && isDocumentedCase(testCase, operation.errorStatuses.filter((status) => status === 401 || status === 403), ["error"])
      })
      if (!unauthorized) securityResponse = false
      for (const testCase of cases) {
        const headers = requestSection(testCase.request, "header")
        if (headers && Object.prototype.hasOwnProperty.call(headers, header)) {
          const headerValue = headers[header]
          if (typeof headerValue !== "string" || !/^\$\{[A-Z][A-Z0-9_]*\}$/u.test(headerValue)) securityResponse = false
        }
      }
    }

    for (const testCase of cases) {
      const documented = testCase.category === "error"
        ? isDocumentedCase(testCase, operation.errorStatuses, ["error"])
        : isDocumentedCase(testCase, operation.successStatuses, ["happy", "boundary"])
      if (!documented) securityResponse = false
    }

    for (const testCase of cases) {
      const id = String(testCase.id)
      if (allCaseIds.has(id) || testCase.independent !== true || Number(testCase.timeoutMs) > 30_000) {
        independenceVerification = false
      }
      allCaseIds.add(id)
    }
  }

  if (!schemaDerivedCases) issues.push("schema-derived-cases")
  if (!securityResponse) issues.push("security-response")
  if (!independenceVerification) issues.push("independence-verification")
  return {
    artifactShape,
    operationCoverage,
    schemaDerivedCases,
    securityResponse,
    independenceVerification,
    issues,
  }
}
