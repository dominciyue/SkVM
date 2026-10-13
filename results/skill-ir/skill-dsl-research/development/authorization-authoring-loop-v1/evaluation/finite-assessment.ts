import { isDeepStrictEqual } from "node:util"
/** Evaluation only. A matching value or a generic unknown is insufficient. */
export function assessFiniteCase(expected: { kind: string; returned?: unknown; conditions: string[] }, execution: any) {
  const rejected = execution?.events?.some((e: any) => e.op === "guard" && e.outcome === "rejected") ?? false
  const valuesMatch = expected.returned !== undefined && isDeepStrictEqual(execution?.returned, expected.returned)
  const rejectionMatch = ["denied", "rejected"].includes(expected.kind) && rejected && execution?.returned === undefined
  const missingExternalNames = expected.conditions.filter(c => c.startsWith("ObjectPermissionChecker.")).map(c => c.split(" ")[0]!)
  const conditionCausesMatch = missingExternalNames.every(name => execution?.gaps?.includes(`external:${name}`))
  const conditionsMatch = expected.kind === "conditional" ? !!execution?.conditions?.length && conditionCausesMatch : !execution?.conditions?.length
  return { valuesMatch, rejectionMatch, conditionsMatch, conditionCausesMatch, finiteMachineMatch: (valuesMatch || rejectionMatch) && conditionsMatch }
}
