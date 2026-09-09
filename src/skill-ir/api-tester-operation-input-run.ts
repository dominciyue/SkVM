import { runApiTesterOperationInput } from "./api-tester-operation-input";

export type ApiTesterOperationInputArgs = {
  rootDir: string;
  manifestPath: string;
  nodeExecutable: string;
};

export function parseApiTesterOperationInputArgs(args: string[]): ApiTesterOperationInputArgs {
  const values = new Map<string, string>();
  const allowed = new Set(["--root", "--manifest", "--node"]);
  for (const argument of args) {
    const separator = argument.indexOf("=");
    const key = separator < 0 ? argument : argument.slice(0, separator);
    const value = separator < 0 ? "" : argument.slice(separator + 1);
    if (!allowed.has(key) || !value || values.has(key)) throw new Error(`invalid or duplicate argument: ${key}`);
    values.set(key, value);
  }
  const rootDir = values.get("--root");
  const manifestPath = values.get("--manifest");
  const nodeExecutable = values.get("--node");
  if (!rootDir || !manifestPath || !nodeExecutable) {
    throw new Error("usage: --root=<input-root> --manifest=<manifest.json> --node=<node>");
  }
  return { rootDir, manifestPath, nodeExecutable };
}

if (import.meta.main) {
  try {
    const report = await runApiTesterOperationInput(parseApiTesterOperationInputArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify({
      status: report.status,
      operations: report.totals.operations,
      accepted: report.totals.accepted,
      rejected: report.totals.rejected,
      unresolved: report.totals.unresolved,
      checked: report.totals.artifactCheckedPassedOperations,
      documentDisposition: report.documentDisposition,
      portableSemanticSha256: report.portableSemanticSha256,
    })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
