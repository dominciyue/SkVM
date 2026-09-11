import { test, expect } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runNativePytestLoopback } from "../../scripts/skill-ir/api-pytest-loopback";

test("real pytest executes independent fixture, detects exact fault layers, skips absent oracle and never follows redirect", async () => {
  const directory = await mkdtemp(join(tmpdir(), "skvm-native-pytest-"));
  const python = process.env.SKVM_TEST_PYTHON ?? Bun.which("python");
  if (!python) throw new Error("Python with pinned pytest/httpx required");
  const report = await runNativePytestLoopback({ outputDirectory: directory, pythonExecutable: python });
  if (report.status !== "pass") console.error(JSON.stringify(report.runs));
  expect(report.oracleVerification.status).toBe("pass");
  expect(report.status).toBe("pass");
  expect(report.runs).toHaveLength(7);
  expect(report.correctlyDetected).toBe(15);
  expect(report.loopbackHttpCalls).toBe(15);
  expect(report.observations.filter((o) => o.status === 200).every((o) => o.text === '{"name":"a&中文"}')).toBe(true);
  expect(report.observations.some((o) => o.target === "/redirected")).toBe(false);
}, 30000);
