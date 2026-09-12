import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";

const IDENTITY = "skill-family-current-v2-source-repair-001" as const;
const RESULT_ROOT = "results/skill-ir/skill-family-current-v2-source-repair-001";
export const CURRENT_V2_N6_TARGET =
  "results/skill-ir/api-tester-operation-dependency-verification-revision-clean-002/report.json" as const;
export const CURRENT_V2_N6_EXPECTED_SHA256 =
  "c4399a8a1fa5249b9061728105f08c65cad5e97d20dd9f68c9d24631910573d6" as const;

const KNOWN_ARCHIVES = [
  "results/skill-ir/api-tester-operation-dependency-verification-revision-development-001/report.json",
  "results/skill-ir/api-tester-operation-dependency-verification-revision-clean-003/report.json",
  "results/skill-ir/api-tester-operation-dependency-verification-revision-clean-003/archive-manifest.json",
  "results/skill-ir/api-tester-operation-delivery-freeze-development-001/report.json",
  "results/skill-ir/api-tester-operation-delivery-freeze-development-001/clean-reproduction.json",
  "results/skill-ir/api-tester-operation-delivery-freeze-development-001/main/archive-manifest.json",
  "results/skill-ir/api-tester-operation-delivery-freeze-development-001/clean/archive-manifest.json",
  "results/skill-ir/api-tester-operation-delivery-freeze-retry-20260912.json",
] as const;

type Binding = { path: string; sha256: string; bytes: number };
type CommandRecord = { command: string[]; exitCode: number; stdout: string; stderr: string };

type WorktreeCandidate = {
  root: string;
  exactPath: string;
  exists: boolean;
  sha256: string | null;
  bytes: number | null;
};

type ObjectCheck = {
  source: "git-path-history" | "git-named-object";
  locator: string;
  objectId: string;
  command: string[];
  exitCode: number;
  stderr: string;
  sha256: string | null;
  bytes: number | null;
  matchesExpectedSha256: boolean;
};

type KnownArchive = {
  path: string;
  exists: boolean;
  sha256: string | null;
  bytes: number | null;
  mentionsTargetPath: boolean;
  mentionsExpectedSha256: boolean;
  isExactTargetBytes: boolean;
};

export type CurrentV2N6SearchTranscript = {
  schemaVersion: "skill-family-current-v2-n6-search-transcript/v1";
  target: { path: typeof CURRENT_V2_N6_TARGET; expectedSha256: typeof CURRENT_V2_N6_EXPECTED_SHA256 };
  worktreeInventory: CommandRecord & { roots: string[] };
  worktreeCandidates: WorktreeCandidate[];
  gitPathHistory: CommandRecord & { commits: string[] };
  gitNamedObjects: CommandRecord & {
    filter: { kind: "exact-path"; value: typeof CURRENT_V2_N6_TARGET };
    matches: Array<{ objectId: string; path: typeof CURRENT_V2_N6_TARGET }>;
  };
  knownArchives: KnownArchive[];
  unreachableObjects: {
    status: "not-applicable-no-object-clue" | "checked-clue-directed";
    clueObjectIds: string[];
    checked: ObjectCheck[];
    reason: string;
  };
  boundaries: { wholeDiskSearches: 0; arbitraryFilenameSearches: 0; remoteEnumerations: 0 };
};

type RecoveredCandidate = {
  source: "known-worktree" | "git-path-history" | "git-named-object" | "known-archive";
  locator: string;
  sha256: typeof CURRENT_V2_N6_EXPECTED_SHA256;
  bytes: number;
  archivedCopy: Binding | null;
};

export type CurrentV2N6ArchiveSearchReport = {
  schemaVersion: "skill-family-current-v2-n6-archive-search/v1";
  identity: typeof IDENTITY;
  exposure: "development-maintenance";
  codeCommit: string;
  searchedAt: string;
  target: {
    path: typeof CURRENT_V2_N6_TARGET;
    expectedSha256: typeof CURRENT_V2_N6_EXPECTED_SHA256;
    historicalRecordMutated: false;
  };
  scope: {
    worktrees: { checked: number; filesFound: number; exactDigestMatches: number; roots: string[] };
    gitPathHistory: { commits: number; objectChecks: number; exactDigestMatches: number };
    gitNamedObjects: { matches: number; objectChecks: number; exactDigestMatches: number };
    knownArchives: { checked: number; filesFound: number; targetMentions: number; digestMentions: number; exactDigestMatches: number };
    unreachableObjects: { status: CurrentV2N6SearchTranscript["unreachableObjects"]["status"]; clueObjectIds: number; checked: number; reason: string };
    excluded: ["whole-disk-search", "arbitrary-filename-search", "all-remote-enumeration"];
  };
  result: {
    decision: "recovered-exact" | "not-recovered-within-search-scope";
    recoveredExact: boolean;
    recoveredCandidate: RecoveredCandidate | null;
    historicalGapRemains: boolean;
    laterCleanEvidenceRemainsSeparate: true;
    reason: string;
  };
  provenance: { searchTranscript: Binding };
  accounting: { sourceApiCalls: 0; businessApiCalls: 0; modelCalls: 0; paidCalls: 0 };
  protectedBoundary: {
    historicalDocumentResult: "0/6-unchanged";
    historicalVerifierChanged: false;
    heldOutReads: 0;
    q1ReservedReads: 0;
    prospectiveRuns: 0;
  };
  claimLimits: string[];
  portableSemanticSha256: string;
};

const HEX_40 = /^[0-9a-f]{40}$/u;
const HEX_64 = /^[0-9a-f]{64}$/u;
const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const portable = (path: string) => path.replaceAll("\\", "/");
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

const stable = (value: unknown) => JSON.stringify(canonical(value));

function reportDigest(report: CurrentV2N6ArchiveSearchReport) {
  return sha(stable({ ...report, searchedAt: null, portableSemanticSha256: null }));
}

function exactCandidates(transcript: CurrentV2N6SearchTranscript): RecoveredCandidate[] {
  const candidates: RecoveredCandidate[] = [];
  for (const row of transcript.worktreeCandidates) {
    if (row.exists && row.sha256 === CURRENT_V2_N6_EXPECTED_SHA256 && row.bytes !== null) {
      candidates.push({ source: "known-worktree", locator: row.exactPath, sha256: CURRENT_V2_N6_EXPECTED_SHA256,
        bytes: row.bytes, archivedCopy: null });
    }
  }
  for (const row of transcript.unreachableObjects.checked) {
    if (row.matchesExpectedSha256 && row.sha256 === CURRENT_V2_N6_EXPECTED_SHA256 && row.bytes !== null) {
      candidates.push({ source: row.source, locator: row.locator, sha256: CURRENT_V2_N6_EXPECTED_SHA256,
        bytes: row.bytes, archivedCopy: null });
    }
  }
  for (const row of transcript.knownArchives) {
    if (row.isExactTargetBytes && row.sha256 === CURRENT_V2_N6_EXPECTED_SHA256 && row.bytes !== null) {
      candidates.push({ source: "known-archive", locator: row.path, sha256: CURRENT_V2_N6_EXPECTED_SHA256,
        bytes: row.bytes, archivedCopy: null });
    }
  }
  return candidates.sort((left, right) => `${left.source}\0${left.locator}`.localeCompare(`${right.source}\0${right.locator}`));
}

function validateTranscript(transcript: CurrentV2N6SearchTranscript) {
  if (transcript.schemaVersion !== "skill-family-current-v2-n6-search-transcript/v1"
    || transcript.target.path !== CURRENT_V2_N6_TARGET
    || transcript.target.expectedSha256 !== CURRENT_V2_N6_EXPECTED_SHA256) {
    throw new Error("N6 transcript target changed");
  }
  for (const command of [transcript.worktreeInventory, transcript.gitPathHistory, transcript.gitNamedObjects]) {
    if (command.exitCode !== 0) throw new Error(`N6 bounded command failed: ${command.command.join(" ")}`);
  }
  if (transcript.worktreeInventory.roots.length !== transcript.worktreeCandidates.length) {
    throw new Error("N6 worktree denominator mismatch");
  }
  const roots = [...new Set(transcript.worktreeInventory.roots.map(portable))];
  if (roots.length !== transcript.worktreeInventory.roots.length
    || transcript.worktreeCandidates.some((row, index) => portable(row.root) !== roots[index])) {
    throw new Error("N6 worktree candidates do not preserve inventory order");
  }
  for (const row of transcript.worktreeCandidates) {
    if (!isAbsolute(row.exactPath) || portable(row.exactPath) !== `${portable(row.root).replace(/\/$/u, "")}/${CURRENT_V2_N6_TARGET}`) {
      throw new Error("N6 worktree check is not the exact target path");
    }
    if (row.exists !== (row.sha256 !== null && row.bytes !== null)
      || (row.sha256 !== null && !HEX_64.test(row.sha256)) || (row.bytes !== null && row.bytes < 0)) {
      throw new Error("N6 worktree candidate binding is invalid");
    }
  }
  if (transcript.gitPathHistory.commits.some((commit) => !HEX_40.test(commit))
    || transcript.gitNamedObjects.filter.kind !== "exact-path"
    || transcript.gitNamedObjects.filter.value !== CURRENT_V2_N6_TARGET
    || transcript.gitNamedObjects.matches.some((row) => !HEX_40.test(row.objectId) || row.path !== CURRENT_V2_N6_TARGET)) {
    throw new Error("N6 Git path clues are invalid");
  }
  const clueIds = [...new Set([
    ...transcript.gitPathHistory.commits,
    ...transcript.gitNamedObjects.matches.map((row) => row.objectId),
  ])].sort();
  if (clueIds.length === 0) {
    if (transcript.unreachableObjects.status !== "not-applicable-no-object-clue"
      || transcript.unreachableObjects.checked.length !== 0
      || transcript.unreachableObjects.clueObjectIds.length !== 0) {
      throw new Error("N6 object-clue disposition is invalid");
    }
  } else {
    const recorded = [...transcript.unreachableObjects.clueObjectIds].sort();
    if (transcript.unreachableObjects.status !== "checked-clue-directed"
      || stable(recorded) !== stable(clueIds)
      || transcript.unreachableObjects.checked.length < clueIds.length) {
      throw new Error("N6 object clue was not checked");
    }
  }
  for (const row of transcript.unreachableObjects.checked) {
    const successfulBinding = row.exitCode === 0 && row.sha256 !== null && HEX_64.test(row.sha256)
      && row.bytes !== null && row.bytes >= 0
      && row.matchesExpectedSha256 === (row.sha256 === CURRENT_V2_N6_EXPECTED_SHA256);
    const failedBinding = row.exitCode !== 0 && row.sha256 === null && row.bytes === null
      && row.matchesExpectedSha256 === false;
    if (!HEX_40.test(row.objectId) || (!successfulBinding && !failedBinding)) {
      throw new Error("N6 clue-directed object binding is invalid");
    }
  }
  if (transcript.boundaries.wholeDiskSearches !== 0 || transcript.boundaries.arbitraryFilenameSearches !== 0
    || transcript.boundaries.remoteEnumerations !== 0) {
    throw new Error("N6 bounded search boundary was exceeded");
  }
  for (const row of transcript.knownArchives) {
    if (row.exists !== (row.sha256 !== null && row.bytes !== null)
      || row.isExactTargetBytes !== (row.sha256 === CURRENT_V2_N6_EXPECTED_SHA256)) {
      throw new Error("N6 known archive binding is invalid");
    }
  }
}

export function buildCurrentV2N6ArchiveSearch(options: {
  codeCommit: string;
  searchedAt: string;
  transcript: CurrentV2N6SearchTranscript;
  transcriptBinding: Binding;
  recoveredArchiveBinding?: Binding;
}): CurrentV2N6ArchiveSearchReport {
  if (!HEX_40.test(options.codeCommit)) throw new Error("N6 code commit is invalid");
  if (!options.searchedAt || !Number.isFinite(Date.parse(options.searchedAt))) throw new Error("N6 search time is invalid");
  if (!HEX_64.test(options.transcriptBinding.sha256) || options.transcriptBinding.bytes < 1) {
    throw new Error("N6 transcript binding is invalid");
  }
  validateTranscript(options.transcript);
  const candidates = exactCandidates(options.transcript);
  const recovered = candidates[0] ?? null;
  if (recovered && !options.recoveredArchiveBinding) throw new Error("N6 recovered bytes were not archived");
  if (!recovered && options.recoveredArchiveBinding) throw new Error("N6 archived recovered bytes without an exact match");
  if (options.recoveredArchiveBinding
    && (options.recoveredArchiveBinding.sha256 !== CURRENT_V2_N6_EXPECTED_SHA256
      || options.recoveredArchiveBinding.bytes !== recovered!.bytes)) {
    throw new Error("N6 recovered archive binding does not match the exact candidate");
  }
  const historyChecks = options.transcript.unreachableObjects.checked.filter((row) => row.source === "git-path-history");
  const namedChecks = options.transcript.unreachableObjects.checked.filter((row) => row.source === "git-named-object");
  const base: CurrentV2N6ArchiveSearchReport = {
    schemaVersion: "skill-family-current-v2-n6-archive-search/v1",
    identity: IDENTITY,
    exposure: "development-maintenance",
    codeCommit: options.codeCommit,
    searchedAt: options.searchedAt,
    target: { path: CURRENT_V2_N6_TARGET, expectedSha256: CURRENT_V2_N6_EXPECTED_SHA256, historicalRecordMutated: false },
    scope: {
      worktrees: {
        checked: options.transcript.worktreeCandidates.length,
        filesFound: options.transcript.worktreeCandidates.filter((row) => row.exists).length,
        exactDigestMatches: options.transcript.worktreeCandidates.filter((row) => row.sha256 === CURRENT_V2_N6_EXPECTED_SHA256).length,
        roots: options.transcript.worktreeInventory.roots.map(portable),
      },
      gitPathHistory: {
        commits: options.transcript.gitPathHistory.commits.length,
        objectChecks: historyChecks.length,
        exactDigestMatches: historyChecks.filter((row) => row.matchesExpectedSha256).length,
      },
      gitNamedObjects: {
        matches: options.transcript.gitNamedObjects.matches.length,
        objectChecks: namedChecks.length,
        exactDigestMatches: namedChecks.filter((row) => row.matchesExpectedSha256).length,
      },
      knownArchives: {
        checked: options.transcript.knownArchives.length,
        filesFound: options.transcript.knownArchives.filter((row) => row.exists).length,
        targetMentions: options.transcript.knownArchives.filter((row) => row.mentionsTargetPath).length,
        digestMentions: options.transcript.knownArchives.filter((row) => row.mentionsExpectedSha256).length,
        exactDigestMatches: options.transcript.knownArchives.filter((row) => row.isExactTargetBytes).length,
      },
      unreachableObjects: {
        status: options.transcript.unreachableObjects.status,
        clueObjectIds: options.transcript.unreachableObjects.clueObjectIds.length,
        checked: options.transcript.unreachableObjects.checked.length,
        reason: options.transcript.unreachableObjects.reason,
      },
      excluded: ["whole-disk-search", "arbitrary-filename-search", "all-remote-enumeration"],
    },
    result: {
      decision: recovered ? "recovered-exact" : "not-recovered-within-search-scope",
      recoveredExact: Boolean(recovered),
      recoveredCandidate: recovered ? { ...recovered, archivedCopy: options.recoveredArchiveBinding ?? null } : null,
      historicalGapRemains: !recovered,
      laterCleanEvidenceRemainsSeparate: true,
      reason: recovered
        ? "A candidate matched the historical SHA-256 exactly and its bytes were archived under the new development identity."
        : "No candidate matched the historical SHA-256 in this bounded search; this does not establish permanent unrecoverability.",
    },
    provenance: { searchTranscript: options.transcriptBinding },
    accounting: { sourceApiCalls: 0, businessApiCalls: 0, modelCalls: 0, paidCalls: 0 },
    protectedBoundary: {
      historicalDocumentResult: "0/6-unchanged",
      historicalVerifierChanged: false,
      heldOutReads: 0,
      q1ReservedReads: 0,
      prospectiveRuns: 0,
    },
    claimLimits: [
      "The result is limited to the bounded scopes recorded in the transcript and does not prove that the archive can never be recovered.",
      "A path or digest mention is not the historical report bytes; only an exact SHA-256 match counts as recovered.",
      "The current clean-003 evidence remains separate and does not replace or overwrite the historical clean-002 digest.",
    ],
    portableSemanticSha256: "",
  };
  base.portableSemanticSha256 = reportDigest(base);
  return base;
}

async function run(repositoryRoot: string, arguments_: string[]): Promise<CommandRecord & { bytes: Uint8Array }> {
  const process = Bun.spawn(arguments_, { cwd: repositoryRoot, stdout: "pipe", stderr: "pipe" });
  const [stdoutBuffer, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).arrayBuffer(), new Response(process.stderr).text(), process.exited,
  ]);
  const bytes = new Uint8Array(stdoutBuffer);
  return { command: [...arguments_], exitCode, stdout: new TextDecoder().decode(bytes), stderr, bytes };
}

async function fileCandidate(path: string): Promise<{ bytes: Uint8Array | null; sha256: string | null; byteLength: number | null }> {
  try {
    const bytes = new Uint8Array(await readFile(path));
    return { bytes, sha256: sha(bytes), byteLength: bytes.byteLength };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { bytes: null, sha256: null, byteLength: null };
    throw error;
  }
}

function parseWorktreeRoots(stdout: string) {
  return stdout.split(/\r?\n/u).filter((line) => line.startsWith("worktree ")).map((line) => portable(line.slice("worktree ".length)));
}

async function writeExclusive(path: string, value: string | Uint8Array) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value, { flag: "wx" });
}

function binding(repositoryRoot: string, path: string, bytes: Uint8Array): Binding {
  return { path: portable(relative(repositoryRoot, path)), sha256: sha(bytes), bytes: bytes.byteLength };
}

export async function writeCurrentV2N6ArchiveSearch(options: {
  repositoryRoot: string;
  codeCommit: string;
  searchedAt: string;
}) {
  const worktreeRun = await run(options.repositoryRoot, ["git", "worktree", "list", "--porcelain"]);
  if (worktreeRun.exitCode !== 0) throw new Error(`N6 worktree inventory failed: ${worktreeRun.stderr.trim()}`);
  const roots = parseWorktreeRoots(worktreeRun.stdout);
  const candidateBytes = new Map<string, Uint8Array>();
  const worktreeCandidates: WorktreeCandidate[] = [];
  for (const root of roots) {
    const exactPath = portable(join(root, CURRENT_V2_N6_TARGET));
    const candidate = await fileCandidate(exactPath);
    if (candidate.bytes) candidateBytes.set(`known-worktree\0${exactPath}`, candidate.bytes);
    worktreeCandidates.push({ root, exactPath, exists: candidate.bytes !== null,
      sha256: candidate.sha256, bytes: candidate.byteLength });
  }

  const historyRun = await run(options.repositoryRoot,
    ["git", "log", "--all", "--full-history", "--format=%H", "--", CURRENT_V2_N6_TARGET]);
  if (historyRun.exitCode !== 0) throw new Error(`N6 Git path history failed: ${historyRun.stderr.trim()}`);
  const commits = [...new Set(historyRun.stdout.split(/\r?\n/u).filter((row) => HEX_40.test(row)))];

  const namedRun = await run(options.repositoryRoot,
    ["git", "rev-list", "--objects", "--all", "--", CURRENT_V2_N6_TARGET]);
  if (namedRun.exitCode !== 0) throw new Error(`N6 Git named-object query failed: ${namedRun.stderr.trim()}`);
  const matches = namedRun.stdout.split(/\r?\n/u).flatMap((line) => {
    const separator = line.indexOf(" ");
    if (separator < 0) return [];
    const objectId = line.slice(0, separator);
    const path = portable(line.slice(separator + 1));
    return HEX_40.test(objectId) && path === CURRENT_V2_N6_TARGET
      ? [{ objectId, path: CURRENT_V2_N6_TARGET } as const] : [];
  });

  const checked: ObjectCheck[] = [];
  for (const commit of commits) {
    const command = ["git", "show", `${commit}:${CURRENT_V2_N6_TARGET}`];
    const result = await run(options.repositoryRoot, command);
    const digest = result.exitCode === 0 ? sha(result.bytes) : null;
    if (result.exitCode === 0) candidateBytes.set(`git-path-history\0${commit}:${CURRENT_V2_N6_TARGET}`, result.bytes);
    checked.push({ source: "git-path-history", locator: `${commit}:${CURRENT_V2_N6_TARGET}`, objectId: commit,
      command, exitCode: result.exitCode, stderr: result.stderr, sha256: digest,
      bytes: result.exitCode === 0 ? result.bytes.byteLength : null,
      matchesExpectedSha256: digest === CURRENT_V2_N6_EXPECTED_SHA256 });
  }
  const seenObjects = new Set<string>();
  for (const match of matches) {
    if (seenObjects.has(match.objectId)) continue;
    seenObjects.add(match.objectId);
    const command = ["git", "cat-file", "-p", match.objectId];
    const result = await run(options.repositoryRoot, command);
    const digest = result.exitCode === 0 ? sha(result.bytes) : null;
    if (result.exitCode === 0) candidateBytes.set(`git-named-object\0${match.objectId}`, result.bytes);
    checked.push({ source: "git-named-object", locator: match.objectId, objectId: match.objectId,
      command, exitCode: result.exitCode, stderr: result.stderr, sha256: digest,
      bytes: result.exitCode === 0 ? result.bytes.byteLength : null,
      matchesExpectedSha256: digest === CURRENT_V2_N6_EXPECTED_SHA256 });
  }
  const clueObjectIds = [...new Set([...commits, ...matches.map((row) => row.objectId)])].sort();

  const knownArchives: KnownArchive[] = [];
  for (const archivePath of KNOWN_ARCHIVES) {
    const candidate = await fileCandidate(join(options.repositoryRoot, archivePath));
    const text = candidate.bytes ? new TextDecoder().decode(candidate.bytes) : "";
    if (candidate.bytes) candidateBytes.set(`known-archive\0${archivePath}`, candidate.bytes);
    knownArchives.push({ path: archivePath, exists: candidate.bytes !== null, sha256: candidate.sha256,
      bytes: candidate.byteLength, mentionsTargetPath: text.includes(CURRENT_V2_N6_TARGET),
      mentionsExpectedSha256: text.includes(CURRENT_V2_N6_EXPECTED_SHA256),
      isExactTargetBytes: candidate.sha256 === CURRENT_V2_N6_EXPECTED_SHA256 });
  }

  const transcript: CurrentV2N6SearchTranscript = {
    schemaVersion: "skill-family-current-v2-n6-search-transcript/v1",
    target: { path: CURRENT_V2_N6_TARGET, expectedSha256: CURRENT_V2_N6_EXPECTED_SHA256 },
    worktreeInventory: { command: worktreeRun.command, exitCode: worktreeRun.exitCode, roots,
      stdout: worktreeRun.stdout, stderr: worktreeRun.stderr },
    worktreeCandidates,
    gitPathHistory: { command: historyRun.command, exitCode: historyRun.exitCode,
      stdout: historyRun.stdout, stderr: historyRun.stderr, commits },
    gitNamedObjects: { command: namedRun.command, filter: { kind: "exact-path", value: CURRENT_V2_N6_TARGET },
      exitCode: namedRun.exitCode, stdout: namedRun.stdout, stderr: namedRun.stderr, matches },
    knownArchives,
    unreachableObjects: clueObjectIds.length === 0 ? {
      status: "not-applicable-no-object-clue",
      clueObjectIds: [],
      checked: [],
      reason: "No exact path history or named-object result supplied an object clue; broad unreachable-object enumeration was not run.",
    } : {
      status: "checked-clue-directed",
      clueObjectIds,
      checked,
      reason: "Only objects named by the exact path history or named-object query were inspected; broad unreachable-object enumeration was not run.",
    },
    boundaries: { wholeDiskSearches: 0, arbitraryFilenameSearches: 0, remoteEnumerations: 0 },
  };
  const outputRoot = join(options.repositoryRoot, RESULT_ROOT, "archive-recovery");
  const transcriptPath = join(outputRoot, "cache", "search-transcript.json");
  const transcriptBytes = new TextEncoder().encode(`${JSON.stringify(transcript, null, 2)}\n`);
  await writeExclusive(transcriptPath, transcriptBytes);
  const transcriptBinding = binding(options.repositoryRoot, transcriptPath, transcriptBytes);

  const candidates = exactCandidates(transcript);
  let recoveredArchiveBinding: Binding | undefined;
  if (candidates.length > 0) {
    const selected = candidates[0]!;
    const selectedBytes = candidateBytes.get(`${selected.source}\0${selected.locator}`);
    if (!selectedBytes || sha(selectedBytes) !== CURRENT_V2_N6_EXPECTED_SHA256) {
      throw new Error("N6 exact candidate bytes were not retained for archival");
    }
    const recoveredPath = join(outputRoot, "recovered-clean-002-report.json");
    await writeExclusive(recoveredPath, selectedBytes);
    recoveredArchiveBinding = binding(options.repositoryRoot, recoveredPath, selectedBytes);
  }
  const report = buildCurrentV2N6ArchiveSearch({
    codeCommit: options.codeCommit,
    searchedAt: options.searchedAt,
    transcript,
    transcriptBinding,
    recoveredArchiveBinding,
  });
  const reportPath = join(outputRoot, "clean-002-search.json");
  const reportBytes = new TextEncoder().encode(`${JSON.stringify(report, null, 2)}\n`);
  await writeExclusive(reportPath, reportBytes);
  return {
    report,
    files: [binding(options.repositoryRoot, transcriptPath, transcriptBytes),
      ...(recoveredArchiveBinding ? [recoveredArchiveBinding] : []),
      binding(options.repositoryRoot, reportPath, reportBytes)],
  };
}

export async function verifyCurrentV2N6ArchiveSearch(options: {
  repositoryRoot: string;
  report: CurrentV2N6ArchiveSearchReport;
}) {
  const errors = new Set<string>();
  let transcript: CurrentV2N6SearchTranscript | null = null;
  try {
    const bytes = new Uint8Array(await readFile(join(options.repositoryRoot, options.report.provenance.searchTranscript.path)));
    if (sha(bytes) !== options.report.provenance.searchTranscript.sha256
      || bytes.byteLength !== options.report.provenance.searchTranscript.bytes) errors.add("N6_TRANSCRIPT_BINDING_MISMATCH");
    transcript = JSON.parse(new TextDecoder().decode(bytes)) as CurrentV2N6SearchTranscript;
  } catch {
    errors.add("N6_TRANSCRIPT_UNREADABLE");
  }
  if (transcript) {
    try {
      for (const archive of transcript.knownArchives.filter((row) => row.exists)) {
        const bytes = new Uint8Array(await readFile(join(options.repositoryRoot, archive.path)));
        if (sha(bytes) !== archive.sha256 || bytes.byteLength !== archive.bytes) errors.add("N6_KNOWN_ARCHIVE_BINDING_MISMATCH");
      }
      let recoveredArchiveBinding: Binding | undefined;
      if (options.report.result.recoveredCandidate?.archivedCopy) {
        const archived = options.report.result.recoveredCandidate.archivedCopy;
        const bytes = new Uint8Array(await readFile(join(options.repositoryRoot, archived.path)));
        if (sha(bytes) !== archived.sha256 || bytes.byteLength !== archived.bytes
          || archived.sha256 !== CURRENT_V2_N6_EXPECTED_SHA256) errors.add("N6_RECOVERED_ARCHIVE_BINDING_MISMATCH");
        recoveredArchiveBinding = archived;
      }
      const rebuilt = buildCurrentV2N6ArchiveSearch({
        codeCommit: options.report.codeCommit,
        searchedAt: options.report.searchedAt,
        transcript,
        transcriptBinding: options.report.provenance.searchTranscript,
        recoveredArchiveBinding,
      });
      if (stable(rebuilt) !== stable(options.report)) errors.add("N6_REPORT_RECOMPUTATION_MISMATCH");
    } catch {
      errors.add("N6_REPORT_RECOMPUTATION_FAILED");
    }
  }
  if (options.report.portableSemanticSha256 !== reportDigest(options.report)) errors.add("N6_PORTABLE_DIGEST_MISMATCH");
  if (options.report.accounting.sourceApiCalls !== 0 || options.report.accounting.businessApiCalls !== 0
    || options.report.accounting.modelCalls !== 0 || options.report.accounting.paidCalls !== 0) errors.add("N6_ACCOUNTING_INVALID");
  if (options.report.protectedBoundary.historicalDocumentResult !== "0/6-unchanged"
    || options.report.protectedBoundary.historicalVerifierChanged !== false
    || options.report.protectedBoundary.heldOutReads !== 0
    || options.report.protectedBoundary.q1ReservedReads !== 0
    || options.report.protectedBoundary.prospectiveRuns !== 0) errors.add("N6_PROTECTED_BOUNDARY_CHANGED");
  return { status: errors.size === 0 ? "pass" as const : "fail" as const, errors: [...errors].sort() };
}
