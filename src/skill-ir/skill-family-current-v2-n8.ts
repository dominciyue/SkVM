import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { runApiTask } from "./api-task-run";

const execute = promisify(execFile);
const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");

const SOURCE = JSON.stringify({
  openapi: "3.0.3",
  info: { title: "N8 ordinary engine fixture", version: "1" },
  paths: {
    "/health": { get: { responses: { "200": { description: "health response is not used as a behavior oracle" } } } },
    "/items": { post: {
      requestBody: { required: true, content: { "application/json": { schema: {
        type: "object", required: ["name"], additionalProperties: false,
        properties: { name: { type: "string", minLength: 1, enum: ["item"] } },
      } } } },
      responses: { "201": { description: "created response is not used as a behavior oracle" } },
    } },
  },
});

type CaseDefinition = {
  id: string;
  operationKey: string;
  requirementId: string;
  requirementKind: "valid-minimal" | "valid-full";
  output: "request-json" | "pytest";
};

const CASES: CaseDefinition[] = [
  { id: "base-minimal", operationKey: "GET /health", requirementId: "minimal", requirementKind: "valid-minimal", output: "request-json" },
  { id: "requirement-full", operationKey: "GET /health", requirementId: "full", requirementKind: "valid-full", output: "request-json" },
  { id: "operation-post", operationKey: "POST /items", requirementId: "minimal", requirementKind: "valid-minimal", output: "request-json" },
  { id: "output-pytest", operationKey: "GET /health", requirementId: "minimal", requirementKind: "valid-minimal", output: "pytest" },
];

function contract(definition: CaseDefinition) {
  return {
    schemaVersion: "skvm-api-task/v1",
    taskId: `n8-${definition.id}`,
    profile: "oas30-offline-test/v1",
    input: { path: "openapi.json", format: "json", dialect: "oas3.0" },
    dependencyManifest: null,
    operationKeys: [definition.operationKey],
    requirements: [{ id: definition.requirementId, kind: definition.requirementKind, required: true,
      scope: "each-selected-operation", sourceLocator: `n8:${definition.id}` }],
    output: definition.output,
    observations: null,
    execution: { mode: "offline-validation" },
    mapping: { origin: "user-declared", sourceSkill: null, unresolvedRequirementIds: [] },
  };
}

async function writeCase(root: string, definition: CaseDefinition) {
  const directory = join(root, definition.id);
  await mkdir(directory, { recursive: true });
  const task = contract(definition);
  await writeFile(join(directory, "openapi.json"), SOURCE);
  await writeFile(join(directory, "task.json"), `${JSON.stringify(task, null, 2)}\n`);
  const run = await runApiTask({ taskPath: join(directory, "task.json"), outputDirectory: join(directory, "out") });
  const packageBytes = await readFile(join(directory, "out", "task-package.json"));
  const artifact = JSON.parse(packageBytes.toString("utf8"));
  return {
    id: definition.id,
    operationKey: definition.operationKey,
    requirement: { id: definition.requirementId, kind: definition.requirementKind },
    requestedOutput: definition.output,
    actualBackend: run.backend.kind,
    status: run.status,
    taskComplete: run.taskComplete,
    packageCheck: run.packageCheck.status,
    semanticPlanSha256: artifact.plan.semanticPlanSha256 as string,
    packageSha256: sha(packageBytes),
    bindings: run.bindings,
    accounting: {
      loopbackHttpCalls: run.accounting.loopbackHttpCalls,
      remoteHttpCalls: run.accounting.remoteHttpCalls,
      projectModelCalls: run.accounting.projectModelCalls,
      paidCalls: run.accounting.paidCalls,
    },
    outputDirectory: join(directory, "out"),
  };
}

function parsedTestSummary(output: string) {
  const pass = /([0-9]+) pass/u.exec(output), fail = /([0-9]+) fail/u.exec(output), assertions = /([0-9]+) expect\(\) calls/u.exec(output);
  return { passed: Number(pass?.[1] ?? 0), failed: Number(fail?.[1] ?? 0), assertions: Number(assertions?.[1] ?? 0) };
}

export async function runN8EngineEvidence(options: { repositoryRoot: string }) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "skvm-n8-engine-"));
  try {
    const cases = [];
    for (const definition of CASES) cases.push(await writeCase(temporaryRoot, definition));
    const base = cases[0]!;
    const replay = await runApiTask({ bindingPath: join(base.outputDirectory, "input-binding.json") });

    const cliDirectory = join(temporaryRoot, "documented-cli");
    await mkdir(cliDirectory);
    await writeFile(join(cliDirectory, "openapi.json"), SOURCE);
    await writeFile(join(cliDirectory, "task.json"), `${JSON.stringify(contract(CASES[0]!), null, 2)}\n`);
    let cli: { exitCode: number | string | null; status: string | null; taskComplete: boolean | null; stderr: string };
    try {
      const result = await execute(process.execPath, [
        join(options.repositoryRoot, "bin", "skvm.js"), "artifact", "task", "--task=task.json", "--out=out",
      ], { cwd: cliDirectory, env: { ...process.env, SKVM_BUN_BIN: process.execPath }, windowsHide: true,
        encoding: "utf8", timeout: 20_000, maxBuffer: 16_777_216 });
      const parsed = JSON.parse(result.stdout);
      cli = { exitCode: 0, status: parsed.status, taskComplete: parsed.taskComplete, stderr: result.stderr };
    } catch (error) {
      const failure = error as any;
      cli = { exitCode: failure.code ?? null, status: null, taskComplete: null, stderr: String(failure.stderr ?? failure.message) };
    }

    let legacy: { exitCode: number | string | null; summary: ReturnType<typeof parsedTestSummary> };
    try {
      const result = await execute(process.execPath, ["test", "./src/skill-ir/api-tester-production-artifact.test.ts", "./src/cli/artifact-entrypoint.test.ts"],
        { cwd: options.repositoryRoot, windowsHide: true, encoding: "utf8", timeout: 30_000, maxBuffer: 16_777_216 });
      legacy = { exitCode: 0, summary: parsedTestSummary(`${result.stdout}\n${result.stderr}`) };
    } catch (error) {
      const failure = error as any;
      legacy = { exitCode: failure.code ?? null,
        summary: parsedTestSummary(`${String(failure.stdout ?? "")}\n${String(failure.stderr ?? "")}`) };
    }

    const genericFiles = ["src/skill-ir/api-task-run.ts", "src/skill-ir/api-task-artifact.ts", "src/skill-ir/api-task-artifact-checker.ts"];
    const forbiddenSourceTokens = ["onepassword", "meilisearch", "bangumi", "skill-family-current-v2-source-repair-001"];
    const tokenMatches: Array<{ path: string; token: string }> = [];
    for (const path of genericFiles) {
      const text = (await readFile(join(options.repositoryRoot, path), "utf8")).toLowerCase();
      for (const token of forbiddenSourceTokens) if (text.includes(token)) tokenMatches.push({ path, token });
    }
    const accounting = cases.reduce((total, row) => ({
      loopbackHttpCalls: total.loopbackHttpCalls + row.accounting.loopbackHttpCalls,
      remoteHttpCalls: total.remoteHttpCalls + row.accounting.remoteHttpCalls,
      projectModelCalls: total.projectModelCalls + row.accounting.projectModelCalls,
      paidCalls: total.paidCalls + row.accounting.paidCalls,
    }), { loopbackHttpCalls: 0, remoteHttpCalls: 0, projectModelCalls: 0, paidCalls: 0 });
    const fromRepository = relative(options.repositoryRoot, temporaryRoot);
    const tempOutsideRepository = isAbsolute(fromRepository) || fromRepository === ".." || fromRepository.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`);
    const relations = {
      ordinaryTemporaryDirectory: tempOutsideRepository && cases.every((row) => row.status === "completed" && row.packageCheck === "pass"),
      requirementChangesArtifact: cases[0]!.semanticPlanSha256 !== cases[1]!.semanticPlanSha256
        && cases[0]!.packageSha256 !== cases[1]!.packageSha256,
      operationChangesArtifact: cases[0]!.semanticPlanSha256 !== cases[2]!.semanticPlanSha256
        && cases[0]!.packageSha256 !== cases[2]!.packageSha256,
      outputChangesBackend: cases[0]!.actualBackend === "request-json" && cases[3]!.actualBackend === "pytest"
        && cases[0]!.packageSha256 !== cases[3]!.packageSha256,
      bundleReplayMatchesBindings: replay.status === "completed" && replay.taskComplete === base.taskComplete
        && JSON.stringify(replay.bindings) === JSON.stringify(base.bindings),
      documentedCliExecuted: cli.exitCode === 0 && cli.status === "completed" && cli.taskComplete === true && cli.stderr === "",
      productionV2RegressionPassed: legacy.exitCode === 0 && legacy.summary.failed === 0 && legacy.summary.passed > 0,
      repositoryAgnosticDispatch: tokenMatches.length === 0,
      projectModelCallsZero: accounting.projectModelCalls === 0,
    };
    const decision = Object.values(relations).every(Boolean) ? "passed" as const : "failed" as const;
    return {
      schemaVersion: "skill-family-current-v2-n8-engine/v1" as const,
      identity: "skill-family-current-v2-source-repair-001" as const,
      exposure: "development" as const,
      supportProfile: "development-rich-task/v1" as const,
      command: "bun ./bin/skvm.js artifact task --task=task.json --out=out",
      bindingCommand: "bun ./bin/skvm.js artifact task --binding=run-binding.json",
      workspace: { kind: "os-temporary-outside-repository", persisted: false },
      cases: cases.map(({ outputDirectory: _, ...row }) => row),
      bundleReplay: { status: replay.status, taskComplete: replay.taskComplete, bindings: replay.bindings },
      cli,
      legacyProductionV2: legacy,
      genericDispatchScan: { files: genericFiles, forbiddenSourceTokens, matches: tokenMatches },
      relations,
      accounting,
      decision,
      claimLimits: [
        "N8 demonstrates an ordinary deterministic development entry, not prospective transfer",
        "development-rich-task/v1 does not change the production API Tester v2 support contract",
        "natural-language skill mapping remains separately reviewed and was not invoked",
      ],
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function writeN8EngineReportFromRepository(root: string) {
  const report = await runN8EngineEvidence({ repositoryRoot: root });
  const relativePath = "results/skill-ir/skill-family-current-v2-source-repair-001/integration/engine-report.json";
  const text = `${JSON.stringify(report, null, 2)}\n`;
  await writeFile(join(root, relativePath), text);
  return { report, file: { path: relativePath, sha256: sha(text), bytes: Buffer.byteLength(text) } };
}
