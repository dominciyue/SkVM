import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  API_TESTER_OPERATION_RESEARCH_SYNTHESIS_EVIDENCE,
  API_TESTER_OPERATION_RESEARCH_SYNTHESIS_OUTPUT_PATH,
  apiTesterOperationResearchSynthesisPortableSha256,
  buildApiTesterOperationResearchSynthesis,
  parseApiTesterOperationResearchSynthesisCommand,
  verifyApiTesterOperationResearchSynthesis,
} from "./api-tester-operation-prospective-research-synthesis";

const repositoryRoot = process.cwd();

async function readCommittedBlob(commit: string, path: string): Promise<Uint8Array> {
  const child = Bun.spawn(["git", "-c", `safe.directory=${repositoryRoot.replaceAll("\\", "/")}`, "show", `${commit}:${path}`], {
    cwd: repositoryRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).arrayBuffer(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(`test git blob read failed: ${stderr.trim()}`);
  return new Uint8Array(stdout);
}

describe("API Tester operation prospective research synthesis", () => {
  test("derives the completed, terminal, and blocked task states from bound evidence", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "skvm-api-research-synthesis-"));
    try {
      for (const evidence of API_TESTER_OPERATION_RESEARCH_SYNTHESIS_EVIDENCE) {
        await mkdir(dirname(join(rootDir, evidence.path)), { recursive: true });
        await writeFile(join(rootDir, evidence.path), await readFile(join(repositoryRoot, evidence.path)));
      }
      const report = await buildApiTesterOperationResearchSynthesis({
        rootDir,
        outputPath: API_TESTER_OPERATION_RESEARCH_SYNTHESIS_OUTPUT_PATH,
        completedAt: "2026-09-10T13:00:00.000Z",
        implementationCommit: "23fc895d20a1a6f3dc89b055d1baab99368a1afd",
        readCommittedBlob,
      });
      expect(report.taskTotals).toEqual({
        total: 10,
        completed: 4,
        closedTerminalFailure: 2,
        notRunBlocked: 4,
        allCompletionGatesClosed: false,
      });
      expect(report.tasks.map((task) => [task.taskId, task.status])).toEqual([
        ["task-1", "completed"],
        ["task-2", "closed-terminal-failure"],
        ["task-3", "not-run-blocked"],
        ["task-4", "not-run-blocked"],
        ["task-5", "not-run-blocked"],
        ["task-7", "completed"],
        ["task-8", "closed-terminal-failure"],
        ["task-9", "not-run-blocked"],
        ["task-10", "completed"],
        ["task-6", "completed"],
      ]);
      expect(report.observedResults).toMatchObject({
        operationDevelopment: { documents: 6, operations: 562, accepted: 112, rejected: 449, unresolved: 1, checkerPassed: 112 },
        prospective: { authoritativeSelections: 0, rowsExecuted: 0, partialInputBundles: 10, terminalStatusCode: 403 },
        family: { responsibilities: 7, currentSupported: 2 },
        publicSkillCorpus: { metadataRequests: 7, bodyRequests: 0, selectedSkills: 0 },
        mechanismAblation: { operationDelta: 112, fullDetected: 9, noDependencyDetected: 6, hiddenOperations: 450, hiddenFamilyResponsibilities: 5 },
        readiness: { before: false, after: false },
      });
      expect(report.nextDecision).toMatchObject({
        eligibleToPrepareNewProspectiveProtocol: true,
        eligibleToExecuteNewProspective: false,
      });
      await expect(verifyApiTesterOperationResearchSynthesis({
        rootDir,
        reportPath: API_TESTER_OPERATION_RESEARCH_SYNTHESIS_OUTPUT_PATH,
        readCommittedBlob,
      })).resolves.toMatchObject({ status: "verified-incomplete-development-synthesis", completed: 4, blockedOrFailed: 6 });

      await expect(verifyApiTesterOperationResearchSynthesis({
        rootDir,
        reportPath: API_TESTER_OPERATION_RESEARCH_SYNTHESIS_OUTPUT_PATH,
        readCommittedBlob: async (commit, path) => path === API_TESTER_OPERATION_RESEARCH_SYNTHESIS_EVIDENCE[0].path
          ? new Uint8Array([0])
          : readCommittedBlob(commit, path),
      })).rejects.toThrow(/committed|provenance|digest/iu);

      const reportPath = join(rootDir, API_TESTER_OPERATION_RESEARCH_SYNTHESIS_OUTPUT_PATH);
      const tampered = JSON.parse(await readFile(reportPath, "utf8"));
      tampered.taskTotals.completed = 5;
      tampered.portableSemanticSha256 = apiTesterOperationResearchSynthesisPortableSha256(tampered);
      await writeFile(reportPath, `${JSON.stringify(tampered, null, 2)}\n`, "utf8");
      await expect(verifyApiTesterOperationResearchSynthesis({
        rootDir,
        reportPath: API_TESTER_OPERATION_RESEARCH_SYNTHESIS_OUTPUT_PATH,
        readCommittedBlob,
      })).rejects.toThrow(/derived|drift|task|semantic/iu);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  test("keeps the CLI on the fixed synthesis identity", () => {
    expect(parseApiTesterOperationResearchSynthesisCommand([
      "--mode=create", "--root=.", `--out=${API_TESTER_OPERATION_RESEARCH_SYNTHESIS_OUTPUT_PATH}`,
      "--completed-at=2026-09-10T13:00:00.000Z", "--implementation-commit=23fc895d20a1a6f3dc89b055d1baab99368a1afd", "--git=git",
    ])).toMatchObject({ mode: "create", implementationCommit: "23fc895d20a1a6f3dc89b055d1baab99368a1afd", gitExecutable: "git" });
    expect(() => parseApiTesterOperationResearchSynthesisCommand([
      "--mode=verify", "--root=.", "--out=results/alternate.json",
    ])).toThrow(/--out must be/iu);
    expect(() => parseApiTesterOperationResearchSynthesisCommand([
      "--mode=verify", "--root=.", `--out=${API_TESTER_OPERATION_RESEARCH_SYNTHESIS_OUTPUT_PATH}`, "--git=git", "--retry=true",
    ])).toThrow(/unknown argument/iu);
  });
});
