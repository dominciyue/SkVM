import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { PromotionReport } from "./promotion-policy";
import { buildValidationPlan, type ValidationPlanReport, type ValidationPlannerOptions } from "./validation-plan";

export type ValidationPlanRunArgs = {
  promotionReport: string;
  out: string;
  options: ValidationPlannerOptions;
};

function parseNumberArg(name: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a finite number`);
  }
  return parsed;
}

export function parseValidationPlanArgs(argv: string[]): ValidationPlanRunArgs {
  const args: ValidationPlanRunArgs = {
    promotionReport: "",
    out: "results/skill-ir/validation-plan.json",
    options: {},
  };

  for (const arg of argv) {
    if (arg.startsWith("--promotion-report=")) {
      args.promotionReport = arg.slice("--promotion-report=".length);
    } else if (arg.startsWith("--out=")) {
      args.out = arg.slice("--out=".length);
    } else if (arg.startsWith("--min-paired-cases=")) {
      args.options.minPairedCasesForMatureClaim = parseNumberArg(
        "--min-paired-cases",
        arg.slice("--min-paired-cases=".length),
      );
    } else if (arg.startsWith("--min-confidence=")) {
      args.options.minConfidenceForMatureClaim = parseNumberArg(
        "--min-confidence",
        arg.slice("--min-confidence=".length),
      );
    } else if (arg.startsWith("--max-infrastructure-rate=")) {
      args.options.maxInfrastructureRateForRouteHealth = parseNumberArg(
        "--max-infrastructure-rate",
        arg.slice("--max-infrastructure-rate=".length),
      );
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.promotionReport) {
    throw new Error("--promotion-report is required");
  }

  return args;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await Bun.file(path).text()) as T;
}

export async function buildValidationPlanFromArgs(args: ValidationPlanRunArgs): Promise<ValidationPlanReport> {
  const promotionReport = await readJson<PromotionReport>(args.promotionReport);
  const plan = buildValidationPlan(promotionReport, args.options);
  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  return plan;
}

if (import.meta.main) {
  const args = parseValidationPlanArgs(process.argv.slice(2));
  buildValidationPlanFromArgs(args)
    .then((plan) => {
      console.log(
        JSON.stringify(
          {
            out: args.out,
            modelFamilies: plan.modelFamilies.length,
            planningStates: Object.fromEntries(
              plan.modelFamilies.map((entry) => [entry.modelFamily, entry.planningState]),
            ),
          },
          null,
          2,
        ),
      );
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
