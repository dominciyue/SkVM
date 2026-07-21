import { PublicValidationCodeSchema, type PublicValidationCode } from "./public-contract";

export const ENV_MANAGER_CRITERION_IDS = [
  "env-protected-files",
  "env-no-secret-leak",
  "env-required-artifacts",
  "env-classification",
  "env-example-safety",
  "env-schema-rules",
] as const;

type EnvManagerCriterionId = (typeof ENV_MANAGER_CRITERION_IDS)[number];
type RuntimeCoverage = "equivalent" | "partial" | "none";
type ObservedStatus =
  | "not-observed-failing"
  | "runtime-and-scorer-failed"
  | "runtime-failed-without-scorer-failure"
  | "scorer-failed-without-runtime-code";

type CoverageDefinition = {
  criterionId: EnvManagerCriterionId;
  scorerSuccessSurface: string;
  runtimeCoverage: RuntimeCoverage;
  publicEvidenceSources: string[];
  validatorChecks: string[];
  runtimeCodes: PublicValidationCode[];
  deterministicRepairOperations: string[];
  gaps: string[];
};

const COVERAGE_DEFINITIONS: CoverageDefinition[] = [
  {
    criterionId: "env-protected-files",
    scorerSuccessSurface: "declared-input-byte-preservation",
    runtimeCoverage: "equivalent",
    publicEvidenceSources: ["preflight-protected-file-digests"],
    validatorChecks: ["protected-file-digest-equality"],
    runtimeCodes: ["PROTECTED_FILE_MUTATED"],
    deterministicRepairOperations: [],
    gaps: [],
  },
  {
    criterionId: "env-no-secret-leak",
    scorerSuccessSurface: "generated-output-and-path-secret-absence",
    runtimeCoverage: "partial",
    publicEvidenceSources: ["public-synthetic-prefix", "generated-output-inventory"],
    validatorChecks: ["generated-text-prefix-scan"],
    runtimeCodes: ["SECRET_PATTERN_PRESENT"],
    deterministicRepairOperations: ["rewrite-redacted-example"],
    gaps: ["exact-secret-and-filesystem-channel-scan-remains-scorer-only"],
  },
  {
    criterionId: "env-required-artifacts",
    scorerSuccessSurface: "required-files-exist-and-json-files-parse",
    runtimeCoverage: "equivalent",
    publicEvidenceSources: ["public-generated-output-contract"],
    validatorChecks: ["required-file-presence", "required-json-parse"],
    runtimeCodes: ["MISSING_FILE", "INVALID_JSON"],
    deterministicRepairOperations: ["create-required-output"],
    gaps: [],
  },
  {
    criterionId: "env-classification",
    scorerSuccessSurface: "five-classification-fields-match-canonical-sets",
    runtimeCoverage: "partial",
    publicEvidenceSources: ["public-runtime-evidence-graph", "public-output-shape-contract"],
    validatorChecks: [
      "report-object-shape",
      "report-array-string-items",
      "classification-set-equality",
      "source-qualified-finding-format",
    ],
    runtimeCodes: [
      "MISSING_REPORT_FIELD",
      "EXTRA_REPORT_FIELD",
      "INVALID_REPORT_FIELD_TYPE",
      "MISSING_CLASSIFICATION_ENTRY",
      "UNSUPPORTED_CLASSIFICATION_ENTRY",
      "MISSING_SOURCE_QUALIFIED_FINDING",
      "INVALID_SOURCE_QUALIFIED_FINDING",
    ],
    deterministicRepairOperations: ["rewrite-canonical-report"],
    gaps: ["unsupported-or-ambiguous-source-evidence-remains-unconfirmed"],
  },
  {
    criterionId: "env-example-safety",
    scorerSuccessSurface: "variable-inventory-is-complete-and-values-are-redacted",
    runtimeCoverage: "partial",
    publicEvidenceSources: ["public-variable-inventory", "public-synthetic-prefix"],
    validatorChecks: ["example-name-coverage", "example-prefix-redaction"],
    runtimeCodes: ["MISSING_EXAMPLE_ENTRY", "UNSAFE_EXAMPLE_ENTRY", "SECRET_PATTERN_PRESENT"],
    deterministicRepairOperations: ["rewrite-redacted-example"],
    gaps: ["exact-forbidden-material-scan-remains-scorer-only"],
  },
  {
    criterionId: "env-schema-rules",
    scorerSuccessSurface: "schema-contains-all-required-variable-rule-subsets",
    runtimeCoverage: "partial",
    publicEvidenceSources: ["public-runtime-evidence-graph", "versioned-public-rule-policy"],
    validatorChecks: ["schema-root-shape", "confirmed-rule-subset"],
    runtimeCodes: [
      "MISSING_SCHEMA_RULE",
      "UNSUPPORTED_SCHEMA_RULE",
      "INVALID_SCHEMA_RULE_TYPE",
    ],
    deterministicRepairOperations: ["upsert-confirmed-schema-rules"],
    gaps: ["public-rule-lowering-incomplete"],
  },
];

export type ContractCoverageAudit = {
  schemaVersion: "skill-ir-contract-coverage-audit/v1";
  catalog: "executable-contract-repair-artifact/v4";
  criteria: Array<Omit<CoverageDefinition, "runtimeCodes"> & {
    observedStatus: ObservedStatus;
  }>;
  observedRuntimeCodes: PublicValidationCode[];
  unknownRuntimeCodes: string[];
  claimBoundary: string;
};

export type BuildContractCoverageAuditOptions = {
  criterionIds: readonly string[];
  observedRuntimeCodes: readonly string[];
  observedFailedCriteria: readonly string[];
};

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function requireExactCriterionRegistry(criterionIds: readonly string[]): void {
  const actual = sortedUnique(criterionIds);
  const registered = [...ENV_MANAGER_CRITERION_IDS].sort();
  if (JSON.stringify(actual) !== JSON.stringify(registered)) {
    throw new Error(
      `env-manager criterion registry drift: registered=${registered.join(",")} actual=${actual.join(",")}`,
    );
  }
}

export function buildEnvManagerContractCoverageAudit(
  options: BuildContractCoverageAuditOptions,
): ContractCoverageAudit {
  requireExactCriterionRegistry(options.criterionIds);

  const observedCodes: PublicValidationCode[] = [];
  const unknownCodes: string[] = [];
  for (const code of sortedUnique(options.observedRuntimeCodes)) {
    const parsed = PublicValidationCodeSchema.safeParse(code);
    if (parsed.success) observedCodes.push(parsed.data);
    else unknownCodes.push(code);
  }
  if (unknownCodes.length > 0) {
    throw new Error(`unknown runtime validation code: ${unknownCodes.join(",")}`);
  }

  const failedCriteria = new Set(options.observedFailedCriteria);
  for (const criterionId of failedCriteria) {
    if (!ENV_MANAGER_CRITERION_IDS.includes(criterionId as EnvManagerCriterionId)) {
      throw new Error(`unknown failed criterion: ${criterionId}`);
    }
  }
  const runtimeCodeSet = new Set<PublicValidationCode>(observedCodes);

  const criteria = COVERAGE_DEFINITIONS
    .map(({ runtimeCodes, ...definition }) => {
      const runtimeFailed = runtimeCodes.some((code) => runtimeCodeSet.has(code));
      const scorerFailed = failedCriteria.has(definition.criterionId);
      const observedStatus: ObservedStatus = runtimeFailed
        ? scorerFailed
          ? "runtime-and-scorer-failed"
          : "runtime-failed-without-scorer-failure"
        : scorerFailed
          ? "scorer-failed-without-runtime-code"
          : "not-observed-failing";
      return { ...definition, observedStatus };
    })
    .sort((left, right) => left.criterionId.localeCompare(right.criterionId));

  return {
    schemaVersion: "skill-ir-contract-coverage-audit/v1",
    catalog: "executable-contract-repair-artifact/v4",
    criteria,
    observedRuntimeCodes: observedCodes,
    unknownRuntimeCodes: [],
    claimBoundary: "Coverage accounting is not a scorer and does not establish task success.",
  };
}
