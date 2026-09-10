import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  PUBLIC_SKILL_CORPUS_IDENTITY,
  PUBLIC_SKILL_CORPUS_PROTOCOL_PATH,
  PUBLIC_SKILL_CORPUS_QUERIES,
  buildPublicSkillMetadataSelection,
  verifyPublicSkillCorpusProtocolFiles,
} from "./public-skill-responsibility-corpus";
import { parsePublicSkillCorpusCommand } from "./public-skill-responsibility-corpus-run";
import {
  discoverPublicSkillMetadata,
  requestPublicSkillMetadata,
  validateGitHubRepositoryApiIdentity,
  verifyPublicSkillMetadataDiscoveryFiles,
} from "./public-skill-responsibility-corpus-discovery";
import { parsePublicSkillMetadataDiscoveryCommand } from "./public-skill-responsibility-corpus-discovery-run";

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

function hex64(seed: string | Uint8Array): string {
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
    searchSource: { queryPriority: 1, page: 1, rank: index },
    branch: {
      requestUrl: `https://api.github.com/repos/${fullName}/branches/main`,
      responsePath: `results/raw/${fullName.replace("/", "--")}-branch.json`,
      responseSha256: hex64(`${fullName}:branch-response`),
      responseMetadataPath: `results/raw/${fullName.replace("/", "--")}-branch.metadata.json`,
      responseMetadataSha256: hex64(`${fullName}:branch-metadata`),
      retrievedAt: "2026-09-10T12:00:00.000Z",
      rateLimitRemaining: 50,
      rateLimitResetAt: "2026-09-10T13:00:00.000Z",
    },
    license: {
      status: "resolved",
      spdxId: "MIT",
      authorityPath: "LICENSE",
      blobOid: hex40(`${fullName}:license`),
      size: 1080,
    },
    tree: {
      requestUrl: `https://api.github.com/repos/${fullName}/git/trees/${hex40(`${fullName}:head`)}?recursive=1`,
      responsePath: `results/raw/${fullName.replace("/", "--")}-tree.json`,
      truncated: false,
      responseSha256: hex64(`${fullName}:tree`),
      responseMetadataPath: `results/raw/${fullName.replace("/", "--")}-tree.metadata.json`,
      responseMetadataSha256: hex64(`${fullName}:tree-metadata`),
      retrievedAt: "2026-09-10T12:00:00.000Z",
      rateLimitRemaining: 49,
      rateLimitResetAt: "2026-09-10T13:00:00.000Z",
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
    responsePath: `results/raw/search-${index + 1}-${page}.json`,
    responseSha256: hex64(`${query}:${page}`),
    responseMetadataPath: `results/raw/search-${index + 1}-${page}.metadata.json`,
    responseMetadataSha256: hex64(`${query}:${page}:metadata`),
    retrievedAt: "2026-09-10T12:00:00.000Z",
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

  test("represents an empty bounded search as a zero-row shortfall", () => {
    const discovery = discoveryFixture();
    for (const page of discovery.searchPages) page.repositoryFullNames = [];
    discovery.repositories = [];
    discovery.accounting.metadataRequests = 8;
    discovery.accounting.repositoriesInspected = 0;
    const selection = buildPublicSkillMetadataSelection({ protocol: baseProtocol(), protocolSha256, discovery, discoveryPath, discoverySha256, q1Registry: emptyQ1Registry(), selectedAt: "2026-09-10T12:30:00.000Z" });
    expect(selection).toMatchObject({
      status: "metadata-selection-shortfall",
      totals: { selectedSkills: 0, selectedRepositories: 0, searchUniverseRepositories: 0, inspectedRepositories: 0 },
    });
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

  test("archives exactly the frozen metadata request sequence without reading skill bodies", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "skvm-public-skill-metadata-"));
    try {
      const protocolBytes = await readFile(join(rootDir, PUBLIC_SKILL_CORPUS_PROTOCOL_PATH));
      const protocol = JSON.parse(protocolBytes.toString("utf8"));
      const q1Source = join(rootDir, protocol.exclusions.q1Registry.path);
      await mkdir(dirname(join(temporaryRoot, PUBLIC_SKILL_CORPUS_PROTOCOL_PATH)), { recursive: true });
      await mkdir(dirname(join(temporaryRoot, protocol.exclusions.q1Registry.path)), { recursive: true });
      await writeFile(join(temporaryRoot, PUBLIC_SKILL_CORPUS_PROTOCOL_PATH), protocolBytes);
      await writeFile(join(temporaryRoot, protocol.exclusions.q1Registry.path), await readFile(q1Source));

      const repositories = Array.from({ length: 25 }, (_, index) => repository(index + 1));
      const calls: string[] = [];
      const request = async (url: string) => {
        calls.push(url);
        let payload: unknown;
        if (url.includes("/search/repositories?")) {
          const parsed = new URL(url);
          const firstPage = parsed.searchParams.get("q") === PUBLIC_SKILL_CORPUS_QUERIES[0]
            && parsed.searchParams.get("page") === "1";
          payload = {
            total_count: firstPage ? repositories.length : 0,
            incomplete_results: false,
            items: (firstPage ? repositories : []).map((entry) => ({
              full_name: entry.fullName,
              html_url: entry.htmlUrl,
              url: entry.apiUrl,
              private: entry.private,
              fork: entry.fork,
              archived: entry.archived,
              disabled: entry.disabled,
              default_branch: entry.defaultBranch,
              license: { spdx_id: entry.license.spdxId },
            })),
          };
        } else if (url.includes("/branches/")) {
          const fullName = new URL(url).pathname.split("/").slice(2, 4).join("/");
          payload = { commit: { sha: hex40(`${fullName}:head`) } };
        } else if (url.includes("/git/trees/")) {
          const fullName = new URL(url).pathname.split("/").slice(2, 4).join("/");
          payload = {
            sha: hex40(`${fullName}:tree-root`),
            truncated: false,
            tree: [
              { path: "LICENSE", type: "blob", sha: hex40(`${fullName}:license`), size: 1080 },
              ...Array.from({ length: 5 }, (_, skillIndex) => ({
                path: `skills/skill-${skillIndex + 1}/SKILL.md`,
                type: "blob",
                sha: hex40(`${fullName}:skill:${skillIndex + 1}`),
                size: 500 + skillIndex,
              })),
            ],
          };
        } else {
          throw new Error(`unexpected request: ${url}`);
        }
        return {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "x-ratelimit-remaining": "50",
            "x-ratelimit-reset": "1789045200",
          },
          body: new TextEncoder().encode(JSON.stringify(payload)),
        };
      };

      const discovery = await discoverPublicSkillMetadata({
        rootDir: temporaryRoot,
        protocolPath: PUBLIC_SKILL_CORPUS_PROTOCOL_PATH,
        outputDir: "results/skill-ir/public-skill-responsibility-corpus-selection-development-001",
        retrievedAt: "2026-09-10T12:00:00.000Z",
        request,
      });
      expect(calls).toHaveLength(58);
      expect(calls.some((url) => /\/git\/blobs\/|\/contents\/|raw\.githubusercontent/iu.test(url))).toBe(false);
      expect(calls.slice(8).some((url) => decodeURIComponent(url).includes("SKILL.md"))).toBe(false);
      expect(discovery).toMatchObject({
        status: "metadata-complete",
        accounting: { metadataRequests: 58, repositoriesInspected: 25, skillBodyRequests: 0, skillBodyBytes: 0 },
      });
      expect(discovery.repositories).toHaveLength(25);
      expect(discovery.repositories[0]!).toMatchObject({
        fullName: "owner-1/repo-1",
        license: { status: "resolved", spdxId: "MIT", authorityPath: "LICENSE" },
      });
      const archivedSearch = await readFile(join(temporaryRoot, discovery.searchPages[0]!.responsePath));
      expect(hex64(archivedSearch.toString("utf8"))).toBe(discovery.searchPages[0]!.responseSha256);
      const firstPage = discovery.searchPages[0] as any;
      expect(firstPage.responseMetadataPath).toMatch(/\.metadata\.json$/u);
      const archivedMetadata = await readFile(join(temporaryRoot, firstPage.responseMetadataPath));
      expect(hex64(archivedMetadata.toString("utf8"))).toBe(firstPage.responseMetadataSha256);
      await expect(verifyPublicSkillMetadataDiscoveryFiles({
        rootDir: temporaryRoot,
        discoveryPath: "results/skill-ir/public-skill-responsibility-corpus-selection-development-001/discovery.json",
      })).resolves.toMatchObject({ status: "verified-metadata-discovery", metadataRequests: 58, repositoriesInspected: 25 });
      const discoveryReportPath = join(
        temporaryRoot,
        "results/skill-ir/public-skill-responsibility-corpus-selection-development-001/discovery.json",
      );
      const incompleteSearch = JSON.parse(archivedSearch.toString("utf8"));
      incompleteSearch.incomplete_results = true;
      const incompleteSearchBytes = new TextEncoder().encode(JSON.stringify(incompleteSearch));
      await writeFile(join(temporaryRoot, discovery.searchPages[0]!.responsePath), incompleteSearchBytes);
      discovery.searchPages[0]!.responseSha256 = hex64(incompleteSearchBytes);
      discovery.searchPages[0]!.incompleteResults = true;
      await writeFile(discoveryReportPath, `${JSON.stringify(discovery, null, 2)}\n`, "utf8");
      await expect(verifyPublicSkillMetadataDiscoveryFiles({
        rootDir: temporaryRoot,
        discoveryPath: "results/skill-ir/public-skill-responsibility-corpus-selection-development-001/discovery.json",
      })).rejects.toThrow(/incomplete/iu);
      await writeFile(join(temporaryRoot, discovery.searchPages[0]!.responsePath), archivedSearch);
      discovery.searchPages[0]!.responseSha256 = hex64(archivedSearch);
      discovery.searchPages[0]!.incompleteResults = false;
      await writeFile(discoveryReportPath, `${JSON.stringify(discovery, null, 2)}\n`, "utf8");
      const exhaustedMetadata = JSON.parse(archivedMetadata.toString("utf8"));
      exhaustedMetadata.headers["x-ratelimit-remaining"] = "0";
      const exhaustedMetadataBytes = new TextEncoder().encode(`${JSON.stringify(exhaustedMetadata, null, 2)}\n`);
      await writeFile(join(temporaryRoot, firstPage.responseMetadataPath), exhaustedMetadataBytes);
      firstPage.responseMetadataSha256 = hex64(exhaustedMetadataBytes);
      firstPage.rateLimitRemaining = 0;
      await writeFile(discoveryReportPath, `${JSON.stringify(discovery, null, 2)}\n`, "utf8");
      await expect(verifyPublicSkillMetadataDiscoveryFiles({
        rootDir: temporaryRoot,
        discoveryPath: "results/skill-ir/public-skill-responsibility-corpus-selection-development-001/discovery.json",
      })).rejects.toThrow(/rate limit|remaining|exhausted/iu);
      await writeFile(join(temporaryRoot, firstPage.responseMetadataPath), archivedMetadata);
      firstPage.responseMetadataSha256 = hex64(archivedMetadata);
      firstPage.rateLimitRemaining = 50;
      await writeFile(discoveryReportPath, `${JSON.stringify(discovery, null, 2)}\n`, "utf8");
      await writeFile(join(temporaryRoot, firstPage.responseMetadataPath), "{}", "utf8");
      await expect(verifyPublicSkillMetadataDiscoveryFiles({
        rootDir: temporaryRoot,
        discoveryPath: "results/skill-ir/public-skill-responsibility-corpus-selection-development-001/discovery.json",
      })).rejects.toThrow(/digest|sha256|metadata|header/iu);
      await writeFile(join(temporaryRoot, firstPage.responseMetadataPath), archivedMetadata);
      await writeFile(join(temporaryRoot, discovery.searchPages[0]!.responsePath), "{}", "utf8");
      await expect(verifyPublicSkillMetadataDiscoveryFiles({
        rootDir: temporaryRoot,
        discoveryPath: "results/skill-ir/public-skill-responsibility-corpus-selection-development-001/discovery.json",
      })).rejects.toThrow(/digest|sha256|search response/iu);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  test("exposes a fixed metadata-discovery CLI without arbitrary source URLs", () => {
    expect(parsePublicSkillMetadataDiscoveryCommand([
      "--root=repo",
      `--protocol=${PUBLIC_SKILL_CORPUS_PROTOCOL_PATH}`,
      "--out-dir=results/skill-ir/public-skill-responsibility-corpus-selection-development-001",
    ])).toEqual({
      rootDir: "repo",
      protocolPath: PUBLIC_SKILL_CORPUS_PROTOCOL_PATH,
      outputDir: "results/skill-ir/public-skill-responsibility-corpus-selection-development-001",
    });
    expect(() => parsePublicSkillMetadataDiscoveryCommand([
      "--root=repo",
      `--protocol=${PUBLIC_SKILL_CORPUS_PROTOCOL_PATH}`,
      "--out-dir=../outside",
    ])).toThrow(/out-dir|relative|contained/iu);
    expect(() => parsePublicSkillMetadataDiscoveryCommand([
      "--root=repo",
      `--protocol=${PUBLIC_SKILL_CORPUS_PROTOCOL_PATH}`,
      "--out-dir=results/discovery",
      "--url=https://example.com/SKILL.md",
    ])).toThrow(/unknown|url/iu);
  });

  test("rejects junction-backed protocol and discovery output paths before metadata access", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "skvm-public-skill-path-root-"));
    const outsideProtocol = await mkdtemp(join(tmpdir(), "skvm-public-skill-path-protocol-"));
    const outsideOutput = await mkdtemp(join(tmpdir(), "skvm-public-skill-path-output-"));
    let metadataRequests = 0;
    try {
      const protocolBytes = await readFile(join(rootDir, PUBLIC_SKILL_CORPUS_PROTOCOL_PATH));
      const protocol = JSON.parse(protocolBytes.toString("utf8"));
      await writeFile(join(outsideProtocol, "public-skill-responsibility-corpus-protocol-v1.json"), protocolBytes);
      await writeFile(
        join(outsideProtocol, "q1-development-sources-v1.json"),
        await readFile(join(rootDir, protocol.exclusions.q1Registry.path)),
      );
      await mkdir(join(temporaryRoot, "benchmarks", "skill-ir"), { recursive: true });
      await symlink(outsideProtocol, join(temporaryRoot, "benchmarks", "skill-ir", "classification"), "junction");
      await expect(verifyPublicSkillCorpusProtocolFiles({
        rootDir: temporaryRoot,
        protocolPath: PUBLIC_SKILL_CORPUS_PROTOCOL_PATH,
      })).rejects.toThrow(/junction|link|symbolic/iu);

      await unlink(join(temporaryRoot, "benchmarks", "skill-ir", "classification"));
      await mkdir(join(temporaryRoot, "benchmarks", "skill-ir", "classification"), { recursive: true });
      await writeFile(join(temporaryRoot, PUBLIC_SKILL_CORPUS_PROTOCOL_PATH), protocolBytes);
      await writeFile(
        join(temporaryRoot, protocol.exclusions.q1Registry.path),
        await readFile(join(rootDir, protocol.exclusions.q1Registry.path)),
      );
      await mkdir(join(temporaryRoot, "results"), { recursive: true });
      await symlink(outsideOutput, join(temporaryRoot, "results", "skill-ir"), "junction");
      await expect(discoverPublicSkillMetadata({
        rootDir: temporaryRoot,
        protocolPath: PUBLIC_SKILL_CORPUS_PROTOCOL_PATH,
        outputDir: "results/skill-ir/discovery",
        retrievedAt: "2026-09-10T12:00:00.000Z",
        request: async () => {
          metadataRequests += 1;
          throw new Error("metadata request must not start");
        },
      })).rejects.toThrow(/junction|link|symbolic/iu);
      expect(metadataRequests).toBe(0);
    } finally {
      await unlink(join(temporaryRoot, "benchmarks", "skill-ir", "classification")).catch(() => undefined);
      await unlink(join(temporaryRoot, "results", "skill-ir")).catch(() => undefined);
      await rm(temporaryRoot, { recursive: true, force: true });
      await rm(outsideProtocol, { recursive: true, force: true });
      await rm(outsideOutput, { recursive: true, force: true });
    }
  });

  test("rejects a search item whose API URL does not match its GitHub repository identity", () => {
    expect(() => validateGitHubRepositoryApiIdentity(
      "https://attacker.example/collect",
      "owner/repository",
      "https://api.github.com",
    )).toThrow(/GitHub|repository|API URL|origin/iu);
    expect(validateGitHubRepositoryApiIdentity(
      "https://api.github.com/repos/owner/repository",
      "owner/repository",
      "https://api.github.com",
    )).toBe("https://api.github.com/repos/owner/repository");
  });

  test("forbids HTTP redirects in the public metadata transport", async () => {
    const originalFetch = globalThis.fetch;
    let redirectPolicy: string | undefined;
    try {
      globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
        redirectPolicy = init?.redirect;
        return new Response("{}", {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-ratelimit-remaining": "50",
            "x-ratelimit-reset": "1789045200",
          },
        });
      }) as typeof fetch;
      await requestPublicSkillMetadata("https://api.github.com/search/repositories", {});
      expect(redirectPolicy).toBe("error");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("preserves an HTTP failure before any skill body exposure", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "skvm-public-skill-metadata-failure-"));
    const outputDir = "results/skill-ir/public-skill-responsibility-corpus-selection-failure-001";
    try {
      const protocolBytes = await readFile(join(rootDir, PUBLIC_SKILL_CORPUS_PROTOCOL_PATH));
      const protocol = JSON.parse(protocolBytes.toString("utf8"));
      await mkdir(dirname(join(temporaryRoot, PUBLIC_SKILL_CORPUS_PROTOCOL_PATH)), { recursive: true });
      await mkdir(dirname(join(temporaryRoot, protocol.exclusions.q1Registry.path)), { recursive: true });
      await writeFile(join(temporaryRoot, PUBLIC_SKILL_CORPUS_PROTOCOL_PATH), protocolBytes);
      await writeFile(
        join(temporaryRoot, protocol.exclusions.q1Registry.path),
        await readFile(join(rootDir, protocol.exclusions.q1Registry.path)),
      );
      let collisionRejected = false;
      await expect(discoverPublicSkillMetadata({
        rootDir: temporaryRoot,
        protocolPath: PUBLIC_SKILL_CORPUS_PROTOCOL_PATH,
        outputDir,
        retrievedAt: "2026-09-10T12:00:00.000Z",
        request: async () => {
          try {
            await writeFile(join(temporaryRoot, outputDir, "failure.json"), "occupied", { flag: "wx" });
          } catch {
            collisionRejected = true;
          }
          return {
            status: 403,
            headers: {
              "content-type": "application/json",
              "x-ratelimit-remaining": "0",
              "x-ratelimit-reset": "1789045200",
            },
            body: new TextEncoder().encode('{"message":"rate limited"}'),
          };
        },
      })).rejects.toThrow(/HTTP 403/iu);
      expect(collisionRejected).toBe(true);
      const failure = JSON.parse(await readFile(join(temporaryRoot, outputDir, "failure.json"), "utf8"));
      expect(failure).toMatchObject({
        status: "metadata-discovery-failed",
        accounting: { metadataRequestsAttempted: 1, publicSkillBodyRequests: 0, publicSkillBodyBytes: 0 },
      });
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
