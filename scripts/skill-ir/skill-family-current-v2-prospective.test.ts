import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CURRENT_V2_IDENTITY,
  CURRENT_V2_RESULT_RELATIVE,
  buildInitialExecutionStatus,
  buildStageManifest,
  completeTask,
  deriveStageView,
  readStageState,
  runN7ReadinessStage,
  runN13ComparisonStage,
  runN13RevisionStage,
  runN13Revision2Stage,
  runN13ReclassificationStage,
  runN4SourceMaintenanceStage,
  runN10RevisionStage,
  runResearchGateStage,
  selectNextRunnableTask,
  validateStageState,
} from "./skill-family-current-v2-prospective";

const BASE_COMMIT = "a".repeat(40);

function fixtures() {
  const manifest = buildStageManifest({
    baseCommit: BASE_COMMIT,
    branch: "skill-ir-aot",
    upstream: "origin/skill-ir-aot",
    bunVersion: "1.3.14",
    nodeVersion: "v23.8.0",
    planSha256: "b".repeat(64),
    createdAt: "2026-09-12T00:00:00.000Z",
  });
  const status = buildInitialExecutionStatus(manifest, {
    createdAt: "2026-09-12T00:00:00.000Z",
    baselineStatusCommand: "bun ./scripts/skill-ir/skill-family-class-proof.ts --step=status",
    baselineStatus: "passed",
  });
  return { manifest, status };
}

describe("current-v2 stage orchestration", () => {
  test("exposes the N10 revision decision as a first-class resumable stage", () => {
    expect(runN10RevisionStage).toBeFunction();
  });

  test("exposes N7 task-scoped readiness without mutating historical readiness", () => {
    expect(runN7ReadinessStage).toBeFunction();
  });

  test("exposes a research gate that can terminate N9, N11, and N12 without execution", () => {
    expect(runResearchGateStage).toBeFunction();
  });

  test("exposes the bounded N13 Schemathesis comparison as a resumable stage", () => {
    expect(runN13ComparisonStage).toBeFunction();
  });

  test("exposes a separate N13 revision path that cannot overwrite the initial failure", () => {
    expect(runN13RevisionStage).toBeFunction();
  });

  test("exposes a second N13 revision only after the archived Windows encoding failure", () => {
    expect(runN13Revision2Stage).toBeFunction();
  });

  test("exposes a third N13 revision that only reclassifies archived raw evidence", () => {
    expect(runN13ReclassificationStage).toBeFunction();
  });

  test("exposes bounded N4 source maintenance without mutating old evidence", () => {
    expect(runN4SourceMaintenanceStage).toBeFunction();
  });

  test("records the complete N0-N15 graph and resumes at N1 after N0", () => {
    const { manifest, status } = fixtures();
    expect(manifest.identity).toBe(CURRENT_V2_IDENTITY);
    expect(manifest.planRevision).toBe(2);
    expect(manifest.tasks.map((task) => task.id)).toEqual([
      "N0", "N1", "N2", "N3", "N5", "N8", "N10", "N7",
      "N9", "N11", "N12", "N13", "N4", "N6", "N14", "N15",
    ]);
    expect(status.tasks.N0.status).toBe("completed");
    expect(selectNextRunnableTask(manifest, status)).toBe("N1");
    expect(status.nextAction).toContain("N1");
  });

  test("keeps engineering, research, and maintenance status separate", () => {
    const { manifest, status } = fixtures();
    const view = deriveStageView(manifest, status);
    expect(view.overallStatus).toBe("active");
    expect(view.currentTask).toBe("N1");
    expect(view.tracks.engineering.completed).toBe(1);
    expect(view.tracks.research.total).toBe(3);
    expect(view.tracks.maintenance.total).toBe(2);
    expect(view.protectedState).toEqual({
      historicalDocumentResult: "0/6-unchanged",
      heldOutReads: 0,
      q1ReservedReads: 0,
      prospectiveRuns: 0,
    });
  });

  test("a limited maintenance result does not block an independent ready task", () => {
    const { manifest, status } = fixtures();
    status.tasks.N1.status = "completed";
    status.tasks.N2.status = "completed";
    status.tasks.N3.status = "completed";
    status.tasks.N4.status = "completed-with-limitation";
    status.tasks.N4.issues = ["source-blocked-unresolved"];
    expect(selectNextRunnableTask(manifest, status)).toBe("N5");
    expect(deriveStageView(manifest, status).blockingIssues).not.toContain("source-blocked-unresolved");
  });

  test("completes the current task without changing protected counters", () => {
    const { manifest, status } = fixtures();
    const next = completeTask(manifest, status, "N1", {
      completedAt: "2026-09-12T01:00:00.000Z",
      evidence: [
        `${CURRENT_V2_RESULT_RELATIVE}/corpus/source-ledger.json`,
        `${CURRENT_V2_RESULT_RELATIVE}/corpus/duty-matrix.json`,
        `${CURRENT_V2_RESULT_RELATIVE}/corpus/exposure-ledger.json`,
      ],
      nextAction: "N2: build the TaskContract and complete obligation plan",
    });
    expect(next.tasks.N1.status).toBe("completed");
    expect(next.tasks.N1.completedAt).toBe("2026-09-12T01:00:00.000Z");
    expect(next.currentStage).toBe("N2");
    expect(next.protectedState).toEqual(status.protectedState);
    expect(status.tasks.N1.status).toBe("pending");
    expect(selectNextRunnableTask(manifest, next)).toBe("N2");
  });

  test("rejects impossible completion order and unsafe evidence paths", () => {
    const first = fixtures();
    first.status.tasks.N2.status = "completed";
    expect(() => validateStageState(first.manifest, first.status)).toThrow(/N2.*N1/u);

    const second = fixtures();
    second.status.tasks.N0.evidence = ["D:\\outside\\report.json"];
    expect(() => validateStageState(second.manifest, second.status)).toThrow(/unsafe evidence path/u);
  });

  test("reads a persisted state without mutating it", async () => {
    const root = await mkdtemp(join(tmpdir(), "current-v2-status-"));
    try {
      const { manifest, status } = fixtures();
      const resultRoot = join(root, CURRENT_V2_RESULT_RELATIVE);
      await mkdir(resultRoot, { recursive: true });
      await writeFile(join(resultRoot, "stage-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
      await writeFile(join(resultRoot, "execution-status.json"), `${JSON.stringify(status, null, 2)}\n`);
      const before = JSON.stringify(status);
      const state = await readStageState(root);
      expect(state.view.currentTask).toBe("N1");
      expect(JSON.stringify(state.status)).toBe(before);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
