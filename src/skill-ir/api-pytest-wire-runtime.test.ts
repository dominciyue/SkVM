import { test, expect } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runNativeWireFixture } from "../../scripts/skill-ir/api-pytest-wire-loopback";

test("native HTTP preserves form, escaped path/query arrays and header; cookie remains unresolved", async () => {
  const out = await mkdtemp(join(tmpdir(), "skvm-native-wire-中文-"));
  const report = await runNativeWireFixture({ outputDirectory: out, pythonExecutable: process.env.SKVM_TEST_PYTHON ?? Bun.which("python")! });
  expect(report.status).toBe("pass");
  expect(report.oracleVerification.status).toBe("pass");
  expect(report.observations.length).toBe(2);
  expect(report.observations.map(v => v.status).sort()).toEqual([200, 422]);
  expect(report.observations.every(v => v.wireValid)).toBe(true);
  expect(report.python.stdout).toContain("2 passed, 8 skipped");
  expect(report.cookieUnsupportedRows).toBe(5);
  expect(report.minimalArrayShapeUnresolvedRows).toBe(3);
  expect(report.python.stdout).toContain("中文");
}, 30000);
