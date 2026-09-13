import type { EvalResult } from "../core/types.ts"
import type { EvidenceCriterion } from "./types.ts"

/** Flatten framework evaluation results into stable optimizer evidence leaves. */
export function buildEvidenceCriteria(evalResults: EvalResult[]): EvidenceCriterion[] {
  interface RawLeaf {
    outerWeight: number
    innerWeight: number
    leaf: Omit<EvidenceCriterion, "weight">
  }
  const raw: RawLeaf[] = []

  for (const result of evalResults) {
    const outerWeight = result.criterion?.weight ?? 1
    const parentId = result.criterion?.id
    const parentName = result.criterion?.name
    const method = result.criterion?.method ?? "custom"
    if (result.checkpoints && result.checkpoints.length > 0) {
      const anyInnerWeighted = result.checkpoints.some((checkpoint) => checkpoint.weight != null)
      for (const checkpoint of result.checkpoints) {
        const innerWeight = checkpoint.weight ?? (anyInnerWeighted ? 0 : 1 / result.checkpoints.length)
        const passed = checkpoint.score >= 0.999
        raw.push({
          outerWeight,
          innerWeight,
          leaf: {
            id: parentId ? `${parentId}/${checkpoint.name}` : `${method}/${checkpoint.name}`,
            name: checkpoint.name,
            method,
            description: checkpoint.description,
            score: checkpoint.score,
            passed,
            details: passed ? undefined : checkpoint.reason,
          },
        })
      }
      continue
    }

    let description: string | undefined
    if (result.criterion?.method === "llm-judge") {
      description = typeof result.criterion.rubric === "string"
        ? result.criterion.rubric
        : JSON.stringify(result.criterion.rubric)
    } else if (result.criterion?.method === "script") {
      description = `script: ${result.criterion.command}`
    } else if (result.criterion?.method === "file-check") {
      description = `file-check ${result.criterion.mode}: ${result.criterion.path}`
    }
    raw.push({
      outerWeight,
      innerWeight: 1,
      leaf: {
        id: parentId ?? `${method}/${result.criterion?.name ?? "criterion"}`,
        name: parentName,
        method,
        description,
        score: result.score,
        passed: result.pass,
        details: result.pass && result.score >= 0.999 ? undefined : result.details,
        infraError: result.infraError,
      },
    })
  }

  const totalRaw = raw.reduce((sum, item) => sum + item.outerWeight * item.innerWeight, 0)
  if (totalRaw <= 0) return []
  return raw.map((item) => ({
    ...item.leaf,
    weight: (item.outerWeight * item.innerWeight) / totalRaw,
  }))
}
