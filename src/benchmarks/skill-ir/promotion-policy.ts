import type { ExperimentSystem } from "./matrix";
import type { ScoredAgentRunRow } from "./scoring";

export type PromotionDecision = "promote-ir-pgo" | "keep-ir-profile" | "hold-for-more-validation";

export type PromotionPolicyOptions = {
  baselineSystem?: ExperimentSystem;
  candidateSystem?: ExperimentSystem;
  minPairedCases?: number;
  maxInfrastructureRate?: number;
  maxTokenCostIncreaseRatio?: number;
  maxLatencyIncreaseRatio?: number;
};

export type ModelRunInput = {
  modelLabel: string;
  model: string;
  modelFamily?: string;
  rows: ScoredAgentRunRow[];
};

export type SystemStats = {
  system: ExperimentSystem;
  rows: number;
  semanticRows: number;
  successes: number;
  successRate: number;
  ruleViolations: number;
  meanLatencyMs: number;
  meanTokenCost: number;
};

export type ModelFamilyPromotionProfile = {
  modelFamily: string;
  modelLabels: string[];
  baselineSystem: ExperimentSystem;
  candidateSystem: ExperimentSystem;
  bestSystem: ExperimentSystem;
  decision: PromotionDecision;
  confidence: number;
  riskScore: number;
  totalRows: number;
  infraRows: number;
  infrastructureRate: number;
  semanticRows: number;
  pairedCases: number;
  pairedDelta: number;
  irPgoGains: number;
  irPgoRegressions: number;
  baselineSuccessRate: number;
  candidateSuccessRate: number;
  tokenCostIncreaseRatio: number;
  latencyIncreaseRatio: number;
  systemStats: SystemStats[];
  reasons: string[];
};

export type PromotionReport = {
  schemaVersion: "skill-ir-promotion/v1";
  generatedAt: string;
  options: Required<PromotionPolicyOptions>;
  modelFamilies: ModelFamilyPromotionProfile[];
};

type SummarizeModelFamilyInput = {
  modelFamily: string;
  modelLabels: string[];
  rows: ScoredAgentRunRow[];
  options?: PromotionPolicyOptions;
};

const DEFAULT_OPTIONS: Required<PromotionPolicyOptions> = {
  baselineSystem: "ir-profile",
  candidateSystem: "ir-pgo",
  minPairedCases: 4,
  maxInfrastructureRate: 0.25,
  maxTokenCostIncreaseRatio: 0.5,
  maxLatencyIncreaseRatio: 0.5,
};

function withDefaults(options: PromotionPolicyOptions = {}): Required<PromotionPolicyOptions> {
  return {
    ...DEFAULT_OPTIONS,
    ...options,
  };
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function pairingKey(row: ScoredAgentRunRow): string {
  return JSON.stringify([
    row.caseId,
    row.model ?? null,
    row.adapter ?? null,
    row.adapterVersion ?? null,
    row.panelConfigId ?? null,
    row.runIndex ?? null,
  ]);
}

function semanticRows(rows: ScoredAgentRunRow[]): ScoredAgentRunRow[] {
  return rows.filter((row) => row.failureType !== "infrastructure");
}

function systemStats(system: ExperimentSystem, rows: ScoredAgentRunRow[]): SystemStats {
  const systemRows = rows.filter((row) => row.system === system);
  const semantic = semanticRows(systemRows);
  const successes = semantic.filter((row) => row.success).length;

  return {
    system,
    rows: systemRows.length,
    semanticRows: semantic.length,
    successes,
    successRate: semantic.length === 0 ? 0 : round(successes / semantic.length),
    ruleViolations: semantic.reduce((sum, row) => sum + row.ruleViolations, 0),
    meanLatencyMs: round(mean(semantic.map((row) => row.latencyMs)), 2),
    meanTokenCost: round(mean(semantic.map((row) => row.tokenCost ?? 0)), 2),
  };
}

function ratioIncrease(candidate: number, baseline: number): number {
  if (baseline <= 0) {
    return candidate > 0 ? 1 : 0;
  }
  return round((candidate - baseline) / baseline);
}

function distinctSystems(rows: ScoredAgentRunRow[]): ExperimentSystem[] {
  return [...new Set(rows.map((row) => row.system))].sort();
}

export function inferModelFamily(model: string): string {
  const normalized = model.toLowerCase();
  if (normalized.includes("gpt") || normalized.includes("o3") || normalized.includes("o4")) {
    return "gpt";
  }
  if (normalized.includes("gemini")) {
    return "gemini";
  }
  if (normalized.includes("claude")) {
    return "claude";
  }
  if (normalized.includes("deepseek")) {
    return "deepseek";
  }
  if (normalized.includes("qwen")) {
    return "qwen";
  }
  if (normalized.includes("grok")) {
    return "grok";
  }
  const leafModel = normalized.split("/").filter(Boolean).at(-1) ?? normalized;
  return leafModel.split(/[:_-]/).find(Boolean) ?? "unknown";
}

export function summarizeModelFamily(input: SummarizeModelFamilyInput): ModelFamilyPromotionProfile {
  const options = withDefaults(input.options);
  const rows = input.rows;
  const infraRows = rows.filter((row) => row.failureType === "infrastructure").length;
  const semantic = semanticRows(rows);
  const infrastructureRate = rows.length === 0 ? 0 : round(infraRows / rows.length);
  const stats = distinctSystems(rows).map((system) => systemStats(system, rows));
  const baselineStats = systemStats(options.baselineSystem, rows);
  const candidateStats = systemStats(options.candidateSystem, rows);
  const rowsByCase = new Map<string, Map<ExperimentSystem, ScoredAgentRunRow>>();

  for (const row of semantic) {
    const key = pairingKey(row);
    const bucket = rowsByCase.get(key) ?? new Map<ExperimentSystem, ScoredAgentRunRow>();
    bucket.set(row.system, row);
    rowsByCase.set(key, bucket);
  }

  let pairedCases = 0;
  let pairedDeltaSum = 0;
  let gains = 0;
  let regressions = 0;

  for (const bucket of rowsByCase.values()) {
    const baseline = bucket.get(options.baselineSystem);
    const candidate = bucket.get(options.candidateSystem);
    if (!baseline || !candidate) {
      continue;
    }

    pairedCases += 1;
    const delta = Number(candidate.success) - Number(baseline.success);
    pairedDeltaSum += delta;
    if (delta > 0) {
      gains += 1;
    } else if (delta < 0) {
      regressions += 1;
    }
  }

  const pairedDelta = pairedCases === 0 ? 0 : round(pairedDeltaSum / pairedCases);
  const tokenCostIncreaseRatio = ratioIncrease(candidateStats.meanTokenCost, baselineStats.meanTokenCost);
  const latencyIncreaseRatio = ratioIncrease(candidateStats.meanLatencyMs, baselineStats.meanLatencyMs);
  const reasons: string[] = [];

  if (infrastructureRate > options.maxInfrastructureRate) {
    reasons.push(`infrastructure rate ${infrastructureRate.toFixed(2)} exceeds ${options.maxInfrastructureRate.toFixed(2)}`);
  }
  if (pairedCases < options.minPairedCases) {
    reasons.push(`paired cases ${pairedCases} below minimum ${options.minPairedCases}`);
  }
  if (regressions > 0) {
    reasons.push(`${options.candidateSystem} regressed on ${regressions} paired case(s)`);
  }
  if (candidateStats.successRate < baselineStats.successRate) {
    reasons.push(`${options.candidateSystem} success rate ${candidateStats.successRate.toFixed(4)} below ${options.baselineSystem} ${baselineStats.successRate.toFixed(4)}`);
  }
  if (tokenCostIncreaseRatio > options.maxTokenCostIncreaseRatio) {
    reasons.push(`token cost increase ${tokenCostIncreaseRatio.toFixed(2)} exceeds ${options.maxTokenCostIncreaseRatio.toFixed(2)}`);
  }
  if (latencyIncreaseRatio > options.maxLatencyIncreaseRatio) {
    reasons.push(`latency increase ${latencyIncreaseRatio.toFixed(2)} exceeds ${options.maxLatencyIncreaseRatio.toFixed(2)}`);
  }

  let decision: PromotionDecision = "hold-for-more-validation";
  if (infrastructureRate <= options.maxInfrastructureRate && pairedCases >= options.minPairedCases) {
    if (candidateStats.successRate > baselineStats.successRate && regressions === 0 && tokenCostIncreaseRatio <= options.maxTokenCostIncreaseRatio && latencyIncreaseRatio <= options.maxLatencyIncreaseRatio) {
      decision = "promote-ir-pgo";
      reasons.push(`${options.candidateSystem} improves held-out paired success without regressions`);
    } else if (candidateStats.successRate < baselineStats.successRate || regressions > 0) {
      decision = "keep-ir-profile";
    }
  }

  const bestSystem =
    candidateStats.successRate > baselineStats.successRate
      ? options.candidateSystem
      : options.baselineSystem;
  const regressionRate = pairedCases === 0 ? 0 : regressions / pairedCases;
  const supportScore = Math.min(pairedCases / Math.max(options.minPairedCases, 1), 1) * 0.25;
  const qualityScore = clamp01(Math.abs(candidateStats.successRate - baselineStats.successRate)) * 0.3;
  const diversityScore = Math.min(new Set(input.modelLabels).size / 2, 1) * 0.1;
  const riskScore = clamp01(
    infrastructureRate * 0.3 +
      regressionRate * 0.7 +
      Math.max(0, tokenCostIncreaseRatio) * 0.15 +
      Math.max(0, latencyIncreaseRatio) * 0.15,
  );
  const confidence = clamp01(0.35 + supportScore + qualityScore + diversityScore - riskScore * 0.35);

  return {
    modelFamily: input.modelFamily,
    modelLabels: [...new Set(input.modelLabels)].sort(),
    baselineSystem: options.baselineSystem,
    candidateSystem: options.candidateSystem,
    bestSystem,
    decision,
    confidence: round(confidence),
    riskScore: round(riskScore),
    totalRows: rows.length,
    infraRows,
    infrastructureRate,
    semanticRows: semantic.length,
    pairedCases,
    pairedDelta,
    irPgoGains: gains,
    irPgoRegressions: regressions,
    baselineSuccessRate: baselineStats.successRate,
    candidateSuccessRate: candidateStats.successRate,
    tokenCostIncreaseRatio,
    latencyIncreaseRatio,
    systemStats: stats,
    reasons,
  };
}

export function buildPromotionReport(
  inputs: ModelRunInput[],
  options: PromotionPolicyOptions = {},
  generatedAt = new Date().toISOString(),
): PromotionReport {
  const groups = new Map<string, { labels: Set<string>; rows: ScoredAgentRunRow[] }>();

  for (const input of inputs) {
    const family = input.modelFamily ?? inferModelFamily(input.model);
    const group = groups.get(family) ?? { labels: new Set<string>(), rows: [] };
    group.labels.add(input.modelLabel);
    group.rows.push(...input.rows);
    groups.set(family, group);
  }

  return {
    schemaVersion: "skill-ir-promotion/v1",
    generatedAt,
    options: withDefaults(options),
    modelFamilies: [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([modelFamily, group]) =>
        summarizeModelFamily({
          modelFamily,
          modelLabels: [...group.labels],
          rows: group.rows,
          options,
        }),
      ),
  };
}
