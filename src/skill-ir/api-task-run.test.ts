import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildApiTaskArtifact } from "./api-task-artifact";
import { parseApiTaskRunBinding, runApiTask, type ApiTaskRunBinding } from "./api-task-run";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const directories: string[] = [];
afterAll(async () => Promise.all(directories.map((directory) => rm(directory, { recursive: true, force: true }))));

const SOURCE = JSON.stringify({
  openapi: "3.0.3",
  info: { title: "Ordinary task fixture", version: "1" },
  paths: {
    "/health": {
      get: {
        responses: {
          "200": {
            description: "healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object", required: ["ok"], additionalProperties: false,
                  properties: { ok: { type: "boolean", enum: [true] } },
                },
              },
            },
          },
        },
      },
    },
  },
});

function task(output: "request-json" | "pytest", execution: unknown = { mode: "offline-validation" }) {
  return {
    schemaVersion: "skvm-api-task/v1",
    taskId: `ordinary-${output}`,
    profile: "oas30-offline-test/v1",
    input: { path: "openapi.json", format: "json", dialect: "oas3.0" },
    dependencyManifest: null,
    operationKeys: ["GET /health"],
    requirements: [
      { id: "minimal", kind: "valid-minimal", required: true, scope: "each-selected-operation", sourceLocator: "task:requirements/0" },
    ],
    output,
    observations: null,
    execution,
    mapping: { origin: "user-declared", sourceSkill: null, unresolvedRequirementIds: [] },
  };
}

async function fixtureDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "skvm-api-task-run-"));
  directories.push(directory);
  await writeFile(join(directory, "openapi.json"), SOURCE);
  return directory;
}

describe("ordinary API TaskContract run", () => {
  test("runs from an arbitrary directory and exports a checked request-json bundle with no research identity", async () => {
    const directory = await fixtureDirectory();
    const rawTask = JSON.stringify(task("request-json"), null, 2) + "\n";
    const taskPath = join(directory, "task.json");
    await writeFile(taskPath, rawTask);
    const report = await runApiTask({ taskPath, outputDirectory: join(directory, "out") });
    expect(report.status).toBe("completed");
    expect(report.taskComplete).toBe(true);
    expect(report.backend).toMatchObject({ kind: "request-json", constructed: 1, unresolved: 0 });
    expect(report.accounting).toMatchObject({ loopbackHttpCalls: 0, remoteHttpCalls: 0, projectModelCalls: 0, paidCalls: 0,
      naturalLanguageImport: "not-performed" });
    expect(JSON.parse(await readFile(join(directory, "out", "task-package.json"), "utf8")).schemaVersion)
      .toBe("skvm-api-task-artifact/v1");
    expect(JSON.parse(await readFile(join(directory, "out", "input-binding.json"), "utf8"))).toMatchObject({
      task: { path: "inputs/task-root/task.json", sha256: sha(rawTask) },
      input: { path: "inputs/task-root/openapi.json", sha256: sha(SOURCE), format: "json" },
      output: { directory: "replay-output" },
    });
    const replay = await runApiTask({ bindingPath: join(directory, "out", "input-binding.json") });
    expect(replay).toMatchObject({ status: "completed", taskId: "ordinary-request-json", taskComplete: true });
  });

  test("executes a task-selected pytest package against an explicit loopback oracle", async () => {
    const directory = await fixtureDirectory();
    const rawTask = task("pytest", { mode: "loopback", oraclePath: "oracle.json" });
    const artifact = await buildApiTaskArtifact({
      task: rawTask,
      sourceText: SOURCE,
      rootUri: "https://skvm.local/ordinary-pytest/openapi.json",
      observations: [],
    });
    if (artifact.backend.kind !== "pytest") throw new Error("expected pytest backend");
    const suite = JSON.parse(artifact.backend.artifact.suiteJson);
    const row = suite.rows.find((candidate: any) => artifact.backend.kind === "pytest" && artifact.backend.selectedRowIds.includes(candidate.id));
    const received: string[] = [];
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
      const target = new URL(request.url).pathname;
      received.push(`${request.method} ${target}`);
      const valid = request.method === "GET" && target === "/health";
      return new Response(JSON.stringify({ ok: valid }), { status: valid ? 200 : 409, headers: { "content-type": "application/json" } });
    } });
    const oracle = {
      schemaVersion: "api-pytest-loopback-oracle/v1",
      suiteSha256: sha(artifact.backend.artifact.suiteJson),
      fixtureSha256: "a".repeat(64),
      origin: `http://127.0.0.1:${server.port}`,
      cases: [{ id: row.id, requestSha256: sha(row.requestJson), response: {
        statusCode: 200, mediaType: "application/json", bodyText: JSON.stringify({ ok: true }),
      } }],
    };
    await writeFile(join(directory, "task.json"), JSON.stringify(rawTask, null, 2) + "\n");
    await writeFile(join(directory, "oracle.json"), JSON.stringify(oracle, null, 2) + "\n");
    let report;
    try {
      report = await runApiTask({ taskPath: join(directory, "task.json"), outputDirectory: join(directory, "out"), pythonExecutable: "python" });
    } finally {
      await server.stop(true);
    }
    expect(report.status).toBe("completed");
    expect(report.consumer).toMatchObject({ status: "passed", junit: { tests: 2, executed: 1, passed: 1, failed: 0, errors: 0, skipped: 1 } });
    expect(received).toEqual(["GET /health"]);
  }, 20_000);

  test("strict run binding supplies paths, formats, digests and output and rejects drift before output creation", async () => {
    const directory = await fixtureDirectory();
    const rawTask = JSON.stringify(task("request-json"), null, 2) + "\n";
    await writeFile(join(directory, "task.json"), rawTask);
    const binding: ApiTaskRunBinding = {
      schemaVersion: "skvm-api-task-run-binding/v1",
      task: { path: "task.json", sha256: sha(rawTask) },
      input: { path: "openapi.json", format: "json", sha256: sha(SOURCE) },
      dependencyManifest: null,
      observations: null,
      oracle: null,
      output: { directory: "bound-out" },
    };
    expect(parseApiTaskRunBinding(binding)).toEqual(binding);
    await writeFile(join(directory, "binding.json"), JSON.stringify(binding, null, 2) + "\n");
    const report = await runApiTask({ bindingPath: join(directory, "binding.json") });
    expect(report.status).toBe("completed");

    binding.input.sha256 = "0".repeat(64);
    binding.output.directory = "bad-out";
    await writeFile(join(directory, "bad-binding.json"), JSON.stringify(binding, null, 2) + "\n");
    await expect(runApiTask({ bindingPath: join(directory, "bad-binding.json") })).rejects.toThrow("input digest mismatch");
    await expect(access(join(directory, "bad-out"))).rejects.toThrow();
  });

  test("rejects an oracle that verifies an unselected suite row while the task-selected row would skip", async () => {
    const directory = await fixtureDirectory();
    const rawTask = task("pytest", { mode: "loopback", oraclePath: "oracle.json" });
    const artifact = await buildApiTaskArtifact({
      task: rawTask,
      sourceText: SOURCE,
      rootUri: "https://skvm.local/ordinary-pytest/openapi.json",
      observations: [],
    });
    if (artifact.backend.kind !== "pytest") throw new Error("expected pytest backend");
    const backend = artifact.backend;
    const suite = JSON.parse(backend.artifact.suiteJson);
    const unselected = suite.rows.find((row: any) => !backend.selectedRowIds.includes(row.id));
    const oracle = {
      schemaVersion: "api-pytest-loopback-oracle/v1",
      suiteSha256: sha(backend.artifact.suiteJson), fixtureSha256: "b".repeat(64), origin: "http://127.0.0.1:1",
      cases: [{ id: unselected.id, requestSha256: sha(unselected.requestJson), response: {
        statusCode: 200, mediaType: "application/json", bodyText: JSON.stringify({ ok: true }),
      } }],
    };
    await writeFile(join(directory, "task.json"), JSON.stringify(rawTask, null, 2) + "\n");
    await writeFile(join(directory, "oracle.json"), JSON.stringify(oracle, null, 2) + "\n");
    await expect(runApiTask({ taskPath: join(directory, "task.json"), outputDirectory: join(directory, "out") }))
      .rejects.toThrow("task-selected pytest rows");
    await expect(access(join(directory, "out"))).rejects.toThrow();
  });
});
