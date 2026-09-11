import { CLASS_OBLIGATION_VOCABULARY, OBLIGATION_LEDGER_CLASS_ID } from "./skill-family-obligation-ledger";

export const MINIMUM_DELIVERY_CLASS_ID = OBLIGATION_LEDGER_CLASS_ID;
export const MINIMUM_DELIVERY_CONTRACT_SCHEMA = "skill-family-minimum-delivery-contract/v1" as const;
export const MINIMUM_DELIVERY_PANEL_SCHEMA = "skill-family-minimum-delivery-panel/v1" as const;
export const DISPOSITIONS = ["constructed", "rejected-with-reason", "unresolved", "outside-class", "source-blocked"] as const;
const COMMIT = /^[0-9a-f]{40}$/;
const CRITERIA = ["public-api-contract-input", "explicit-coverage-requirements", "offline-request-or-test-artifacts", "independent-check-possible"] as const;

function fail(message: string): never { throw new Error(`invalid minimum-delivery contract: ${message}`); }

export function validateMinimumDeliveryContract(input: unknown) {
  if (!input || typeof input !== "object") fail("must be an object");
  const c = input as Record<string, any>;
  if (c.schemaVersion !== MINIMUM_DELIVERY_CONTRACT_SCHEMA) fail("schemaVersion");
  if (c.identity !== "skill-family-minimum-delivery-contract-001") fail("identity");
  if (c.classId !== MINIMUM_DELIVERY_CLASS_ID || c.planRevision !== 2) fail("classId/planRevision");
  if (c.status !== "candidate-pre-freeze" && c.status !== "frozen") fail("status");
  if (!Array.isArray(c.criteria) || c.criteria.length !== CRITERIA.length) fail("criteria");
  const ids = c.criteria.map((row: any) => row?.criterionId);
  if (JSON.stringify(ids) !== JSON.stringify([...CRITERIA])) fail("criterion coverage");
  for (const row of c.criteria) if (typeof row.question !== "string" || !row.question) fail("criterion question");
  if (!Array.isArray(c.negatives) || c.negatives.length < 2) fail("negatives");
  for (const row of c.negatives) {
    if (row?.kind !== "out-of-class" || typeof row.exampleId !== "string" || typeof row.skillId !== "string" || typeof row.reason !== "string") fail("negative example");
  }
  if (!Array.isArray(c.unsupportedInFamily) || c.unsupportedInFamily.length < 1) fail("unsupported");
  for (const row of c.unsupportedInFamily) {
    if (row?.kind !== "in-family-currently-unsupported" || !CLASS_OBLIGATION_VOCABULARY[row.obligationKey] || CLASS_OBLIGATION_VOCABULARY[row.obligationKey]!.role !== "in-class-unsupported") {
      fail("unsupported in-family case");
    }
  }
  if (JSON.stringify(c.dispositionSchema) !== JSON.stringify([...DISPOSITIONS])) fail("dispositionSchema");
  const inputs = c.inputAdmissibility;
  if (!inputs || inputs.minApplicableInputsPerMember !== 2 || JSON.stringify(inputs.formats) !== JSON.stringify(["json", "yaml"]) || inputs.openapi !== "3.0.x" || inputs.mustBePublicContract !== true) fail("inputAdmissibility");
  const profile = c.profile;
  if (!profile || profile.id !== "skill-family-class-construction/v1" || profile.originalOutputConformance !== "not-implemented" || profile.boundedV2Label !== "bounded-subtask-not-family-wide-support") fail("profile; originalOutputConformance must remain not-implemented");
  if (!Array.isArray(c.checkers) || c.checkers.length !== 2) fail("checkers");
  for (const checker of c.checkers) if (typeof checker.checkerId !== "string" || typeof checker.checkerVersion !== "string") fail("checker");
  if (typeof c.claimBoundary !== "string" || !c.claimBoundary) fail("claimBoundary");
  return c;
}

export function classScopeIsComplete(rows: Array<{ role: string | null; plannedDisposition?: string }>): boolean {
  if (!rows.length) return false;
  return rows.every((row) => row.role !== null && typeof row.plannedDisposition === "string" && row.plannedDisposition.length > 0);
}

export function validateDevelopmentPanel(input: unknown) {
  if (!input || typeof input !== "object") fail("panel must be an object");
  const p = input as Record<string, any>;
  if (p.schemaVersion !== MINIMUM_DELIVERY_PANEL_SCHEMA) fail("panel schemaVersion");
  if (p.classId !== MINIMUM_DELIVERY_CLASS_ID) fail("panel classId");
  if (p.heldOutBodiesRead !== false) fail("held-out bodies must not be read while constructing the development panel");
  if (!Array.isArray(p.candidates) || p.candidates.length < 5) fail("five candidates");
  const ids = new Set<string>();
  for (const row of p.candidates) {
    if (typeof row?.candidateId !== "string" || !row.candidateId || ids.has(row.candidateId)) fail("candidate identity");
    ids.add(row.candidateId);
    if (typeof row.skillId !== "string" || typeof row.repository !== "string" || typeof row.owner !== "string") fail("candidate identity fields");
    if (typeof row.commit !== "string" || !COMMIT.test(row.commit)) fail("candidate commit");
    if (typeof row.sourcePath !== "string" || !row.sourcePath || row.sourcePath.includes("..")) fail("candidate sourcePath");
    if (typeof row.readable !== "boolean" || typeof row.fork !== "boolean") fail("candidate provenance flags");
    if (!["selected", "excluded"].includes(row.selection) || typeof row.selectionReason !== "string" || !row.selectionReason) fail("candidate selection");
  }
  if (!Array.isArray(p.selectedMemberIds) || p.selectedMemberIds.length !== 3) fail("three selected members");
  const selected = p.selectedMemberIds.map((id: string) => p.candidates.find((row: any) => row.candidateId === id));
  if (selected.some((row: any) => !row || row.selection !== "selected" || row.readable !== true || row.duplicateOf)) fail("selected members must be readable and non-duplicate");
  const owners = new Set(selected.map((row: any) => row.owner.toLowerCase()));
  const repos = new Set(selected.map((row: any) => row.repository.toLowerCase()));
  if (owners.size !== 3 || repos.size !== 3) fail("selected members must have distinct owners and repositories");
  const provenance = p.provenance;
  if (!provenance || provenance.distinctOwners !== true || provenance.distinctRepositories !== true || provenance.knownExactCopyAmongSelected !== false || provenance.knownForkAmongSelected !== false) fail("provenance");
  if (!Array.isArray(provenance.relatednessFlagsAmongSelected) || provenance.relatednessFlagsAmongSelected.length !== 0) fail("relatedness flags among selected");
  if (JSON.stringify(p.selectedMemberIds) !== JSON.stringify(selected.map((row: any) => row.candidateId))) fail("selectedMemberIds");
  return p;
}
