import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  PUBLIC_SKILL_CORPUS_IDENTITY,
  PUBLIC_SKILL_CORPUS_PROTOCOL_PATH,
  buildPublicSkillMetadataSelection,
  verifyPublicSkillCorpusProtocolFiles,
} from "./public-skill-responsibility-corpus";
import { parsePublicSkillCorpusCommand } from "./public-skill-responsibility-corpus-run";

const rootDir = process.cwd();
const protocolSha256 = "a".repeat(64);
const discoveryPath = "results/discovery.json";
const discoverySha256 = "b".repeat(64);

function baseProtocol(): any {
  return {
    schemaVersion: "skill-ir-public-skill-responsibility-corpus-protocol/v1",
    identity: PUBLIC_SKILL_CORPUS_IDENTITY,
    status: "frozen-before-public-skill-metadata",
    provider: {
      id: "github-public-rest-v3",
      baseUrl: "https://api.github.com",
      authentication: "none",
      apiVersion: "2022-11-28",
    },
    repositorySearch: {
      sort: "stars",
      order: "desc",
      perPage: 100,
      pages: [1, 2],
      queries: [
        "topic:agent-skills fork:false archived:false",
        "topic:claude-skills fork:false archived:false",
        "\"SKILL.md\" in:readme fork:false archived:false",
        "\"agent skills\" in:name,description,readme fork:false archived:false",
      ],
    },
    repositoryInspection: {
      repositoryMetadataSource: "search-response",
      repositoryPrefixLimit: 25,
      perRepositoryRequests: ["default-branch", "recursive-tree"],
      maximumMetadataRequests: 58,
      licenseAuthorityRule: "single-root-license-or-copying-blob",
    },
    eligibility: {
      requirePublic: true,
      rejectForks: true,
      rejectArchived: true,
      rejectDisabled: true,
      licenseSpdxAllowlist: ["0BSD", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "CC-BY-4.0", "CC0-1.0", "ISC", "MIT", "MPL-2.0", "Unlicense"],
      skillBasename: "SKILL.md",
      minSkillBytes: 100,
      maxSkillBytes: 524288,
      excludedPathSegments: [".git", ".cache", "node_modules", "vendor", "third_party", "dist", "build"],
      requireCompleteRecursiveTree: true,
    },
    selection: {
      targetSkills: 40,
      minimumRepositories: 8,
      maximumSkillsPerRepository: 5,
      rounds: [1, 2, 3, 4, 5],
      repositoryOrder: "query-priority-page-rank-full-name",
      pathOrder: "utf8-code-point",
      replacementPolicy: "none-after-metadata-selection",
    },
    exclusions: {
      q1Registry: {
        path: "benchmarks/skill-ir/classification/q1-development-sources-v1.json",
        sha256: "07356d58f179f7a7edc60112da0000108ca7b232cdca093fe56bcfcfc1030183",
      },
      q1ReservedAccess: "forbidden",
      heldOutAccess: "forbidden",
      pendingProspectiveAccess: "forbidden",
      pendingProspectiveSelectedSourcesAtFreeze: 0,
    },
    contentGate: {
      selectionMustBeCommittedBeforeBodyRead: true,
      bodyExposuresAtFreeze: 0,
      skillBodyRequestsAtFreeze: 0,
      skillBodyBytesAtFreeze: 0,
    },
    resourceClosure: {
      directlyNamedDirectories: ["scripts", "references", "templates", "assets", "examples"],
      maximumFilesPerSkill: 100,
      maximumBytesPerSkill: 5242880,
      maximumBytesPerResource: 1048576,
      followTransitiveResourceLinks: false,
    },
    accounting: {
      publicMetadataRequests: 0,
      publicSkillBodyRequests: 0,
      publicSkillBodyBytes: 0,
      prospectiveResultsUsed: 0,
      modelCalls: 0,
      businessApiCalls: 0,
      paidCalls: 0,
      heldOutAccesses: 0,
      q1ReservedAccesses: 0,
      developmentAgentUsage: "host-external-not-measured-by-runner",
    },
    claimBoundary: "Convenience corpus only; no ecosystem prevalence, human agreement, readiness, or artifact-success claim.",
  };
}

function hex40(seed: string): string {
  return createHash("sha1").update(seed).digest("hex");
}

function hex64(seed: string): string {
  return createHash("sha256").update(seed).digest("hex");
}

function repository(index: number): any {
  const fullName = `owner-${index}/repo-${index}`;
  return {
    fullName,
    htmlUrl: `https://github.com/${fullName}`,
    apiUrl: `https://api.github.com/repos/${fullName}`,
    private: false,
    fork: false,
    archived: false,
    disabled: false,
    defaultBranch: "main",
    headCommit: hex40(`${fullName}:head`),
    license: {
      status: "resolved",
      spdxId: "MIT",
      authorityPath: "LICENSE",
      blobOid: hex40(`${fullName}:license`),
      size: 1080,
    },
    tree: {
      truncated: false,
      responseSha256: hex64(`${fullName}:tree`),
      blobs: Array.from({ length: 5 }, (_, skillIndex) => ({
        path: `skills/skill-${skillIndex + 1}/SKILL.md`,
        oid: hex40(`${fullName}:skill:${skillIndex + 1}`),
        size: 500 + skillIndex,
        type: "blob",
      })),
    },
  };
}

function discoveryFixture(): any {
  const protocol = baseProtocol();
  const repositories = Array.from({ length: 8 }, (_, index) => repository(index + 1));
  const searchPages = protocol.repositorySearch.queries.flatMap((query: string, index: number) => [1, 2].map((page) => ({
    queryPriority: index + 1,
    query,
    page,
    requestUrl: `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=100&page=${page}`,
    responseSha256: hex64(`${query}:${page}`),
    totalCount: index === 0 ? repositories.length : 0,
    incompleteResults: false,
    repositoryFullNames: index === 0 && page === 1 ? repositories.map((entry) => entry.fullName) : [],
    rateLimitRemaining: 50,
    rateLimitResetAt: "2026-09-10T13:00:00.000Z",
  })));
  return {
    schemaVersion: "skill-ir-public-skill-responsibility-metadata-discovery/v1",
    identity: PUBLIC_SKILL_CORPUS_IDENTITY,
    status: "metadata-complete",
    protocol: { path: PUBLIC_SKILL_CORPUS_PROTOCOL_PATH, sha256: protocolSha256 },
    retrievedAt: "2026-09-10T12:00:00.000Z",
    searchPages,
    repositories,
    accounting: {
      metadataRequests: 24,
      repositoriesInspected: 8,
      skillBodyRequests: 0,
      skillBodyBytes: 0,
      modelCalls: 0,
      businessApiCalls: 0,
      paidCalls: 0,
      heldOutAccesses: 0,
      q1ReservedAccesses: 0,
      pendingProspectiveAccesses: 0,
    },
  };
}

function emptyQ1Registry(): any {
  return { developmentSources: [] };
}

describe("public skill responsibility corpus metadata selection", () => {
  test("verifies the committed pre-source protocol and exclusion registry binding", async () => {
    await expect(verifyPublicSkillCorpusProtocolFiles({
      rootDir,
      protocolPath: PUBLIC_SKILL_CORPUS_PROTOCOL_PATH,
    })).resolves.toMatchObject({
      status: "verified-pre-source-protocol",
      queries: 4,
      pagesPerQuery: 2,
      targetSkills: 40,
      minimumRepositories: 8,
      publicSkillBodyRequests: 0,
    });
  });

  test("selects forty metadata-only rows by balanced repository rounds", () => {
    const selection = buildPublicSkillMetadataSelection({
      protocol: baseProtocol(),
      protocolSha256,
      discovery: discoveryFixture(),
      discoveryPath,
      discoverySha256,
      q1Registry: emptyQ1Registry(),
      selectedAt: "2026-09-10T12:30:00.000Z",
    });
    expect(selection.status).toBe("frozen-selection-pending-commit");
    expect(selection.discovery).toEqual({
      path: discoveryPath,
      sha256: discoverySha256,
      portableSha256: expect.any(String),
    });
    expect(selection.totals).toMatchObject({ selectedSkills: 40, selectedRepositories: 8, bodyExposures: 0 });
    expect(selection.selected.slice(0, 8).every((entry: any) => entry.selectionRound === 1)).toBe(true);
    expect(selection.selected[8]).toMatchObject({ selectionRank: 9, selectionRound: 2 });
    expect(Math.max(...selection.selected.map((entry: any) => entry.repositorySelectionIndex))).toBe(5);
  });

  test("fails closed on protocol order drift, body exposure, and outcome fields", () => {
    const queryDrift = baseProtocol();
    queryDrift.repositorySearch.queries.reverse();
    expect(() => buildPublicSkillMetadataSelection({ protocol: queryDrift, protocolSha256, discovery: discoveryFixture(), discoveryPath, discoverySha256, q1Registry: emptyQ1Registry(), selectedAt: "2026-09-10T12:30:00.000Z" }))
      .toThrow(/query|protocol|order/iu);

    const bodyExposure = discoveryFixture();
    bodyExposure.accounting.skillBodyRequests = 1;
    expect(() => buildPublicSkillMetadataSelection({ protocol: baseProtocol(), protocolSha256, discovery: bodyExposure, discoveryPath, discoverySha256, q1Registry: emptyQ1Registry(), selectedAt: "2026-09-10T12:30:00.000Z" }))
      .toThrow(/body|exposure|request/iu);

    const outcomeLeak = discoveryFixture();
    outcomeLeak.repositories[0].candidatePassed = true;
    expect(() => buildPublicSkillMetadataSelection({ protocol: baseProtocol(), protocolSha256, discovery: outcomeLeak, discoveryPath, discoverySha256, q1Registry: emptyQ1Registry(), selectedAt: "2026-09-10T12:30:00.000Z" }))
      .toThrow(/unrecognized|candidatePassed|outcome/iu);
  });

  test("records ineligible and Q1-overlapping candidates as a fixed shortfall", () => {
    const discovery = discoveryFixture();
    discovery.repositories[0].fork = true;
    discovery.repositories[1].license.spdxId = "NOASSERTION";
    const q1Registry = {
      developmentSources: [{
        identity: {
          repository: discovery.repositories[2].htmlUrl,
          packageRoot: "skills/skill-1",
        },
      }],
    };
    const selection = buildPublicSkillMetadataSelection({
      protocol: baseProtocol(),
      protocolSha256,
      discovery,
      discoveryPath,
      discoverySha256,
      q1Registry,
      selectedAt: "2026-09-10T12:30:00.000Z",
    });
    expect(selection.status).toBe("metadata-selection-shortfall");
    expect(selection.totals).toMatchObject({ selectedSkills: 29, selectedRepositories: 6, bodyExposures: 0 });
    expect(selection.exclusions.map((entry: any) => entry.reason)).toEqual(expect.arrayContaining(["repository-fork", "license-not-allowlisted", "q1-overlap"]));
  });

  test("records missing and ambiguous license authority without guessing a path", () => {
    const missing = discoveryFixture();
    missing.repositories[0].license = {
      status: "missing-classification",
      spdxId: null,
      authorityPath: null,
      blobOid: null,
      size: null,
    };
    missing.repositories[1].license = {
      status: "ambiguous-authority",
      spdxId: "MIT",
      authorityPath: null,
      blobOid: null,
      size: null,
    };
    const selection = buildPublicSkillMetadataSelection({ protocol: baseProtocol(), protocolSha256, discovery: missing, discoveryPath, discoverySha256, q1Registry: emptyQ1Registry(), selectedAt: "2026-09-10T12:30:00.000Z" });
    expect(selection.exclusions.map((entry: any) => entry.reason)).toEqual(expect.arrayContaining([
      "license-missing-classification",
      "license-ambiguous-authority",
    ]));
  });

  test("rejects duplicate repository records and duplicate skill paths", () => {
    const duplicateRepository = discoveryFixture();
    duplicateRepository.repositories.push(structuredClone(duplicateRepository.repositories[0]));
    expect(() => buildPublicSkillMetadataSelection({ protocol: baseProtocol(), protocolSha256, discovery: duplicateRepository, discoveryPath, discoverySha256, q1Registry: emptyQ1Registry(), selectedAt: "2026-09-10T12:30:00.000Z" }))
      .toThrow(/duplicate repository/iu);

    const duplicatePath = discoveryFixture();
    duplicatePath.repositories[0].tree.blobs.push(structuredClone(duplicatePath.repositories[0].tree.blobs[0]));
    expect(() => buildPublicSkillMetadataSelection({ protocol: baseProtocol(), protocolSha256, discovery: duplicatePath, discoveryPath, discoverySha256, q1Registry: emptyQ1Registry(), selectedAt: "2026-09-10T12:30:00.000Z" }))
      .toThrow(/duplicate.*path|path.*duplicate/iu);
  });

  test("keeps duplicate blob rows but assigns the same provisional lineage", () => {
    const discovery = discoveryFixture();
    discovery.repositories[1].tree.blobs[0].oid = discovery.repositories[0].tree.blobs[0].oid;
    const selection = buildPublicSkillMetadataSelection({ protocol: baseProtocol(), protocolSha256, discovery, discoveryPath, discoverySha256, q1Registry: emptyQ1Registry(), selectedAt: "2026-09-10T12:30:00.000Z" });
    const duplicated = selection.selected.filter((entry: any) => entry.blobOid === discovery.repositories[0].tree.blobs[0].oid);
    expect(duplicated).toHaveLength(2);
    expect(new Set(duplicated.map((entry: any) => entry.provisionalLineageId)).size).toBe(1);
  });

  test("selects only from the frozen inspected prefix while preserving the larger search universe", () => {
    const discovery = discoveryFixture();
    for (let index = 9; index <= 25; index += 1) {
      const entry = repository(index);
      discovery.repositories.push(entry);
      discovery.searchPages[0].repositoryFullNames.push(entry.fullName);
    }
    discovery.searchPages[0].repositoryFullNames.push("later/repository");
    discovery.accounting.metadataRequests = 58;
    discovery.accounting.repositoriesInspected = 25;
    const selection = buildPublicSkillMetadataSelection({ protocol: baseProtocol(), protocolSha256, discovery, discoveryPath, discoverySha256, q1Registry: emptyQ1Registry(), selectedAt: "2026-09-10T12:30:00.000Z" });
    expect(selection.totals).toMatchObject({ selectedSkills: 40, selectedRepositories: 25, searchUniverseRepositories: 26, inspectedRepositories: 25, uninspectedRepositories: 1 });
  });

  test("exposes only protocol verification and metadata-selection CLI inputs", () => {
    expect(parsePublicSkillCorpusCommand([
      "--mode=verify-protocol",
      "--root=repo",
      `--protocol=${PUBLIC_SKILL_CORPUS_PROTOCOL_PATH}`,
    ])).toEqual({
      mode: "verify-protocol",
      rootDir: "repo",
      protocolPath: PUBLIC_SKILL_CORPUS_PROTOCOL_PATH,
    });
    expect(parsePublicSkillCorpusCommand([
      "--mode=select-metadata",
      "--root=repo",
      `--protocol=${PUBLIC_SKILL_CORPUS_PROTOCOL_PATH}`,
      "--discovery=results/discovery.json",
      "--out=results/selection.json",
      "--selected-at=2026-09-10T12:30:00.000Z",
    ])).toEqual({
      mode: "select-metadata",
      rootDir: "repo",
      protocolPath: PUBLIC_SKILL_CORPUS_PROTOCOL_PATH,
      discoveryPath: "results/discovery.json",
      outputPath: "results/selection.json",
      selectedAt: "2026-09-10T12:30:00.000Z",
    });
    expect(() => parsePublicSkillCorpusCommand([
      "--mode=select-metadata",
      "--root=repo",
      `--protocol=${PUBLIC_SKILL_CORPUS_PROTOCOL_PATH}`,
      "--discovery=results/discovery.json",
      "--out=../outside.json",
      "--selected-at=2026-09-10T12:30:00.000Z",
    ])).toThrow(/out|relative|contained/iu);
    expect(() => parsePublicSkillCorpusCommand(["--skill-body=https://example.com/SKILL.md"]))
      .toThrow(/unknown|mode|required/iu);
  });
});
