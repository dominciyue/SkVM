import { expect, test } from "bun:test";
import { buildCurrentV2N4Maintenance } from "./skill-family-current-v2-n4";

const COMMIT = "a".repeat(40);
const MEILI_COMMIT = "103221abb2458326ea89f32d5b904ba018c4f30e";
const BANGUMI_COMMIT = "60fdc32daf1d717f8446bad75fd2c3dc44805642";

function inventory() {
  const dependencyVerification = Array.from({ length: 19 }, (_, index) => ({
    operationKey: `GET /operation-${index + 1}`,
    sourceIssues: [
      {
        code: "REFERENCE_EXTERNAL",
        role: "response",
        locator: "#/components/schemas/ErrorDetail/$ref",
        reference: "./components/error_detail.yaml",
        constructionObligation: false,
      },
      ...(index < 8 ? [{
        code: "REFERENCE_EXTERNAL", role: "response", locator: "#/components/schemas/Creator/$ref",
        reference: "./components/creator.yaml", constructionObligation: false,
      }] : []),
      ...(index < 4 ? [{
        code: "REFERENCE_EXTERNAL", role: "response", locator: "#/components/schemas/SubjectType/$ref",
        reference: "./components/subject_type.yaml", constructionObligation: false,
      }] : []),
      ...(index === 0 ? [{
        code: "REFERENCE_EXTERNAL", role: "response", locator: "#/components/schemas/User/$ref",
        reference: "./components/user.yaml", constructionObligation: false,
      }] : []),
    ],
  }));
  return { dependencyVerification };
}

function snapshot(withAvatar = true) {
  const entries = [
    { name: "error_detail.yaml", type: "blob", oid: "1", object: { byteSize: 32, isBinary: false, text: "type: object\nproperties: {}\n" } },
    { name: "creator.yaml", type: "blob", oid: "2", object: { byteSize: 32, isBinary: false, text: "type: object\nproperties: {}\n" } },
    { name: "subject_type.yaml", type: "blob", oid: "3", object: { byteSize: 29, isBinary: false, text: "type: integer\nenum: [1, 2]\n" } },
    { name: "user.yaml", type: "blob", oid: "4", object: { byteSize: 67, isBinary: false, text: "type: object\nproperties:\n  avatar:\n    $ref: ./avatar.yaml\n" } },
  ];
  if (withAvatar) entries.push({
    name: "avatar.yaml", type: "blob", oid: "5", object: { byteSize: 32, isBinary: false, text: "type: object\nproperties: {}\n" },
  });
  return {
    data: {
      meili: {
        isArchived: true,
        defaultBranchRef: { name: "main", target: { oid: MEILI_COMMIT, committedDate: "2024-03-21T14:33:50Z" } },
        releases: { nodes: [] },
      },
      bangumi: {
        isArchived: false,
        defaultBranchRef: { name: "master", target: { oid: BANGUMI_COMMIT, committedDate: "2026-09-02T22:36:51Z" } },
        components: { entries },
      },
      rateLimit: { cost: 1, remaining: 4999, resetAt: "2026-09-12T14:00:00Z" },
    },
  };
}

function options(withAvatar = true) {
  return {
    codeCommit: COMMIT,
    observedAt: "2026-09-12T14:00:00.000Z",
    snapshot: snapshot(withAvatar),
    rawSnapshotBinding: { path: "source-repair/cache/github-graphql.json", sha256: "b".repeat(64), bytes: 100 },
    accounting: { exploratoryMetadataCalls: 1, acquisitionCalls: 1, retryCalls: 0 },
    meilisearch: {
      pinnedCommit: MEILI_COMMIT,
      sourceSha256: "c".repeat(64),
      sourceBytes: 172199,
      sourceText: "openapi: 3.0.0\npaths:\n  /tasks:\n    get:\n      parameters:\n        - $ref: '#/components/parameters/total'\ncomponents:\n  parameters: {}\n",
    },
    bangumi: {
      pinnedCommit: BANGUMI_COMMIT,
      sourceSha256: "d".repeat(64),
      sourceBytes: 97032,
      inventory: inventory(),
    },
  } as const;
}

test("N4 keeps Meilisearch blocked and closes all 32 Bangumi advisories in a new identity", () => {
  const built = buildCurrentV2N4Maintenance(options());
  expect(built.meilisearch.resolution).toMatchObject({
    decision: "source-blocked-unresolved",
    authoritativeNewSourceFound: false,
    historicalEvidenceMutated: false,
  });
  expect(built.bangumi.summary).toEqual({
    historicalReferenceIssues: 32,
    affectedOperations: 19,
    acquiredReferenceIssues: 32,
    parsedReferenceIssues: 32,
    unresolvedReferenceIssues: 0,
    uniqueRootResources: 4,
    closureResources: 5,
  });
  expect(built.bangumi.references.every((row) => row.role === "response"
    && row.constructionObligation === false && row.acquisitionStatus === "fetched"
    && row.parseStatus === "parsed")).toBe(true);
  expect(built.bangumi.resolution).toMatchObject({
    decision: "resolved-new-development-source",
    historicalEvidenceMutated: false,
    liveApiValidityEstablished: false,
  });
  expect(built.accounting.sourceApiCalls).toBe(2);
});

test("N4 reports partial Bangumi closure when a nested dependency is absent", () => {
  const built = buildCurrentV2N4Maintenance(options(false));
  expect(built.bangumi.resolution.decision).toBe("partial-source-validity");
  expect(built.bangumi.summary.historicalReferenceIssues).toBe(32);
  expect(built.bangumi.summary.unresolvedReferenceIssues).toBeGreaterThan(0);
  expect(built.bangumi.closure.unresolved).toContain("openapi/components/avatar.yaml");
});
