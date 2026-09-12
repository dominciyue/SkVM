import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { buildN1CorpusLedgers } from "./skill-family-current-v2-corpus";

const sha256 = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");

function fixture() {
  const selectedIds = Array.from({ length: 12 }, (_, index) => `source-${String(index + 1).padStart(2, "0")}`);
  const sources = selectedIds.map((candidateId, index) => {
    const body = Buffer.from(`# Source ${index + 1}\nRequirement ${index + 1}\n`);
    return {
      row: {
        candidateId,
        skillId: `owner-${index % 6}/repo-${index % 6}:SKILL.md`,
        repository: `owner-${index % 6}/repo-${index % 6}`,
        commit: String(index).padStart(40, "a"),
        skillPath: "SKILL.md",
        sha: String(index).padStart(40, "b"),
        license: "MIT",
        role: "screened-reserve",
        acquisition: "cached-development",
        bodyReadForScreening: true,
        bodyReadForConstruction: false,
        bodyPath: `sources/${candidateId}/SKILL.md`,
        bodySha256: sha256(body),
        bodyBytes: body.byteLength,
        directResources: [],
      },
      body,
      resources: [],
    };
  });
  const responsibilities = selectedIds.map((candidateId, index) => ({
    candidateId,
    skillId: sources[index]!.row.skillId,
    role: "screened-reserve",
    duties: [{
      obligationId: `${candidateId}:duty-001`,
      key: "valid-request",
      text: `Requirement ${index + 1}`,
      sourceLocator: "SKILL.md:2",
      role: "in-class-constructible",
      plannedDisposition: "to-construct",
      caseKinds: ["valid-minimal"],
    }],
    coreConstructible: 1,
    outsideClass: 0,
    unresolved: 0,
  }));
  const metadataCandidates = Array.from({ length: 5 }, (_, index) => ({
    candidateId: `metadata-${index + 1}`,
    repository: `future-${index}/repo`,
    path: "SKILL.md",
    sha: String(index).padStart(40, "c"),
    license: null,
    source: "github-search",
    bodyRead: false,
    selection: "uninspected",
  }));
  const apiInputs = Array.from({ length: 6 }, (_, index) => {
    const document = Buffer.from(`openapi: 3.0.${index % 4}\ninfo:\n  title: API ${index}\n  version: 1.${index}\npaths: {}\n`);
    return {
      row: {
        inputId: `api-${index}`,
        provider: `provider-${index % 3}`,
        sourcePath: `provider-${index % 3}/api-${index}/openapi.yaml`,
        sourceUrl: `https://example.invalid/archive/api-${index}.yaml`,
        status: "acquired",
        localPath: `sources/api-${index}.yaml`,
        format: "yaml",
        byteLength: document.byteLength,
        sha256: sha256(document),
        qualification: { eligible: true, reason: null },
        error: null,
      },
      document,
    };
  });
  return {
    policy: {
      selectedIds,
      metadataCandidateIds: metadataCandidates.map(({ candidateId }) => candidateId),
      sourceRoles: Object.fromEntries(selectedIds.map((id, index) => [id, index === 1 ? "out-of-class-e2e-contrast" : index === 2 ? "in-class-unsupported-duty-source" : "api-task-duty-source"])),
      mappingCandidates: selectedIds.slice(0, 3).map((candidateId) => ({ candidateId, obligationIds: [`${candidateId}:duty-001`], targetRequirementKinds: ["valid-minimal"] })),
    },
    sources,
    responsibilities,
    metadataCandidates,
    apiInputManifest: {
      schemaVersion: "skill-family-api-inputs/v1",
      exposure: "development",
      repository: "archive/openapi-examples",
      commit: "d".repeat(40),
      provenanceLimit: "aggregator mirror; original upstream not recorded",
    },
    apiInputs,
    reviewExposures: [{ repository: "seen/repo", scope: "body excerpt", exposure: "development-exposed" }],
    evidence: {
      sourceLedger: { path: "prior/source-ledger.json", sha256: "1".repeat(64) },
      responsibilityLedger: { path: "prior/responsibility-ledger.json", sha256: "2".repeat(64) },
      candidatePool: { path: "prior/candidate-pool.json", sha256: "3".repeat(64) },
      apiInputs: { path: "prior/api-inputs.json", sha256: "4".repeat(64) },
    },
  };
}

describe("current-v2 N1 corpus", () => {
  test("binds complete bodies, full duties, metadata-only candidates, and API provider identity", () => {
    const result = buildN1CorpusLedgers(fixture());
    expect(result.sourceLedger.summary).toEqual({ bodies: 12, repositoryOrigins: 6, directResources: 0, acquisitionRequests: 0 });
    expect(result.dutyMatrix.summary).toEqual({ members: 12, duties: 12, constructible: 12, unsupported: 0, outsideClass: 0, unmappedOrUnresolved: 0, mappingCandidates: 3 });
    expect(result.dutyMatrix.mappingCandidates.map((row) => row.repository)).toEqual([
      "owner-0/repo-0", "owner-1/repo-1", "owner-2/repo-2",
    ]);
    expect(result.exposureLedger.metadataOnlyCandidates).toHaveLength(5);
    expect(result.exposureLedger.metadataOnlyCandidates.every((row) => row.bodyRead === false)).toBe(true);
    expect(result.exposureLedger.apiInputs.summary).toEqual({ documents: 6, providers: 3, aggregatorMirrors: 6, originalUpstreamUrlsKnown: 0 });
    expect(result.exposureLedger.apiInputs.rows[0]).toMatchObject({
      openapiVersion: "3.0.0",
      originalUpstreamUrl: null,
      upstreamIdentityStatus: "not-recorded-in-prior-ledger",
      developmentExposed: true,
    });
  });

  test("fails closed on a body digest mismatch", () => {
    const input = fixture();
    input.sources[0]!.row.bodySha256 = "0".repeat(64);
    expect(() => buildN1CorpusLedgers(input)).toThrow(/body source-01 digest mismatch/u);
  });

  test("does not silently accept fewer than six repository origins", () => {
    const input = fixture();
    for (const [index, source] of input.sources.entries()) source.row.repository = `owner-${index % 5}/repo-${index % 5}`;
    expect(() => buildN1CorpusLedgers(input)).toThrow(/at least 6 repository origins/u);
  });

  test("does not promote a previously read metadata candidate", () => {
    const input = fixture();
    input.metadataCandidates[0]!.bodyRead = true;
    expect(() => buildN1CorpusLedgers(input)).toThrow(/metadata-only.*bodyRead=false/u);
  });
});
