import { expect, test } from "bun:test";
import { decideAccountRecovery, type AccountRecoveryObservation } from "./codex-account-recovery.ts";

const unknown: AccountRecoveryObservation = {
  terminal: "unknown", localExecution: "closed", reconciliation: "not-found",
  channel: "available", nextPurpose: "independent-task", independentAuthorized: true,
};

test("isolated historical unknown permits an authorized independent purpose without changing its terminal", () => {
  const before = structuredClone(unknown);
  expect(decideAccountRecovery(unknown)).toMatchObject({
    action: "quarantine-and-continue", allowNewTurn: true, keepTerminalUnknown: true,
  });
  expect(unknown).toEqual(before);
});

test("the same unknown attempt is never automatically replayed", () => {
  expect(decideAccountRecovery({ ...unknown, nextPurpose: "same-attempt" }).allowNewTurn).toBe(false);
});

test("a local owner must be observed closed", () => {
  for (const localExecution of ["active", "unconfirmed"] as const) {
    expect(decideAccountRecovery({ ...unknown, localExecution }).allowNewTurn).toBe(false);
  }
});

test("quota, authentication and repeated transport failures pause only the channel", () => {
  for (const channel of ["quota-or-auth-blocked", "repeated-transport-failure"] as const) {
    expect(decideAccountRecovery({ ...unknown, channel })).toMatchObject({ action: "pause-channel", allowNewTurn: false });
  }
});

test("unreconciled and unauthorized unknowns do not pass", () => {
  expect(decideAccountRecovery({ ...unknown, reconciliation: "not-attempted" }).allowNewTurn).toBe(false);
  expect(decideAccountRecovery({ ...unknown, independentAuthorized: false }).allowNewTurn).toBe(false);
  expect(decideAccountRecovery({ ...unknown, reconciliation: "unavailable" }).allowNewTurn).toBe(true);
  expect(decideAccountRecovery({ ...unknown, reconciliation: "terminal-found" }).allowNewTurn).toBe(false);
});

test("known terminal observations allow a separately recorded continuation", () => {
  for (const terminal of ["completed", "failed", "interrupted", "not-started"] as const) {
    expect(decideAccountRecovery({ ...unknown, terminal, nextPurpose: "same-attempt" })).toMatchObject({
      action: "resume-after-terminal", allowNewTurn: true, keepTerminalUnknown: false,
    });
  }
});

test("late terminal reconciliation does not mutate the historical observation", () => {
  const late = { ...unknown, terminal: "completed", reconciliation: "terminal-found" } as const;
  expect(decideAccountRecovery(late).keepTerminalUnknown).toBe(false);
  expect(unknown.terminal).toBe("unknown");
  expect(decideAccountRecovery(unknown).keepTerminalUnknown).toBe(true);
});
