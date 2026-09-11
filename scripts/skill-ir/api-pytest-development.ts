import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { buildApiPytestSuite } from "../../src/skill-ir/api-pytest-suite";
import { verifyApiPytestSuite } from "../../src/skill-ir/api-pytest-suite-checker";
import { decodeDevelopmentUtf8 } from "../../src/skill-ir/development-utf8";
import { createContainedDirectory, normalizeRepositoryRelativePath, resolveContainedExistingFile } from "../../src/benchmarks/skill-ir/public-skill-responsibility-corpus-paths";

const exec = promisify(execFile), sha = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
type PythonResult = { exitCode: number | string | null; stdout: string; stderr: string;
  counts: { tests: number; skipped: number; failures: number; errors: number; cases: number } | null };
const junitCounts = 'import json,sys,xml.etree.ElementTree as E; r=E.parse(sys.argv[1]).getroot(); suites=list(r.iter("testsuite")); print(json.dumps({**{k:sum(int(s.get(k,"0")) for s in suites) for k in ["tests","skipped","failures","errors"]},"cases":len(list(r.iter("testcase")))}))';

export async function runApiPytestDevelopment(options: { rootDir: string; executionRoot: string; inputIndexPath: string; outputPath: string; pythonExecutable: string }) {
  const indexPath = await resolveContainedExistingFile(options.rootDir, options.inputIndexPath, "pytest input index");
  const indexBytes = await readFile(indexPath), index = JSON.parse(decodeDevelopmentUtf8(indexBytes));
  if (!Array.isArray(index.inputs) || index.inputs.some((i: any) => !i || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u.test(i.inputId))
    || new Set(index.inputs.map((i: any) => i.inputId)).size !== index.inputs.length) throw new Error("unique safe input identities required");
  const out = await createContainedDirectory(options.rootDir, options.outputPath, "pytest output");
  const environment: NodeJS.ProcessEnv = { ...process.env, PYTEST_DISABLE_PLUGIN_AUTOLOAD: "1", PYTHONDONTWRITEBYTECODE: "1" };
  delete environment.SKVM_PYTEST_ORACLE;
  const runtime = await exec(options.pythonExecutable, ["-I", "-c", 'import sys,json,importlib.metadata as m; print(json.dumps({"python":sys.version,"pytest":m.version("pytest"),"httpx":m.version("httpx")}))'], { windowsHide: true, encoding: "utf8", timeout: 10000 });
  const boundFiles = ["src/skill-ir/api-pytest-suite.ts", "src/skill-ir/api-pytest-suite-checker.ts", "src/skill-ir/api-pytest-runtime.py",
    "src/skill-ir/api-request-specimens.ts", "src/skill-ir/api-request-specimens-checker.ts", "src/skill-ir/api-form-wire.ts", "src/skill-ir/api-form-wire-checker.ts",
    "src/skill-ir/api-tester-operation-source.ts", "src/skill-ir/api-tester-operation-coverage.ts", "src/skill-ir/api-schema-witness.ts", "src/skill-ir/api-schema-checker.ts",
    "src/skill-ir/api-parameter-wire.ts", "src/skill-ir/api-parameter-wire-checker.ts", "src/skill-ir/development-utf8.ts", "scripts/skill-ir/api-pytest-development.ts", "bun.lock", "package.json"];
  const report = { exposure: "development", profile: "api-pytest-request-suite/v1", startedAt: new Date().toISOString(),
    executionCommit: execFileSync("git", ["-c", `safe.directory=${options.executionRoot.replaceAll("\\", "/")}`, "rev-parse", "HEAD"], { cwd: options.executionRoot, windowsHide: true, encoding: "utf8" }).trim(),
    inputIndexSha256: sha(indexBytes), runtime: { ...JSON.parse(runtime.stdout), bun: Bun.version, pythonExecutable: options.pythonExecutable },
    sourceBindings: await Promise.all(boundFiles.map(async (path) => ({ path, sha256: sha(await readFile(resolve(options.executionRoot, path))) }))),
    rows: [] as Array<{ inputId: string; status: string; sourceSha256?: string; suiteSha256?: string; testPythonSha256?: string;
      verification?: Awaited<ReturnType<typeof verifyApiPytestSuite>>; python?: PythonResult; error?: string; elapsedMs: number }>,
    remoteHttpCalls: 0, loopbackHttpCalls: 0, projectModelCalls: 0, paidCalls: 0, developerAgentCost: "unmeasured-separate",
    wholeSkillCompleted: false, claimLimit: "Python collection with no explicit oracle: skipped is not an API pass" };
  for (const input of index.inputs) {
    const started = performance.now();
    try {
      if (input.status !== "acquired") throw new Error("declared input unavailable");
      if (!["json", "yaml"].includes(input.format) || typeof input.sha256 !== "string") throw new Error("input binding fields required");
      const path = normalizeRepositoryRelativePath(input.localPath, "pytest source path");
      const contained = relative(options.rootDir, resolve(dirname(indexPath), path)).replaceAll("\\", "/");
      const bytes = await readFile(await resolveContainedExistingFile(options.rootDir, contained, "pytest source"));
      if (sha(bytes) !== input.sha256) throw new Error("input digest mismatch");
      const source = decodeDevelopmentUtf8(bytes), artifact = await buildApiPytestSuite(source, input.format);
      const verification = await verifyApiPytestSuite(source, input.format, artifact);
      if (verification.status !== "pass") throw new Error(`pytest artifact verification failed: ${verification.errors.join("; ")}`);
      const directory = await createContainedDirectory(options.rootDir, `${options.outputPath}/${input.inputId}`, "pytest input output");
      await writeFile(resolve(directory, "suite.json"), artifact.suiteJson, { flag: "wx" });
      await writeFile(resolve(directory, "test_api_requests.py"), artifact.testPython, { flag: "wx" });
      let python: PythonResult;
      try {
        const result = await exec(options.pythonExecutable, ["-I", "-B", "-m", "pytest", "-q", "-p", "no:cacheprovider", `--confcutdir=${directory}`, "--junitxml=pytest.junit.xml", "test_api_requests.py"],
          { cwd: directory, env: environment, windowsHide: true, encoding: "utf8", timeout: 60000, maxBuffer: 16777216 });
        python = { exitCode: 0, ...result, counts: null };
      } catch (error) {
        const e = error as any; python = { exitCode: e.code ?? null, stdout: String(e.stdout ?? ""), stderr: String(e.stderr ?? e.message), counts: null };
      }
      try {
        const counts = await exec(options.pythonExecutable, ["-I", "-c", junitCounts, resolve(directory, "pytest.junit.xml")], { windowsHide: true, encoding: "utf8", timeout: 10000 });
        python.counts = JSON.parse(counts.stdout);
      } catch (error) { python.stderr += `\nJUNIT_PARSE_FAILED: ${String(error)}`; }
      await writeFile(resolve(directory, "python.json"), JSON.stringify(python, null, 2) + "\n", { flag: "wx" });
      const counts = python.counts;
      const okay = python.exitCode === 0 && counts && counts.tests === verification.collectedCases && counts.cases === counts.tests
        && counts.skipped === counts.tests && counts.failures === 0 && counts.errors === 0;
      report.rows.push({ inputId: input.inputId, status: okay ? "collected-all-skipped" : "native-validation-failed", sourceSha256: sha(bytes),
        suiteSha256: sha(artifact.suiteJson), testPythonSha256: sha(artifact.testPython), verification, python, elapsedMs: performance.now() - started });
    } catch (error) { report.rows.push({ inputId: input.inputId, status: "error", error: String(error), elapsedMs: performance.now() - started }); }
    await writeFile(resolve(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
    const row = report.rows.at(-1)!;
    console.log(JSON.stringify({ inputId: row.inputId, status: row.status, verification: row.verification, counts: row.python?.counts, error: row.error }));
  }
  return report;
}

if (import.meta.main) {
  const arg = (name: string) => process.argv.find((v) => v.startsWith(`--${name}=`))?.slice(name.length + 3);
  const inputIndexPath = arg("inputs"), outputPath = arg("out"), pythonExecutable = arg("python");
  if (!inputIndexPath || !outputPath || !pythonExecutable) throw new Error("--inputs=<bound-index> --out=<new-directory> --python=<explicit-python>");
  const report = await runApiPytestDevelopment({ rootDir: process.cwd(), executionRoot: process.cwd(), inputIndexPath, outputPath, pythonExecutable });
  if (report.rows.some((r) => r.status !== "collected-all-skipped")) process.exitCode = 1;
}
