import { createHash } from "node:crypto";
import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { currentV2LoopbackFixtures } from "./skill-family-current-v2-n5";
import {
  collectSchemathesisFailureChecks,
  createCurrentV2SchemathesisArguments,
  deriveCurrentV2AddedValueEvidence,
} from "./skill-family-current-v2-n13";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");

test("N13 fixes the actual external-tool budget while reusing the exact N5 fixtures", async () => {
  const fixtures = currentV2LoopbackFixtures();
  expect(fixtures.map((row) => [row.id, sha(row.source)])).toEqual([
    ["json-reference", "ea2dfe81ded878cf9aa4cfa6d51bd24d5f7e47e606c9d707d165b80f9581b81b"],
    ["form-wire", "ccad5c315e8fb3c7a9d000c3c60b31a4ef9ba81b2d667860b856aa5815caa3d5"],
  ]);
  const arguments_ = createCurrentV2SchemathesisArguments({
    sourcePath: "source.json",
    baseUrl: "http://127.0.0.1:43123",
    reportDirectory: "report",
  });
  expect(arguments_).toContain("--max-examples=2");
  expect(arguments_).toContain("--request-timeout=5");
  expect(arguments_).toContain("--max-time=30");
  expect(arguments_).toContain("--request-retries=0");
  expect(arguments_).toContain("--seed=20260912");
  expect(arguments_).toContain("--generation-deterministic");
  expect(arguments_).toContain("--generation-unique-inputs");
  expect(arguments_).toContain("--generation-database=none");
  expect(arguments_).toContain("--workers=1");
  expect(arguments_).toContain("--mode=positive");
  expect(arguments_).toContain("--phases=fuzzing");
});

test("N13 attributes a fault only to the named Schemathesis check", () => {
  const raw = {
    events: [{ failures: [
      { id: "response_schema_conformance", message: "body mismatch" },
      { id: "status_code_conformance", message: "status mismatch" },
    ] }],
  };
  expect(collectSchemathesisFailureChecks(raw)).toEqual([
    "response_schema_conformance",
    "status_code_conformance",
  ]);
  expect(collectSchemathesisFailureChecks({ error: "some unrelated crash" })).toEqual([]);
});

test("N13 derives traceability and task-conditioned deltas from archived evidence", async () => {
  const repositoryRoot = resolve(import.meta.dir, "../..");
  const evidence = await deriveCurrentV2AddedValueEvidence(repositoryRoot);
  expect(evidence.traceability.requiredObligations).toBeGreaterThan(0);
  expect(evidence.traceability.allRequiredObligationsLocated).toBe(true);
  expect(evidence.sameSourceTaskDelta.sourceInputId).toBe("zapier-embed");
  expect(evidence.sameSourceTaskDelta.semanticPlansDiffer).toBe(true);
  expect(evidence.sameSourceTaskDelta.requiredOutcomesDiffer).toBe(true);
  expect(evidence.modelCalls).toBe(0);
});
