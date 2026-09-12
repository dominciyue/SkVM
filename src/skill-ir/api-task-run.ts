import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { parseDocument } from "yaml";
import { z } from "zod";
import { parseApiTaskContract } from "./api-task-contract";
import { ApiDependencyManifestSchema } from "./api-tester-source-closure";
import { buildApiTaskArtifact, type ApiTaskArtifactObservation } from "./api-task-artifact";
import { verifyApiTaskArtifact } from "./api-task-artifact-checker";
import { verifyApiPytestOracle } from "./api-pytest-oracle";

const execute = promisify(execFile);
const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const HashSchema = z.string().regex(/^[0-9a-f]{64}$/u);
const RelativePathSchema = z.string().min(1).max(4096).refine((value) => !isAbsolute(value)
  && !/^[A-Za-z]:[\\/]/u.test(value) && !value.startsWith("\\\\") && !value.split(/[\\/]+/u).includes(".."),
"path must be relative and contained");
const FileBindingSchema = z.object({ path: RelativePathSchema, sha256: HashSchema }).strict();

export const ApiTaskRunBindingSchema = z.object({
  schemaVersion: z.literal("skvm-api-task-run-binding/v1"),
  task: FileBindingSchema,
  input: FileBindingSchema.extend({ format: z.enum(["json", "yaml"]) }).strict(),
  dependencyManifest: FileBindingSchema.nullable(),
  observations: FileBindingSchema.nullable(),
  oracle: FileBindingSchema.nullable(),
  output: z.object({ directory: RelativePathSchema }).strict(),
}).strict();

export type ApiTaskRunBinding = z.infer<typeof ApiTaskRunBindingSchema>;
export const parseApiTaskRunBinding = (value: unknown): ApiTaskRunBinding => ApiTaskRunBindingSchema.parse(value);

const ObservationFileSchema = z.object({
  schemaVersion: z.literal("skvm-api-task-observations/v1"),
  observations: z.array(z.object({
    operationKey: z.string().min(1),
    statusCode: z.number().int().min(100).max(599),
    mediaType: z.string(),
    bodyText: z.string(),
    headers: z.array(z.object({ name: z.string(), value: z.string() }).strict()).optional(),
  }).strict()).max(10000),
}).strict();

type DirectRunOptions = { taskPath: string; outputDirectory: string; bindingPath?: never; pythonExecutable?: string };
type BoundRunOptions = { bindingPath: string; taskPath?: never; outputDirectory?: never; pythonExecutable?: string };
export type RunApiTaskOptions = DirectRunOptions | BoundRunOptions;

function portable(value: string): string {
  return value.replaceAll("\\", "/");
}

function strictJson(text: string, label: string): unknown {
  const parsed = parseDocument(text, { uniqueKeys: true });
  if (parsed.errors.length) throw new Error(`${label}: ${parsed.errors.map(({ message }) => message).join("; ")}`);
  try { return JSON.parse(text); }
  catch (error) { throw new Error(`${label}: ${String(error)}`); }
}

async function readBoundFile(path: string, expectedSha256: string | null, label: string) {
  const bytes = await readFile(path);
  const actual = sha(bytes);
  if (expectedSha256 !== null && actual !== expectedSha256) throw new Error(`${label} digest mismatch`);
  return { bytes, text: bytes.toString("utf8"), sha256: actual };
}

function matchingPath(left: string, right: string): boolean {
  return process.platform === "win32" ? resolve(left).toLowerCase() === resolve(right).toLowerCase() : resolve(left) === resolve(right);
}

async function mustNotExist(path: string) {
  try { await access(path); throw new Error(`output directory already exists: ${path}`); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function parseJUnit(xml: string) {
  const tag = /<testsuite\b[^>]*>/u.exec(xml)?.[0];
  if (!tag) throw new Error("pytest JUnit testsuite element missing");
  const count = (name: string) => Number(new RegExp(`\\b${name}="([0-9]+)"`, "u").exec(tag)?.[1] ?? "0");
  const tests = count("tests"), failed = count("failures"), errors = count("errors"), skipped = count("skipped");
  return { tests, executed: tests - skipped, passed: tests - skipped - failed - errors, failed, errors, skipped };
}

async function runPytest(options: { pythonExecutable: string; outputDirectory: string; oraclePath: string }) {
  const junitPath = resolve(options.outputDirectory, "pytest.junit.xml");
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    PYTEST_DISABLE_PLUGIN_AUTOLOAD: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    HTTP_PROXY: "http://127.0.0.1:1",
    HTTPS_PROXY: "http://127.0.0.1:1",
    ALL_PROXY: "http://127.0.0.1:1",
    NO_PROXY: "",
    SKVM_PYTEST_ORACLE: options.oraclePath,
  };
  try {
    const result = await execute(options.pythonExecutable, [
      "-X", "utf8", "-I", "-B", "-m", "pytest", "-q", "-p", "no:cacheprovider",
      `--confcutdir=${options.outputDirectory}`, `--junitxml=${junitPath}`, "test_api_requests.py",
    ], { cwd: options.outputDirectory, env: environment, windowsHide: true, encoding: "utf8", timeout: 30_000, maxBuffer: 16_777_216 });
    return { status: "passed" as const, exitCode: 0, stdout: result.stdout, stderr: result.stderr,
      junit: parseJUnit(await readFile(junitPath, "utf8")) };
  } catch (error) {
    const failure = error as any;
    const xml = await readFile(junitPath, "utf8").catch(() => "");
    return { status: "failed" as const, exitCode: failure.code ?? null, stdout: String(failure.stdout ?? ""),
      stderr: String(failure.stderr ?? failure.message), junit: xml ? parseJUnit(xml) : null };
  }
}

async function resolveRun(options: RunApiTaskOptions) {
  let binding: ApiTaskRunBinding | null = null;
  let bindingPath: string | null = null;
  let baseDirectory: string;
  let taskPath: string;
  let outputDirectory: string;
  if ("bindingPath" in options && options.bindingPath !== undefined) {
    bindingPath = resolve(options.bindingPath);
    baseDirectory = dirname(bindingPath);
    const raw = await readBoundFile(bindingPath, null, "run binding");
    binding = parseApiTaskRunBinding(strictJson(raw.text, "run binding JSON"));
    taskPath = resolve(baseDirectory, binding.task.path);
    outputDirectory = resolve(baseDirectory, binding.output.directory);
  } else {
    taskPath = resolve(options.taskPath);
    baseDirectory = dirname(taskPath);
    outputDirectory = resolve(options.outputDirectory);
  }
  const taskFile = await readBoundFile(taskPath, binding?.task.sha256 ?? null, "task");
  const task = parseApiTaskContract(strictJson(taskFile.text, "task JSON"));
  const sourcePath = binding ? resolve(baseDirectory, binding.input.path) : resolve(dirname(taskPath), task.input.path);
  const expectedSourcePath = resolve(dirname(taskPath), task.input.path);
  if (!matchingPath(sourcePath, expectedSourcePath)) throw new Error("binding input path does not match TaskContract input path");
  if (binding && binding.input.format !== task.input.format) throw new Error("binding input format does not match TaskContract input format");
  const sourceFile = await readBoundFile(sourcePath, binding?.input.sha256 ?? null, "input");

  let dependencyManifest: z.infer<typeof ApiDependencyManifestSchema> | undefined = undefined;
  let dependencyManifestFile: Awaited<ReturnType<typeof readBoundFile>> | null = null;
  let dependencyManifestPath: string | null = null;
  const dependencyPayloads: Record<string, Uint8Array> = {};
  if (task.dependencyManifest === null) {
    if (binding?.dependencyManifest) throw new Error("binding declares a dependency manifest absent from TaskContract");
  } else {
    if (binding && !binding.dependencyManifest) throw new Error("binding omits the TaskContract dependency manifest");
    dependencyManifestPath = binding ? resolve(baseDirectory, binding.dependencyManifest!.path)
      : resolve(dirname(taskPath), task.dependencyManifest);
    const expectedPath = resolve(dirname(taskPath), task.dependencyManifest);
    if (!matchingPath(dependencyManifestPath, expectedPath)) throw new Error("binding dependency manifest path mismatch");
    dependencyManifestFile = await readBoundFile(dependencyManifestPath, binding?.dependencyManifest?.sha256 ?? null, "dependency manifest");
    dependencyManifest = ApiDependencyManifestSchema.parse(strictJson(dependencyManifestFile.text, "dependency manifest JSON"));
    for (const row of dependencyManifest.resources) {
      const file = await readBoundFile(resolve(dirname(dependencyManifestPath), row.path), row.sha256, `dependency ${row.path}`);
      dependencyPayloads[row.path] = file.bytes;
    }
  }

  let observationsFile: Awaited<ReturnType<typeof readBoundFile>> | null = null;
  let observationsPath: string | null = null;
  let observations: ApiTaskArtifactObservation[] = [];
  if (task.observations === null) {
    if (binding?.observations) throw new Error("binding declares observations absent from TaskContract");
  } else {
    if (binding && !binding.observations) throw new Error("binding omits TaskContract observations");
    observationsPath = binding ? resolve(baseDirectory, binding.observations!.path) : resolve(dirname(taskPath), task.observations.path);
    const expectedPath = resolve(dirname(taskPath), task.observations.path);
    if (!matchingPath(observationsPath, expectedPath)) throw new Error("binding observations path mismatch");
    observationsFile = await readBoundFile(observationsPath, binding?.observations?.sha256 ?? null, "observations");
    observations = ObservationFileSchema.parse(strictJson(observationsFile.text, "observations JSON")).observations;
  }

  let oracleFile: Awaited<ReturnType<typeof readBoundFile>> | null = null;
  let oraclePath: string | null = null;
  let oracle: unknown = null;
  if (task.execution.mode === "loopback") {
    if (binding && !binding.oracle) throw new Error("binding omits TaskContract loopback oracle");
    oraclePath = binding ? resolve(baseDirectory, binding.oracle!.path) : resolve(dirname(taskPath), task.execution.oraclePath);
    const expectedPath = resolve(dirname(taskPath), task.execution.oraclePath);
    if (!matchingPath(oraclePath, expectedPath)) throw new Error("binding oracle path mismatch");
    oracleFile = await readBoundFile(oraclePath, binding?.oracle?.sha256 ?? null, "oracle");
    oracle = strictJson(oracleFile.text, "oracle JSON");
  } else if (binding?.oracle) throw new Error("binding declares an oracle for offline validation");

  if (!binding) {
    const rel = (path: string) => portable(relative(baseDirectory, path));
    binding = {
      schemaVersion: "skvm-api-task-run-binding/v1",
      task: { path: rel(taskPath), sha256: taskFile.sha256 },
      input: { path: rel(sourcePath), format: task.input.format, sha256: sourceFile.sha256 },
      dependencyManifest: dependencyManifestFile && dependencyManifestPath
        ? { path: rel(dependencyManifestPath), sha256: dependencyManifestFile.sha256 } : null,
      observations: observationsFile && observationsPath ? { path: rel(observationsPath), sha256: observationsFile.sha256 } : null,
      oracle: oracleFile && oraclePath ? { path: rel(oraclePath), sha256: oracleFile.sha256 } : null,
      output: { directory: rel(outputDirectory) },
    };
  }
  return {
    binding,
    bindingPath,
    baseDirectory,
    task,
    taskPath,
    taskFile,
    sourcePath,
    sourceFile,
    outputDirectory,
    dependencyManifest,
    dependencyManifestFile,
    dependencyManifestPath,
    dependencyPayloads,
    observations,
    observationsFile,
    observationsPath,
    oracle,
    oracleFile,
    oraclePath,
  };
}

/** Ordinary, research-identity-free TaskContract compile/check/bundle/consume entry. */
export async function runApiTask(options: RunApiTaskOptions) {
  const resolved = await resolveRun(options);
  await mustNotExist(resolved.outputDirectory);
  const rootUri = resolved.dependencyManifest && typeof resolved.dependencyManifest === "object"
    ? (resolved.dependencyManifest as { rootUri: string }).rootUri
    : `https://skvm.local/${encodeURIComponent(resolved.task.taskId)}/openapi.${resolved.task.input.format}`;
  const artifact = await buildApiTaskArtifact({
    task: resolved.task,
    sourceText: resolved.sourceFile.text,
    rootUri,
    dependencyManifest: resolved.dependencyManifest,
    dependencyPayloads: resolved.dependencyPayloads,
    observations: resolved.observations,
    sourceRepository: null,
  });
  const packageCheck = await verifyApiTaskArtifact({
    task: resolved.task,
    sourceText: resolved.sourceFile.text,
    rootUri,
    dependencyManifest: resolved.dependencyManifest,
    dependencyPayloads: resolved.dependencyPayloads,
    observations: resolved.observations,
    sourceRepository: null,
    artifact,
  });
  if (packageCheck.status !== "pass") throw new Error(`task package verification failed: ${packageCheck.errors.join("; ")}`);
  let oracleCheck: Awaited<ReturnType<typeof verifyApiPytestOracle>> | null = null;
  if (resolved.task.execution.mode === "loopback" && resolved.task.output === "pytest") {
    if (artifact.backend.kind !== "pytest") throw new Error("pytest task emitted the wrong backend");
    oracleCheck = await verifyApiPytestOracle(resolved.sourceFile.text, resolved.task.input.format, artifact.backend.artifact, resolved.oracle);
    if (oracleCheck.status !== "pass") throw new Error(`loopback oracle verification failed: ${oracleCheck.errors.join("; ")}`);
    const oracleIds = new Set((resolved.oracle as { cases: Array<{ id: string }> }).cases.map(({ id }) => id));
    const missingSelectedRows = artifact.backend.selectedRowIds.filter((id) => !oracleIds.has(id));
    if (missingSelectedRows.length) {
      throw new Error(`loopback oracle does not cover task-selected pytest rows: ${missingSelectedRows.join(", ")}`);
    }
  }

  await mkdir(dirname(resolved.outputDirectory), { recursive: true });
  await mkdir(resolved.outputDirectory);
  const written: Array<{ path: string; sha256: string; bytes: number }> = [];
  const writtenPaths = new Set<string>();
  const emit = async (relativePath: string, content: string | Uint8Array) => {
    const normalized = portable(relativePath);
    if (writtenPaths.has(normalized)) throw new Error(`duplicate bundle path: ${normalized}`);
    writtenPaths.add(normalized);
    const path = resolve(resolved.outputDirectory, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
    const bytes = typeof content === "string" ? Buffer.from(content) : Buffer.from(content);
    written.push({ path: normalized, sha256: sha(bytes), bytes: bytes.byteLength });
  };
  const taskRoot = "inputs/task-root";
  const bundleTaskPath = portable(join(taskRoot, basename(resolved.taskPath)));
  const bundleInputPath = portable(join(taskRoot, resolved.task.input.path));
  const bundleDependencyPath = resolved.task.dependencyManifest === null ? null
    : portable(join(taskRoot, resolved.task.dependencyManifest));
  const bundleObservationsPath = resolved.task.observations === null ? null
    : portable(join(taskRoot, resolved.task.observations.path));
  const bundleOraclePath = resolved.task.execution.mode === "loopback" ? portable(join(taskRoot, resolved.task.execution.oraclePath)) : null;
  const replayBinding = parseApiTaskRunBinding({
    schemaVersion: "skvm-api-task-run-binding/v1",
    task: { path: bundleTaskPath, sha256: resolved.taskFile.sha256 },
    input: { path: bundleInputPath, format: resolved.task.input.format, sha256: resolved.sourceFile.sha256 },
    dependencyManifest: bundleDependencyPath && resolved.dependencyManifestFile
      ? { path: bundleDependencyPath, sha256: resolved.dependencyManifestFile.sha256 } : null,
    observations: bundleObservationsPath && resolved.observationsFile
      ? { path: bundleObservationsPath, sha256: resolved.observationsFile.sha256 } : null,
    oracle: bundleOraclePath && resolved.oracleFile ? { path: bundleOraclePath, sha256: resolved.oracleFile.sha256 } : null,
    output: { directory: "replay-output" },
  });
  await emit("input-binding.json", `${JSON.stringify(replayBinding, null, 2)}\n`);
  await emit(bundleTaskPath, resolved.taskFile.bytes);
  await emit(bundleInputPath, resolved.sourceFile.bytes);
  if (resolved.dependencyManifestFile && resolved.dependencyManifestPath) {
    await emit(bundleDependencyPath!, resolved.dependencyManifestFile.bytes);
    const manifest = resolved.dependencyManifest as z.infer<typeof ApiDependencyManifestSchema>;
    for (const row of manifest.resources) {
      await emit(portable(join(dirname(bundleDependencyPath!), row.path)), resolved.dependencyPayloads[row.path]!);
    }
  }
  if (resolved.observationsFile) await emit(bundleObservationsPath!, resolved.observationsFile.bytes);
  if (resolved.oracleFile) await emit(bundleOraclePath!, resolved.oracleFile.bytes);
  await emit("task-package.json", `${JSON.stringify(artifact, null, 2)}\n`);
  await emit("package-check.json", `${JSON.stringify(packageCheck, null, 2)}\n`);

  let backend: { kind: "request-json"; constructed: number; unresolved: number }
    | { kind: "pytest"; rows: number; selectedRows: number };
  let consumer: Record<string, unknown>;
  if (artifact.backend.kind === "request-json") {
    await emit("requests.json", `${JSON.stringify(artifact.backend.requests, null, 2)}\n`);
    const constructed = artifact.backend.requests.filter(({ status }) => status === "constructed").length;
    const unresolved = artifact.backend.requests.length - constructed;
    backend = { kind: "request-json", constructed, unresolved };
    consumer = { status: "exported", executed: 0, reason: "request JSON is a checked data artifact" };
  } else {
    const suite = JSON.parse(artifact.backend.artifact.suiteJson);
    await emit("suite.json", artifact.backend.artifact.suiteJson);
    await emit("test_api_requests.py", artifact.backend.artifact.testPython);
    await emit("requirements.txt", "pytest>=8\nhttpx>=0.27\n");
    backend = { kind: "pytest", rows: suite.rows.length, selectedRows: artifact.backend.selectedRowIds.length };
    if (resolved.task.execution.mode === "loopback") {
      await emit("oracle.json", resolved.oracleFile!.bytes);
      consumer = await runPytest({
        pythonExecutable: options.pythonExecutable ?? process.env.SKVM_PYTHON ?? "python",
        outputDirectory: resolved.outputDirectory,
        oraclePath: resolve(resolved.outputDirectory, "oracle.json"),
      });
    } else consumer = { status: "not-executed", reason: "offline-validation requested; pytest package was compiled and checked only" };
  }
  const status = consumer.status === "failed" ? "failed" as const : "completed" as const;
  const report = {
    schemaVersion: "skvm-api-task-run-report/v1" as const,
    status,
    profile: "oas30-offline-test/v1" as const,
    supportContract: "development-rich-task/v1" as const,
    taskId: resolved.task.taskId,
    taskComplete: artifact.completion.taskComplete,
    input: { path: portable(resolved.sourcePath), format: resolved.task.input.format, sha256: resolved.sourceFile.sha256 },
    outputDirectory: portable(resolved.outputDirectory),
    bindings: artifact.bindings,
    packageCheck,
    backend,
    consumer,
    oracleCheck,
    accounting: {
      loopbackHttpCalls: consumer.status === "passed" && consumer.junit && typeof consumer.junit === "object"
        ? Number((consumer.junit as { executed: number }).executed) : 0,
      remoteHttpCalls: 0,
      projectModelCalls: 0,
      paidCalls: 0,
      naturalLanguageImport: "not-performed" as const,
    },
    claimLimits: [
      "development-rich-task/v1 is separate from the production API Tester v2 support contract",
      "compiled validation and replay perform no model calls",
      "task completion does not prove live API behavior without an explicit oracle",
    ],
  };
  await emit("run-report.json", `${JSON.stringify(report, null, 2)}\n`);
  const manifest = {
    schemaVersion: "skvm-api-task-bundle-manifest/v1",
    taskId: resolved.task.taskId,
    files: written.slice().sort((left, right) => left.path.localeCompare(right.path)),
  };
  await writeFile(resolve(resolved.outputDirectory, "bundle-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return report;
}
