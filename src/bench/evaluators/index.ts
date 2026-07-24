/**
 * Evaluator barrel.
 *
 * Adding a new custom evaluator is two edits:
 *
 *   1. Create `src/bench/evaluators/<new-evaluator>.ts` whose module top
 *      calls `registerCustomEvaluator("<id>", <evaluator>)`.
 *   2. Add `import "./<new-evaluator>.ts"` below.
 *
 * Nothing else changes — the loaders in `src/bench/loader.ts`,
 * `src/bench/custom-plan.ts`, and `src/jit-optimize/task-source.ts` all
 * import `hydrateEvalPayloads` / `persistEvalPayloads` from THIS barrel,
 * which transitively loads every evaluator listed here before any task is
 * loaded. Registration is structurally unforgettable: a new evaluator is
 * registered iff its side-effect import appears below, and the compile step
 * will flag a typo immediately.
 */

import { customEvaluators, type CustomEvaluator } from "../../framework/types.ts"

// --- registered evaluators (one side-effect import per evaluator) ---
import "./python-grade.ts"
import "./junit-grade.ts"
import "./env-manager-grade.ts"
import "./law-to-markdown-grade.ts"
import "./experimental-design-grade.ts"
// import "./docker-grader.ts"   // example of future addition
// import "./js-grader.ts"       // example of future addition

export const customEvaluatorSourcePaths = new Map<string, string>([
  ["python-grade", "src/bench/evaluators/python-grade.ts"],
  ["junit-grade", "src/bench/evaluators/junit-grade.ts"],
  ["skill-ir-env-manager", "src/bench/evaluators/env-manager-grade.ts"],
  ["skill-ir-law-to-markdown", "src/bench/evaluators/law-to-markdown-grade.ts"],
  ["skill-ir-experimental-design", "src/bench/evaluators/experimental-design-grade.ts"],
])

export const customEvaluatorSourceDigests = new Map<string, string>([
  ["python-grade", "5a9063435c993e7211d1b84e5df398fc353a8d960586a01b7692929494622fb6"],
  ["junit-grade", "5f350a96b9060c5bdaced4f49abf3f003883dfc0b31358e9ddd5227bdab64aef"],
  ["skill-ir-env-manager", "c80d0b5637b2d9c480cbba8a816d042b5afd0e931fa06690d2fa3f1a950811a7"],
  ["skill-ir-law-to-markdown", "051d467ae8292dbc917316ce7c495915fe36377b529c22553cff3dd637d2d180"],
  ["skill-ir-experimental-design", "6030a23048d1f12d59d72790635ed0c5ccf5b40d4cace8171eb0a7763ed2cd19"],
])

export const customEvaluatorImplementations = new Map<string, CustomEvaluator>(
  [...customEvaluatorSourcePaths.keys()].flatMap((id) => {
    const evaluator = customEvaluators.get(id)
    return evaluator ? [[id, evaluator] as const] : []
  }),
)

// --- re-exports so loaders import from one place ---
export { hydrateEvalPayloads, persistEvalPayloads } from "../../framework/payload.ts"
