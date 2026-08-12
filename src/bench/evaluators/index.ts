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
import "./env-manager-grade-v2.ts"
import "./env-manager-grade-v3.ts"
import "./law-to-markdown-grade.ts"
import "./law-to-markdown-grade-v3.ts"
import "./experimental-design-grade.ts"
import "./experimental-design-grade-v2.ts"
import "./experimental-design-skill-unique-grade.ts"
import "./api-tester-grade.ts"
import "./zh-code-reviewer-grade.ts"
import "./zh-readme-grade.ts"
import "./i18n-helper-grade-v2.ts"
import "./i18n-helper-contribution-grade.ts"
import "./i18n-helper-contribution-v2-grade.ts"
// import "./docker-grader.ts"   // example of future addition
// import "./js-grader.ts"       // example of future addition

export const customEvaluatorSourcePaths = new Map<string, string>([
  ["python-grade", "src/bench/evaluators/python-grade.ts"],
  ["junit-grade", "src/bench/evaluators/junit-grade.ts"],
  ["skill-ir-env-manager", "src/bench/evaluators/env-manager-grade.ts"],
  ["skill-ir-env-manager-v2", "src/bench/evaluators/env-manager-grade-v2.ts"],
  ["skill-ir-env-manager-v3", "src/bench/evaluators/env-manager-grade-v3.ts"],
  ["skill-ir-law-to-markdown", "src/bench/evaluators/law-to-markdown-grade.ts"],
  ["skill-ir-law-to-markdown-v3", "src/bench/evaluators/law-to-markdown-grade-v3.ts"],
  ["skill-ir-experimental-design", "src/bench/evaluators/experimental-design-grade.ts"],
  ["skill-ir-experimental-design-v2", "src/bench/evaluators/experimental-design-grade-v2.ts"],
  ["skill-ir-experimental-design-skill-unique", "src/bench/evaluators/experimental-design-skill-unique-grade.ts"],
  ["skill-ir-api-tester", "src/bench/evaluators/api-tester-grade.ts"],
  ["skill-ir-zh-code-reviewer", "src/bench/evaluators/zh-code-reviewer-grade.ts"],
  ["skill-ir-zh-readme", "src/bench/evaluators/zh-readme-grade.ts"],
  ["skill-ir-i18n-helper-v2", "src/bench/evaluators/i18n-helper-grade-v2.ts"],
  ["skill-ir-i18n-helper-contribution-v1", "src/bench/evaluators/i18n-helper-contribution-grade.ts"],
  ["skill-ir-i18n-helper-contribution-v2", "src/bench/evaluators/i18n-helper-contribution-v2-grade.ts"],
])

export const customEvaluatorSourceDigests = new Map<string, string>([
  ["python-grade", "5a9063435c993e7211d1b84e5df398fc353a8d960586a01b7692929494622fb6"],
  ["junit-grade", "5f350a96b9060c5bdaced4f49abf3f003883dfc0b31358e9ddd5227bdab64aef"],
  ["skill-ir-env-manager", "c80d0b5637b2d9c480cbba8a816d042b5afd0e931fa06690d2fa3f1a950811a7"],
  ["skill-ir-env-manager-v2", "e3968dac7748f3c2010cff6f0d992d631e0009d8af2bcdba005c611457518cae"],
  ["skill-ir-env-manager-v3", "d5343795f00b9cc866111e5da049686d9b4f1566d810805ebb580a174b446382"],
  ["skill-ir-law-to-markdown", "051d467ae8292dbc917316ce7c495915fe36377b529c22553cff3dd637d2d180"],
  ["skill-ir-law-to-markdown-v3", "8c80e22f9efd411fc399dc76aaf0cf4bf0e02e148a4a0421fba26e76ce8a6cbb"],
  ["skill-ir-experimental-design", "6030a23048d1f12d59d72790635ed0c5ccf5b40d4cace8171eb0a7763ed2cd19"],
  ["skill-ir-experimental-design-v2", "6dda3cbc9e369fa6b1ab1dbe974c86baa3cad967bd707e1d5668eb1ea2d51960"],
  ["skill-ir-experimental-design-skill-unique", "d74e81e90925a1dd62104be10dd8cb536f13f7ce8e4a10a3e063e0980fea1e4f"],
  ["skill-ir-api-tester", "8c32311030502fccdf8d56e70bb946d070ffee47c560604ad846b974272bba22"],
  ["skill-ir-zh-code-reviewer", "0c3bc91fd611317741d0a1700e57bd938f2e207f2adac5442e22d72e297cc3d2"],
  ["skill-ir-zh-readme", "a9da3bab92bbb8f24f2a0b8292e66c5c2122bddded4996c350d4bbdc061a8a45"],
  ["skill-ir-i18n-helper-v2", "5adb4583cb33eb9429d62b23b0187cb1a061c263f15164d284f5c13732e55e91"],
  ["skill-ir-i18n-helper-contribution-v1", "d439fbda85932240e4b78a0886bf116e06a6583e2a50608e301c9efefe09d536"],
  ["skill-ir-i18n-helper-contribution-v2", "f868a925abfe96bc18cacd85947becbf60df059cb7a4fdb654440f4a8003a264"],
])

export const customEvaluatorImplementations = new Map<string, CustomEvaluator>(
  [...customEvaluatorSourcePaths.keys()].flatMap((id) => {
    const evaluator = customEvaluators.get(id)
    return evaluator ? [[id, evaluator] as const] : []
  }),
)

// --- re-exports so loaders import from one place ---
export { hydrateEvalPayloads, persistEvalPayloads } from "../../framework/payload.ts"
