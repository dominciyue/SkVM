import { runApiTesterOperationDependencyVerificationRevision } from "./api-tester-operation-dependency-verification-revision";

export type ApiTesterOperationDependencyRevisionArgs = {
  rootDir: string;
  cacheRoot: string;
  nodeExecutable: string;
  gitExecutable: string;
  outputRoot: string;
  completedAt?: string;
  cleanRoot?: string;
  cleanReportPath?: string;
};

export function parseApiTesterOperationDependencyRevisionArgs(args: string[]): ApiTesterOperationDependencyRevisionArgs {
  const values = new Map<string, string>();
  const allowed = new Set(["--root", "--cache-root", "--node", "--git", "--out", "--completed-at", "--clean-root", "--clean-report"]);
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
  const gitExecutable = values.get("--git");
  const outputRoot = values.get("--out");
  if (!rootDir || !cacheRoot || !nodeExecutable || !gitExecutable || !outputRoot) {
    throw new Error("usage: --root=<repo> --cache-root=<offline-cache> --node=<node> --git=<git> --out=<fresh-result> [--clean-root=<detached-checkout> --clean-report=<relative-report>] [--completed-at=<ISO>]");
  }
  const cleanRoot = values.get("--clean-root");
  const cleanReportPath = values.get("--clean-report");
  if ((cleanRoot === undefined) !== (cleanReportPath === undefined)) throw new Error("--clean-root and --clean-report are required together");
  const completedAt = values.get("--completed-at");
  if (completedAt && Number.isNaN(Date.parse(completedAt))) throw new Error("--completed-at must be an ISO timestamp");
  return {
    rootDir,
    cacheRoot,
    nodeExecutable,
    gitExecutable,
    outputRoot,
    ...(completedAt ? { completedAt } : {}),
    ...(cleanRoot ? { cleanRoot } : {}),
    ...(cleanReportPath ? { cleanReportPath } : {}),
  };
}

if (import.meta.main) {
  try {
    const report = await runApiTesterOperationDependencyVerificationRevision(
      parseApiTesterOperationDependencyRevisionArgs(process.argv.slice(2)),
    );
    process.stdout.write(`${JSON.stringify({
      status: report.status,
      revisionCommit: report.revision.commit,
      faults: report.cases.totals,
      comparison: report.comparison.aggregateChecks,
      cleanReproduction: report.gates.cleanReproduction,
      portableSemanticSha256: report.portableSemanticSha256,
    })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
