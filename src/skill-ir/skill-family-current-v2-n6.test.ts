import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  buildCurrentV2N6ArchiveSearch,
  verifyCurrentV2N6ArchiveSearch,
  type CurrentV2N6SearchTranscript,
} from "./skill-family-current-v2-n6";

const TARGET = "results/skill-ir/api-tester-operation-dependency-verification-revision-clean-002/report.json";
const EXPECTED = "c4399a8a1fa5249b9061728105f08c65cad5e97d20dd9f68c9d24631910573d6";
const CODE_COMMIT = "a".repeat(40);

function transcript(overrides: Partial<CurrentV2N6SearchTranscript> = {}): CurrentV2N6SearchTranscript {
  return {
    schemaVersion: "skill-family-current-v2-n6-search-transcript/v1",
    target: { path: TARGET, expectedSha256: EXPECTED },
    worktreeInventory: {
      command: ["git", "worktree", "list", "--porcelain"],
      exitCode: 0,
      roots: ["D:/repo", "D:/clean"],
      stdout: "worktree D:/repo\n\nworktree D:/clean\n",
      stderr: "",
    },
    worktreeCandidates: [
      { root: "D:/repo", exactPath: `D:/repo/${TARGET}`, exists: false, sha256: null, bytes: null },
      { root: "D:/clean", exactPath: `D:/clean/${TARGET}`, exists: false, sha256: null, bytes: null },
    ],
    gitPathHistory: {
      command: ["git", "log", "--all", "--full-history", "--format=%H", "--", TARGET],
      exitCode: 0,
      stdout: "",
      stderr: "",
      commits: [],
    },
    gitNamedObjects: {
      command: ["git", "rev-list", "--objects", "--all"],
      filter: { kind: "exact-path", value: TARGET },
      exitCode: 0,
      stdout: "",
      stderr: "",
      matches: [],
    },
    knownArchives: [
      {
        path: "results/skill-ir/api-tester-operation-delivery-freeze-development-001/report.json",
        exists: true,
        sha256: "b".repeat(64),
        bytes: 100,
        mentionsTargetPath: true,
        mentionsExpectedSha256: true,
        isExactTargetBytes: false,
      },
    ],
    unreachableObjects: {
      status: "not-applicable-no-object-clue",
      clueObjectIds: [],
      checked: [],
      reason: "No exact path history or named-object result supplied an object clue.",
    },
    boundaries: {
      wholeDiskSearches: 0,
      arbitraryFilenameSearches: 0,
      remoteEnumerations: 0,
    },
    ...overrides,
  };
}

test("N6 reports a bounded miss without claiming permanent unrecoverability", () => {
  const report = buildCurrentV2N6ArchiveSearch({
    codeCommit: CODE_COMMIT,
    searchedAt: "2026-09-12T14:30:00.000Z",
    transcript: transcript(),
    transcriptBinding: { path: "archive-recovery/cache/search-transcript.json", sha256: "c".repeat(64), bytes: 200 },
  });
  expect(report.result).toMatchObject({
    decision: "not-recovered-within-search-scope",
    recoveredExact: false,
    recoveredCandidate: null,
    historicalGapRemains: true,
  });
  expect(report.scope.worktrees.checked).toBe(2);
  expect(report.scope.gitPathHistory.commits).toBe(0);
  expect(report.claimLimits.join(" ")).toContain("bounded");
  expect(report.claimLimits.join(" ")).not.toContain("forever");
});

test("N6 records recovered-exact only for bytes matching the historical digest", () => {
  const report = buildCurrentV2N6ArchiveSearch({
    codeCommit: CODE_COMMIT,
    searchedAt: "2026-09-12T14:30:00.000Z",
    transcript: transcript({
      worktreeCandidates: [
        { root: "D:/repo", exactPath: `D:/repo/${TARGET}`, exists: true, sha256: EXPECTED, bytes: 123 },
      ],
      worktreeInventory: {
        command: ["git", "worktree", "list", "--porcelain"],
        exitCode: 0,
        roots: ["D:/repo"],
        stdout: "worktree D:/repo\n",
        stderr: "",
      },
    }),
    transcriptBinding: { path: "archive-recovery/cache/search-transcript.json", sha256: "c".repeat(64), bytes: 200 },
    recoveredArchiveBinding: {
      path: "archive-recovery/recovered-clean-002-report.json",
      sha256: EXPECTED,
      bytes: 123,
    },
  });
  expect(report.result.decision).toBe("recovered-exact");
  expect(report.result.recoveredCandidate).toMatchObject({ sha256: EXPECTED, bytes: 123 });
  expect(report.result.historicalGapRemains).toBe(false);
});

test("N6 refuses to skip a clue-directed unreachable-object check", () => {
  expect(() => buildCurrentV2N6ArchiveSearch({
    codeCommit: CODE_COMMIT,
    searchedAt: "2026-09-12T14:30:00.000Z",
    transcript: transcript({
      gitNamedObjects: {
        command: ["git", "rev-list", "--objects", "--all"],
        filter: { kind: "exact-path", value: TARGET },
        exitCode: 0,
        stdout: `dddddddddddddddddddddddddddddddddddddddd ${TARGET}\n`,
        stderr: "",
        matches: [{ objectId: "d".repeat(40), path: TARGET }],
      },
    }),
    transcriptBinding: { path: "archive-recovery/cache/search-transcript.json", sha256: "c".repeat(64), bytes: 200 },
  })).toThrow("object clue");
});

test("N6 verifier recomputes the report from bound transcript bytes and detects transcript drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "current-v2-n6-"));
  const archivePath = "results/skill-ir/api-tester-operation-delivery-freeze-development-001/report.json";
  const transcriptPath = "results/skill-ir/skill-family-current-v2-source-repair-001/archive-recovery/cache/search-transcript.json";
  try {
    const archiveBytes = new TextEncoder().encode(`${TARGET}\n${EXPECTED}\n`);
    await mkdir(dirname(join(root, archivePath)), { recursive: true });
    await writeFile(join(root, archivePath), archiveBytes);
    const value = transcript({
      knownArchives: [{
        path: archivePath,
        exists: true,
        sha256: createHash("sha256").update(archiveBytes).digest("hex"),
        bytes: archiveBytes.byteLength,
        mentionsTargetPath: true,
        mentionsExpectedSha256: true,
        isExactTargetBytes: false,
      }],
    });
    const transcriptBytes = new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
    await mkdir(dirname(join(root, transcriptPath)), { recursive: true });
    await writeFile(join(root, transcriptPath), transcriptBytes);
    const report = buildCurrentV2N6ArchiveSearch({
      codeCommit: CODE_COMMIT,
      searchedAt: "2026-09-12T14:30:00.000Z",
      transcript: value,
      transcriptBinding: {
        path: transcriptPath,
        sha256: createHash("sha256").update(transcriptBytes).digest("hex"),
        bytes: transcriptBytes.byteLength,
      },
    });
    expect(await verifyCurrentV2N6ArchiveSearch({ repositoryRoot: root, report })).toEqual({ status: "pass", errors: [] });
    await writeFile(join(root, transcriptPath), new TextEncoder().encode("{}\n"));
    const drift = await verifyCurrentV2N6ArchiveSearch({ repositoryRoot: root, report });
    expect(drift.status).toBe("fail");
    expect(drift.errors).toContain("N6_TRANSCRIPT_BINDING_MISMATCH");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
