import { test, expect } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { runSpecimenDevelopment } from "./api-request-specimens-development";

test("development specimen batch retains unavailable and digest-drift inputs beside successful input", async () => {
  const root = await mkdtemp(join(tmpdir(), "skvm-specimen-batch-"));
  const source = JSON.stringify({ openapi: "3.0.3", info: { title: "Synthetic", version: "1" }, paths: { "/health": { get: { responses: { "200": { description: "ok" } } } } } });
  await writeFile(join(root, "source.json"), source);
  await writeFile(join(root, "inputs.json"), JSON.stringify({ inputs: [
    { inputId: "good", status: "acquired", localPath: "source.json", format: "json", sha256: createHash("sha256").update(source).digest("hex") },
    { inputId: "drift", status: "acquired", localPath: "source.json", format: "json", sha256: "0".repeat(64) },
    { inputId: "unavailable", status: "failed" },
  ] }));
  const report = await runSpecimenDevelopment({ rootDir: root, inputIndexPath: "inputs.json", outputPath: "output", executionRoot: process.cwd() });
  expect(report.rows.map((r) => r.status)).toEqual(["pass", "error", "error"]);
  expect(report.rows[0]!.constructed).toBe(2);
  expect(JSON.parse(await readFile(join(root, "output/report.json"), "utf8")).rows).toHaveLength(3);
  expect(report.projectModelCalls).toBe(0);
  const negatives = await runSpecimenDevelopment({ rootDir: root, inputIndexPath: "inputs.json", outputPath: "negative-output", executionRoot: process.cwd(), profile: "body-negatives" });
  expect(negatives.rows.map((r) => r.status)).toEqual(["pass", "error", "error"]);
  expect(negatives.rows[0]!.constructed).toBe(0);
  expect(JSON.parse(await readFile(join(root, "negative-output/good.json"), "utf8")).report.schemaVersion).toBe("api-request-body-negatives/v1");
});

test("hash-bound malformed UTF-8 input is an explicit failure, not replacement-character source", async () => {
  const root = await mkdtemp(join(tmpdir(), "skvm-specimen-utf8-"));
  const text = JSON.stringify({ openapi: "3.0.3", info: { title: "Synthetic", version: "1" }, paths: { "/item": { get: { responses: { "200": { description: "ok" } } } } } });
  const invalid = Buffer.from(text.replace("Synthetic", "Synthetix"));
  invalid[invalid.indexOf("Synthetix")] = 0xff;
  await writeFile(join(root, "bad.json"), invalid);
  await writeFile(join(root, "good.json"), text);
  await writeFile(join(root, "inputs.json"), JSON.stringify({ inputs: [
    { inputId: "bad", status: "acquired", localPath: "bad.json", format: "json", sha256: createHash("sha256").update(invalid).digest("hex") },
    { inputId: "good", status: "acquired", localPath: "good.json", format: "json", sha256: createHash("sha256").update(text).digest("hex") },
  ] }));
  for (const profile of ["specimens", "form-specimens", "body-negatives"] as const) {
    const report = await runSpecimenDevelopment({ rootDir: root, inputIndexPath: "inputs.json", outputPath: profile, executionRoot: process.cwd(), profile });
    expect(report.rows.map((r) => r.status)).toEqual(["error", "pass"]);
    expect(report.rows[0]!.error).toContain("UTF-8");
    expect(JSON.parse(await readFile(join(root, profile, "report.json"), "utf8")).rows).toHaveLength(2);
  }
});
