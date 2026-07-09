import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { buildPromotionReport, type ModelRunInput, type PromotionPolicyOptions, type PromotionReport } from "./promotion-policy";
import type { ScoredAgentRunRow } from "./scoring";

export type RunSpec = {
  modelLabel: string;
  model: string;
  path: string;
  modelFamily?: string;
};

export type PromotionPolicyRunArgs = {
  runs: RunSpec[];
  options: PromotionPolicyOptions;
  out: string;
};

function parseNumberArg(name: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a finite number`);
  }
  return parsed;
}

export function parseRunSpec(value: string): RunSpec {
  const [modelLabel, model, path, modelFamily] = value.split(",").map((part) => part.trim());
  if (!modelLabel || !model || !path) {
    throw new Error("--run must use modelLabel,model,path[,modelFamily]");
  }

  return {
    modelLabel,
    model,
    path,
    modelFamily: modelFamily || undefined,
  };
}

export function parsePromotionPolicyArgs(argv: string[]): PromotionPolicyRunArgs {
  const args: PromotionPolicyRunArgs = {
    runs: [],
    options: {},
    out: "results/skill-ir/promotion-policy-report.json",
  };

  for (const arg of argv) {
    if (arg.startsWith("--run=")) {
      args.runs.push(parseRunSpec(arg.slice("--run=".length)));
    } else if (arg.startsWith("--out=")) {
      args.out = arg.slice("--out=".length);
    } else if (arg.startsWith("--min-paired-cases=")) {
      args.options.minPairedCases = parseNumberArg("--min-paired-cases", arg.slice("--min-paired-cases=".length));
    } else if (arg.startsWith("--max-infrastructure-rate=")) {
      args.options.maxInfrastructureRate = parseNumberArg(
        "--max-infrastructure-rate",
        arg.slice("--max-infrastructure-rate=".length),
      );
    } else if (arg.startsWith("--max-token-cost-increase-ratio=")) {
      args.options.maxTokenCostIncreaseRatio = parseNumberArg(
        "--max-token-cost-increase-ratio",
        arg.slice("--max-token-cost-increase-ratio=".length),
      );
    } else if (arg.startsWith("--max-latency-increase-ratio=")) {
      args.options.maxLatencyIncreaseRatio = parseNumberArg(
        "--max-latency-increase-ratio",
        arg.slice("--max-latency-increase-ratio=".length),
      );
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.runs.length === 0) {
    throw new Error("At least one --run=modelLabel,model,path[,modelFamily] argument is required");
  }

  return args;
}

async function readJsonl<T>(path: string): Promise<T[]> {
  const text = await Bun.file(path).text();
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as T);
}

export async function buildPromotionReportFromArgs(args: PromotionPolicyRunArgs): Promise<PromotionReport> {
  const inputs: ModelRunInput[] = [];

  for (const run of args.runs) {
    inputs.push({
      modelLabel: run.modelLabel,
      model: run.model,
      modelFamily: run.modelFamily,
      rows: await readJsonl<ScoredAgentRunRow>(run.path),
    });
  }

  const report = buildPromotionReport(inputs, args.options);
  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

if (import.meta.main) {
  const args = parsePromotionPolicyArgs(process.argv.slice(2));
  buildPromotionReportFromArgs(args)
    .then((report) => {
      console.log(
        JSON.stringify(
          {
            out: args.out,
            modelFamilies: report.modelFamilies.length,
            decisions: Object.fromEntries(
              report.modelFamilies.map((profile) => [profile.modelFamily, profile.decision]),
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
