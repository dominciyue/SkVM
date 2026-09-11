/** Pure planning and accounting helpers for the post-R12 class-proof queue. */

export const EXTENSION_TASK_ORDER = ["E1", "E2", "E3", "E4", "E5", "E6"] as const;
export type ExtensionTaskId = typeof EXTENSION_TASK_ORDER[number];
export type ExtensionTaskStatus = "pending" | "running" | "complete" | "not-applicable" | "blocked";

export type E1Gap = {
  gapId: string;
  memberIds: string[];
  occurrenceCount: number;
  classContract: boolean;
  actionable: boolean;
};

export type E1Decision = {
  status: "ready" | "not-applicable";
  repeatedContractInternalGaps: E1Gap[];
  reason: string;
};

/** The pre-registered repair rule needs the same gap in two members. */
export function deriveE1Decision(input: { commonGaps: E1Gap[] }): E1Decision {
  const repeatedContractInternalGaps = input.commonGaps
    .filter((gap) => gap.classContract && gap.actionable
      && gap.occurrenceCount >= 2 && new Set(gap.memberIds).size >= 2)
    .map((gap) => ({ ...gap, memberIds: [...new Set(gap.memberIds)].sort() }))
    .sort((left, right) => left.gapId.localeCompare(right.gapId));
  if (repeatedContractInternalGaps.length === 0) {
    return {
      status: "not-applicable",
      repeatedContractInternalGaps,
      reason: "no actionable contract-internal gap occurs across two independent members",
    };
  }
  return {
    status: "ready",
    repeatedContractInternalGaps,
    reason: "at least one actionable contract-internal gap occurs across two independent members",
  };
}

export type ExtensionMemberCandidate = {
  candidateId: string;
  memberId: string;
  repository: string;
  eligibility: "eligible" | "excluded" | "uncertain";
  applicableInputCount: number;
  bodyAvailable: boolean;
};

/** Select a bounded extension panel without looking at construction outcomes. */
export function selectExtensionMembers(input: {
  eligibleRows: ExtensionMemberCandidate[];
  excludedCandidateIds: string[];
  targetCount: number;
}): ExtensionMemberCandidate[] {
  const excluded = new Set(input.excludedCandidateIds);
  const selected: ExtensionMemberCandidate[] = [];
  const repositories = new Set<string>();
  const ordered = [...input.eligibleRows].sort((left, right) =>
    left.repository.toLowerCase().localeCompare(right.repository.toLowerCase())
    || left.candidateId.localeCompare(right.candidateId)
    || left.memberId.localeCompare(right.memberId));
  for (const row of ordered) {
    const repositoryKey = row.repository.toLowerCase();
    if (row.eligibility !== "eligible" || excluded.has(row.candidateId) || !row.bodyAvailable
      || row.applicableInputCount < 2 || repositories.has(repositoryKey)) continue;
    repositories.add(repositoryKey);
    selected.push({ ...row });
    if (selected.length >= Math.max(0, input.targetCount)) break;
  }
  return selected;
}

export const EXTENSION_E5_CAPABILITIES = ["$ref", "arrays", "form", "decimal", "header", "negative-witness"] as const;
export type ExtensionE5Capability = typeof EXTENSION_E5_CAPABILITIES[number];

export type ExtensionE5Case = {
  capability: string;
  format: "json" | "yaml";
  ordering: "canonical" | "reversed" | "combined";
  status: "pass" | "fail" | "not-applicable" | "unresolved";
};

export function deriveExtensionE5Summary(cases: ExtensionE5Case[]) {
  const registered = new Set<string>(EXTENSION_E5_CAPABILITIES);
  const observed = new Set<string>();
  const unique = new Set<string>();
  let duplicateCases = 0;
  for (const row of cases) {
    if (registered.has(row.capability)) observed.add(row.capability);
    const key = `${row.capability}\u0000${row.format}\u0000${row.ordering}`;
    if (unique.has(key)) duplicateCases += 1;
    unique.add(key);
  }
  return {
    registeredCapabilities: [...EXTENSION_E5_CAPABILITIES],
    cases: cases.length,
    passed: cases.filter((row) => row.status === "pass").length,
    failed: cases.filter((row) => row.status === "fail").length,
    notApplicable: cases.filter((row) => row.status === "not-applicable").length,
    unresolved: cases.filter((row) => row.status === "unresolved").length,
    duplicateCases,
    missingCapabilities: EXTENSION_E5_CAPABILITIES.filter((capability) => !observed.has(capability)),
  };
}

export function deriveNextExtensionTask(statuses: Record<ExtensionTaskId, ExtensionTaskStatus>): ExtensionTaskId | null {
  return EXTENSION_TASK_ORDER.find((task) => statuses[task] !== "complete" && statuses[task] !== "not-applicable") ?? null;
}
