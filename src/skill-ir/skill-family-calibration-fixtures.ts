/**
 * Calibration fixtures for extraction, semantic review, ledger and checker
 * plumbing. Each fixture must land in an explicit non-accepted disposition.
 * These are development-only; they never enter a held-out numerator.
 */
export const CALIBRATION_FIXTURE_IDS = [
  "conflicting-expected-status",
  "missing-host-tool-metadata",
  "guidance-not-repair-authority",
  "missing-local-reference",
  "external-response-advisory",
] as const;

export type CalibrationFixtureId = typeof CALIBRATION_FIXTURE_IDS[number];
export type SemanticFixtureRow = { fixtureId: CalibrationFixtureId; disposition: "unresolved" | "source-blocked" | "rejected-with-reason" | "outside-class"; reason: string; silentlyApproved: false };

const ROWS: Record<CalibrationFixtureId, Omit<SemanticFixtureRow, "fixtureId" | "silentlyApproved">> = {
  "conflicting-expected-status": {
    disposition: "unresolved",
    reason: "source maps missing credentials to both 401 and 403; no status authority is inferred",
  },
  "missing-host-tool-metadata": {
    disposition: "unresolved",
    reason: "allowed-tool and host compatibility metadata are present in the source but are not repair or construction authority",
  },
  "guidance-not-repair-authority": {
    disposition: "unresolved",
    reason: "source guidance to update a schema or allow extra fields is not authorization to weaken the independent checker",
  },
  "missing-local-reference": {
    disposition: "rejected-with-reason",
    reason: "local $ref target is absent from the bound contract",
  },
  "external-response-advisory": {
    disposition: "source-blocked",
    reason: "external $ref is not fetched; the obligation remains source-blocked rather than accepted",
  },
};

export function adjudicateSemanticFixture(id: string): SemanticFixtureRow {
  if (!CALIBRATION_FIXTURE_IDS.includes(id as CalibrationFixtureId)) throw new Error(`unknown calibration fixture: ${id}`);
  const row = ROWS[id as CalibrationFixtureId];
  return { fixtureId: id as CalibrationFixtureId, silentlyApproved: false, ...row };
}
