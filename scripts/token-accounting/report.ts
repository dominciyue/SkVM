import { z } from "zod"
import { UsageGroupSchema, UsageObservationSchema, aggregateTokenObservations, compareTokenGroups,
  type TokenGroupAggregate, type TokenGroupComparison } from "../../src/measurement/token-accounting.ts"

export const TokenAccountingInputSchema = z.object({
  schemaVersion: z.literal("token-accounting-input/v1"),
  groups: z.array(UsageGroupSchema.extend({ observations: z.array(UsageObservationSchema) }).strict()).min(1),
  comparisons: z.array(z.object({ baseline: z.string().min(1), candidate: z.string().min(1) }).strict()),
}).strict()

export function buildTokenReport(input: unknown): {
  schemaVersion: "token-accounting-report/v1"; groups: TokenGroupAggregate[]; comparisons: TokenGroupComparison[]
} {
  const parsed = TokenAccountingInputSchema.parse(input)
  const groupIds = new Set<string>()
  const recordIds = new Set<string>()
  const groups = parsed.groups.map(({ observations, ...group }) => {
    if (groupIds.has(group.id)) throw new Error(`duplicate group id: ${group.id}`)
    groupIds.add(group.id)
    for (const observation of observations) {
      if (recordIds.has(observation.id)) throw new Error(`duplicate observation id: ${observation.id}`)
      recordIds.add(observation.id)
    }
    return aggregateTokenObservations(group, observations)
  }).sort((a, b) => a.group.id < b.group.id ? -1 : a.group.id > b.group.id ? 1 : 0)
  const byId = new Map(groups.map(group => [group.group.id, group]))
  const comparisons = parsed.comparisons.map(({ baseline, candidate }) => {
    const a = byId.get(baseline); const b = byId.get(candidate)
    if (!a || !b) throw new Error(`unknown comparison group: ${baseline} / ${candidate}`)
    return compareTokenGroups(a, b)
  }).sort((a, b) => {
    const left = JSON.stringify([a.baselineGroup, a.candidateGroup])
    const right = JSON.stringify([b.baselineGroup, b.candidateGroup])
    return left < right ? -1 : left > right ? 1 : 0
  })
  return { schemaVersion: "token-accounting-report/v1", groups, comparisons }
}
