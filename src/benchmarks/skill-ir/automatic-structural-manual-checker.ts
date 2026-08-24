import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { InitialWorkdirManifestReferenceSchema } from "../../core/workdir-manifest";
import { EvalCriterionSchema, type RunResult } from "../../core/types";
import { customEvaluators } from "../../framework/types";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

const input = z.object({
  evaluatorModule: z.string().min(1),
  eval: z.array(EvalCriterionSchema),
  runs: z.array(z.object({
    id: z.string().min(1),
    workDir: z.string().min(1),
    initialWorkdirManifest: InitialWorkdirManifestReferenceSchema,
  }).strict()).min(1),
}).strict().parse(JSON.parse(await readFile(argument("--input"), "utf8")));

await import(pathToFileURL(input.evaluatorModule).href);

const allResults = new Map<string, Record<string, { status: "pass" | "fail" | "infrastructure-failure"; details?: string }>>();
for (const run of input.runs) {
  const runResult: RunResult = {
    text: "structural parity shadow",
    steps: [],
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    cost: 0,
    durationMs: 0,
    llmDurationMs: 0,
    workDir: run.workDir,
    initialWorkdirManifest: run.initialWorkdirManifest,
    runStatus: "ok",
    usageAvailable: true,
  };
  const results = new Map<string, { status: "pass" | "fail" | "infrastructure-failure"; details?: string }>();
  for (const criterion of input.eval) {
    if (criterion.method !== "custom") continue;
    if (!criterion.id) throw new Error("manual criterion id is required for structural parity");
    const evaluator = customEvaluators.get(criterion.evaluatorId);
    if (!evaluator) throw new Error(`manual evaluator is not registered: ${criterion.evaluatorId}`);
    const evaluated = await evaluator.run({ criterion, runResult });
    results.set(criterion.id, {
      status: evaluated.infraError ? "infrastructure-failure" : evaluated.pass ? "pass" : "fail",
      ...(evaluated.details ? { details: evaluated.details } : {}),
    });
  }
  allResults.set(run.id, Object.fromEntries(results));
}

console.log(JSON.stringify(Object.fromEntries(allResults)));
