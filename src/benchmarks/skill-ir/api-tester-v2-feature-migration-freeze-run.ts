import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  API_TESTER_V2_FEATURE_MIGRATION_CANDIDATE_PATH,
  API_TESTER_V2_FEATURE_MIGRATION_LOCK_PATH,
  API_TESTER_V2_FEATURE_MIGRATION_SELECTION_PATH,
  ApiTesterV2FeatureMigrationSelectionSchema,
  buildApiTesterV2FeatureMigrationCandidate,
  buildApiTesterV2FeatureMigrationLock,
} from "./api-tester-v2-feature-migration";

function requiredValue(name: string): string {
  const prefix = `--${name}=`;
  const values = process.argv.slice(2).filter((argument) => argument.startsWith(prefix));
  if (values.length !== 1 || values[0]!.length === prefix.length) throw new Error(`Expected exactly one ${prefix}<value>`);
  return values[0]!.slice(prefix.length);
}

function rejectUnknownArguments(): void {
  const allowed = new Set(["root", "candidate-out", "lock-out", "bun", "node"]);
  for (const argument of process.argv.slice(2)) {
    const match = argument.match(/^--([^=]+)=/u);
    if (!match || !allowed.has(match[1]!)) throw new Error(`Unknown argument: ${argument}`);
  }
}

async function version(executable: string): Promise<string> {
  const child = Bun.spawn([executable, "--version"], { stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0 || !stdout.trim()) throw new Error(`Unable to read runtime version: ${stderr.trim()}`);
  return stdout.trim();
}

rejectUnknownArguments();
const rootDir = resolve(requiredValue("root"));
const candidateOut = resolve(requiredValue("candidate-out"));
const lockOut = resolve(requiredValue("lock-out"));
const bunExecutable = resolve(requiredValue("bun"));
const nodeExecutable = resolve(requiredValue("node"));
if (candidateOut !== resolve(rootDir, API_TESTER_V2_FEATURE_MIGRATION_CANDIDATE_PATH)) {
  throw new Error("candidate output must use the registered candidate path");
}
if (lockOut !== resolve(rootDir, API_TESTER_V2_FEATURE_MIGRATION_LOCK_PATH)) {
  throw new Error("lock output must use the registered experiment path");
}

const selection = ApiTesterV2FeatureMigrationSelectionSchema.parse(JSON.parse(await readFile(
  resolve(rootDir, API_TESTER_V2_FEATURE_MIGRATION_SELECTION_PATH),
  "utf8",
)));
const candidate = await buildApiTesterV2FeatureMigrationCandidate({
  rootDir,
  bunVersion: await version(bunExecutable),
  nodeVersion: await version(nodeExecutable),
});
await mkdir(dirname(candidateOut), { recursive: true });
await writeFile(candidateOut, `${JSON.stringify(candidate, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
const lock = await buildApiTesterV2FeatureMigrationLock({ rootDir, candidate, selection });
await mkdir(dirname(lockOut), { recursive: true });
await writeFile(lockOut, `${JSON.stringify(lock, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
console.log(JSON.stringify({
  candidate: candidate.identity,
  experiment: lock.identity,
  denominator: lock.denominator,
  resultState: lock.resultState,
  audit: lock.audit,
}));
