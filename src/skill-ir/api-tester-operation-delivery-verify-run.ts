import { verifyApiTesterOperationDeliveryValidation } from "./api-tester-operation-delivery-freeze";

export type ApiTesterOperationDeliveryVerifyArgs = {
  rootDir: string;
  archiveRoot: string;
  nodeExecutable: string;
};

export function parseApiTesterOperationDeliveryVerifyArgs(args: string[]): ApiTesterOperationDeliveryVerifyArgs {
  const values = new Map<string, string>();
  const allowed = new Set(["--root", "--archive-root", "--node"]);
  for (const argument of args) {
    const separator = argument.indexOf("=");
    const key = separator < 0 ? argument : argument.slice(0, separator);
    const value = separator < 0 ? "" : argument.slice(separator + 1);
    if (!allowed.has(key) || !value || values.has(key)) throw new Error(`invalid or duplicate argument: ${key}`);
    values.set(key, value);
  }
  const rootDir = values.get("--root");
  const archiveRoot = values.get("--archive-root");
  const nodeExecutable = values.get("--node");
  if (!rootDir || !archiveRoot || !nodeExecutable) {
    throw new Error("usage: --root=<repo> --archive-root=<validation-archive> --node=<node>");
  }
  return { rootDir, archiveRoot, nodeExecutable };
}

if (import.meta.main) {
  try {
    const verified = await verifyApiTesterOperationDeliveryValidation(
      parseApiTesterOperationDeliveryVerifyArgs(process.argv.slice(2)),
    );
    process.stdout.write(`${JSON.stringify(verified)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
