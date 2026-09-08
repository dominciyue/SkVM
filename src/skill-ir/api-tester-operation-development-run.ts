import { runApiTesterOperationDevelopment } from "./api-tester-operation-development";

export type ApiTesterOperationDevelopmentArgs = {
  rootDir: string;
  cacheRoot: string;
  nodeExecutable: string;
  outputRoot?: string;
  completedAt?: string;
};

export function parseApiTesterOperationDevelopmentArgs(args: string[]): ApiTesterOperationDevelopmentArgs {
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
  if (!rootDir || !cacheRoot || !nodeExecutable) {
    throw new Error("usage: --root=<repo> --cache-root=<offline-cache> --node=<node> [--out=<fresh-result>] [--completed-at=<ISO>]");
  }
  const completedAt = values.get("--completed-at");
  if (completedAt && Number.isNaN(Date.parse(completedAt))) throw new Error("--completed-at must be an ISO timestamp");
  return {
    rootDir,
    cacheRoot,
    nodeExecutable,
    ...(values.get("--out") ? { outputRoot: values.get("--out") } : {}),
    ...(completedAt ? { completedAt } : {}),
  };
}

if (import.meta.main) {
  try {
    const report = await runApiTesterOperationDevelopment(parseApiTesterOperationDevelopmentArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify({
      status: report.status,
      operations: report.totals.operations,
      accepted: report.totals.accepted,
      checked: report.totals.artifactCheckedPassedOperations,
      correctness: report.gates.correctness,
      portableSemanticSha256: report.portableSemanticSha256,
    })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
