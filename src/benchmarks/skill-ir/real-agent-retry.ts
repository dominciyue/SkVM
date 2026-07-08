import { classifyFailureType } from "./scoring";

export type RetryableRunRow = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type RetryDecisionOptions = {
  attempt: number;
  maxAttempts: number;
};

export type RunWithRetriesOptions = {
  maxRetries: number;
  retryDelayMs: number;
};

export type RunWithRetriesResult<T extends RetryableRunRow> = {
  row: T;
  attempts: number;
};

export function shouldRetryRunRow(row: RetryableRunRow, opts: RetryDecisionOptions): boolean {
  if (row.exitCode === 0) {
    return false;
  }

  if (opts.attempt >= opts.maxAttempts) {
    return false;
  }

  const combined = `${row.stderr}\n${row.stdout}`.toLowerCase();
  if (
    combined.includes("providerautherror") ||
    combined.includes("authentication failed") ||
    combined.includes("requires env var")
  ) {
    return false;
  }

  return classifyFailureType(row) === "infrastructure";
}

export async function runWithInfrastructureRetries<T extends RetryableRunRow>(
  runAttempt: () => Promise<T>,
  opts: RunWithRetriesOptions,
): Promise<RunWithRetriesResult<T>> {
  const maxAttempts = opts.maxRetries + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const row = await runAttempt();
    if (!shouldRetryRunRow(row, { attempt, maxAttempts })) {
      return { row, attempts: attempt };
    }

    if (opts.retryDelayMs > 0) {
      await Bun.sleep(opts.retryDelayMs);
    }
  }

  throw new Error("unreachable retry state");
}
