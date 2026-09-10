import { test, expect } from "bun:test";
import { runLoopbackTransportVerification } from "./api-loopback-transport";

test("actual loopback transport preserves encoded path/query/header/body and detects query corruption", async () => {
  const report = await runLoopbackTransportVerification();
  expect(report.rows.length).toBeGreaterThan(5);
  expect(report.rows.every((r) => r.status === "pass")).toBe(true);
  expect(report.rows.find((r) => r.kind === "positive")?.actualStatus).toBe(200);
  expect(report.rows.filter((r) => r.kind === "body-negative").every((r) => r.actualStatus === 422)).toBe(true);
  expect(report.rows.find((r) => r.kind === "intentional-wire-corruption")?.actualStatus).toBe(409);
  expect(report.remoteHttpCalls).toBe(0);
  expect(report.loopbackHttpCalls).toBe(report.rows.length);
}, 15000);
