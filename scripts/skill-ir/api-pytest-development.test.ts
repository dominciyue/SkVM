import { test, expect } from "bun:test";
import { mkdtemp, writeFile, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { runApiPytestDevelopment } from "./api-pytest-development";

test("native batch executes Python but keeps absent oracle as skipped and isolates bad source bindings", async () => {
  const root = await mkdtemp(join(tmpdir(), "skvm-pytest-batch-"));
  const text = JSON.stringify({ openapi: "3.0.3", info: { title: "Synthetic", version: "1" }, paths: { "/health": { get: { responses: { "200": { description: "unknown fixture" } } } } } });
  await writeFile(join(root, "source.json"), text);
  await writeFile(join(root, "inputs.json"), JSON.stringify({ inputs: [
    { inputId: "valid", status: "acquired", localPath: "source.json", format: "json", sha256: createHash("sha256").update(text).digest("hex") },
    { inputId: "drift", status: "acquired", localPath: "source.json", format: "json", sha256: "0".repeat(64) },
    { inputId: "unavailable", status: "failed" },
  ] }));
  const report = await runApiPytestDevelopment({ rootDir: root, executionRoot: process.cwd(), inputIndexPath: "inputs.json", outputPath: "output", pythonExecutable: process.env.SKVM_TEST_PYTHON ?? Bun.which("python")! });
  expect(report.rows.map((r) => r.status)).toEqual(["collected-all-skipped", "error", "error"]);
  expect(report.rows[0]!.python?.counts).toMatchObject({ tests: 2, skipped: 2, failures: 0, errors: 0, cases: 2 });
  expect(report.rows[0]!.verification?.constructedCases).toBe(2);
  expect(report.remoteHttpCalls).toBe(0);
  expect(JSON.parse(await readFile(join(root, "output/report.json"), "utf8")).rows).toHaveLength(3);
  expect(await readdir(join(root, "output/valid"))).not.toContain("__pycache__");
}, 30000);
