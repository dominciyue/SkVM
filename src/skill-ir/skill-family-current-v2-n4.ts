import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, posix, relative } from "node:path";
import { parse as parseYaml } from "yaml";

const IDENTITY = "skill-family-current-v2-source-repair-001" as const;
const RESULT_ROOT = "results/skill-ir/skill-family-current-v2-source-repair-001";
const LOCK_PATH = "benchmarks/skill-ir/pilots/api-tester/v2-feature-migration-002/experiment-lock.json";
const BANGUMI_INVENTORY_PATH =
  "results/skill-ir/api-tester-operation-dependency-verification-revision-development-001/replay/inventories/real-bangumi-api.json";
const MEILI_REPOSITORY = "https://github.com/meilisearch/specifications";
const BANGUMI_REPOSITORY = "https://github.com/bangumi/server";
const MEILI_COMMIT = "103221abb2458326ea89f32d5b904ba018c4f30e";
const BANGUMI_COMMIT = "60fdc32daf1d717f8446bad75fd2c3dc44805642";

type Binding = { path: string; sha256: string; bytes: number; commit?: string };
type SourceAccounting = {
  exploratoryMetadataCalls: number;
  acquisitionCalls: number;
  retryCalls: number;
};

type SourceIssue = {
  code: string;
  role: string;
  locator: string;
  reference: string;
  constructionObligation: boolean;
};

type DependencyRow = { operationKey: string; sourceIssues?: SourceIssue[] };

type GraphBlob = { byteSize: number; isBinary: boolean; text: string | null };
type GraphTreeEntry = { name: string; type: string; oid: string; object?: GraphBlob | null };

export type CurrentV2N4Snapshot = {
  data?: {
    meili?: {
      isArchived?: boolean;
      defaultBranchRef?: { name?: string; target?: { oid?: string; committedDate?: string } } | null;
      releases?: { nodes?: Array<{ tagName?: string; publishedAt?: string; url?: string }> };
    } | null;
    bangumi?: {
      isArchived?: boolean;
      defaultBranchRef?: { name?: string; target?: { oid?: string; committedDate?: string } } | null;
      components?: { entries?: GraphTreeEntry[] } | null;
    } | null;
    rateLimit?: { cost?: number; remaining?: number; resetAt?: string };
  };
  errors?: unknown[];
};

type Provenance = {
  experimentLock: Binding;
  bangumiInventory: Binding;
  rawSnapshot: Binding;
  meilisearchSource: Binding;
  bangumiSource: Binding;
  meilisearchLicense?: Binding;
  bangumiLicense?: Binding;
  querySha256: string;
};

export type CurrentV2N4MeilisearchReport = {
  schemaVersion: "skill-family-current-v2-n4-meilisearch-resolution/v1";
  identity: typeof IDENTITY;
  exposure: "development-maintenance";
  codeCommit: string;
  observedAt: string;
  source: {
    repository: typeof MEILI_REPOSITORY;
    pinnedCommit: string;
    sha256: string;
    bytes: number;
    missingReference: {
      operationKey: "GET /tasks";
      locator: "#/paths/~1tasks/get/parameters/0/$ref";
      reference: "#/components/parameters/total";
      targetPresent: boolean;
      constructionObligation: true;
    };
  };
  upstreamObservation: {
    archived: boolean;
    defaultBranch: string | null;
    defaultHead: string | null;
    defaultHeadCommittedAt: string | null;
    releases: Array<{ tagName: string; publishedAt: string | null; url: string | null }>;
  };
  resolution: {
    decision: "source-blocked-unresolved" | "authoritative-new-source-available";
    authoritativeNewSourceFound: boolean;
    newSourceIdentity: string | null;
    reason: string;
    historicalEvidenceMutated: false;
    affectedOperation: "GET /tasks";
    independentInputsBlocked: false;
  };
  provenance?: Provenance;
  accounting: { sourceApiCalls: number; businessApiCalls: 0; modelCalls: 0; paidCalls: 0 } & SourceAccounting;
  claimLimits: string[];
  portableSemanticSha256: string;
};

type BangumiReference = {
  operationKey: string;
  locator: string;
  reference: string;
  role: "response";
  constructionObligation: false;
  resourcePath: string;
  acquisitionStatus: "fetched" | "missing";
  parseStatus: "parsed" | "unreadable";
  closureStatus: "resolved" | "unresolved";
  dependencyPaths: string[];
};

type ClosureResource = {
  path: string;
  oid: string | null;
  sha256: string | null;
  bytes: number | null;
  acquisitionStatus: "fetched" | "missing";
  parseStatus: "parsed" | "unreadable";
  references: string[];
};

export type CurrentV2N4BangumiReport = {
  schemaVersion: "skill-family-current-v2-n4-bangumi-external-closure/v1";
  identity: typeof IDENTITY;
  exposure: "development-maintenance";
  codeCommit: string;
  observedAt: string;
  source: { repository: typeof BANGUMI_REPOSITORY; pinnedCommit: string; sha256: string; bytes: number };
  upstreamObservation: { archived: boolean; defaultBranch: string | null; defaultHead: string | null; defaultHeadCommittedAt: string | null };
  summary: {
    historicalReferenceIssues: number;
    affectedOperations: number;
    acquiredReferenceIssues: number;
    parsedReferenceIssues: number;
    unresolvedReferenceIssues: number;
    uniqueRootResources: number;
    closureResources: number;
  };
  references: BangumiReference[];
  closure: { resources: ClosureResource[]; unresolved: string[] };
  resolution: {
    decision: "resolved-new-development-source" | "partial-source-validity";
    newSourceIdentity: string;
    historicalEvidenceMutated: false;
    liveApiValidityEstablished: false;
    affectedOperationStates: Array<{ operationKey: string; state: "resolved-development-closure" | "partial-source-validity" }>;
  };
  provenance?: Provenance;
  accounting: { sourceApiCalls: number; businessApiCalls: 0; modelCalls: 0; paidCalls: 0 } & SourceAccounting;
  claimLimits: string[];
  portableSemanticSha256: string;
};

export const CURRENT_V2_N4_QUERY = `query {
  meili: repository(owner: "meilisearch", name: "specifications") {
    isArchived
    defaultBranchRef { name target { ... on Commit { oid committedDate } } }
    releases(first: 10, orderBy: {field: CREATED_AT, direction: DESC}) { nodes { tagName publishedAt url } }
  }
  bangumi: repository(owner: "bangumi", name: "server") {
    isArchived
    defaultBranchRef { name target { ... on Commit { oid committedDate } } }
    components: object(expression: "${BANGUMI_COMMIT}:openapi/components") {
      ... on Tree { entries { name type oid object { ... on Blob { byteSize isBinary text } } } }
    }
  }
  rateLimit { cost remaining resetAt }
}`;

const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const portable = (path: string) => path.replaceAll("\\", "/");
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

const stable = (value: unknown) => JSON.stringify(canonical(value));

function portableDigest<T extends { portableSemanticSha256: string }>(report: T) {
  return sha(stable({ ...report, observedAt: null, portableSemanticSha256: null }));
}

function externalReferences(value: unknown): string[] {
  const found: string[] = [];
  const walk = (entry: unknown) => {
    if (Array.isArray(entry)) return entry.forEach(walk);
    if (!object(entry)) return;
    for (const [key, child] of Object.entries(entry)) {
      if (key === "$ref" && typeof child === "string" && !child.startsWith("#")) found.push(child);
      else walk(child);
    }
  };
  walk(value);
  return found;
}

function referencePath(basePath: string, reference: string) {
  const file = reference.split("#", 1)[0]!;
  return posix.normalize(posix.join(posix.dirname(basePath), file));
}

function graphEntries(snapshot: CurrentV2N4Snapshot) {
  return new Map((snapshot.data?.bangumi?.components?.entries ?? [])
    .filter((entry) => entry.type === "blob")
    .map((entry) => [`openapi/components/${entry.name}`, entry]));
}

function closureForRoot(root: string, entries: Map<string, GraphTreeEntry>) {
  const visited = new Set<string>();
  const unresolved = new Set<string>();
  const resources = new Map<string, ClosureResource>();
  const visit = (path: string) => {
    if (visited.has(path)) return;
    visited.add(path);
    const entry = entries.get(path);
    const text = entry?.object?.text;
    if (!entry || entry.object?.isBinary || typeof text !== "string") {
      unresolved.add(path);
      resources.set(path, { path, oid: entry?.oid ?? null, sha256: null, bytes: null,
        acquisitionStatus: "missing", parseStatus: "unreadable", references: [] });
      return;
    }
    let parsed: unknown;
    try {
      parsed = parseYaml(text);
    } catch {
      unresolved.add(path);
      resources.set(path, { path, oid: entry.oid, sha256: sha(text), bytes: Buffer.byteLength(text),
        acquisitionStatus: "fetched", parseStatus: "unreadable", references: [] });
      return;
    }
    const references = externalReferences(parsed).map((ref) => referencePath(path, ref)).sort();
    resources.set(path, { path, oid: entry.oid, sha256: sha(text), bytes: Buffer.byteLength(text),
      acquisitionStatus: "fetched", parseStatus: "parsed", references });
    for (const dependency of references) visit(dependency);
  };
  visit(root);
  return {
    resolved: unresolved.size === 0,
    resources: [...resources.values()].sort((left, right) => left.path.localeCompare(right.path)),
    unresolved: [...unresolved].sort(),
  };
}

export function buildCurrentV2N4Maintenance(options: {
  codeCommit: string;
  observedAt: string;
  snapshot: CurrentV2N4Snapshot;
  rawSnapshotBinding: Binding;
  accounting: SourceAccounting;
  provenance?: Provenance;
  meilisearch: { pinnedCommit: string; sourceSha256: string; sourceBytes: number; sourceText: string };
  bangumi: { pinnedCommit: string; sourceSha256: string; sourceBytes: number; inventory: { dependencyVerification?: DependencyRow[] } };
}): { meilisearch: CurrentV2N4MeilisearchReport; bangumi: CurrentV2N4BangumiReport; accounting: { sourceApiCalls: number } } {
  if (!/^[0-9a-f]{40}$/u.test(options.codeCommit)) throw new Error("N4 code commit is invalid");
  if (options.snapshot.errors?.length || !options.snapshot.data?.meili || !options.snapshot.data?.bangumi) {
    throw new Error("N4 GitHub snapshot is incomplete");
  }
  const sourceApiCalls = options.accounting.exploratoryMetadataCalls + options.accounting.acquisitionCalls;
  if (options.accounting.retryCalls > options.accounting.acquisitionCalls || sourceApiCalls < 1) {
    throw new Error("N4 source API accounting is invalid");
  }
  const meiliDocument = parseYaml(options.meilisearch.sourceText) as any;
  const taskParameter = meiliDocument?.paths?.["/tasks"]?.get?.parameters?.[0]?.$ref;
  const targetPresent = meiliDocument?.components?.parameters?.total !== undefined;
  if (taskParameter !== "#/components/parameters/total") throw new Error("N4 Meilisearch blocker changed");
  const meiliNode = options.snapshot.data.meili;
  const meiliHead = meiliNode.defaultBranchRef?.target?.oid ?? null;
  const meiliReleases = (meiliNode.releases?.nodes ?? []).map((row) => ({
    tagName: String(row.tagName ?? ""),
    publishedAt: row.publishedAt ?? null,
    url: row.url ?? null,
  }));
  const authoritativeNewSourceFound = meiliHead !== null && meiliHead !== options.meilisearch.pinnedCommit;
  const commonAccounting = {
    ...options.accounting,
    sourceApiCalls,
    businessApiCalls: 0 as const,
    modelCalls: 0 as const,
    paidCalls: 0 as const,
  };
  const meilisearchBase: CurrentV2N4MeilisearchReport = {
    schemaVersion: "skill-family-current-v2-n4-meilisearch-resolution/v1",
    identity: IDENTITY,
    exposure: "development-maintenance",
    codeCommit: options.codeCommit,
    observedAt: options.observedAt,
    source: {
      repository: MEILI_REPOSITORY,
      pinnedCommit: options.meilisearch.pinnedCommit,
      sha256: options.meilisearch.sourceSha256,
      bytes: options.meilisearch.sourceBytes,
      missingReference: {
        operationKey: "GET /tasks",
        locator: "#/paths/~1tasks/get/parameters/0/$ref",
        reference: "#/components/parameters/total",
        targetPresent,
        constructionObligation: true,
      },
    },
    upstreamObservation: {
      archived: meiliNode.isArchived === true,
      defaultBranch: meiliNode.defaultBranchRef?.name ?? null,
      defaultHead: meiliHead,
      defaultHeadCommittedAt: meiliNode.defaultBranchRef?.target?.committedDate ?? null,
      releases: meiliReleases,
    },
    resolution: {
      decision: authoritativeNewSourceFound ? "authoritative-new-source-available" : "source-blocked-unresolved",
      authoritativeNewSourceFound,
      newSourceIdentity: authoritativeNewSourceFound ? `meilisearch-specifications-${meiliHead}` : null,
      reason: authoritativeNewSourceFound
        ? "The maintainer default branch points to a different authoritative source revision; it must be evaluated under a new identity."
        : "The archived maintainer repository default head is the pinned source commit and exposes no newer release; the missing parameter target remains unresolved.",
      historicalEvidenceMutated: false,
      affectedOperation: "GET /tasks",
      independentInputsBlocked: false,
    },
    provenance: options.provenance,
    accounting: commonAccounting,
    claimLimits: [
      "No missing parameter identity is guessed and the old six-source evidence remains unchanged.",
      "Repository metadata does not establish live API behavior.",
    ],
    portableSemanticSha256: "",
  };
  meilisearchBase.portableSemanticSha256 = portableDigest(meilisearchBase);

  const historicalIssues = (options.bangumi.inventory.dependencyVerification ?? []).flatMap((row) =>
    (row.sourceIssues ?? []).filter((issue) => issue.code === "REFERENCE_EXTERNAL")
      .map((issue) => ({ operationKey: row.operationKey, ...issue })));
  if (historicalIssues.length !== 32 || new Set(historicalIssues.map((row) => row.operationKey)).size !== 19
    || historicalIssues.some((row) => row.role !== "response" || row.constructionObligation !== false)) {
    throw new Error("N4 Bangumi historical reference denominator changed");
  }
  const entries = graphEntries(options.snapshot);
  const rootCache = new Map<string, ReturnType<typeof closureForRoot>>();
  const references: BangumiReference[] = historicalIssues.map((issue): BangumiReference => {
    const resourcePath = referencePath("openapi/v0.yaml", issue.reference);
    const closure = rootCache.get(resourcePath) ?? closureForRoot(resourcePath, entries);
    rootCache.set(resourcePath, closure);
    const root = closure.resources.find((resource) => resource.path === resourcePath)!;
    return {
      operationKey: issue.operationKey,
      locator: issue.locator,
      reference: issue.reference,
      role: "response",
      constructionObligation: false,
      resourcePath,
      acquisitionStatus: root.acquisitionStatus,
      parseStatus: root.parseStatus,
      closureStatus: closure.resolved ? "resolved" : "unresolved",
      dependencyPaths: closure.resources.map((resource) => resource.path),
    };
  }).sort((left, right) => `${left.operationKey}\0${left.locator}`.localeCompare(`${right.operationKey}\0${right.locator}`));
  const allResources = new Map<string, ClosureResource>();
  const unresolved = new Set<string>();
  for (const closure of rootCache.values()) {
    for (const resource of closure.resources) allResources.set(resource.path, resource);
    for (const path of closure.unresolved) unresolved.add(path);
  }
  const affectedOperations = [...new Set(references.map((row) => row.operationKey))].sort();
  const unresolvedOperations = new Set(references.filter((row) => row.closureStatus === "unresolved").map((row) => row.operationKey));
  const unresolvedReferenceIssues = references.filter((row) => row.closureStatus === "unresolved").length;
  const bangumiBase: CurrentV2N4BangumiReport = {
    schemaVersion: "skill-family-current-v2-n4-bangumi-external-closure/v1",
    identity: IDENTITY,
    exposure: "development-maintenance",
    codeCommit: options.codeCommit,
    observedAt: options.observedAt,
    source: { repository: BANGUMI_REPOSITORY, pinnedCommit: options.bangumi.pinnedCommit,
      sha256: options.bangumi.sourceSha256, bytes: options.bangumi.sourceBytes },
    upstreamObservation: {
      archived: options.snapshot.data.bangumi.isArchived === true,
      defaultBranch: options.snapshot.data.bangumi.defaultBranchRef?.name ?? null,
      defaultHead: options.snapshot.data.bangumi.defaultBranchRef?.target?.oid ?? null,
      defaultHeadCommittedAt: options.snapshot.data.bangumi.defaultBranchRef?.target?.committedDate ?? null,
    },
    summary: {
      historicalReferenceIssues: references.length,
      affectedOperations: affectedOperations.length,
      acquiredReferenceIssues: references.filter((row) => row.acquisitionStatus === "fetched").length,
      parsedReferenceIssues: references.length - unresolvedReferenceIssues,
      unresolvedReferenceIssues,
      uniqueRootResources: rootCache.size,
      closureResources: allResources.size,
    },
    references,
    closure: { resources: [...allResources.values()].sort((left, right) => left.path.localeCompare(right.path)),
      unresolved: [...unresolved].sort() },
    resolution: {
      decision: unresolvedReferenceIssues === 0 ? "resolved-new-development-source" : "partial-source-validity",
      newSourceIdentity: `bangumi-external-closure-${options.bangumi.pinnedCommit}`,
      historicalEvidenceMutated: false,
      liveApiValidityEstablished: false,
      affectedOperationStates: affectedOperations.map((operationKey) => ({
        operationKey,
        state: unresolvedOperations.has(operationKey) ? "partial-source-validity" : "resolved-development-closure",
      })),
    },
    provenance: options.provenance,
    accounting: commonAccounting,
    claimLimits: [
      "Resolved component bytes form a new development closure identity and do not rewrite the historical source or its advisories.",
      "Source parsing does not establish live API correctness or whole-document success.",
      "All 32 historical dependencies are response-only and are not construction obligations under the fixed task contract.",
    ],
    portableSemanticSha256: "",
  };
  bangumiBase.portableSemanticSha256 = portableDigest(bangumiBase);
  return { meilisearch: meilisearchBase, bangumi: bangumiBase, accounting: { sourceApiCalls } };
}

async function gitBytes(repositoryRoot: string, commit: string, path: string) {
  const process = Bun.spawn(["git", "show", `${commit}:${path}`], { cwd: repositoryRoot, stdout: "pipe", stderr: "pipe" });
  const [bytes, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).arrayBuffer(), new Response(process.stderr).text(), process.exited,
  ]);
  if (exitCode !== 0) throw new Error(`N4 cannot read ${path} at ${commit}: ${stderr.trim()}`);
  return new Uint8Array(bytes);
}

const binding = (repositoryRoot: string, path: string, bytes: Uint8Array, commit?: string): Binding => ({
  path: portable(relative(repositoryRoot, path)), sha256: sha(bytes), bytes: bytes.byteLength, ...(commit ? { commit } : {}),
});

async function writeExclusive(path: string, bytes: string | Uint8Array) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes, { flag: "wx" });
}

async function acquireSnapshot(repositoryRoot: string, executable: string) {
  const attempts: Array<{ attempt: number; exitCode: number; stdoutSha256: string; stdoutBytes: number; stderr: string }> = [];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const process = Bun.spawn([executable, "api", "graphql", "-f", `query=${CURRENT_V2_N4_QUERY}`], {
      cwd: repositoryRoot, stdout: "pipe", stderr: "pipe",
    });
    const [stdoutBuffer, stderr, exitCode] = await Promise.all([
      new Response(process.stdout).arrayBuffer(), new Response(process.stderr).text(), process.exited,
    ]);
    const stdout = new Uint8Array(stdoutBuffer);
    attempts.push({ attempt, exitCode, stdoutSha256: sha(stdout), stdoutBytes: stdout.byteLength, stderr });
    if (exitCode === 0) {
      try {
        const snapshot = JSON.parse(new TextDecoder().decode(stdout)) as CurrentV2N4Snapshot;
        if (!snapshot.errors?.length && snapshot.data?.meili && snapshot.data?.bangumi?.components) {
          return { snapshot, attempts };
        }
      } catch {
        // The one permitted retry covers a malformed or truncated transport response.
      }
    }
  }
  throw new Error(`N4 GitHub acquisition failed after ${attempts.length} attempts`);
}

export async function writeCurrentV2N4Maintenance(options: {
  repositoryRoot: string;
  codeCommit: string;
  observedAt: string;
  legacyCacheRoot: string;
  ghExecutable?: string;
  exploratoryMetadataCalls?: number;
  relativeOutputDirectory?: string;
}) {
  if (!/^[0-9a-f]{40}$/u.test(options.codeCommit)) throw new Error("N4 code commit is invalid");
  const outputRoot = join(options.repositoryRoot, options.relativeOutputDirectory ?? `${RESULT_ROOT}/source-repair`);
  const [lockBytes, inventoryBytes] = await Promise.all([
    gitBytes(options.repositoryRoot, options.codeCommit, LOCK_PATH),
    gitBytes(options.repositoryRoot, options.codeCommit, BANGUMI_INVENTORY_PATH),
  ]);
  const lock = JSON.parse(new TextDecoder().decode(lockBytes));
  const inventory = JSON.parse(new TextDecoder().decode(inventoryBytes));
  const meiliRow = lock.rows.find((row: any) => row.rowId === "real-meilisearch-api");
  const bangumiRow = lock.rows.find((row: any) => row.rowId === "real-bangumi-api");
  if (!meiliRow || !bangumiRow || meiliRow.input.upstream.commit !== MEILI_COMMIT
    || bangumiRow.input.upstream.commit !== BANGUMI_COMMIT) throw new Error("N4 historical source lock changed");
  const sourceSpecs = [
    { row: meiliRow, output: "cache/legacy/meilisearch-open-api.yaml" },
    { row: bangumiRow, output: "cache/legacy/bangumi-v0.yaml" },
  ];
  const licenseSpecs = [
    { row: meiliRow, output: "cache/licenses/meilisearch-LICENSE.md" },
    { row: bangumiRow, output: "cache/licenses/bangumi-LICENSE.txt" },
  ];
  const archivedSources: Array<{ row: any; path: string; bytes: Uint8Array; binding: Binding }> = [];
  for (const spec of sourceSpecs) {
    const bytes = new Uint8Array(await readFile(join(options.legacyCacheRoot, spec.row.input.cachePath)));
    if (sha(bytes) !== spec.row.input.sha256 || bytes.byteLength !== spec.row.input.bytes) throw new Error(`N4 source cache mismatch: ${spec.row.rowId}`);
    const path = join(outputRoot, spec.output);
    await writeExclusive(path, bytes);
    archivedSources.push({ row: spec.row, path, bytes, binding: binding(options.repositoryRoot, path, bytes) });
  }
  const archivedLicenses: Binding[] = [];
  for (const spec of licenseSpecs) {
    const bytes = new Uint8Array(await readFile(join(options.legacyCacheRoot, spec.row.input.license.cachePath)));
    if (sha(bytes) !== spec.row.input.license.sha256 || bytes.byteLength !== spec.row.input.license.bytes) throw new Error(`N4 license cache mismatch: ${spec.row.rowId}`);
    const path = join(outputRoot, spec.output);
    await writeExclusive(path, bytes);
    archivedLicenses.push(binding(options.repositoryRoot, path, bytes));
  }
  const acquired = await acquireSnapshot(options.repositoryRoot, options.ghExecutable ?? "gh");
  const rawEnvelope = {
    schemaVersion: "skill-family-current-v2-n4-github-acquisition/v1",
    query: CURRENT_V2_N4_QUERY,
    querySha256: sha(CURRENT_V2_N4_QUERY),
    observedAt: options.observedAt,
    attempts: acquired.attempts,
    snapshot: acquired.snapshot,
  };
  const rawPath = join(outputRoot, "cache", "github-graphql.json");
  const rawBytes = new TextEncoder().encode(`${JSON.stringify(rawEnvelope, null, 2)}\n`);
  await writeExclusive(rawPath, rawBytes);
  const provenance: Provenance = {
    experimentLock: binding(options.repositoryRoot, join(options.repositoryRoot, LOCK_PATH), lockBytes, options.codeCommit),
    bangumiInventory: binding(options.repositoryRoot, join(options.repositoryRoot, BANGUMI_INVENTORY_PATH), inventoryBytes, options.codeCommit),
    rawSnapshot: binding(options.repositoryRoot, rawPath, rawBytes),
    meilisearchSource: archivedSources[0]!.binding,
    bangumiSource: archivedSources[1]!.binding,
    meilisearchLicense: archivedLicenses[0],
    bangumiLicense: archivedLicenses[1],
    querySha256: sha(CURRENT_V2_N4_QUERY),
  };
  const built = buildCurrentV2N4Maintenance({
    codeCommit: options.codeCommit,
    observedAt: options.observedAt,
    snapshot: acquired.snapshot,
    rawSnapshotBinding: provenance.rawSnapshot,
    accounting: {
      exploratoryMetadataCalls: options.exploratoryMetadataCalls ?? 0,
      acquisitionCalls: acquired.attempts.length,
      retryCalls: Math.max(0, acquired.attempts.length - 1),
    },
    provenance,
    meilisearch: { pinnedCommit: MEILI_COMMIT, sourceSha256: meiliRow.input.sha256,
      sourceBytes: meiliRow.input.bytes, sourceText: new TextDecoder().decode(archivedSources[0]!.bytes) },
    bangumi: { pinnedCommit: BANGUMI_COMMIT, sourceSha256: bangumiRow.input.sha256,
      sourceBytes: bangumiRow.input.bytes, inventory },
  });
  const meiliPath = join(outputRoot, "meilisearch-resolution.json");
  const bangumiPath = join(outputRoot, "bangumi-external-closure.json");
  await Promise.all([
    writeExclusive(meiliPath, `${JSON.stringify(built.meilisearch, null, 2)}\n`),
    writeExclusive(bangumiPath, `${JSON.stringify(built.bangumi, null, 2)}\n`),
  ]);
  const outputPaths = [meiliPath, bangumiPath, rawPath, ...archivedSources.map((row) => row.path),
    ...archivedLicenses.map((row) => join(options.repositoryRoot, row.path))];
  return {
    ...built,
    files: await Promise.all(outputPaths.map(async (path) => {
      const bytes = new Uint8Array(await readFile(path));
      return binding(options.repositoryRoot, path, bytes);
    })),
  };
}

async function bytesForBinding(repositoryRoot: string, value: Binding) {
  const bytes = value.commit
    ? await gitBytes(repositoryRoot, value.commit, value.path)
    : new Uint8Array(await readFile(join(repositoryRoot, value.path)));
  if (sha(bytes) !== value.sha256 || bytes.byteLength !== value.bytes) throw new Error(`N4 binding mismatch: ${value.path}`);
  return bytes;
}

export async function verifyCurrentV2N4Maintenance(options: {
  repositoryRoot: string;
  meilisearchReport?: CurrentV2N4MeilisearchReport;
  bangumiReport?: CurrentV2N4BangumiReport;
}) {
  const errors = new Set<string>();
  let meili = options.meilisearchReport;
  let bangumi = options.bangumiReport;
  try {
    meili ??= JSON.parse(await readFile(join(options.repositoryRoot, RESULT_ROOT, "source-repair/meilisearch-resolution.json"), "utf8"));
    bangumi ??= JSON.parse(await readFile(join(options.repositoryRoot, RESULT_ROOT, "source-repair/bangumi-external-closure.json"), "utf8"));
  } catch {
    return { status: "fail" as const, errors: ["N4_REPORT_UNREADABLE"] };
  }
  if (!meili || !bangumi || meili.schemaVersion !== "skill-family-current-v2-n4-meilisearch-resolution/v1"
    || bangumi.schemaVersion !== "skill-family-current-v2-n4-bangumi-external-closure/v1"
    || meili.codeCommit !== bangumi.codeCommit || !meili.provenance || !bangumi.provenance
    || stable(meili.provenance) !== stable(bangumi.provenance)) {
    return { status: "fail" as const, errors: ["N4_REPORT_HEADER_INVALID"] };
  }
  try {
    const provenance = meili.provenance;
    const [lockBytes, inventoryBytes, rawBytes, meiliBytes, bangumiBytes] = await Promise.all([
      bytesForBinding(options.repositoryRoot, provenance.experimentLock),
      bytesForBinding(options.repositoryRoot, provenance.bangumiInventory),
      bytesForBinding(options.repositoryRoot, provenance.rawSnapshot),
      bytesForBinding(options.repositoryRoot, provenance.meilisearchSource),
      bytesForBinding(options.repositoryRoot, provenance.bangumiSource),
      ...(provenance.meilisearchLicense ? [bytesForBinding(options.repositoryRoot, provenance.meilisearchLicense)] : []),
      ...(provenance.bangumiLicense ? [bytesForBinding(options.repositoryRoot, provenance.bangumiLicense)] : []),
    ]);
    const lock = JSON.parse(new TextDecoder().decode(lockBytes));
    const inventory = JSON.parse(new TextDecoder().decode(inventoryBytes));
    const raw = JSON.parse(new TextDecoder().decode(rawBytes));
    if (raw.querySha256 !== sha(CURRENT_V2_N4_QUERY) || provenance.querySha256 !== sha(CURRENT_V2_N4_QUERY)) errors.add("N4_QUERY_BINDING_MISMATCH");
    const meiliRow = lock.rows.find((row: any) => row.rowId === "real-meilisearch-api");
    const bangumiRow = lock.rows.find((row: any) => row.rowId === "real-bangumi-api");
    const expected = buildCurrentV2N4Maintenance({
      codeCommit: meili.codeCommit,
      observedAt: meili.observedAt,
      snapshot: raw.snapshot,
      rawSnapshotBinding: provenance.rawSnapshot,
      accounting: {
        exploratoryMetadataCalls: meili.accounting.exploratoryMetadataCalls,
        acquisitionCalls: raw.attempts.length,
        retryCalls: Math.max(0, raw.attempts.length - 1),
      },
      provenance,
      meilisearch: { pinnedCommit: meiliRow.input.upstream.commit, sourceSha256: meiliRow.input.sha256,
        sourceBytes: meiliRow.input.bytes, sourceText: new TextDecoder().decode(meiliBytes) },
      bangumi: { pinnedCommit: bangumiRow.input.upstream.commit, sourceSha256: bangumiRow.input.sha256,
        sourceBytes: bangumiRow.input.bytes, inventory },
    });
    if (stable(expected.meilisearch) !== stable(meili)) errors.add("N4_MEILISEARCH_RECOMPUTATION_MISMATCH");
    if (stable(expected.bangumi) !== stable(bangumi)) errors.add("N4_BANGUMI_RECOMPUTATION_MISMATCH");
  } catch {
    errors.add("N4_RECOMPUTATION_FAILED");
  }
  if (meili.accounting.sourceApiCalls !== bangumi.accounting.sourceApiCalls
    || meili.accounting.businessApiCalls !== 0 || meili.accounting.modelCalls !== 0 || meili.accounting.paidCalls !== 0) {
    errors.add("N4_ACCOUNTING_INVALID");
  }
  return { status: errors.size === 0 ? "pass" as const : "fail" as const, errors: [...errors].sort() };
}
