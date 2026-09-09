import { runApiTesterOperationDeliveryValidation } from "./api-tester-operation-delivery-freeze";

export type ApiTesterOperationDeliveryValidationArgs = {
  rootDir: string;
  cacheRoot: string;
  nodeExecutable: string;
  outputRoot: string;
  completedAt?: string;
};

export function parseApiTesterOperationDeliveryValidationArgs(args: string[]): ApiTesterOperationDeliveryValidationArgs {
  const values = new Map<string, string>();
  const allowed = new Set(["--root", "--cache-root", "--node", "--out", "--completed-at"]);
  for (const argument of args) {
    const separator = argument.indexOf("=");
    const key = separator < 0 ? argument : argument.slice(0, separator);
    const value = separator < 0 ? "" : argument.slice(separator + 1);
    if (!allowed.has(key) || !value || values.has(key)) throw new Error(`invalid or duplicate argument: ${key}`);
    values.set(key, value);
  }
  const rootDir = values.get("--root");
  const cacheRoot = values.get("--cache-root");
  const nodeExecutable = values.get("--node");
  const outputRoot = values.get("--out");
  if (!rootDir || !cacheRoot || !nodeExecutable || !outputRoot) {
    throw new Error("usage: --root=<repo> --cache-root=<exposed-cache> --node=<node> --out=<fresh-repo-relative-output> [--completed-at=<ISO>]");
  }
  const completedAt = values.get("--completed-at");
  if (completedAt && Number.isNaN(Date.parse(completedAt))) throw new Error("--completed-at must be an ISO timestamp");
  return {
    rootDir,
    cacheRoot,
    nodeExecutable,
    outputRoot,
    ...(completedAt ? { completedAt } : {}),
  };
}

if (import.meta.main) {
  try {
    const report = await runApiTesterOperationDeliveryValidation(
      parseApiTesterOperationDeliveryValidationArgs(process.argv.slice(2)),
    );
    process.stdout.write(`${JSON.stringify({
      status: report.status,
      operations: report.totals.operations,
      accepted: report.totals.accepted,
      rejected: report.totals.rejected,
      unresolved: report.totals.unresolved,
      checked: report.totals.checked,
      obligations: report.totals.obligations,
      portableSemanticSha256: report.portableSemanticSha256,
    })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
