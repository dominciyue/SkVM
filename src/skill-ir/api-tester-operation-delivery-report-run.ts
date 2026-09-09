import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  API_TESTER_OPERATION_DELIVERY_REPORT_PATH,
  buildApiTesterOperationDeliveryFreezeReport,
  verifyApiTesterOperationDeliveryFreezeReport,
} from "./api-tester-operation-delivery-report";

export type ApiTesterOperationDeliveryReportArgs = {
  mode: "create" | "verify";
  rootDir: string;
  nodeExecutable: string;
  gitExecutable: string;
  completedAt?: string;
};

export function parseApiTesterOperationDeliveryReportArgs(args: string[]): ApiTesterOperationDeliveryReportArgs {
  const values = new Map<string, string>();
  const allowed = new Set(["--mode", "--root", "--node", "--git", "--completed-at"]);
  for (const argument of args) {
    const separator = argument.indexOf("=");
    const key = separator < 0 ? argument : argument.slice(0, separator);
    const value = separator < 0 ? "" : argument.slice(separator + 1);
    if (!allowed.has(key) || !value || values.has(key)) throw new Error(`invalid or duplicate argument: ${key}`);
    values.set(key, value);
  }
  const mode = values.get("--mode");
  const rootDir = values.get("--root");
  const nodeExecutable = values.get("--node");
  const gitExecutable = values.get("--git");
  const completedAt = values.get("--completed-at");
  if ((mode !== "create" && mode !== "verify") || !rootDir || !nodeExecutable || !gitExecutable) {
    throw new Error("usage: --mode=create|verify --root=<repo> --node=<node> --git=<git> [--completed-at=<ISO-for-create>]");
  }
  if (mode === "create" && (!completedAt || Number.isNaN(Date.parse(completedAt)))) {
    throw new Error("create mode requires an ISO --completed-at");
  }
  if (mode === "verify" && completedAt) throw new Error("verify mode forbids --completed-at");
  return { mode, rootDir, nodeExecutable, gitExecutable, ...(completedAt ? { completedAt } : {}) };
}

async function readNodeVersion(nodeExecutable: string): Promise<string> {
  const child = Bun.spawn([nodeExecutable, "--version"], { stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  if (exitCode !== 0) throw new Error(`node version command failed: ${stderr.trim()}`);
  return stdout.trim();
}

if (import.meta.main) {
  try {
    const args = parseApiTesterOperationDeliveryReportArgs(process.argv.slice(2));
    const rootDir = resolve(args.rootDir);
    const nodeVersion = await readNodeVersion(args.nodeExecutable);
    if (args.mode === "create") {
      const report = await buildApiTesterOperationDeliveryFreezeReport({
        rootDir,
        gitExecutable: args.gitExecutable,
        nodeExecutable: args.nodeExecutable,
        bunVersion: Bun.version,
        nodeVersion,
        completedAt: args.completedAt!,
      });
      const reportPath = resolve(rootDir, API_TESTER_OPERATION_DELIVERY_REPORT_PATH);
      try {
        await readFile(reportPath);
        throw new Error(`delivery freeze report already exists: ${reportPath}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
      process.stdout.write(`${JSON.stringify({ status: report.status, candidateCommit: report.candidate.commit, prospectiveRuns: report.prospective.prospectiveRuns, portableSemanticSha256: report.portableSemanticSha256 })}\n`);
    } else {
      process.stdout.write(`${JSON.stringify(await verifyApiTesterOperationDeliveryFreezeReport({
        rootDir,
        gitExecutable: args.gitExecutable,
        nodeExecutable: args.nodeExecutable,
        bunVersion: Bun.version,
        nodeVersion,
      }))}\n`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
