import type { ModelFamilyPromotionProfile, PromotionReport } from "./promotion-policy";

export type ValidationPlanningState =
  | "candidate-regression-validation"
  | "static-baseline-preferred"
  | "needs-route-health-and-heldout-validation";

export type RecommendedArtifact = "ir-pgo-candidate" | "ir-profile-current-baseline" | "undecided";

export type AdoptionReadiness = "not-ready" | "experimental-candidate";

export type ValidationActionKind =
  | "route-probe"
  | "paired-heldout-validation"
  | "periodic-regression-validation"
  | "final-ir-regression-audit"
  | "output-schema-learning"
  | "model-family-profile-learning"
  | "expand-evidence"
  | "corpus-expansion";

export type ValidationAction = {
  kind: ValidationActionKind;
  priority: "high" | "medium" | "low";
  reason: string;
  sampleHint?: {
    minTasks?: number;
    contexts?: string[];
    systems?: string[];
  };
};

export type ValidationPlannerOptions = {
  minPairedCasesForMatureClaim?: number;
  minConfidenceForMatureClaim?: number;
  maxInfrastructureRateForRouteHealth?: number;
  generatedAt?: string;
};

export type ModelFamilyValidationPlan = {
  modelFamily: string;
  modelLabels: string[];
  sourceDecision: ModelFamilyPromotionProfile["decision"];
  planningState: ValidationPlanningState;
  recommendedArtifact: RecommendedArtifact;
  adoptionReadiness: AdoptionReadiness;
  confidence: number;
  riskScore: number;
  pairedCases: number;
  infrastructureRate: number;
  actions: ValidationAction[];
  caveats: string[];
};

export type ValidationPlanReport = {
  schemaVersion: "skill-ir-validation-plan/v1";
  generatedAt: string;
  sourceReport: {
    schemaVersion: PromotionReport["schemaVersion"];
    generatedAt: string;
  };
  options: Required<Omit<ValidationPlannerOptions, "generatedAt">>;
  modelFamilies: ModelFamilyValidationPlan[];
};

const DEFAULT_OPTIONS: Required<Omit<ValidationPlannerOptions, "generatedAt">> = {
  minPairedCasesForMatureClaim: 6,
  minConfidenceForMatureClaim: 0.65,
  maxInfrastructureRateForRouteHealth: 0.25,
};

function withDefaults(options: ValidationPlannerOptions = {}): Required<Omit<ValidationPlannerOptions, "generatedAt">> {
  return {
    ...DEFAULT_OPTIONS,
    ...options,
  };
}

function addUniqueAction(actions: ValidationAction[], action: ValidationAction): void {
  if (!actions.some((existing) => existing.kind === action.kind)) {
    actions.push(action);
  }
}

function readinessFor(profile: ModelFamilyPromotionProfile, options: Required<Omit<ValidationPlannerOptions, "generatedAt">>): AdoptionReadiness {
  if (
    profile.decision === "promote-ir-pgo" &&
    profile.confidence >= options.minConfidenceForMatureClaim &&
    profile.pairedCases >= options.minPairedCasesForMatureClaim &&
    profile.irPgoRegressions === 0
  ) {
    return "experimental-candidate";
  }

  return "not-ready";
}

export function planForModelFamily(
  profile: ModelFamilyPromotionProfile,
  rawOptions: ValidationPlannerOptions = {},
): ModelFamilyValidationPlan {
  const options = withDefaults(rawOptions);
  const actions: ValidationAction[] = [];
  const caveats = [
    "promotion signal is advisory and does not rewrite base corpus IR",
    "planner output is a dry-run experiment plan, not an automatic IR selector",
  ];
  let planningState: ValidationPlanningState = "needs-route-health-and-heldout-validation";
  let recommendedArtifact: RecommendedArtifact = "undecided";

  if (profile.decision === "promote-ir-pgo") {
    planningState = "candidate-regression-validation";
    recommendedArtifact = "ir-pgo-candidate";
    addUniqueAction(actions, {
      kind: "paired-heldout-validation",
      priority: "medium",
      reason: "promising final IR still needs paired held-out validation before stronger claims",
      sampleHint: {
        minTasks: Math.max(options.minPairedCasesForMatureClaim - profile.pairedCases, 2),
        contexts: ["compressed", "long"],
        systems: ["original", "ir-profile", "ir-pgo"],
      },
    });
    addUniqueAction(actions, {
      kind: "periodic-regression-validation",
      priority: "high",
      reason: "ir-pgo improved paired evidence, so regressions should be monitored before stronger claims",
      sampleHint: {
        minTasks: Math.max(options.minPairedCasesForMatureClaim, profile.pairedCases),
        contexts: ["compressed", "noisy"],
        systems: ["ir-profile", "ir-pgo"],
      },
    });
  } else if (profile.decision === "keep-ir-profile") {
    planningState = "static-baseline-preferred";
    recommendedArtifact = "ir-profile-current-baseline";
    addUniqueAction(actions, {
      kind: "final-ir-regression-audit",
      priority: "high",
      reason: "ir-pgo regressed against static ir-profile on paired cases",
      sampleHint: {
        minTasks: Math.max(profile.irPgoRegressions, 1),
        systems: ["ir-profile", "ir-pgo"],
      },
    });
    addUniqueAction(actions, {
      kind: "output-schema-learning",
      priority: "medium",
      reason: "final IR repair should learn structured output contracts instead of only generic rule checks",
    });
    addUniqueAction(actions, {
      kind: "model-family-profile-learning",
      priority: "medium",
      reason: "final IR behavior differs by model family and needs family-specific evidence before repair hints generalize",
    });
  }

  if (
    profile.decision === "hold-for-more-validation" ||
    profile.infrastructureRate > options.maxInfrastructureRateForRouteHealth
  ) {
    planningState = "needs-route-health-and-heldout-validation";
    recommendedArtifact = "undecided";
    if (profile.infrastructureRate > options.maxInfrastructureRateForRouteHealth) {
      addUniqueAction(actions, {
        kind: "route-probe",
        priority: "high",
        reason: `infrastructure rate ${profile.infrastructureRate.toFixed(2)} is above route-health threshold`,
      });
    }
  }

  if (
    profile.decision === "hold-for-more-validation" ||
    profile.pairedCases < options.minPairedCasesForMatureClaim ||
    profile.confidence < options.minConfidenceForMatureClaim
  ) {
    addUniqueAction(actions, {
      kind: "paired-heldout-validation",
      priority: profile.decision === "hold-for-more-validation" ? "high" : "medium",
      reason: "current evidence is not mature enough for stronger model-family claims",
      sampleHint: {
        minTasks: Math.max(options.minPairedCasesForMatureClaim - profile.pairedCases, 2),
        contexts: ["compressed", "long"],
        systems: ["original", "ir-profile", "ir-pgo"],
      },
    });
  }

  if (profile.confidence < options.minConfidenceForMatureClaim || profile.semanticRows < 12) {
    addUniqueAction(actions, {
      kind: "expand-evidence",
      priority: "medium",
      reason: "confidence or semantic row count is too low for mature claims",
    });
  }

  if (profile.pairedCases < options.minPairedCasesForMatureClaim || profile.modelLabels.length < 2) {
    addUniqueAction(actions, {
      kind: "corpus-expansion",
      priority: "low",
      reason: "broader skill shapes and additional stable routes are needed for stronger generalization evidence",
    });
  }

  return {
    modelFamily: profile.modelFamily,
    modelLabels: profile.modelLabels,
    sourceDecision: profile.decision,
    planningState,
    recommendedArtifact,
    adoptionReadiness: readinessFor(profile, options),
    confidence: profile.confidence,
    riskScore: profile.riskScore,
    pairedCases: profile.pairedCases,
    infrastructureRate: profile.infrastructureRate,
    actions,
    caveats,
  };
}

export function buildValidationPlan(
  promotionReport: PromotionReport,
  rawOptions: ValidationPlannerOptions = {},
): ValidationPlanReport {
  const options = withDefaults(rawOptions);
  return {
    schemaVersion: "skill-ir-validation-plan/v1",
    generatedAt: rawOptions.generatedAt ?? new Date().toISOString(),
    sourceReport: {
      schemaVersion: promotionReport.schemaVersion,
      generatedAt: promotionReport.generatedAt,
    },
    options,
    modelFamilies: promotionReport.modelFamilies.map((profile) => planForModelFamily(profile, options)),
  };
}
