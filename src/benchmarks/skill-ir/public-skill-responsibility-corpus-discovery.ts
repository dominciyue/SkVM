import { createHash } from "node:crypto";
import { open, readFile, unlink, writeFile } from "node:fs/promises";
import { posix, resolve } from "node:path";
import { z } from "zod";
import {
  PUBLIC_SKILL_CORPUS_DISCOVERY_SCHEMA_VERSION,
  PUBLIC_SKILL_CORPUS_IDENTITY,
  PUBLIC_SKILL_CORPUS_PROTOCOL_PATH,
  PublicSkillCorpusDiscoverySchema,
  PublicSkillCorpusProtocolSchema,
  type PublicSkillCorpusDiscovery,
  type PublicSkillCorpusProtocol,
  verifyPublicSkillCorpusProtocolFiles,
} from "./public-skill-responsibility-corpus";
import {
  createContainedDirectory,
  normalizeRepositoryRelativePath,
  resolveContainedExistingFile,
  resolveContainedNewFile,
} from "./public-skill-responsibility-corpus-paths";

const Sha1Schema = z.string().regex(/^[0-9a-f]{40}$/u);

const GitHubSearchItemSchema = z.object({
  full_name: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u),
  html_url: z.string().url(),
  url: z.string().url(),
  private: z.boolean(),
  fork: z.boolean(),
  archived: z.boolean(),
  disabled: z.boolean(),
  default_branch: z.string().min(1),
  license: z.object({ spdx_id: z.string().nullable() }).passthrough().nullable(),
}).passthrough();

const GitHubSearchResponseSchema = z.object({
  total_count: z.number().int().nonnegative(),
  incomplete_results: z.boolean(),
  items: z.array(GitHubSearchItemSchema).max(100),
}).passthrough();

const GitHubBranchResponseSchema = z.object({
  commit: z.object({ sha: Sha1Schema }).passthrough(),
}).passthrough();

const GitHubTreeEntrySchema = z.object({
  path: z.string().min(1),
  type: z.enum(["blob", "tree", "commit"]),
  sha: Sha1Schema,
  size: z.number().int().nonnegative().optional(),
}).passthrough();

const GitHubTreeResponseSchema = z.object({
  sha: Sha1Schema,
  truncated: z.boolean(),
  tree: z.array(GitHubTreeEntrySchema),
}).passthrough();

const ArchivedResponseMetadataSchema = z.object({
  schemaVersion: z.literal("skill-ir-public-skill-responsibility-http-metadata/v1"),
  status: z.literal(200),
  headers: z.object({
    "content-type": z.string().min(1),
    "x-ratelimit-remaining": z.string().regex(/^\d+$/u),
    "x-ratelimit-reset": z.string().regex(/^\d+$/u),
  }).strict(),
}).strict();

const MAX_METADATA_RESPONSE_BYTES = 64 * 1024 * 1024;

export type PublicSkillMetadataHttpResponse = {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
};

export type PublicSkillMetadataRequest = (
  url: string,
  headers: Readonly<Record<string, string>>,
) => Promise<PublicSkillMetadataHttpResponse>;

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function assertEquivalent(actual: unknown, expected: unknown, label: string): void {
  if (canonical(actual) !== canonical(expected)) throw new Error(`${label} drift`);
}

function normalizedHeaders(headers: Headers): Record<string, string> {
  return Object.fromEntries([...headers.entries()].map(([key, value]) => [key.toLowerCase(), value]));
}

async function readResponseBodyBounded(response: Response, url: string): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      totalBytes += next.value.byteLength;
      if (totalBytes > MAX_METADATA_RESPONSE_BYTES) {
        await reader.cancel("metadata response byte limit exceeded");
        throw new Error(`GitHub metadata response exceeds 64 MiB: ${url}`);
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function requestPublicSkillMetadata(
  url: string,
  headers: Readonly<Record<string, string>>,
): Promise<PublicSkillMetadataHttpResponse> {
  const response = await fetch(url, { method: "GET", headers, redirect: "error" });
  return {
    status: response.status,
    headers: normalizedHeaders(response.headers),
    body: await readResponseBodyBounded(response, url),
  };
}

function rateMetadata(headers: Record<string, string>): {
  rateLimitRemaining: number;
  rateLimitResetAt: string;
} {
  const normalized = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  const remaining = Number(normalized.get("x-ratelimit-remaining"));
  const resetSeconds = Number(normalized.get("x-ratelimit-reset"));
  if (!Number.isInteger(remaining) || remaining < 0) throw new Error("GitHub response lacks a valid x-ratelimit-remaining header");
  if (!Number.isInteger(resetSeconds) || resetSeconds <= 0) throw new Error("GitHub response lacks a valid x-ratelimit-reset header");
  return {
    rateLimitRemaining: remaining,
    rateLimitResetAt: new Date(resetSeconds * 1000).toISOString(),
  };
}

function assertJsonResponse(response: PublicSkillMetadataHttpResponse, url: string): void {
  if (response.status !== 200) throw new Error(`GitHub metadata request failed with HTTP ${response.status}: ${url}`);
  const contentType = Object.entries(response.headers)
    .find(([key]) => key.toLowerCase() === "content-type")?.[1];
  if (!contentType?.toLowerCase().includes("json")) throw new Error(`GitHub metadata response is not JSON: ${url}`);
  if (response.body.byteLength > MAX_METADATA_RESPONSE_BYTES) throw new Error(`GitHub metadata response exceeds 64 MiB: ${url}`);
}

function responseMetadata(response: PublicSkillMetadataHttpResponse): z.infer<typeof ArchivedResponseMetadataSchema> {
  const headers = new Map(Object.entries(response.headers).map(([key, value]) => [key.toLowerCase(), value]));
  return ArchivedResponseMetadataSchema.parse({
    schemaVersion: "skill-ir-public-skill-responsibility-http-metadata/v1",
    status: response.status,
    headers: {
      "content-type": headers.get("content-type"),
      "x-ratelimit-remaining": headers.get("x-ratelimit-remaining"),
      "x-ratelimit-reset": headers.get("x-ratelimit-reset"),
    },
  });
}

function buildSearchUrl(protocol: PublicSkillCorpusProtocol, query: string, page: number): string {
  const url = new URL("/search/repositories", protocol.provider.baseUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("sort", protocol.repositorySearch.sort);
  url.searchParams.set("order", protocol.repositorySearch.order);
  url.searchParams.set("per_page", String(protocol.repositorySearch.perPage));
  url.searchParams.set("page", String(page));
  return url.toString();
}

export function validateGitHubRepositoryApiIdentity(
  apiUrl: string,
  fullName: string,
  providerBaseUrl: string,
): string {
  const [owner, repository, ...extra] = fullName.split("/");
  if (!owner || !repository || extra.length > 0) throw new Error(`invalid GitHub repository identity: ${fullName}`);
  const provider = new URL(providerBaseUrl);
  const expected = new URL(`/repos/${owner}/${repository}`, `${provider.origin}/`).toString().replace(/\/$/u, "");
  const actual = new URL(apiUrl).toString().replace(/\/$/u, "");
  if (actual !== expected) {
    throw new Error(`GitHub repository API URL does not match ${fullName}: ${apiUrl}`);
  }
  return expected;
}

function branchUrl(apiUrl: string, defaultBranch: string): string {
  return `${apiUrl}/branches/${encodeURIComponent(defaultBranch)}`;
}

function treeUrl(apiUrl: string, commit: string): string {
  return `${apiUrl}/git/trees/${commit}?recursive=1`;
}

function rawRepositorySlug(index: number, fullName: string): string {
  const portable = fullName.replaceAll("/", "--").replace(/[^A-Za-z0-9._-]/gu, "-");
  return `${String(index).padStart(2, "0")}-${portable}`;
}

function licenseFromTree(spdxId: string | null, blobs: Array<{ path: string; oid: string; size: number; type: "blob" }>):
  PublicSkillCorpusDiscovery["repositories"][number]["license"] {
  if (!spdxId || spdxId === "NOASSERTION" || spdxId === "OTHER") {
    return { status: "missing-classification", spdxId: null, authorityPath: null, blobOid: null, size: null };
  }
  const authority = blobs.filter((entry) => !entry.path.includes("/") && /^(?:LICENSE|COPYING)(?:$|[._-])/iu.test(entry.path));
  if (authority.length === 0) {
    return { status: "missing-authority", spdxId, authorityPath: null, blobOid: null, size: null };
  }
  if (authority.length > 1) {
    return { status: "ambiguous-authority", spdxId, authorityPath: null, blobOid: null, size: null };
  }
  const selected = authority[0]!;
  return { status: "resolved", spdxId, authorityPath: selected.path, blobOid: selected.oid, size: selected.size };
}

function blobsFromTree(
  tree: z.infer<typeof GitHubTreeResponseSchema>,
  repositoryFullName: string,
): Array<{ path: string; oid: string; size: number; type: "blob" }> {
  if (tree.tree.some((entry) => entry.type === "blob" && entry.size === undefined)) {
    throw new Error(`GitHub tree contains a blob without size: ${repositoryFullName}`);
  }
  return tree.tree
    .filter((entry): entry is typeof entry & { type: "blob"; size: number } => entry.type === "blob" && entry.size !== undefined)
    .map((entry) => ({ path: entry.path, oid: entry.sha, size: entry.size, type: "blob" as const }));
}

function metadataHeaders(protocol: PublicSkillCorpusProtocol): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": protocol.provider.apiVersion,
    "User-Agent": "SkVM-public-skill-responsibility-corpus-development",
  };
}

async function writeRaw(
  rootDir: string,
  responsePath: string,
  response: PublicSkillMetadataHttpResponse,
): Promise<{ responseMetadataPath: string; responseMetadataSha256: string }> {
  const target = await resolveContainedNewFile(rootDir, responsePath, "metadata response archive");
  await writeFile(target, response.body, { flag: "wx" });
  const metadata = new TextEncoder().encode(`${JSON.stringify(responseMetadata(response), null, 2)}\n`);
  const responseMetadataPath = responsePath.replace(/\.json$/u, ".metadata.json");
  if (responseMetadataPath === responsePath) throw new Error(`metadata response archive path lacks .json suffix: ${responsePath}`);
  const metadataTarget = await resolveContainedNewFile(rootDir, responseMetadataPath, "metadata response header archive");
  await writeFile(metadataTarget, metadata, { flag: "wx" });
  return { responseMetadataPath, responseMetadataSha256: sha256(metadata) };
}

export type PublicSkillMetadataDiscoveryOptions = {
  rootDir: string;
  protocolPath: string;
  outputDir: string;
  retrievedAt: string;
  request?: PublicSkillMetadataRequest;
};

async function discoverPublicSkillMetadataCore(
  options: PublicSkillMetadataDiscoveryOptions & { request: PublicSkillMetadataRequest },
): Promise<PublicSkillCorpusDiscovery> {
  const rootDir = resolve(options.rootDir);
  if (options.protocolPath !== PUBLIC_SKILL_CORPUS_PROTOCOL_PATH) throw new Error("unexpected public skill corpus protocol path");
  const outputDir = normalizeRepositoryRelativePath(options.outputDir, "outputDir");
  const retrievedAt = z.string().datetime().parse(options.retrievedAt);
  await verifyPublicSkillCorpusProtocolFiles({ rootDir, protocolPath: options.protocolPath });
  const protocolFile = await resolveContainedExistingFile(rootDir, options.protocolPath, "public skill corpus protocol");
  const protocolBytes = await readFile(protocolFile);
  const protocol = PublicSkillCorpusProtocolSchema.parse(JSON.parse(protocolBytes.toString("utf8")));
  const request = options.request;
  const headers = metadataHeaders(protocol);

  const searchPages: PublicSkillCorpusDiscovery["searchPages"] = [];
  const firstSearchItem = new Map<string, {
    item: z.infer<typeof GitHubSearchItemSchema>;
    queryPriority: number;
    page: number;
    rank: number;
  }>();
  let metadataRequests = 0;
  for (let queryIndex = 0; queryIndex < protocol.repositorySearch.queries.length; queryIndex += 1) {
    const queryPriority = queryIndex + 1;
    const query = protocol.repositorySearch.queries[queryIndex]!;
    for (const page of protocol.repositorySearch.pages) {
      const requestUrl = buildSearchUrl(protocol, query, page);
      const response = await request(requestUrl, headers);
      metadataRequests += 1;
      assertJsonResponse(response, requestUrl);
      const rate = rateMetadata(response.headers);
      const parsed = GitHubSearchResponseSchema.parse(JSON.parse(new TextDecoder().decode(response.body)));
      if (parsed.incomplete_results) throw new Error(`GitHub repository search was incomplete: query ${queryPriority}, page ${page}`);
      const responsePath = `${outputDir}/raw/search/query-${queryPriority}-page-${page}.json`;
      const responseArchive = await writeRaw(rootDir, responsePath, response);
      const repositoryFullNames = parsed.items.map((item, rankIndex) => {
        validateGitHubRepositoryApiIdentity(item.url, item.full_name, protocol.provider.baseUrl);
        const key = item.full_name.toLowerCase();
        if (!firstSearchItem.has(key)) {
          firstSearchItem.set(key, { item, queryPriority, page, rank: rankIndex + 1 });
        }
        return item.full_name;
      });
      searchPages.push({
        queryPriority,
        query,
        page,
        requestUrl,
        responsePath,
        responseSha256: sha256(response.body),
        ...responseArchive,
        retrievedAt,
        totalCount: parsed.total_count,
        incompleteResults: parsed.incomplete_results,
        repositoryFullNames,
        ...rate,
      });
      const hasAnotherSearch = searchPages.length < protocol.repositorySearch.queries.length * protocol.repositorySearch.pages.length;
      const hasRepositoryInspection = !hasAnotherSearch && firstSearchItem.size > 0;
      if ((hasAnotherSearch || hasRepositoryInspection) && rate.rateLimitRemaining === 0) {
        throw new Error("GitHub search rate limit exhausted before fixed metadata sequence completed");
      }
    }
  }

  const inspectionItems = [...firstSearchItem.values()].slice(0, protocol.repositoryInspection.repositoryPrefixLimit);
  const repositories: PublicSkillCorpusDiscovery["repositories"] = [];
  for (let index = 0; index < inspectionItems.length; index += 1) {
    const source = inspectionItems[index]!;
    const slug = rawRepositorySlug(index + 1, source.item.full_name);
    const branchRequestUrl = branchUrl(source.item.url, source.item.default_branch);
    const branchResponse = await request(branchRequestUrl, headers);
    metadataRequests += 1;
    assertJsonResponse(branchResponse, branchRequestUrl);
    const branchRate = rateMetadata(branchResponse.headers);
    const branch = GitHubBranchResponseSchema.parse(JSON.parse(new TextDecoder().decode(branchResponse.body)));
    const branchResponsePath = `${outputDir}/raw/repositories/${slug}/branch.json`;
    const branchArchive = await writeRaw(rootDir, branchResponsePath, branchResponse);
    if (branchRate.rateLimitRemaining === 0) {
      throw new Error("GitHub core rate limit exhausted before recursive tree request");
    }

    const treeRequestUrl = treeUrl(source.item.url, branch.commit.sha);
    const treeResponse = await request(treeRequestUrl, headers);
    metadataRequests += 1;
    assertJsonResponse(treeResponse, treeRequestUrl);
    const treeRate = rateMetadata(treeResponse.headers);
    const tree = GitHubTreeResponseSchema.parse(JSON.parse(new TextDecoder().decode(treeResponse.body)));
    const treeResponsePath = `${outputDir}/raw/repositories/${slug}/tree.json`;
    const treeArchive = await writeRaw(rootDir, treeResponsePath, treeResponse);
    const blobs = blobsFromTree(tree, source.item.full_name);
    repositories.push({
      fullName: source.item.full_name,
      htmlUrl: source.item.html_url,
      apiUrl: source.item.url,
      private: source.item.private,
      fork: source.item.fork,
      archived: source.item.archived,
      disabled: source.item.disabled,
      defaultBranch: source.item.default_branch,
      headCommit: branch.commit.sha,
      searchSource: { queryPriority: source.queryPriority, page: source.page, rank: source.rank },
      branch: {
        requestUrl: branchRequestUrl,
        responsePath: branchResponsePath,
        responseSha256: sha256(branchResponse.body),
        ...branchArchive,
        retrievedAt,
        ...branchRate,
      },
      license: licenseFromTree(source.item.license?.spdx_id ?? null, blobs),
      tree: {
        requestUrl: treeRequestUrl,
        responsePath: treeResponsePath,
        responseSha256: sha256(treeResponse.body),
        ...treeArchive,
        retrievedAt,
        ...treeRate,
        truncated: tree.truncated,
        blobs,
      },
    });
    const hasAnotherCoreRequest = index + 1 < inspectionItems.length;
    if (hasAnotherCoreRequest && treeRate.rateLimitRemaining === 0) {
      throw new Error("GitHub core rate limit exhausted before fixed repository prefix completed");
    }
  }

  const discovery = PublicSkillCorpusDiscoverySchema.parse({
    schemaVersion: PUBLIC_SKILL_CORPUS_DISCOVERY_SCHEMA_VERSION,
    identity: PUBLIC_SKILL_CORPUS_IDENTITY,
    status: "metadata-complete",
    protocol: { path: PUBLIC_SKILL_CORPUS_PROTOCOL_PATH, sha256: sha256(protocolBytes) },
    retrievedAt,
    searchPages,
    repositories,
    accounting: {
      metadataRequests,
      repositoriesInspected: repositories.length,
      skillBodyRequests: 0,
      skillBodyBytes: 0,
      modelCalls: 0,
      businessApiCalls: 0,
      paidCalls: 0,
      heldOutAccesses: 0,
      q1ReservedAccesses: 0,
      pendingProspectiveAccesses: 0,
    },
  });
  if (metadataRequests > protocol.repositoryInspection.maximumMetadataRequests) {
    throw new Error("public metadata request budget exceeded");
  }
  const discoveryFile = await resolveContainedNewFile(rootDir, `${outputDir}/discovery.json`, "metadata discovery report");
  await writeFile(discoveryFile, `${JSON.stringify(discovery, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return discovery;
}

export async function discoverPublicSkillMetadata(
  options: PublicSkillMetadataDiscoveryOptions,
): Promise<PublicSkillCorpusDiscovery> {
  const rootDir = resolve(options.rootDir);
  if (options.protocolPath !== PUBLIC_SKILL_CORPUS_PROTOCOL_PATH) throw new Error("unexpected public skill corpus protocol path");
  const outputDir = normalizeRepositoryRelativePath(options.outputDir, "outputDir");
  const failedAt = z.string().datetime().parse(options.retrievedAt);
  await verifyPublicSkillCorpusProtocolFiles({ rootDir, protocolPath: options.protocolPath });
  const protocolFile = await resolveContainedExistingFile(rootDir, options.protocolPath, "public skill corpus protocol");
  const protocolBytes = await readFile(protocolFile);
  await createContainedDirectory(rootDir, outputDir, "metadata discovery output directory");
  const failurePath = await resolveContainedNewFile(rootDir, `${outputDir}/failure.json`, "metadata discovery failure report");
  const failureHandle = await open(failurePath, "wx");

  const underlyingRequest = options.request ?? requestPublicSkillMetadata;
  let metadataRequestsAttempted = 0;
  const countedRequest: PublicSkillMetadataRequest = async (url, headers) => {
    metadataRequestsAttempted += 1;
    return underlyingRequest(url, headers);
  };
  let discovery: PublicSkillCorpusDiscovery;
  try {
    discovery = await discoverPublicSkillMetadataCore({ ...options, request: countedRequest });
  } catch (error) {
    const failure = {
      schemaVersion: "skill-ir-public-skill-responsibility-metadata-discovery-failure/v1",
      identity: PUBLIC_SKILL_CORPUS_IDENTITY,
      status: "metadata-discovery-failed",
      failedAt,
      protocol: { path: options.protocolPath, sha256: sha256(protocolBytes) },
      error: {
        name: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : String(error),
      },
      accounting: {
        metadataRequestsAttempted,
        publicSkillBodyRequests: 0,
        publicSkillBodyBytes: 0,
        modelCalls: 0,
        businessApiCalls: 0,
        paidCalls: 0,
        heldOutAccesses: 0,
        q1ReservedAccesses: 0,
        pendingProspectiveAccesses: 0,
      },
    };
    let archiveError: unknown;
    try {
      await failureHandle.truncate(0);
      await failureHandle.writeFile(`${JSON.stringify(failure, null, 2)}\n`, { encoding: "utf8" });
      await failureHandle.sync();
    } catch (caught) {
      archiveError = caught;
    }
    try {
      await failureHandle.close();
    } catch (caught) {
      archiveError = archiveError
        ? new AggregateError([archiveError, caught], "multiple failure archive errors")
        : caught;
    }
    if (archiveError) {
      throw new AggregateError(
        [error, archiveError],
        "metadata discovery failed and its failure evidence could not be archived",
      );
    }
    throw error;
  }

  try {
    await failureHandle.close();
    await unlink(failurePath);
  } catch (error) {
    throw new AggregateError(
      [error],
      "metadata discovery completed but its reserved failure evidence file could not be removed",
    );
  }
  return discovery;
}

function assertResponsePathUnderDiscovery(discoveryPath: string, responsePath: string): void {
  const normalizedDiscovery = normalizeRepositoryRelativePath(discoveryPath, "discoveryPath");
  const normalizedResponse = normalizeRepositoryRelativePath(responsePath, "metadata response path");
  const back = posix.relative(posix.dirname(normalizedDiscovery), normalizedResponse);
  if (back === "" || back === ".." || back.startsWith("../") || posix.isAbsolute(back)) {
    throw new Error(`metadata response path is outside discovery directory: ${responsePath}`);
  }
}

async function readBoundResponse(
  rootDir: string,
  discoveryPath: string,
  responsePath: string,
  expectedSha256: string,
  label: string,
): Promise<Uint8Array> {
  assertResponsePathUnderDiscovery(discoveryPath, responsePath);
  const responseFile = await resolveContainedExistingFile(rootDir, responsePath, label);
  const bytes = await readFile(responseFile);
  if (sha256(bytes) !== expectedSha256) throw new Error(`${label} digest / sha256 drift`);
  return bytes;
}

async function readBoundResponseMetadata(
  rootDir: string,
  discoveryPath: string,
  responseMetadataPath: string,
  expectedSha256: string,
  requestUrl: string,
  label: string,
): Promise<ReturnType<typeof rateMetadata>> {
  assertResponsePathUnderDiscovery(discoveryPath, responseMetadataPath);
  const metadataFile = await resolveContainedExistingFile(rootDir, responseMetadataPath, `${label} metadata`);
  const bytes = await readFile(metadataFile);
  if (sha256(bytes) !== expectedSha256) throw new Error(`${label} metadata digest / sha256 drift`);
  const archived = ArchivedResponseMetadataSchema.parse(JSON.parse(bytes.toString("utf8")));
  assertJsonResponse({ status: archived.status, headers: archived.headers, body: new Uint8Array() }, requestUrl);
  return rateMetadata(archived.headers);
}

export async function verifyPublicSkillMetadataDiscoveryFiles(options: {
  rootDir: string;
  discoveryPath: string;
}): Promise<{
  status: "verified-metadata-discovery";
  metadataRequests: number;
  repositoriesInspected: number;
  searchUniverseRepositories: number;
  publicSkillBodyRequests: 0;
}> {
  const rootDir = resolve(options.rootDir);
  const discoveryPath = normalizeRepositoryRelativePath(options.discoveryPath, "discoveryPath");
  const discoveryFile = await resolveContainedExistingFile(rootDir, discoveryPath, "metadata discovery report");
  const discoveryBytes = await readFile(discoveryFile);
  const discovery = PublicSkillCorpusDiscoverySchema.parse(JSON.parse(discoveryBytes.toString("utf8")));
  await verifyPublicSkillCorpusProtocolFiles({ rootDir, protocolPath: discovery.protocol.path });
  const protocolFile = await resolveContainedExistingFile(rootDir, discovery.protocol.path, "public skill corpus protocol");
  const protocolBytes = await readFile(protocolFile);
  if (sha256(protocolBytes) !== discovery.protocol.sha256) throw new Error("discovery protocol digest drift");
  const protocol = PublicSkillCorpusProtocolSchema.parse(JSON.parse(protocolBytes.toString("utf8")));

  const responsePaths = new Set<string>();
  const firstSearchItem = new Map<string, {
    item: z.infer<typeof GitHubSearchItemSchema>;
    queryPriority: number;
    page: number;
    rank: number;
  }>();
  let searchIndex = 0;
  for (let queryIndex = 0; queryIndex < protocol.repositorySearch.queries.length; queryIndex += 1) {
    for (const expectedPageNumber of protocol.repositorySearch.pages) {
      const page = discovery.searchPages[searchIndex]!;
      const queryPriority = queryIndex + 1;
      const query = protocol.repositorySearch.queries[queryIndex]!;
      if (page.queryPriority !== queryPriority || page.query !== query || page.page !== expectedPageNumber) {
        throw new Error(`search response order drift at index ${searchIndex}`);
      }
      if (page.requestUrl !== buildSearchUrl(protocol, query, expectedPageNumber)) throw new Error("search request URL drift");
      if (page.retrievedAt !== discovery.retrievedAt) throw new Error("search response retrieval time drift");
      if (responsePaths.has(page.responsePath)) throw new Error(`duplicate metadata response path: ${page.responsePath}`);
      responsePaths.add(page.responsePath);
      if (responsePaths.has(page.responseMetadataPath)) throw new Error(`duplicate metadata response path: ${page.responseMetadataPath}`);
      responsePaths.add(page.responseMetadataPath);
      const bytes = await readBoundResponse(rootDir, discoveryPath, page.responsePath, page.responseSha256, "search response");
      const rate = await readBoundResponseMetadata(
        rootDir,
        discoveryPath,
        page.responseMetadataPath,
        page.responseMetadataSha256,
        page.requestUrl,
        "search response",
      );
      assertEquivalent({
        rateLimitRemaining: page.rateLimitRemaining,
        rateLimitResetAt: page.rateLimitResetAt,
      }, rate, "search response rate metadata");
      const parsed = GitHubSearchResponseSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
      if (parsed.incomplete_results) {
        throw new Error(`GitHub repository search archive is incomplete: query ${queryPriority}, page ${expectedPageNumber}`);
      }
      for (const item of parsed.items) {
        validateGitHubRepositoryApiIdentity(item.url, item.full_name, protocol.provider.baseUrl);
      }
      assertEquivalent(page.repositoryFullNames, parsed.items.map((item) => item.full_name), "search response repository identities");
      if (page.totalCount !== parsed.total_count || page.incompleteResults !== parsed.incomplete_results) {
        throw new Error("search response aggregate drift");
      }
      parsed.items.forEach((item, rankIndex) => {
        const key = item.full_name.toLowerCase();
        if (!firstSearchItem.has(key)) firstSearchItem.set(key, { item, queryPriority, page: expectedPageNumber, rank: rankIndex + 1 });
      });
      searchIndex += 1;
    }
  }

  const inspectionItems = [...firstSearchItem.values()].slice(0, protocol.repositoryInspection.repositoryPrefixLimit);
  for (let index = 0; index < discovery.searchPages.length; index += 1) {
    const page = discovery.searchPages[index]!;
    const hasAnotherMetadataRequest = index + 1 < discovery.searchPages.length || inspectionItems.length > 0;
    if (hasAnotherMetadataRequest && page.rateLimitRemaining === 0) {
      throw new Error("archived GitHub search rate limit was exhausted before fixed metadata sequence completed");
    }
  }
  if (inspectionItems.length !== discovery.repositories.length) throw new Error("frozen inspected repository prefix length drift");
  for (let index = 0; index < inspectionItems.length; index += 1) {
    const source = inspectionItems[index]!;
    const repository = discovery.repositories[index]!;
    if (repository.fullName.toLowerCase() !== source.item.full_name.toLowerCase()) throw new Error("frozen inspected repository prefix order drift");
    assertEquivalent(repository.searchSource, {
      queryPriority: source.queryPriority,
      page: source.page,
      rank: source.rank,
    }, "repository search source");
    assertEquivalent({
      fullName: repository.fullName,
      htmlUrl: repository.htmlUrl,
      apiUrl: repository.apiUrl,
      private: repository.private,
      fork: repository.fork,
      archived: repository.archived,
      disabled: repository.disabled,
      defaultBranch: repository.defaultBranch,
    }, {
      fullName: source.item.full_name,
      htmlUrl: source.item.html_url,
      apiUrl: source.item.url,
      private: source.item.private,
      fork: source.item.fork,
      archived: source.item.archived,
      disabled: source.item.disabled,
      defaultBranch: source.item.default_branch,
    }, "repository search metadata");

    const expectedBranchUrl = branchUrl(source.item.url, source.item.default_branch);
    if (repository.branch.requestUrl !== expectedBranchUrl) throw new Error("branch request URL drift");
    if (repository.branch.retrievedAt !== discovery.retrievedAt) throw new Error("branch retrieval time drift");
    if (responsePaths.has(repository.branch.responsePath)) throw new Error(`duplicate metadata response path: ${repository.branch.responsePath}`);
    responsePaths.add(repository.branch.responsePath);
    if (responsePaths.has(repository.branch.responseMetadataPath)) throw new Error(`duplicate metadata response path: ${repository.branch.responseMetadataPath}`);
    responsePaths.add(repository.branch.responseMetadataPath);
    const branchBytes = await readBoundResponse(rootDir, discoveryPath, repository.branch.responsePath, repository.branch.responseSha256, "branch response");
    const branchRate = await readBoundResponseMetadata(
      rootDir,
      discoveryPath,
      repository.branch.responseMetadataPath,
      repository.branch.responseMetadataSha256,
      repository.branch.requestUrl,
      "branch response",
    );
    assertEquivalent({
      rateLimitRemaining: repository.branch.rateLimitRemaining,
      rateLimitResetAt: repository.branch.rateLimitResetAt,
    }, branchRate, "branch response rate metadata");
    if (branchRate.rateLimitRemaining === 0) {
      throw new Error("archived GitHub core rate limit was exhausted before recursive tree request");
    }
    const branch = GitHubBranchResponseSchema.parse(JSON.parse(new TextDecoder().decode(branchBytes)));
    if (repository.headCommit !== branch.commit.sha) throw new Error("default branch head commit drift");

    const expectedTreeUrl = treeUrl(source.item.url, branch.commit.sha);
    if (repository.tree.requestUrl !== expectedTreeUrl) throw new Error("tree request URL drift");
    if (repository.tree.retrievedAt !== discovery.retrievedAt) throw new Error("tree retrieval time drift");
    if (responsePaths.has(repository.tree.responsePath)) throw new Error(`duplicate metadata response path: ${repository.tree.responsePath}`);
    responsePaths.add(repository.tree.responsePath);
    if (responsePaths.has(repository.tree.responseMetadataPath)) throw new Error(`duplicate metadata response path: ${repository.tree.responseMetadataPath}`);
    responsePaths.add(repository.tree.responseMetadataPath);
    const treeBytes = await readBoundResponse(rootDir, discoveryPath, repository.tree.responsePath, repository.tree.responseSha256, "tree response");
    const treeRate = await readBoundResponseMetadata(
      rootDir,
      discoveryPath,
      repository.tree.responseMetadataPath,
      repository.tree.responseMetadataSha256,
      repository.tree.requestUrl,
      "tree response",
    );
    assertEquivalent({
      rateLimitRemaining: repository.tree.rateLimitRemaining,
      rateLimitResetAt: repository.tree.rateLimitResetAt,
    }, treeRate, "tree response rate metadata");
    if (index + 1 < inspectionItems.length && treeRate.rateLimitRemaining === 0) {
      throw new Error("archived GitHub core rate limit was exhausted before fixed repository prefix completed");
    }
    const tree = GitHubTreeResponseSchema.parse(JSON.parse(new TextDecoder().decode(treeBytes)));
    const blobs = blobsFromTree(tree, repository.fullName);
    if (repository.tree.truncated !== tree.truncated) throw new Error("recursive tree truncation drift");
    assertEquivalent(repository.tree.blobs, blobs, "recursive tree blobs");
    assertEquivalent(repository.license, licenseFromTree(source.item.license?.spdx_id ?? null, blobs), "license authority");
  }

  const metadataRequests = discovery.searchPages.length + discovery.repositories.length * 2;
  if (responsePaths.size !== metadataRequests * 2) throw new Error("metadata response path cardinality drift");
  if (discovery.accounting.metadataRequests !== metadataRequests
    || discovery.accounting.repositoriesInspected !== discovery.repositories.length
    || metadataRequests > protocol.repositoryInspection.maximumMetadataRequests) {
    throw new Error("metadata discovery accounting drift");
  }
  return {
    status: "verified-metadata-discovery",
    metadataRequests,
    repositoriesInspected: discovery.repositories.length,
    searchUniverseRepositories: firstSearchItem.size,
    publicSkillBodyRequests: 0,
  };
}
