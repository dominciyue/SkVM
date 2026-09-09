import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  API_TESTER_OPERATION_INPUT_IDENTITY,
  ApiTesterOperationInputManifestSchema,
  ApiTesterOperationInputReportSchema,
  runApiTesterOperationInput,
  verifyApiTesterOperationInputOutput,
  verifyApiTesterOperationInputSemantics,
} from "./api-tester-operation-input";
import { parseApiTesterOperationInputArgs } from "./api-tester-operation-input-run";

const temporaryDirectories: string[] = [];
const nodeExecutable = Bun.which("node")!;

const MIXED_DOCUMENT = {
  openapi: "3.1.0",
  info: { title: "ordinary operation input", version: "1" },
  paths: {
    "/accepted": {
      get: {
        operationId: "accepted",
        summary: "Accepted operation",
        responses: { "200": { description: "ok" } },
      },
    },
    "/advisory": {
      get: {
        operationId: "advisory",
        summary: "External response advisory",
        responses: { "200": { $ref: "./responses.yaml#/Ok" } },
      },
    },
    "/rejected": {
      post: {
        parameters: [{ name: "session", in: "cookie", schema: { type: "string" } }],
        responses: { default: { description: "unknown" } },
      },
    },
    "/unresolved": {
      get: {
        parameters: [{ $ref: "#/components/parameters/Missing" }],
        responses: { "200": { description: "ok" } },
      },
    },
  },
};

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

afterAll(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
});

async function setup(document: unknown = MIXED_DOCUMENT, overrides: Record<string, unknown> = {}) {
  const root = await mkdtemp(join(tmpdir(), "skvm-api-operation-input-"));
  temporaryDirectories.push(root);
  await mkdir(join(root, "input"));
  const sourceText = `${JSON.stringify(document, null, 2)}\n`;
  await writeFile(join(root, "input/openapi.json"), sourceText, "utf8");
  const manifest = {
    schemaVersion: "skill-ir-api-tester-operation-input-manifest/v1",
    identity: API_TESTER_OPERATION_INPUT_IDENTITY,
    bindingId: "ordinary-api",
    supportContractId: "api-tester-openapi-subset-v2",
    input: {
      path: "input/openapi.json",
      format: "json",
      bytes: Buffer.byteLength(sourceText),
      sha256: sha256(sourceText),
    },
    output: { path: "output", writeMode: "exclusive-create-once" },
    ...overrides,
  };
  await writeFile(join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { root, manifest, sourceText };
}

describe("API Tester operation ordinary-input entry", () => {
  test("runs one manifest-bound mixed document without fixed-six predecessor state", async () => {
    const fixture = await setup();
    const report = ApiTesterOperationInputReportSchema.parse(await runApiTesterOperationInput({
      rootDir: fixture.root,
      manifestPath: "manifest.json",
      nodeExecutable,
      completedAt: "2026-09-09T10:00:00.000Z",
    }));

    expect(report).toMatchObject({
      status: "completed-with-source-blocker",
      bindingId: "ordinary-api",
      supportContractId: "api-tester-openapi-subset-v2",
      totals: { operations: 4, accepted: 2, rejected: 1, unresolved: 1, artifactCheckedPassedOperations: 2 },
      documentDisposition: "partial",
      gates: {
        sourceCoverage: "pass",
        admissionConsistency: "pass",
        dependencyPreservation: "pass",
        artifactCorrectness: "pass",
        implementationCorrectness: "pass",
        sourceCorrectness: "blocked",
      },
      accounting: {
        runtime: { modelCalls: 0, apiCalls: 0, paidCalls: 0 },
        developmentAgentUsage: "host-external-not-measured-by-runner",
        separate: true,
      },
      protectedBoundary: {
        frozenWholeDocumentRealAccepted: 0,
        changesFrozenHistory: false,
        prospectiveRuns: 0,
        heldOutAccesses: 0,
        readinessChanges: 0,
        claimsHumanSavings: false,
        claimsLiveApiBehavior: false,
      },
    });
    expect(Object.keys(report.inputs).sort()).toEqual(["input", "manifest"]);
    expect(report.sourceIssues).toMatchObject({ blocking: 1, advisories: 1 });

    const inventory = JSON.parse(await readFile(join(fixture.root, "output/operation-inventory.json"), "utf8"));
    expect(inventory.operations.map((row: { source: { key: string }; admission: { status: string } }) =>
      [row.source.key, row.admission.status])).toEqual([
      ["GET /accepted", "accepted"],
      ["GET /advisory", "accepted"],
      ["POST /rejected", "rejected"],
      ["GET /unresolved", "unresolved"],
    ]);
    expect(inventory.dependencyVerification.find((row: { operationKey: string }) =>
      row.operationKey === "GET /advisory")).toMatchObject({
      status: "pass",
      dimensions: { projectionPreservation: "pass", constructionObligations: "pass", sourceValidity: "fail" },
    });
    expect(inventory.operations.find((row: { source: { key: string } }) =>
      row.source.key === "GET /unresolved").admission.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "UNRESOLVED_CONSTRUCTION_REFERENCE" }),
    ]));
    expect((await lstat(join(fixture.root, "output/artifact/artifact/package-manifest.json"))).isFile()).toBe(true);

    await expect(verifyApiTesterOperationInputOutput({
      rootDir: fixture.root,
      manifestPath: "manifest.json",
      nodeExecutable,
    })).resolves.toMatchObject({ status: "verified", operations: 4, accepted: 2, checked: 2 });
  });

  test("fails closed on manifest/input digest drift and an existing output directory", async () => {
    const digestDrift = await setup();
    const drifted = { ...digestDrift.manifest, input: { ...(digestDrift.manifest.input as object), sha256: "0".repeat(64) } };
    await writeFile(join(digestDrift.root, "manifest.json"), `${JSON.stringify(drifted, null, 2)}\n`, "utf8");
    await expect(runApiTesterOperationInput({
      rootDir: digestDrift.root,
      manifestPath: "manifest.json",
      nodeExecutable,
    })).rejects.toThrow(/input digest mismatch/u);
    await expect(lstat(join(digestDrift.root, "output"))).rejects.toMatchObject({ code: "ENOENT" });

    const existing = await setup();
    await mkdir(join(existing.root, "output"));
    await writeFile(join(existing.root, "output/keep.txt"), "keep\n", "utf8");
    await expect(runApiTesterOperationInput({
      rootDir: existing.root,
      manifestPath: "manifest.json",
      nodeExecutable,
    })).rejects.toThrow(/output.*already exists/u);
  });

  test("rejects unsafe paths, format drift, unknown arguments, and any fixed-six dependency", async () => {
    const valid = (await setup()).manifest;
    expect(() => ApiTesterOperationInputManifestSchema.parse({
      ...valid,
      input: { ...(valid.input as object), path: "../old-selection.json" },
    })).toThrow();
    expect(() => ApiTesterOperationInputManifestSchema.parse({
      ...valid,
      input: { ...(valid.input as object), format: "yaml" },
    })).toThrow();
    expect(parseApiTesterOperationInputArgs(["--root=r", "--manifest=m", "--node=n"]))
      .toEqual({ rootDir: "r", manifestPath: "m", nodeExecutable: "n" });
    expect(() => parseApiTesterOperationInputArgs([
      "--root=r", "--manifest=m", "--node=n", "--cache-root=old",
    ])).toThrow(/invalid or duplicate argument/u);

    const source = await readFile(join(import.meta.dir, "api-tester-operation-input.ts"), "utf8");
    expect(source).not.toMatch(/api-tester-operation-development|source-selection|feature-migration|EXPECTED_ROW_IDS|real-meilisearch/u);
  });

  test("semantic verifier independently detects omitted/duplicate inventory and dependency loss", async () => {
    const fixture = await setup();
    await runApiTesterOperationInput({ rootDir: fixture.root, manifestPath: "manifest.json", nodeExecutable });
    const inventory = JSON.parse(await readFile(join(fixture.root, "output/operation-inventory.json"), "utf8"));
    const projection = JSON.parse(await readFile(join(fixture.root, "output/projected-input.json"), "utf8"));
    const good = {
      sourceText: fixture.sourceText,
      format: "json" as const,
      operations: inventory.operations,
      projectedDocument: projection,
      contractOperationKeys: ["GET /accepted", "GET /advisory"],
      artifactOperationKeys: ["GET /accepted", "GET /advisory"],
    };
    expect(verifyApiTesterOperationInputSemantics(good)).toMatchObject({ status: "pass" });
    expect(() => verifyApiTesterOperationInputSemantics({ ...good, operations: good.operations.slice(1) }))
      .toThrow(/ANALYZER_OPERATION_OMITTED/u);
    expect(() => verifyApiTesterOperationInputSemantics({ ...good, operations: [...good.operations, good.operations[0]] }))
      .toThrow(/ANALYZER_OPERATION_DUPLICATE/u);

    const dependencyDrift = structuredClone(projection);
    dependencyDrift.paths["/advisory"].get.responses["200"] = { description: "silently replaced" };
    expect(() => verifyApiTesterOperationInputSemantics({ ...good, projectedDocument: dependencyDrift }))
      .toThrow(/RESPONSE_DEPENDENCY_LOST/u);
  });

  test("strict verifier rejects input, inventory, artifact, and exact-closure tampering", async () => {
    const input = await setup();
    await runApiTesterOperationInput({ rootDir: input.root, manifestPath: "manifest.json", nodeExecutable });
    await writeFile(join(input.root, "input/openapi.json"), "{}\n", "utf8");
    await expect(verifyApiTesterOperationInputOutput({ rootDir: input.root, manifestPath: "manifest.json", nodeExecutable }))
      .rejects.toThrow(/input digest mismatch/u);

    const inventory = await setup();
    await runApiTesterOperationInput({ rootDir: inventory.root, manifestPath: "manifest.json", nodeExecutable });
    await writeFile(join(inventory.root, "output/operation-inventory.json"), "{}\n", "utf8");
    await expect(verifyApiTesterOperationInputOutput({ rootDir: inventory.root, manifestPath: "manifest.json", nodeExecutable }))
      .rejects.toThrow(/digest mismatch/u);

    const artifact = await setup();
    await runApiTesterOperationInput({ rootDir: artifact.root, manifestPath: "manifest.json", nodeExecutable });
    await writeFile(join(artifact.root, "output/artifact/generated-plan.json"), "{}\n", "utf8");
    await expect(verifyApiTesterOperationInputOutput({ rootDir: artifact.root, manifestPath: "manifest.json", nodeExecutable }))
      .rejects.toThrow(/digest mismatch/u);

    const extra = await setup();
    await runApiTesterOperationInput({ rootDir: extra.root, manifestPath: "manifest.json", nodeExecutable });
    await writeFile(join(extra.root, "output/undeclared.txt"), "extra\n", "utf8");
    await expect(verifyApiTesterOperationInputOutput({ rootDir: extra.root, manifestPath: "manifest.json", nodeExecutable }))
      .rejects.toThrow(/closure mismatch/u);
  });
});
