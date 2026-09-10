import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import {
  normalizeRepositoryRelativePath,
  resolveContainedExistingFile,
} from "./public-skill-responsibility-corpus-paths";

export const PUBLIC_SKILL_CORPUS_IDENTITY = "skill-ir-public-skill-responsibility-corpus-development-001" as const;
export const PUBLIC_SKILL_CORPUS_PROTOCOL_PATH = "benchmarks/skill-ir/classification/public-skill-responsibility-corpus-protocol-v1.json" as const;
export const PUBLIC_SKILL_CORPUS_PROTOCOL_SCHEMA_VERSION = "skill-ir-public-skill-responsibility-corpus-protocol/v1" as const;
export const PUBLIC_SKILL_CORPUS_DISCOVERY_SCHEMA_VERSION = "skill-ir-public-skill-responsibility-metadata-discovery/v1" as const;
export const PUBLIC_SKILL_CORPUS_SELECTION_SCHEMA_VERSION = "skill-ir-public-skill-responsibility-metadata-selection/v1" as const;

export const PUBLIC_SKILL_CORPUS_QUERIES = [
  "topic:agent-skills fork:false archived:false",
  "topic:claude-skills fork:false archived:false",
  "\"SKILL.md\" in:readme fork:false archived:false",
  "\"agent skills\" in:name,description,readme fork:false archived:false",
] as const;
export const PUBLIC_SKILL_CORPUS_PAGES = [1, 2] as const;
export const PUBLIC_SKILL_CORPUS_LICENSE_ALLOWLIST = [
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC-BY-4.0",
  "CC0-1.0",
  "ISC",
  "MIT",
  "MPL-2.0",
  "Unlicense",
] as const;
export const PUBLIC_SKILL_CORPUS_EXCLUDED_PATH_SEGMENTS = [
  ".git",
  ".cache",
  "node_modules",
  "vendor",
  "third_party",
  "dist",
  "build",
] as const;
export const PublicSkillCorpusLicenseSpdxSchema = z.enum(PUBLIC_SKILL_CORPUS_LICENSE_ALLOWLIST);

const Sha1Schema = z.string().regex(/^[0-9a-f]{40}$/u);
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const RepositoryNameSchema = z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u);
const RegularGitBlobModeSchema = z.enum(["100644", "100755"]);
const RelativePathSchema = z.string().min(1).superRefine((value, context) => {
  try {
    normalizeRepositoryRelativePath(value, "path");
  } catch {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "path must be repository-relative and contained" });
  }
});

export const PublicSkillCorpusProtocolSchema = z.object({
  schemaVersion: z.literal(PUBLIC_SKILL_CORPUS_PROTOCOL_SCHEMA_VERSION),
  identity: z.literal(PUBLIC_SKILL_CORPUS_IDENTITY),
  status: z.literal("frozen-before-public-skill-metadata"),
  provider: z.object({
    id: z.literal("github-public-rest-v3"),
    baseUrl: z.literal("https://api.github.com"),
    authentication: z.literal("none"),
    apiVersion: z.literal("2022-11-28"),
  }).strict(),
  repositorySearch: z.object({
    sort: z.literal("stars"),
    order: z.literal("desc"),
    perPage: z.literal(100),
    pages: z.array(z.number().int().positive()).length(2),
    queries: z.array(z.string().min(1)).length(4),
  }).strict(),
  repositoryInspection: z.object({
    repositoryMetadataSource: z.literal("search-response"),
    repositoryPrefixLimit: z.literal(25),
    perRepositoryRequests: z.tuple([z.literal("default-branch"), z.literal("recursive-tree")]),
    maximumMetadataRequests: z.literal(58),
    licenseAuthorityRule: z.literal("single-root-license-or-copying-blob"),
  }).strict(),
  eligibility: z.object({
    requirePublic: z.literal(true),
    rejectForks: z.literal(true),
    rejectArchived: z.literal(true),
    rejectDisabled: z.literal(true),
    licenseSpdxAllowlist: z.array(z.string().min(1)).length(10),
    skillBasename: z.literal("SKILL.md"),
    minSkillBytes: z.literal(100),
    maxSkillBytes: z.literal(524288),
    excludedPathSegments: z.array(z.string().min(1)).length(7),
    requireCompleteRecursiveTree: z.literal(true),
  }).strict(),
  selection: z.object({
    targetSkills: z.literal(40),
    minimumRepositories: z.literal(8),
    maximumSkillsPerRepository: z.literal(5),
    rounds: z.array(z.number().int().positive()).length(5),
    repositoryOrder: z.literal("query-priority-page-rank-full-name"),
    pathOrder: z.literal("utf8-code-point"),
    replacementPolicy: z.literal("none-after-metadata-selection"),
  }).strict(),
  exclusions: z.object({
    q1Registry: z.object({ path: RelativePathSchema, sha256: Sha256Schema }).strict(),
    q1ReservedAccess: z.literal("forbidden"),
    heldOutAccess: z.literal("forbidden"),
    pendingProspectiveAccess: z.literal("forbidden"),
    pendingProspectiveSelectedSourcesAtFreeze: z.literal(0),
  }).strict(),
  contentGate: z.object({
    selectionMustBeCommittedBeforeBodyRead: z.literal(true),
    bodyExposuresAtFreeze: z.literal(0),
    skillBodyRequestsAtFreeze: z.literal(0),
    skillBodyBytesAtFreeze: z.literal(0),
  }).strict(),
  resourceClosure: z.object({
    directlyNamedDirectories: z.array(z.string().min(1)).length(5),
    maximumFilesPerSkill: z.literal(100),
    maximumBytesPerSkill: z.literal(5242880),
    maximumBytesPerResource: z.literal(1048576),
    followTransitiveResourceLinks: z.literal(false),
  }).strict(),
  accounting: z.object({
    publicMetadataRequests: z.literal(0),
    publicSkillBodyRequests: z.literal(0),
    publicSkillBodyBytes: z.literal(0),
    prospectiveResultsUsed: z.literal(0),
    modelCalls: z.literal(0),
    businessApiCalls: z.literal(0),
    paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
    q1ReservedAccesses: z.literal(0),
    developmentAgentUsage: z.literal("host-external-not-measured-by-runner"),
  }).strict(),
  claimBoundary: z.string().min(1),
}).strict();

export type PublicSkillCorpusProtocol = z.infer<typeof PublicSkillCorpusProtocolSchema>;

export const PublicSkillCorpusSearchPageSchema = z.object({
  queryPriority: z.number().int().min(1).max(4),
  query: z.string().min(1),
  page: z.number().int().min(1).max(2),
  requestUrl: z.string().url(),
  responsePath: RelativePathSchema,
  responseSha256: Sha256Schema,
  responseMetadataPath: RelativePathSchema,
  responseMetadataSha256: Sha256Schema,
  retrievedAt: z.string().datetime(),
  totalCount: z.number().int().nonnegative(),
  incompleteResults: z.boolean(),
  repositoryFullNames: z.array(RepositoryNameSchema),
  rateLimitRemaining: z.number().int().nonnegative(),
  rateLimitResetAt: z.string().datetime(),
}).strict();

const ResolvedRepositoryLicenseSchema = z.object({
  status: z.literal("resolved"),
  spdxId: z.string().min(1),
  authorityPath: RelativePathSchema,
  blobOid: Sha1Schema,
  size: z.number().int().positive(),
}).strict();

const UnresolvedRepositoryLicenseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("missing-classification"),
    spdxId: z.null(),
    authorityPath: z.null(),
    blobOid: z.null(),
    size: z.null(),
  }).strict(),
  z.object({
    status: z.enum(["missing-authority", "ambiguous-authority"]),
    spdxId: z.string().min(1),
    authorityPath: z.null(),
    blobOid: z.null(),
    size: z.null(),
  }).strict(),
]);

export const PublicSkillCorpusRepositorySchema = z.object({
  fullName: RepositoryNameSchema,
  htmlUrl: z.string().url(),
  apiUrl: z.string().url(),
  private: z.boolean(),
  fork: z.boolean(),
  archived: z.boolean(),
  disabled: z.boolean(),
  defaultBranch: z.string().min(1),
  headCommit: Sha1Schema,
  searchSource: z.object({
    queryPriority: z.number().int().min(1).max(4),
    page: z.number().int().min(1).max(2),
    rank: z.number().int().positive().max(100),
  }).strict(),
  branch: z.object({
    requestUrl: z.string().url(),
    responsePath: RelativePathSchema,
    responseSha256: Sha256Schema,
    responseMetadataPath: RelativePathSchema,
    responseMetadataSha256: Sha256Schema,
    retrievedAt: z.string().datetime(),
    rateLimitRemaining: z.number().int().nonnegative(),
    rateLimitResetAt: z.string().datetime(),
  }).strict(),
  license: z.union([ResolvedRepositoryLicenseSchema, UnresolvedRepositoryLicenseSchema]),
  tree: z.object({
    requestUrl: z.string().url(),
    responsePath: RelativePathSchema,
    truncated: z.boolean(),
    responseSha256: Sha256Schema,
    responseMetadataPath: RelativePathSchema,
    responseMetadataSha256: Sha256Schema,
    retrievedAt: z.string().datetime(),
    rateLimitRemaining: z.number().int().nonnegative(),
    rateLimitResetAt: z.string().datetime(),
    entries: z.array(z.object({
      path: RelativePathSchema,
      oid: Sha1Schema,
      size: z.number().int().nonnegative().nullable(),
      type: z.enum(["blob", "tree", "commit"]),
      mode: z.enum(["040000", "100644", "100755", "120000", "160000"]),
    }).strict()),
    blobs: z.array(z.object({
      path: RelativePathSchema,
      oid: Sha1Schema,
      size: z.number().int().nonnegative(),
      type: z.literal("blob"),
      mode: RegularGitBlobModeSchema,
    }).strict()),
  }).strict(),
}).strict();

export const PublicSkillCorpusDiscoverySchema = z.object({
  schemaVersion: z.literal(PUBLIC_SKILL_CORPUS_DISCOVERY_SCHEMA_VERSION),
  identity: z.literal(PUBLIC_SKILL_CORPUS_IDENTITY),
  status: z.literal("metadata-complete"),
  protocol: z.object({ path: z.literal(PUBLIC_SKILL_CORPUS_PROTOCOL_PATH), sha256: Sha256Schema }).strict(),
  retrievedAt: z.string().datetime(),
  searchPages: z.array(PublicSkillCorpusSearchPageSchema).length(8),
  repositories: z.array(PublicSkillCorpusRepositorySchema),
  accounting: z.object({
    metadataRequests: z.number().int().positive(),
    repositoriesInspected: z.number().int().nonnegative(),
    skillBodyRequests: z.literal(0),
    skillBodyBytes: z.literal(0),
    modelCalls: z.literal(0),
    businessApiCalls: z.literal(0),
    paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
    q1ReservedAccesses: z.literal(0),
    pendingProspectiveAccesses: z.literal(0),
  }).strict(),
}).strict();

const Q1RegistrySchema = z.object({
  developmentSources: z.array(z.object({
    identity: z.object({
      repository: z.string().url(),
      packageRoot: RelativePathSchema,
    }).passthrough(),
  }).passthrough()),
}).passthrough();

export const PublicSkillCorpusSelectionExclusionSchema = z.object({
  repositoryFullName: RepositoryNameSchema,
  path: RelativePathSchema.nullable(),
  reason: z.enum([
    "repository-private",
    "repository-fork",
    "repository-archived",
    "repository-disabled",
    "license-missing-classification",
    "license-missing-authority",
    "license-ambiguous-authority",
    "license-not-allowlisted",
    "tree-truncated",
    "no-eligible-skill-path",
    "q1-overlap",
  ]),
}).strict();

export const PublicSkillCorpusSelectedRowSchema = z.object({
  selectionRank: z.number().int().positive().max(40),
  selectionRound: z.number().int().min(1).max(5),
  repositoryOrder: z.number().int().positive(),
  repositorySelectionIndex: z.number().int().min(1).max(5),
  repositoryFullName: RepositoryNameSchema,
  repositoryUrl: z.string().url(),
  commit: Sha1Schema,
  path: RelativePathSchema,
  blobOid: Sha1Schema,
  blobSize: z.number().int().min(100).max(524288),
  provisionalLineageId: z.string().regex(/^git-blob-sha1:[0-9a-f]{40}$/u),
  license: z.object({
    spdxId: PublicSkillCorpusLicenseSpdxSchema,
    authorityPath: RelativePathSchema,
    blobOid: Sha1Schema,
    size: z.number().int().positive(),
  }).strict(),
}).strict();

export const PublicSkillCorpusSelectionSchema = z.object({
  schemaVersion: z.literal(PUBLIC_SKILL_CORPUS_SELECTION_SCHEMA_VERSION),
  identity: z.literal(PUBLIC_SKILL_CORPUS_IDENTITY),
  status: z.enum(["frozen-selection-pending-commit", "metadata-selection-shortfall"]),
  selectedAt: z.string().datetime(),
  protocol: z.object({ path: z.literal(PUBLIC_SKILL_CORPUS_PROTOCOL_PATH), sha256: Sha256Schema }).strict(),
  discovery: z.object({
    path: RelativePathSchema,
    sha256: Sha256Schema,
    portableSha256: Sha256Schema,
  }).strict(),
  selected: z.array(PublicSkillCorpusSelectedRowSchema).max(40),
  exclusions: z.array(PublicSkillCorpusSelectionExclusionSchema),
  totals: z.object({
    selectedSkills: z.number().int().nonnegative().max(40),
    selectedRepositories: z.number().int().nonnegative(),
    provisionalLineages: z.number().int().nonnegative(),
    searchUniverseRepositories: z.number().int().nonnegative(),
    inspectedRepositories: z.number().int().nonnegative().max(25),
    uninspectedRepositories: z.number().int().nonnegative(),
    targetSkills: z.literal(40),
    minimumRepositories: z.literal(8),
    bodyExposures: z.literal(0),
  }).strict(),
  accounting: z.object({
    publicMetadataRequests: z.number().int().positive(),
    publicSkillBodyRequests: z.literal(0),
    publicSkillBodyBytes: z.literal(0),
    modelCalls: z.literal(0),
    businessApiCalls: z.literal(0),
    paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
    q1ReservedAccesses: z.literal(0),
    pendingProspectiveAccesses: z.literal(0),
  }).strict(),
  portableSemanticSha256: Sha256Schema,
}).strict();

export type PublicSkillCorpusSelection = z.infer<typeof PublicSkillCorpusSelectionSchema>;
export type PublicSkillCorpusDiscovery = z.infer<typeof PublicSkillCorpusDiscoverySchema>;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function exactArray(actual: readonly unknown[], expected: readonly unknown[], label: string): void {
  if (canonical(actual) !== canonical(expected)) throw new Error(`${label} drift`);
}

function verifyProtocol(protocol: PublicSkillCorpusProtocol): void {
  exactArray(protocol.repositorySearch.queries, PUBLIC_SKILL_CORPUS_QUERIES, "repository query order");
  exactArray(protocol.repositorySearch.pages, PUBLIC_SKILL_CORPUS_PAGES, "repository page order");
  exactArray(protocol.repositoryInspection.perRepositoryRequests, ["default-branch", "recursive-tree"], "repository inspection request order");
  exactArray(protocol.eligibility.licenseSpdxAllowlist, PUBLIC_SKILL_CORPUS_LICENSE_ALLOWLIST, "license allowlist");
  exactArray(protocol.eligibility.excludedPathSegments, PUBLIC_SKILL_CORPUS_EXCLUDED_PATH_SEGMENTS, "excluded path segment order");
  exactArray(protocol.selection.rounds, [1, 2, 3, 4, 5], "selection round order");
  exactArray(protocol.resourceClosure.directlyNamedDirectories, ["scripts", "references", "templates", "assets", "examples"], "resource directory order");
}

export async function verifyPublicSkillCorpusProtocolFiles(options: {
  rootDir: string;
  protocolPath: string;
}): Promise<{
  status: "verified-pre-source-protocol";
  queries: 4;
  pagesPerQuery: 2;
  targetSkills: 40;
  minimumRepositories: 8;
  publicSkillBodyRequests: 0;
}> {
  if (options.protocolPath !== PUBLIC_SKILL_CORPUS_PROTOCOL_PATH) throw new Error("unexpected public skill corpus protocol path");
  const protocolFile = await resolveContainedExistingFile(options.rootDir, options.protocolPath, "public skill corpus protocol");
  const protocol = PublicSkillCorpusProtocolSchema.parse(JSON.parse(await readFile(protocolFile, "utf8")));
  verifyProtocol(protocol);
  const q1File = await resolveContainedExistingFile(options.rootDir, protocol.exclusions.q1Registry.path, "Q1 exclusion registry");
  const q1Bytes = await readFile(q1File);
  if (sha256(q1Bytes) !== protocol.exclusions.q1Registry.sha256) throw new Error("Q1 exclusion registry digest drift");
  Q1RegistrySchema.parse(JSON.parse(q1Bytes.toString("utf8")));
  return {
    status: "verified-pre-source-protocol",
    queries: 4,
    pagesPerQuery: 2,
    targetSkills: 40,
    minimumRepositories: 8,
    publicSkillBodyRequests: 0,
  };
}

function codePointCompare(left: string, right: string): number {
  const a = [...left].map((value) => value.codePointAt(0)!);
  const b = [...right].map((value) => value.codePointAt(0)!);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  }
  return a.length - b.length;
}

function canonicalRepositoryFromUrl(value: string): string {
  const parsed = new URL(value);
  if (parsed.hostname.toLowerCase() !== "github.com") throw new Error(`Q1 repository is not a canonical GitHub URL: ${value}`);
  const parts = parsed.pathname.replace(/\.git$/u, "").split("/").filter(Boolean);
  if (parts.length !== 2) throw new Error(`Q1 repository URL is not owner/repository: ${value}`);
  return `${parts[0]}/${parts[1]}`.toLowerCase();
}

function pathEligible(path: string, size: number, protocol: PublicSkillCorpusProtocol): boolean {
  const parts = path.replaceAll("\\", "/").split("/");
  return parts.at(-1) === protocol.eligibility.skillBasename
    && size >= protocol.eligibility.minSkillBytes
    && size <= protocol.eligibility.maxSkillBytes
    && !parts.some((part) => protocol.eligibility.excludedPathSegments.includes(part));
}

export function buildPublicSkillMetadataSelection(options: {
  protocol: PublicSkillCorpusProtocol | unknown;
  protocolSha256: string;
  discovery: unknown;
  discoveryPath: string;
  discoverySha256: string;
  q1Registry: unknown;
  selectedAt: string;
}): PublicSkillCorpusSelection {
  const protocol = PublicSkillCorpusProtocolSchema.parse(options.protocol);
  verifyProtocol(protocol);
  const protocolSha256 = Sha256Schema.parse(options.protocolSha256);
  const discovery = PublicSkillCorpusDiscoverySchema.parse(options.discovery);
  const discoveryPath = RelativePathSchema.parse(options.discoveryPath);
  const discoverySha256 = Sha256Schema.parse(options.discoverySha256);
  const q1Registry = Q1RegistrySchema.parse(options.q1Registry);
  const selectedAt = z.string().datetime().parse(options.selectedAt);
  if (discovery.protocol.sha256 !== protocolSha256) throw new Error("discovery protocol digest drift");

  const pageByKey = new Map<string, z.infer<typeof PublicSkillCorpusSearchPageSchema>>();
  for (const page of discovery.searchPages) {
    const key = `${page.queryPriority}:${page.page}`;
    if (pageByKey.has(key)) throw new Error(`duplicate search page: ${key}`);
    pageByKey.set(key, page);
    if (new Set(page.repositoryFullNames.map((entry) => entry.toLowerCase())).size !== page.repositoryFullNames.length) {
      throw new Error(`duplicate repository within search page: ${key}`);
    }
  }
  const orderedPages: z.infer<typeof PublicSkillCorpusSearchPageSchema>[] = [];
  for (let queryIndex = 0; queryIndex < protocol.repositorySearch.queries.length; queryIndex += 1) {
    for (const pageNumber of protocol.repositorySearch.pages) {
      const key = `${queryIndex + 1}:${pageNumber}`;
      const page = pageByKey.get(key);
      if (!page) throw new Error(`missing search page: ${key}`);
      if (page.query !== protocol.repositorySearch.queries[queryIndex]) throw new Error(`search page query order drift: ${key}`);
      orderedPages.push(page);
    }
  }
  if (orderedPages.some((page) => page.incompleteResults)) throw new Error("repository search returned incomplete results");

  const repositoryByName = new Map<string, z.infer<typeof PublicSkillCorpusRepositorySchema>>();
  for (const repository of discovery.repositories) {
    const key = repository.fullName.toLowerCase();
    if (repositoryByName.has(key)) throw new Error(`duplicate repository record: ${repository.fullName}`);
    repositoryByName.set(key, repository);
  }
  const orderedRepositoryKeys: string[] = [];
  for (const page of orderedPages) {
    for (const fullName of page.repositoryFullNames) {
      const key = fullName.toLowerCase();
      if (!orderedRepositoryKeys.includes(key)) orderedRepositoryKeys.push(key);
    }
  }
  const inspectedRepositoryKeys = orderedRepositoryKeys.slice(0, protocol.repositoryInspection.repositoryPrefixLimit);
  const recordedRepositoryKeys = discovery.repositories.map((repository) => repository.fullName.toLowerCase());
  if (canonical(recordedRepositoryKeys) !== canonical(inspectedRepositoryKeys)) {
    throw new Error("discovery repository records must equal the frozen inspected prefix in order");
  }
  if (discovery.accounting.repositoriesInspected !== repositoryByName.size) throw new Error("repository inspection accounting drift");
  const expectedMetadataRequests = protocol.repositorySearch.queries.length * protocol.repositorySearch.pages.length
    + repositoryByName.size * protocol.repositoryInspection.perRepositoryRequests.length;
  if (discovery.accounting.metadataRequests !== expectedMetadataRequests
    || discovery.accounting.metadataRequests > protocol.repositoryInspection.maximumMetadataRequests) {
    throw new Error("public metadata request accounting drift or budget exceeded");
  }

  const q1PackageRoots = q1Registry.developmentSources.map((entry) => ({
    repository: canonicalRepositoryFromUrl(entry.identity.repository),
    packageRoot: entry.identity.packageRoot.replaceAll("\\", "/").replace(/^\/+|\/+$/gu, ""),
  }));
  const exclusions: z.infer<typeof PublicSkillCorpusSelectionExclusionSchema>[] = [];
  const eligibleRepositories: Array<{
    repository: z.infer<typeof PublicSkillCorpusRepositorySchema>;
    repositoryOrder: number;
    skills: z.infer<typeof PublicSkillCorpusRepositorySchema>["tree"]["blobs"];
  }> = [];
  for (let orderIndex = 0; orderIndex < inspectedRepositoryKeys.length; orderIndex += 1) {
    const repository = repositoryByName.get(inspectedRepositoryKeys[orderIndex]!)!;
    const licenseReason = repository.license.status === "missing-classification" ? "license-missing-classification" as const
      : repository.license.status === "missing-authority" ? "license-missing-authority" as const
        : repository.license.status === "ambiguous-authority" ? "license-ambiguous-authority" as const
          : null;
    const repositoryReason = repository.private ? "repository-private" as const
      : repository.fork ? "repository-fork" as const
        : repository.archived ? "repository-archived" as const
          : repository.disabled ? "repository-disabled" as const
            : licenseReason
              ?? (repository.license.status === "resolved"
                && !protocol.eligibility.licenseSpdxAllowlist.includes(repository.license.spdxId) ? "license-not-allowlisted" as const
                : repository.tree.truncated ? "tree-truncated" as const
                  : null);
    if (repositoryReason) {
      exclusions.push({ repositoryFullName: repository.fullName, path: null, reason: repositoryReason });
      continue;
    }
    if (repository.license.status !== "resolved") throw new Error("eligible repository has unresolved license authority");
    const seenPaths = new Set<string>();
    const skills = repository.tree.blobs
      .map((entry) => {
        const normalized = entry.path.replaceAll("\\", "/");
        if (seenPaths.has(normalized)) throw new Error(`duplicate skill path in repository tree: ${repository.fullName}:${normalized}`);
        seenPaths.add(normalized);
        return { ...entry, path: normalized };
      })
      .filter((entry) => pathEligible(entry.path, entry.size, protocol))
      .sort((left, right) => codePointCompare(left.path, right.path));
    const selectedSkills = skills.filter((entry) => {
      const overlap = q1PackageRoots.some((excluded) => excluded.repository === repository.fullName.toLowerCase()
        && (entry.path === `${excluded.packageRoot}/SKILL.md` || entry.path.startsWith(`${excluded.packageRoot}/`)));
      if (overlap) exclusions.push({ repositoryFullName: repository.fullName, path: entry.path, reason: "q1-overlap" });
      return !overlap;
    });
    if (selectedSkills.length === 0) {
      exclusions.push({ repositoryFullName: repository.fullName, path: null, reason: "no-eligible-skill-path" });
      continue;
    }
    eligibleRepositories.push({ repository, repositoryOrder: orderIndex + 1, skills: selectedSkills });
  }

  const selected: z.infer<typeof PublicSkillCorpusSelectedRowSchema>[] = [];
  for (const round of protocol.selection.rounds) {
    for (const candidate of eligibleRepositories) {
      const blob = candidate.skills[round - 1];
      if (!blob || selected.length >= protocol.selection.targetSkills) continue;
      const license = ResolvedRepositoryLicenseSchema.parse(candidate.repository.license);
      selected.push({
        selectionRank: selected.length + 1,
        selectionRound: round,
        repositoryOrder: candidate.repositoryOrder,
        repositorySelectionIndex: round,
        repositoryFullName: candidate.repository.fullName,
        repositoryUrl: candidate.repository.htmlUrl,
        commit: candidate.repository.headCommit,
        path: blob.path,
        blobOid: blob.oid,
        blobSize: blob.size,
        provisionalLineageId: `git-blob-sha1:${blob.oid}`,
        license: {
          spdxId: PublicSkillCorpusLicenseSpdxSchema.parse(license.spdxId),
          authorityPath: license.authorityPath,
          blobOid: license.blobOid,
          size: license.size,
        },
      });
    }
  }
  const selectedRepositories = new Set(selected.map((entry) => entry.repositoryFullName.toLowerCase())).size;
  const semantic = {
    schemaVersion: PUBLIC_SKILL_CORPUS_SELECTION_SCHEMA_VERSION,
    identity: PUBLIC_SKILL_CORPUS_IDENTITY,
    status: selected.length === protocol.selection.targetSkills && selectedRepositories >= protocol.selection.minimumRepositories
      ? "frozen-selection-pending-commit" as const
      : "metadata-selection-shortfall" as const,
    selectedAt,
    protocol: { path: PUBLIC_SKILL_CORPUS_PROTOCOL_PATH, sha256: protocolSha256 },
    discovery: {
      path: discoveryPath,
      sha256: discoverySha256,
      portableSha256: sha256(canonical(discovery)),
    },
    selected,
    exclusions,
    totals: {
      selectedSkills: selected.length,
      selectedRepositories,
      provisionalLineages: new Set(selected.map((entry) => entry.provisionalLineageId)).size,
      searchUniverseRepositories: orderedRepositoryKeys.length,
      inspectedRepositories: inspectedRepositoryKeys.length,
      uninspectedRepositories: orderedRepositoryKeys.length - inspectedRepositoryKeys.length,
      targetSkills: 40 as const,
      minimumRepositories: 8 as const,
      bodyExposures: 0 as const,
    },
    accounting: {
      publicMetadataRequests: discovery.accounting.metadataRequests,
      publicSkillBodyRequests: 0 as const,
      publicSkillBodyBytes: 0 as const,
      modelCalls: 0 as const,
      businessApiCalls: 0 as const,
      paidCalls: 0 as const,
      heldOutAccesses: 0 as const,
      q1ReservedAccesses: 0 as const,
      pendingProspectiveAccesses: 0 as const,
    },
  };
  return PublicSkillCorpusSelectionSchema.parse({
    ...semantic,
    portableSemanticSha256: sha256(canonical(semantic)),
  });
}
