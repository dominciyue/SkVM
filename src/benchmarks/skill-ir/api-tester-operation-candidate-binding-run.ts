import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  API_TESTER_OPERATION_CANDIDATE_BINDING_PATH,
  buildApiTesterOperationCandidateBinding,
  verifyApiTesterOperationCandidateBinding,
  verifyApiTesterOperationCandidateBindingExecutionCommit,
} from "./api-tester-operation-candidate-binding";

export type ApiTesterOperationCandidateBindingArgs = {
  mode: "create" | "verify";
  rootDir: string;
  nodeExecutable: string;
  gitExecutable: string;
  bindingPath: string;
  executionCommit?: string;
  frozenAt?: string;
};

export function parseApiTesterOperationCandidateBindingArgs(args: string[]): ApiTesterOperationCandidateBindingArgs {
  const values = new Map<string, string>();
  const allowed = new Set(["--mode", "--root", "--node", "--git", "--binding", "--execution-commit", "--frozen-at"]);
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
  const bindingPath = values.get("--binding") ?? API_TESTER_OPERATION_CANDIDATE_BINDING_PATH;
  const executionCommit = values.get("--execution-commit");
  const frozenAt = values.get("--frozen-at");
  if ((mode !== "create" && mode !== "verify") || !rootDir || !nodeExecutable || !gitExecutable) {
    throw new Error("usage: --mode=create|verify --root=<repo> --node=<node> --git=<git> [--binding=<json>] [--execution-commit=<commit> --frozen-at=<ISO-for-create>]");
  }
  if (mode === "create" && (!executionCommit || !/^[0-9a-f]{40}$/u.test(executionCommit)
    || !frozenAt || Number.isNaN(Date.parse(frozenAt)))) {
    throw new Error("create mode requires a 40-hex --execution-commit and ISO --frozen-at");
  }
  if (mode === "verify" && (executionCommit || frozenAt)) {
    throw new Error("verify mode forbids --execution-commit and --frozen-at");
  }
  return {
    mode,
    rootDir,
    nodeExecutable,
    gitExecutable,
    bindingPath,
    ...(executionCommit ? { executionCommit } : {}),
    ...(frozenAt ? { frozenAt } : {}),
  };
}

async function nodeVersion(nodeExecutable: string): Promise<string> {
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
    const args = parseApiTesterOperationCandidateBindingArgs(process.argv.slice(2));
    const rootDir = resolve(args.rootDir);
    const currentNodeVersion = await nodeVersion(args.nodeExecutable);
    if (args.mode === "create") {
      const binding = await buildApiTesterOperationCandidateBinding({
        rootDir,
        frozenAt: args.frozenAt!,
        executionCommit: args.executionCommit!,
        bunVersion: Bun.version,
        nodeVersion: currentNodeVersion,
      });
      await verifyApiTesterOperationCandidateBindingExecutionCommit({
        rootDir,
        binding,
        gitExecutable: args.gitExecutable,
      });
      const output = resolve(rootDir, args.bindingPath);
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, `${JSON.stringify(binding, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    }
    const verified = await verifyApiTesterOperationCandidateBinding({
      rootDir,
      bindingPath: args.bindingPath,
      bunVersion: Bun.version,
      nodeVersion: currentNodeVersion,
      gitExecutable: args.gitExecutable,
    });
    process.stdout.write(`${JSON.stringify(verified)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
