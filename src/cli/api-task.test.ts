import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { parseApiTaskCliArguments } from "./api-task";

const directories: string[] = [];
afterAll(async () => Promise.all(directories.map((directory) => rm(directory, { recursive: true, force: true }))));

describe("artifact task CLI", () => {
  test("accepts either an ordinary task plus output or a complete run binding", () => {
    expect(parseApiTaskCliArguments(["--task=task.json", "--out=out"], "D:/work")).toEqual({
      taskPath: "D:/work/task.json",
      outputDirectory: "D:/work/out",
      pythonExecutable: undefined,
    });
    expect(parseApiTaskCliArguments(["--binding=run.json", "--python=python3"], "D:/work")).toEqual({
      bindingPath: "D:/work/run.json",
      pythonExecutable: "python3",
    });
    expect(() => parseApiTaskCliArguments(["--task=task.json", "--binding=run.json", "--out=out"], "D:/work"))
      .toThrow("mutually exclusive");
    expect(() => parseApiTaskCliArguments(["--task=task.json"], "D:/work")).toThrow("--out");
    expect(() => parseApiTaskCliArguments(["--task=task.json", "--out=out", "--unknown=x"], "D:/work"))
      .toThrow("unknown task option");
  });

  test("runs the documented bin/skvm.js artifact task command outside research directories", async () => {
    const directory = await mkdtemp(join(tmpdir(), "skvm-artifact-task-cli-"));
    directories.push(directory);
    const source = JSON.stringify({ openapi: "3.0.3", info: { title: "CLI", version: "1" }, paths: {
      "/health": { get: { responses: { "200": { description: "ok" } } } },
    } });
    const task = {
      schemaVersion: "skvm-api-task/v1", taskId: "cli-task", profile: "oas30-offline-test/v1",
      input: { path: "openapi.json", format: "json", dialect: "oas3.0" }, dependencyManifest: null,
      operationKeys: ["GET /health"], requirements: [{ id: "minimal", kind: "valid-minimal", required: true,
        scope: "each-selected-operation", sourceLocator: "task:0" }], output: "request-json", observations: null,
      execution: { mode: "offline-validation" }, mapping: { origin: "user-declared", sourceSkill: null, unresolvedRequirementIds: [] },
    };
    await writeFile(join(directory, "openapi.json"), source);
    await writeFile(join(directory, "task.json"), JSON.stringify(task, null, 2) + "\n");
    const result = spawnSync(process.execPath, [join(process.cwd(), "bin", "skvm.js"), "artifact", "task", "--task=task.json", "--out=out"], {
      cwd: directory,
      encoding: "utf8",
      env: { ...process.env, SKVM_BUN_BIN: process.execPath },
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "completed", taskId: "cli-task", taskComplete: true,
      accounting: { projectModelCalls: 0, remoteHttpCalls: 0, paidCalls: 0 } });
    expect(JSON.parse(await readFile(join(directory, "out", "run-report.json"), "utf8"))).toEqual(JSON.parse(result.stdout));
  }, 20_000);
});
