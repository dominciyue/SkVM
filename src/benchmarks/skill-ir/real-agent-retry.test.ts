import { describe, expect, test } from "bun:test";
import { runWithInfrastructureRetries, shouldRetryRunRow } from "./real-agent-retry";

describe("real-agent infrastructure retry helpers", () => {
  test("shouldRetryRunRow retries provider infrastructure failures when budget remains", () => {
    expect(
      shouldRetryRunRow(
        {
          exitCode: 1,
          stdout: "Task failed",
          stderr: "ProviderNetworkError: openai-compatible network error: The operation timed out.",
        },
        { attempt: 1, maxAttempts: 2 },
      ),
    ).toBe(true);
  });

  test("shouldRetryRunRow does not retry successful rows, agent failures, or exhausted attempts", () => {
    expect(
      shouldRetryRunRow({ exitCode: 0, stdout: "Final output:\nok", stderr: "" }, { attempt: 1, maxAttempts: 2 }),
    ).toBe(false);
    expect(
      shouldRetryRunRow({ exitCode: 1, stdout: "Run failed", stderr: "agent crashed" }, { attempt: 1, maxAttempts: 2 }),
    ).toBe(false);
    expect(
      shouldRetryRunRow(
        {
          exitCode: 1,
          stdout: "Task failed",
          stderr: "ProviderNetworkError: openai-compatible network error: The operation timed out.",
        },
        { attempt: 2, maxAttempts: 2 },
      ),
    ).toBe(false);
  });

  test("runWithInfrastructureRetries returns the first successful retry", async () => {
    let calls = 0;
    const result = await runWithInfrastructureRetries(
      async () => {
        calls += 1;
        if (calls === 1) {
          return {
            exitCode: 1,
            stdout: "Task failed",
            stderr: "ProviderNetworkError: openai-compatible network error: The operation timed out.",
          };
        }
        return { exitCode: 0, stdout: "Final output:\nok", stderr: "" };
      },
      { maxRetries: 1, retryDelayMs: 0 },
    );

    expect(calls).toBe(2);
    expect(result.attempts).toBe(2);
    expect(result.row.exitCode).toBe(0);
  });
});
