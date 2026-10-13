export type AccountRecoveryObservation = {
  terminal: "completed" | "failed" | "interrupted" | "unknown" | "not-started";
  localExecution: "active" | "closed" | "unconfirmed";
  reconciliation: "not-attempted" | "terminal-found" | "not-found" | "unavailable";
  channel: "available" | "quota-or-auth-blocked" | "repeated-transport-failure";
  nextPurpose: "same-attempt" | "independent-task";
  independentAuthorized: boolean;
};

export type AccountRecoveryDecision = {
  action: "inspect-existing" | "resume-after-terminal" | "quarantine-and-continue" | "pause-channel";
  allowNewTurn: boolean;
  keepTerminalUnknown: boolean;
  reason: string;
};

export function decideAccountRecovery(observation: AccountRecoveryObservation): AccountRecoveryDecision {
  const keepTerminalUnknown = observation.terminal === "unknown";
  const decision = (action: AccountRecoveryDecision["action"], allowNewTurn: boolean, reason: string): AccountRecoveryDecision =>
    ({ action, allowNewTurn, keepTerminalUnknown, reason });
  if (observation.channel !== "available") {
    return decision("pause-channel", false, observation.channel);
  }
  if (observation.localExecution !== "closed") {
    return decision("inspect-existing", false, "local-owner-not-observed-closed");
  }
  if (observation.nextPurpose === "independent-task" && !observation.independentAuthorized) {
    return decision("inspect-existing", false, "independent-purpose-not-authorized");
  }
  if (!keepTerminalUnknown) {
    return decision("resume-after-terminal", true, "record-a-new-turn-after-known-outcome");
  }
  if (observation.nextPurpose === "same-attempt") {
    return decision("inspect-existing", false, "unknown-attempt-must-not-be-replayed");
  }
  if (observation.reconciliation === "not-attempted" || observation.reconciliation === "terminal-found") {
    return decision("inspect-existing", false, "reconciliation-observation-required");
  }
  return decision("quarantine-and-continue", true, "closed-unrecoverable-unknown-independent-purpose");
}
