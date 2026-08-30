import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { envManagerGradeV3 } from "../../bench/evaluators/env-manager-grade-v3";
import type { RunResult } from "../../core/types";
import type { InitialWorkdirManifestReference } from "../../core/workdir-manifest";
import { sha256Bytes } from "./source-fixture";

export const ENV_MANAGER_PRODUCT_EVALUATOR_AUTHORITY = {
  path: "src/bench/evaluators/env-manager-grade-v3.ts",
  sha256: "d5343795f00b9cc866111e5da049686d9b4f1566d810805ebb580a174b446382",
} as const;
const Checks = ["artifact-integrity", "environment-analysis", "artifact-consistency"] as const;

export async function checkVerifiedArtifact(options: {
  rootDir: string;
  workDir: string;
  initialWorkdirManifest: InitialWorkdirManifestReference;
}) {
  const evaluatorBytes = await readFile(join(resolve(options.rootDir), ENV_MANAGER_PRODUCT_EVALUATOR_AUTHORITY.path));
  if (sha256Bytes(evaluatorBytes) !== ENV_MANAGER_PRODUCT_EVALUATOR_AUTHORITY.sha256) {
    return { status: "fail" as const, detail: "env-manager v3 evaluator digest mismatch" };
  }
  const runResult: RunResult = {
    text: "",
    steps: [],
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    cost: 0,
    durationMs: 0,
    llmDurationMs: 0,
    workDir: options.workDir,
    initialWorkdirManifest: options.initialWorkdirManifest,
    runStatus: "ok",
    usageAvailable: true,
  };
  const results = [];
  for (const check of Checks) {
    results.push(await envManagerGradeV3.run({
      criterion: {
        method: "custom",
        id: `env-v3-${check}`,
        evaluatorId: "skill-ir-env-manager-v3",
        payload: {
          schemaVersion: "skill-ir-env-manager-eval/v3",
          check,
          interfacePath: "env-audit-interface.json",
        },
      },
      runResult,
    }));
  }
  const passed = results.filter((result) => result.pass && !result.infraError).length;
  return {
    status: passed === Checks.length ? "pass" as const : "fail" as const,
    detail: `env-manager-v3 public criteria ${passed}/${Checks.length}; evaluatorSha256=${ENV_MANAGER_PRODUCT_EVALUATOR_AUTHORITY.sha256}`,
  };
}
