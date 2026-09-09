import { runApiTesterOperationValidationDevelopment } from "./api-tester-operation-validation-development";

export type ApiTesterOperationValidationArgs = {
  rootDir: string;
  cacheRoot: string;
  cleanRoot: string;
  nodeExecutable: string;
  gitExecutable: string;
  validationOutputRoot?: string;
  combinedOutputRoot?: string;
  completedAt?: string;
};

export function parseApiTesterOperationValidationArgs(args: string[]): ApiTesterOperationValidationArgs {
  const values = new Map<string, string>();
  const allowed = new Set([
    "--root", "--cache-root", "--clean-root", "--node", "--git",
    "--validation-out", "--combined-out", "--completed-at",
  ]);
  for (const argument of args) {
    const separator = argument.indexOf("=");
    const key = separator < 0 ? argument : argument.slice(0, separator);
    const value = separator < 0 ? "" : argument.slice(separator + 1);
    if (!allowed.has(key) || !value || values.has(key)) throw new Error(`invalid or duplicate argument: ${key}`);
    values.set(key, value);
  }
  const rootDir = values.get("--root");
  const cacheRoot = values.get("--cache-root");
  const cleanRoot = values.get("--clean-root");
  const nodeExecutable = values.get("--node");
  const gitExecutable = values.get("--git");
  if (!rootDir || !cacheRoot || !cleanRoot || !nodeExecutable || !gitExecutable) {
    throw new Error("usage: --root=<repo> --cache-root=<offline-cache> --clean-root=<detached-task1-worktree> --node=<node> --git=<git> [--validation-out=<fresh-result>] [--combined-out=<fresh-result>] [--completed-at=<ISO>]");
  }
  const completedAt = values.get("--completed-at");
  if (completedAt && Number.isNaN(Date.parse(completedAt))) throw new Error("--completed-at must be an ISO timestamp");
  return {
    rootDir,
    cacheRoot,
    cleanRoot,
    nodeExecutable,
    gitExecutable,
    ...(values.get("--validation-out") ? { validationOutputRoot: values.get("--validation-out") } : {}),
    ...(values.get("--combined-out") ? { combinedOutputRoot: values.get("--combined-out") } : {}),
    ...(completedAt ? { completedAt } : {}),
  };
}

if (import.meta.main) {
  try {
    const result = await runApiTesterOperationValidationDevelopment(
      parseApiTesterOperationValidationArgs(process.argv.slice(2)),
    );
    process.stdout.write(`${JSON.stringify({
      status: result.combined.status,
      branch: result.validation.branch,
      transforms: result.validation.transforms.totals,
      faults: result.validation.faultDetection.totals,
      cleanReproduction: result.validation.cleanReproduction.status,
      task2PortableSemanticSha256: result.validation.portableSemanticSha256,
      combinedPortableSemanticSha256: result.combined.portableSemanticSha256,
    })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
