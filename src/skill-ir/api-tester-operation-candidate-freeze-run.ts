import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  API_TESTER_OPERATION_CANDIDATE_PATH,
  API_TESTER_OPERATION_DELIVERY_MAIN_ROOT,
  buildApiTesterOperationCandidate,
  verifyApiTesterOperationCandidate,
  verifyApiTesterOperationDeliveryValidation,
} from "./api-tester-operation-delivery-freeze";

export type ApiTesterOperationCandidateFreezeArgs = {
  mode: "create" | "verify";
  rootDir: string;
  nodeExecutable: string;
  gitExecutable: string;
  frozenAt?: string;
};

export function parseApiTesterOperationCandidateFreezeArgs(args: string[]): ApiTesterOperationCandidateFreezeArgs {
  const values = new Map<string, string>();
  const allowed = new Set(["--mode", "--root", "--node", "--git", "--frozen-at"]);
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
  const frozenAt = values.get("--frozen-at");
  if ((mode !== "create" && mode !== "verify") || !rootDir || !nodeExecutable || !gitExecutable) {
    throw new Error("usage: --mode=create|verify --root=<repo> --node=<node> --git=<git> [--frozen-at=<ISO-for-create>]");
  }
  if (mode === "create" && (!frozenAt || Number.isNaN(Date.parse(frozenAt)))) {
    throw new Error("create mode requires an ISO --frozen-at");
  }
  if (mode === "verify" && frozenAt) throw new Error("verify mode forbids --frozen-at");
  return { mode, rootDir, nodeExecutable, gitExecutable, ...(frozenAt ? { frozenAt } : {}) };
}

async function readNodeVersion(nodeExecutable: string): Promise<string> {
  const child = Bun.spawn([nodeExecutable, "--version"], { stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(`node version command failed: ${stderr.trim()}`);
  const version = stdout.trim();
  if (!/^v\d+\.\d+\.\d+$/u.test(version)) throw new Error(`unexpected node version: ${version}`);
  return version;
}

if (import.meta.main) {
  try {
    const args = parseApiTesterOperationCandidateFreezeArgs(process.argv.slice(2));
    const rootDir = resolve(args.rootDir);
    const nodeVersion = await readNodeVersion(args.nodeExecutable);
    if (args.mode === "create") {
      await verifyApiTesterOperationDeliveryValidation({
        rootDir,
        archiveRoot: join(rootDir, API_TESTER_OPERATION_DELIVERY_MAIN_ROOT),
        nodeExecutable: args.nodeExecutable,
      });
      const candidate = await buildApiTesterOperationCandidate({
        rootDir,
        frozenAt: args.frozenAt!,
        bunVersion: Bun.version,
        nodeVersion,
        validation: { path: `${API_TESTER_OPERATION_DELIVERY_MAIN_ROOT}/validation-report.json` },
      });
      const candidatePath = join(rootDir, API_TESTER_OPERATION_CANDIDATE_PATH);
      await mkdir(dirname(candidatePath), { recursive: true });
      await writeFile(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    }
    const verified = await verifyApiTesterOperationCandidate({
      rootDir,
      candidatePath: API_TESTER_OPERATION_CANDIDATE_PATH,
      bunVersion: Bun.version,
      nodeVersion,
      nodeExecutable: args.nodeExecutable,
      gitExecutable: args.gitExecutable,
    });
    process.stdout.write(`${JSON.stringify(verified)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
