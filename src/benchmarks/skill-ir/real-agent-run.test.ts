import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { SkillIR } from "../../skill-ir/schema";
import {
  assertRequiredEnv,
  buildPlan,
  executePlan,
  extractRunStatus,
  parseRealAgentRunArgs,
  resetPersistentWorkDir,
  type RealAgentRunArgs,
} from "./real-agent-run";
import { buildFinalIRProvenance } from "./final-ir-provenance";
import type { RealAgentRunPlanEntry } from "./real-agent";
import { sha256Bytes } from "./source-fixture";
import { compileEnvManagerArtifactPackage } from "./artifact-package-compiler";
import { compileEnvManagerContractRepairArtifactPackage } from "./executable-contract-artifact-compiler";
import { compileEnvManagerSemanticArtifactPackage } from "./semantic-artifact-compiler";

const tempDirs: string[] = [];
const projectRoot = join(import.meta.dir, "../../..");

const defaultRunIdentityArgs = {
  modelFamily: "test",
  adapterVersion: "workspace",
  repetitions: 1,
  panelConfigId: "single-run",
};

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

function irFixture(id: string, name: string, sourceText: string): SkillIR {
  return {
    schemaVersion: "skill-ir/v1",
    id,
    name,
    category: ["workflow"],
    intent: `Execute ${name} consistently.`,
    source: { kind: "inline", text: sourceText },
    inputs: [],
    outputs: [],
    preconditions: [],
    steps: [
      {
        id: "step-main",
        title: "Main step",
        description: "Perform the main benchmark action.",
        kind: "execute",
        required: true,
        dependsOn: [],
        toolRefs: [],
        produces: ["result"],
        successCheckRefs: [],
        failureModes: [],
      },
    ],
    rules: [],
    tools: [],
    environment: [],
    checks: [],
    recovery: [],
    profile: [],
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function createExecutableArtifactPackage(): Promise<{ packageDir: string; lockPath: string }> {
  const root = await mkdtemp(join(tmpdir(), "skill-ir-runner-package-"));
  tempDirs.push(root);
  const packageDir = join(root, "package");
  await compileEnvManagerArtifactPackage({
    rootDir: projectRoot,
    baseIrPath: join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/base-ir.json"),
    repairEvidencePath: join(projectRoot, "results/skill-ir/env-manager-dual-overlay-v2-2026-07-16/repair-evidence.json"),
    taskSetPath: join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/tasks.json"),
    sourcePath: join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/source/SKILL.md"),
    predecessorPaths: [
      join(projectRoot, "results/skill-ir/env-manager-dual-overlay-v1-2026-07-16/provenance.json"),
      join(projectRoot, "results/skill-ir/env-manager-dual-overlay-v2-2026-07-16/provenance.json"),
    ],
    outDir: packageDir,
    scope: {
      model: "xty/gpt-4.1-mini",
      modelFamily: "gpt",
      adapter: "bare-agent",
      adapterVersion: "workspace-executable-artifact-v1",
      environment: "windows",
      context: "clean",
    },
  });
  const lockPath = join(root, "artifact-lock.json");
  await writeJson(lockPath, {
    schemaVersion: "skill-ir-env-manager-executable-artifact-lock/v1",
    stage: "executable-artifact-development",
    status: "preregistered",
    catalog: "executable-artifact/v1",
    corpus: "pilot",
    skillId: "env-manager",
    package: {
      path: "package",
      manifestSha256: sha256Bytes(await readFile(join(packageDir, "package-manifest.json"))),
      provenanceSha256: sha256Bytes(await readFile(join(packageDir, "package-provenance.json"))),
    },
    model: { route: "xty/gpt-4.1-mini", family: "gpt" },
    adapter: { id: "bare-agent", version: "workspace-executable-artifact-v1" },
    matrix: {
      system: "ir-artifact-dev",
      repairModes: ["check-only", "one-repair"],
      contexts: ["clean"],
      agents: ["skvm"],
      environments: ["windows"],
      taskSplit: "development",
      taskIds: ["env-manager-node-audit-dev-001", "env-manager-vite-audit-dev-002"],
      repetitions: 2,
      initialGenerationRows: 8,
    },
    runtime: {
      stateMachine: ["preflight", "generation", "validate", "optional-one-repair", "revalidate", "stop"],
      maxSemanticRepairCalls: 1,
      apiKeyEnv: "SKVM_XTY_API_KEY",
    },
    scoring: {
      authority: "existing-deterministic-env-manager-scorer",
      runtimeValidatorIsScorer: false,
      repairCostReportedSeparately: true,
    },
    developmentGate: {
      minimumSuccesses: 3,
      minimumMeanScore: 0.85,
      maximumHardGateRegressions: 0,
      maximumInfrastructureFailures: 0,
    },
    prohibited: ["held-out execution before development gate"],
  });
  return { packageDir, lockPath };
}

async function createSemanticArtifactPackage(): Promise<{ packageDir: string; lockPath: string }> {
  const root = await mkdtemp(join(tmpdir(), "skill-ir-semantic-runner-package-"));
  tempDirs.push(root);
  const packageDir = join(root, "package");
  await compileEnvManagerSemanticArtifactPackage({
    rootDir: projectRoot,
    baseIrPath: join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/base-ir.json"),
    taskSetPath: join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/tasks.json"),
    sourcePath: join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/source/SKILL.md"),
    outDir: packageDir,
  });
  const lockPath = join(root, "semantic-artifact-lock.json");
  await writeJson(lockPath, {
    schemaVersion: "skill-ir-env-manager-executable-semantic-artifact-lock/v1",
    stage: "executable-semantic-artifact-development",
    status: "preregistered",
    catalog: "executable-semantic-artifact/v2",
    codeCatalog: "semantic-error-codes/v1",
    corpus: "pilot",
    skillId: "env-manager",
    package: {
      path: "package",
      manifestSha256: sha256Bytes(await readFile(join(packageDir, "package-manifest.json"))),
      provenanceSha256: sha256Bytes(await readFile(join(packageDir, "package-provenance.json"))),
    },
    model: { route: "xty/gpt-4.1-mini", family: "gpt" },
    adapter: { id: "bare-agent", version: "workspace-semantic-artifact-v2-test" },
    matrix: {
      system: "ir-artifact-dev",
      repairModes: ["check-only", "one-repair"],
      contexts: ["clean"],
      agents: ["skvm"],
      environments: ["windows"],
      taskSplit: "development",
      taskIds: ["env-manager-node-audit-dev-001", "env-manager-vite-audit-dev-002"],
      repetitions: 1,
      initialGenerationRows: 4,
    },
    runtime: {
      stateMachine: ["preflight", "generation", "validate", "optional-one-repair", "revalidate", "stop"],
      maxSemanticRepairCalls: 1,
      apiKeyEnv: "TEST_ONLY_API_KEY_ENV",
    },
    scoring: {
      authority: "existing-deterministic-env-manager-scorer",
      runtimeValidatorIsScorer: false,
      repairCostReportedSeparately: true,
    },
    developmentGate: {
      minimumSuccesses: 1,
      minimumMeanScore: 0,
      maximumHardGateRegressions: 0,
      maximumInfrastructureFailures: 0,
    },
    attributionGate: {
      minimumRepairAttempts: 1,
      compareModes: ["check-only", "one-repair"],
      scorerAuthorityUnchanged: true,
    },
    prohibited: ["test-only lock; not a real gate or paid-run authority"],
  });
  return { packageDir, lockPath };
}

async function createContractRepairArtifactPackage(): Promise<{ packageDir: string; lockPath: string }> {
  const root = await mkdtemp(join(tmpdir(), "skill-ir-contract-repair-runner-package-"));
  tempDirs.push(root);
  const packageDir = join(root, "package");
  const tasksPath = join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/tasks.json");
  const scorerPath = join(projectRoot, "src/bench/evaluators/env-manager-grade.ts");
  await compileEnvManagerContractRepairArtifactPackage({
    rootDir: projectRoot,
    baseIrPath: join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/base-ir.json"),
    taskSetPath: tasksPath,
    sourcePath: join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/source/SKILL.md"),
    coverageAuditPath: join(
      projectRoot,
      "results/skill-ir/env-manager-v4-deterministic-replay-evidence-2026-07-22/contract-coverage-audit.json",
    ),
    replayFreezePath: join(
      projectRoot,
      "benchmarks/skill-ir/pilots/env-manager/env-manager-v4-deterministic-replay-freeze.json",
    ),
    replaySummaryPath: join(
      projectRoot,
      "results/skill-ir/env-manager-v4-deterministic-replay-evidence-2026-07-22/summary.json",
    ),
    outDir: packageDir,
  });
  const lockPath = join(root, "contract-repair-artifact-lock.json");
  await writeJson(lockPath, {
    schemaVersion: "skill-ir-env-manager-contract-repair-artifact-lock/v1",
    stage: "contract-repair-artifact-development",
    status: "preregistered",
    catalog: "executable-contract-repair-artifact/v4",
    codeCatalog: "public-contract-error-codes/v2",
    corpus: "pilot",
    skillId: "env-manager",
    package: {
      path: "package",
      manifestSha256: sha256Bytes(await readFile(join(packageDir, "package-manifest.json"))),
      provenanceSha256: sha256Bytes(await readFile(join(packageDir, "package-provenance.json"))),
    },
    scorer: {
      path: "src/bench/evaluators/env-manager-grade.ts",
      sha256: sha256Bytes(await readFile(scorerPath)),
    },
    tasks: {
      path: "benchmarks/skill-ir/pilots/env-manager/tasks.json",
      sha256: sha256Bytes(await readFile(tasksPath)),
    },
    model: { route: "xty/gpt-5.6-sol", family: "gpt" },
    adapter: { id: "bare-agent", version: "workspace-contract-repair-v4" },
    matrix: {
      system: "ir-contract-artifact-dev",
      panelConfigId: "env-manager-contract-repair-v4-development",
      contexts: ["clean"],
      agents: ["skvm"],
      environments: ["windows"],
      taskSplit: "development",
      taskIds: ["env-manager-node-audit-dev-001", "env-manager-vite-audit-dev-002"],
      repetitions: 2,
      initialGenerationRows: 4,
    },
    runtime: {
      stateMachine: [
        "preflight",
        "generation",
        "capture-pre-repair-snapshot",
        "validate",
        "deterministic-repair",
        "revalidate",
        "optional-one-model-repair-for-residual",
        "final-validate",
        "capture-post-repair-snapshot",
        "stop",
      ],
      maxDeterministicRepairCalls: 1,
      maxModelRepairCalls: 1,
      apiKeyEnv: "SKVM_XTY_API_KEY",
      sharedGeneration: true,
    },
    scoring: {
      authority: "existing-deterministic-env-manager-scorer",
      runtimeValidatorIsScorer: false,
      generationDenominator: "preregistered-generation",
      missingPairIsInfrastructure: true,
      deterministicRepairCostReportedSeparately: true,
      modelRepairCostReportedSeparately: true,
      logicalArms: ["check-only", "one-repair"],
    },
    attributionGate: {
      minimumDeterministicRepairAttempts: 1,
      requireSharedGenerationIdentity: true,
      scorerAuthorityUnchanged: true,
    },
    developmentGate: {
      minimumSuccesses: 3,
      minimumMeanScore: 0.85,
      maximumHardGateRegressions: 0,
      maximumInfrastructureFailures: 0,
    },
    prohibited: [
      "held-out execution before the development gate passes",
      "post-run package, scorer, tasks, model, repetitions, or gate changes",
    ],
  });
  return { packageDir, lockPath };
}

async function createMultiSkillRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "skill-ir-real-agent-run-"));
  tempDirs.push(root);

  await writeJson(join(root, "benchmarks/skill-ir/contexts/standard-contexts.json"), {
    schemaVersion: "skill-ir-contexts/v1",
    contexts: [{ id: "clean", description: "Clean context." }],
  });
  await writeJson(
    join(root, "benchmarks/skill-ir/ir/review.json"),
    irFixture("skill-review", "Review Skill", "Review source text."),
  );
  await writeJson(
    join(root, "benchmarks/skill-ir/ir/diagnostic.json"),
    irFixture("skill-diagnostic", "Diagnostic Skill", "Diagnostic source text."),
  );
  await writeJson(join(root, "benchmarks/skill-ir/tasks/review.json"), {
    schemaVersion: "skill-ir-tasks/v1",
    skillId: "skill-review",
    tasks: [{ id: "review-task", split: "development", prompt: "Review task prompt.", successCriteria: [] }],
  });
  await writeJson(join(root, "benchmarks/skill-ir/tasks/diagnostic.json"), {
    schemaVersion: "skill-ir-tasks/v1",
    skillId: "skill-diagnostic",
    tasks: [{ id: "diagnostic-task", split: "development", prompt: "Diagnostic task prompt.", successCriteria: [] }],
  });
  await writeJson(join(root, "benchmarks/skill-ir/corpus/manifest.json"), {
    schemaVersion: "skill-ir-corpus-registry/v1",
    corpora: {
      calibration: {
        manifestPath: "benchmarks/skill-ir/corpus/corpora/calibration.json",
        role: "test",
      },
      pilot: {
        manifestPath: "benchmarks/skill-ir/corpus/corpora/pilot.json",
        role: "test",
      },
    },
  });
  await writeJson(join(root, "benchmarks/skill-ir/corpus/corpora/calibration.json"), {
    schemaVersion: "skill-ir-corpus/v2",
    corpusId: "calibration",
    categories: ["workflow"],
    skills: [
      {
        id: "skill-review",
        name: "Review Skill",
        category: ["workflow"],
        depth: "calibration",
        status: "runnable",
        provenance: "real-public",
        source: "public/review",
        sourceUrl: "https://example.com/review",
        evidenceWeight: "main-real",
        irPath: "benchmarks/skill-ir/ir/review.json",
        tasksPath: "benchmarks/skill-ir/tasks/review.json",
      },
      {
        id: "skill-diagnostic",
        name: "Diagnostic Skill",
        category: ["workflow"],
        depth: "calibration",
        status: "runnable",
        provenance: "adapted-public",
        source: "public/diagnostic",
        sourceUrl: "https://example.com/diagnostic",
        evidenceWeight: "support-real",
        irPath: "benchmarks/skill-ir/ir/diagnostic.json",
        tasksPath: "benchmarks/skill-ir/tasks/diagnostic.json",
      },
    ],
  });

  return root;
}

async function createTasksAuthoredPilotRoot(): Promise<string> {
  const root = await createMultiSkillRoot();
  const sourcePath = "benchmarks/skill-ir/pilots/env-manager/source/SKILL.md";
  const sourceText = "# Environment Variable Manager\n\nAudit environment variables without leaking secrets.\n";
  await mkdir(dirname(join(root, sourcePath)), { recursive: true });
  await writeFile(join(root, sourcePath), sourceText, "utf8");
  await writeJson(join(root, "benchmarks/skill-ir/tasks/env-manager.json"), {
    schemaVersion: "skill-ir-tasks/v1",
    skillId: "env-manager",
    tasks: [
      { id: "env-dev-1", split: "development", prompt: "Audit fixture one.", successCriteria: [] },
      { id: "env-dev-2", split: "development", prompt: "Audit fixture two.", successCriteria: [] },
      { id: "env-heldout-1", split: "held-out", prompt: "Audit held-out fixture.", successCriteria: [] },
    ],
  });
  await writeJson(join(root, "benchmarks/skill-ir/corpus/corpora/pilot.json"), {
    schemaVersion: "skill-ir-corpus/v2",
    corpusId: "pilot",
    skills: [
      {
        id: "env-manager",
        name: "Environment Variable Manager",
        category: ["tool-use", "constraint-heavy", "environment-sensitive"],
        status: "tasks-authored",
        provenance: "real-public",
        evidenceWeight: "main-real",
        sourcePath,
        tasksPath: "benchmarks/skill-ir/tasks/env-manager.json",
        sourceFiles: [{ path: sourcePath, sha256: sha256Bytes(Buffer.from(sourceText, "utf8")) }],
      },
    ],
  });
  return root;
}

describe("real-agent-run manifest loading", () => {
  test("resetPersistentWorkDir recreates only the supplied materialized workdir", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "skill-ir-real-agent-reset-"));
    tempDirs.push(rootDir);
    const runDir = join(rootDir, "case", "original", "run-1");
    const workDir = join(runDir, "workdir");
    const staleOutput = join(workDir, "nested", "stale-output.txt");
    const taskSentinel = join(runDir, "task", "task.json");
    const skillSentinel = join(runDir, "skill", "SKILL.md");
    await Promise.all([
      mkdir(join(workDir, "nested"), { recursive: true }),
      mkdir(dirname(taskSentinel), { recursive: true }),
      mkdir(dirname(skillSentinel), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(staleOutput, "stale\n", "utf8"),
      writeFile(taskSentinel, "task\n", "utf8"),
      writeFile(skillSentinel, "skill\n", "utf8"),
    ]);
    await resetPersistentWorkDir(workDir);

    expect((await stat(workDir)).isDirectory()).toBe(true);
    expect(await Bun.file(staleOutput).exists()).toBe(false);
    expect(await Bun.file(taskSentinel).text()).toBe("task\n");
    expect(await Bun.file(skillSentinel).text()).toBe("skill\n");
  });

  test("resetPersistentWorkDir rejects a target outside the materialized workdir shape", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "skill-ir-real-agent-reset-"));
    tempDirs.push(rootDir);
    const runDir = join(rootDir, "case", "original", "run-1");
    const sentinel = join(runDir, "task", "task.json");
    await mkdir(dirname(sentinel), { recursive: true });
    await writeFile(sentinel, "task\n", "utf8");

    expect(resetPersistentWorkDir(runDir)).rejects.toThrow("Refusing to reset non-materialized workdir");
    expect(await Bun.file(sentinel).text()).toBe("task\n");
  });

  test("executePlan writes the persistent workDir into each raw row", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "skill-ir-real-agent-execute-"));
    tempDirs.push(rootDir);
    const outDir = join(rootDir, "out");
    const workDir = join(rootDir, "case", "original", "run-1", "workdir");
    const taskPath = join(rootDir, "task.json");
    const initialWorkdirManifestPath = join(rootDir, "case", "original", "run-1", "initial-workdir-manifest.json");
    await mkdir(outDir, { recursive: true });
    await writeFile(taskPath, `${JSON.stringify({ id: "artifact-task", prompt: "test", eval: [] })}\n`, "utf8");
    const plan: RealAgentRunPlanEntry[] = [{
      caseId: "artifact-skill:skvm:windows:clean:artifact-task",
      system: "original",
      taskPath,
      workDir,
      initialWorkdirManifestPath,
      model: "test/model",
      modelFamily: "test",
      adapter: "bare-agent",
      adapterVersion: "workspace",
      runIndex: 1,
      panelConfigId: "single-run",
      command: [process.execPath, "-e", "console.log('Final output:\\nok')"],
    }];

    await executePlan(plan, {
      corpus: "calibration",
      model: "test/model",
      adapter: "bare-agent",
      outDir,
      limit: 1,
      execute: true,
      retries: 0,
      retryDelayMs: 0,
      rootDir,
    });

    const rawRow = JSON.parse((await Bun.file(join(outDir, "raw-runs.jsonl")).text()).trim());
    expect(rawRow.workDir).toBe(workDir);
    expect(rawRow.runStatus).toBe("ok");
    expect(rawRow.initialWorkdirManifest).toEqual({
      path: initialWorkdirManifestPath,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  test("extractRunStatus reads a colored non-ok status without trusting final output text", () => {
    expect(extractRunStatus("\u001b[33mwarning runStatus: timeout\u001b[0m\nFinal output:\nok")).toBe("timeout");
    expect(extractRunStatus("Run complete\nFinal output:\nreported runStatus: adapter-crashed")).toBe("ok");
  });

  test("executePlan persists non-ok adapter status when the wrapper exits zero", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "skill-ir-real-agent-status-"));
    tempDirs.push(rootDir);
    const outDir = join(rootDir, "out");
    const workDir = join(rootDir, "case", "original", "run-1", "workdir");
    await mkdir(outDir, { recursive: true });

    await executePlan([{
      caseId: "artifact-skill:skvm:windows:clean:artifact-task",
      system: "original",
      taskPath: join(rootDir, "task.json"),
      workDir,
      model: "test/model",
      modelFamily: "test",
      adapter: "bare-agent",
      adapterVersion: "workspace",
      runIndex: 1,
      panelConfigId: "single-run",
      command: [process.execPath, "-e", "console.log('warning runStatus: adapter-crashed\\nFinal output:\\nresidual')"],
    }], {
      corpus: "calibration",
      model: "test/model",
      adapter: "bare-agent",
      outDir,
      limit: 1,
      execute: true,
      retries: 0,
      retryDelayMs: 0,
      rootDir,
    });

    const rawRow = JSON.parse((await Bun.file(join(outDir, "raw-runs.jsonl")).text()).trim());
    expect(rawRow).toMatchObject({ exitCode: 0, runStatus: "adapter-crashed" });
  });

  test("executePlan orchestrates one artifact repair and persists split runtime cost", async () => {
    const { packageDir, lockPath } = await createExecutableArtifactPackage();
    const rootDir = await mkdtemp(join(tmpdir(), "skill-ir-artifact-execute-"));
    tempDirs.push(rootDir);
    const outDir = join(rootDir, "out");
    const runDir = join(rootDir, "case", "ir-artifact-dev", "run-1");
    const workDir = join(runDir, "workdir");
    const taskPath = join(runDir, "task", "task.json");
    const skillPath = join(runDir, "skill", "SKILL.md");
    await Promise.all([
      mkdir(outDir, { recursive: true }),
      mkdir(dirname(taskPath), { recursive: true }),
      mkdir(dirname(skillPath), { recursive: true }),
    ]);
    await writeJson(taskPath, {
      id: "env-manager-node-audit-dev-001-clean",
      name: "Artifact generation",
      category: "skill-ir",
      gradingType: "automated",
      prompt: "Generate declared artifacts.",
      fixtures: { "fixture.txt": "protected fixture\n" },
      eval: [],
      timeoutMs: 300000,
      maxSteps: 30,
    });
    await writeFile(skillPath, await readFile(join(packageDir, "skill.md")), "utf8");
    const scriptPath = join(rootDir, "fake-agent.ts");
    await writeFile(scriptPath, [
      'import { writeFile } from "node:fs/promises";',
      'import { join } from "node:path";',
      'const workdir = process.argv.find((arg) => arg.startsWith("--workdir="))!.slice(10);',
      'const task = process.argv.find((arg) => arg.startsWith("--task="))!.slice(7);',
      'await writeFile(join(workdir, ".env.example"), "PORT=3000\\n");',
      'await writeFile(join(workdir, ".env.schema.json"), JSON.stringify({ variables: { PORT: { type: "integer", required: true } } }));',
      'if (task.includes("artifact-repair-task")) {',
      '  await writeFile(join(workdir, "env-report.json"), JSON.stringify({ definedAndUsed: ["PORT"], definedUnconfirmedUnused: [], usedUndefined: [], hardcodedSecrets: [], exposureRisks: [] }));',
      '  console.log("Tokens: in=7 out=3\\nFinal output:\\nrepaired");',
      '} else {',
      '  await writeFile(join(workdir, "env-report.json"), JSON.stringify({ definedAndUsed: ["PORT"] }));',
      '  console.log("Tokens: in=10 out=5\\nFinal output:\\ngenerated");',
      '}',
    ].join("\n"), "utf8");
    const provenance = JSON.parse(await readFile(join(packageDir, "package-provenance.json"), "utf8")) as {
      taskContract: { sha256: string };
    };
    const plan: RealAgentRunPlanEntry[] = [{
      caseId: "env-manager:skvm:windows:clean:env-manager-node-audit-dev-001",
      system: "ir-artifact-dev",
      taskPath,
      skillPath,
      workDir,
      model: "xty/gpt-4.1-mini",
      modelFamily: "gpt",
      adapter: "bare-agent",
      adapterVersion: "workspace-executable-artifact-v1",
      runIndex: 1,
      panelConfigId: "env-manager-executable-artifact-v1-one-repair",
      command: [process.execPath, scriptPath, `--task=${taskPath}`, `--workdir=${workDir}`],
      artifactPackageDir: packageDir,
      artifactRepairMode: "one-repair",
      artifactContractDigest: provenance.taskContract.sha256,
      artifactScope: {
        skillId: "env-manager",
        taskId: "env-manager-node-audit-dev-001",
        taskSplit: "development",
        model: "xty/gpt-4.1-mini",
        modelFamily: "gpt",
        adapter: "bare-agent",
        adapterVersion: "workspace-executable-artifact-v1",
        environment: "windows",
        context: "clean",
      },
    }];

    await executePlan(plan, {
      corpus: "pilot",
      model: "xty/gpt-4.1-mini",
      adapter: "bare-agent",
      outDir,
      limit: 1,
      execute: true,
      retries: 0,
      retryDelayMs: 0,
      rootDir,
      allowArtifactDevelopmentReplay: true,
      artifactPackageDir: packageDir,
      artifactRepairMode: "one-repair",
    });

    const rawRow = JSON.parse((await readFile(join(outDir, "raw-runs.jsonl"), "utf8")).trim());
    expect(rawRow.stdout).toContain("Final output:\nrepaired");
    expect(rawRow.artifactRuntime).toMatchObject({
      mode: "one-repair",
      status: "complete",
      initialValidation: { status: "fail" },
      finalValidation: { status: "pass" },
      repairAttempted: true,
      repairedToPass: true,
      generationUsage: { inputTokens: 10, outputTokens: 5, tokenCost: 15 },
      repairUsage: { inputTokens: 7, outputTokens: 3, tokenCost: 10 },
      aggregateUsage: { inputTokens: 17, outputTokens: 8, tokenCost: 25 },
      preRepairSnapshot: { phase: "pre-repair" },
      postRepairSnapshot: { phase: "post-repair" },
    });
    expect(rawRow.artifactRuntime.generationIdentity).toMatch(/^[0-9a-f]{64}$/);
    expect(rawRow.artifactRuntime.preRepairSnapshot.generationIdentity)
      .toBe(rawRow.artifactRuntime.generationIdentity);
    expect(rawRow.artifactRuntime.postRepairSnapshot.generationIdentity)
      .toBe(rawRow.artifactRuntime.generationIdentity);
    expect(await readFile(join(rawRow.artifactRuntime.preRepairSnapshot.path, "env-report.json"), "utf8"))
      .toBe('{"definedAndUsed":["PORT"]}');
    expect(await readFile(join(rawRow.artifactRuntime.postRepairSnapshot.path, "env-report.json"), "utf8"))
      .toContain('"exposureRisks":[]');
    expect(await readFile(join(workDir, "fixture.txt"), "utf8")).toBe("protected fixture\n");
  });

  test("parseRealAgentRunArgs requires an explicit corpus", () => {
    expect(() => parseRealAgentRunArgs([])).toThrow("--corpus is required");
  });

  test("parseRealAgentRunArgs parses explicit run identity and repetitions", () => {
    const parsed = parseRealAgentRunArgs([
      "--corpus=calibration",
      "--model=xty/gpt-4.1-mini",
      "--model-family=gpt",
      "--adapter=bare-agent",
      "--adapter-version=workspace-2026-07-15",
      "--panel-config-id=env-manager-calibration-v1",
      "--repetitions=3",
    ]);

    expect(parsed).toMatchObject({
      model: "xty/gpt-4.1-mini",
      modelFamily: "gpt",
      adapter: "bare-agent",
      adapterVersion: "workspace-2026-07-15",
      panelConfigId: "env-manager-calibration-v1",
      repetitions: 3,
    });
  });

  test("parseRealAgentRunArgs recognizes the explicit tasks-authored calibration selector", () => {
    const parsed = parseRealAgentRunArgs([
      "--corpus=pilot",
      "--allow-tasks-authored",
      "--skills=env-manager",
      "--systems=no-skill,original",
      "--contexts=clean",
      "--tasks=env-dev-1,env-dev-2",
    ]);

    expect(parsed.allowTasksAuthored).toBe(true);
    expect(parsed.skills).toEqual(new Set(["env-manager"]));
  });

  test("parseRealAgentRunArgs recognizes the explicit development replay selector", () => {
    const parsed = parseRealAgentRunArgs([
      "--corpus=pilot",
      "--allow-development-replay",
      "--skills=env-manager",
      "--systems=ir-pgo-dev",
      "--contexts=clean",
      "--tasks=env-dev-1,env-dev-2",
      "--ir-override-dir=results/final-ir",
    ]);

    expect(parsed.allowDevelopmentReplay).toBe(true);
    expect(parsed.systems).toEqual(new Set(["ir-pgo-dev"]));
  });

  test("parseRealAgentRunArgs recognizes explicit executable artifact development options", () => {
    const parsed = parseRealAgentRunArgs([
      "--corpus=pilot",
      "--allow-artifact-development-replay",
      "--artifact-package-dir=benchmarks/skill-ir/pilots/env-manager/packages/executable-artifact-v1",
      "--artifact-lock=benchmarks/skill-ir/pilots/env-manager/env-manager-executable-artifact-v1-lock.json",
      "--artifact-repair-mode=one-repair",
      "--skills=env-manager",
      "--systems=ir-artifact-dev",
      "--contexts=clean",
      "--tasks=env-dev-1",
    ]);

    expect(parsed.allowArtifactDevelopmentReplay).toBe(true);
    expect(parsed.artifactPackageDir).toContain("executable-artifact-v1");
    expect(parsed.artifactLockPath).toContain("executable-artifact-v1-lock.json");
    expect(parsed.artifactRepairMode).toBe("one-repair");
    expect(parsed.systems).toEqual(new Set(["ir-artifact-dev"]));
  });

  test("parseRealAgentRunArgs rejects unknown artifact repair modes", () => {
    expect(() => parseRealAgentRunArgs([
      "--corpus=pilot",
      "--artifact-repair-mode=unbounded",
    ])).toThrow("--artifact-repair-mode");
  });

  test("parseRealAgentRunArgs infers model family and applies identity defaults", () => {
    const parsed = parseRealAgentRunArgs(["--corpus=calibration", "--model=xty/gemini-2.5-flash"]);

    expect(parsed).toMatchObject({
      modelFamily: "gemini",
      adapterVersion: "workspace",
      panelConfigId: "single-run",
      repetitions: 1,
    });
  });

  test("parseRealAgentRunArgs rejects invalid repetition counts", () => {
    for (const repetitions of ["0", "-1", "1.5", "abc"]) {
      expect(() => parseRealAgentRunArgs(["--corpus=calibration", `--repetitions=${repetitions}`])).toThrow(
        "--repetitions must be a positive integer",
      );
    }
  });

  for (const flag of ["--model", "--model-family", "--adapter", "--adapter-version", "--panel-config-id"]) {
    for (const [label, value] of [
      ["empty", ""],
      ["whitespace", "   "],
    ] as const) {
      test(`parseRealAgentRunArgs rejects ${label} ${flag} values`, () => {
        expect(() => parseRealAgentRunArgs(["--corpus=calibration", `${flag}=${value}`])).toThrow(
          `${flag} must be a non-empty value`,
        );
      });
    }
  }

  test("parseRealAgentRunArgs rejects an empty model in execute mode", () => {
    expect(() => parseRealAgentRunArgs(["--corpus=calibration", "--execute", "--model="])).toThrow(
      "--model must be a non-empty value",
    );
  });

  test("buildPlan materializes each skill with its own IR and task file", async () => {
    const rootDir = await createMultiSkillRoot();
    const args: RealAgentRunArgs = {
      model: "test/model",
      adapter: "bare-agent",
      ...defaultRunIdentityArgs,
      outDir: join(rootDir, "out"),
      limit: 10,
      execute: false,
      retries: 0,
      retryDelayMs: 1000,
      rootDir,
      corpus: "calibration",
      systems: new Set(["original"]),
      contexts: new Set(["clean"]),
    };

    const plan = await buildPlan(args);

    expect(plan.map((entry) => entry.caseId)).toContain("skill-review:skvm:linux:clean:review-task");
    expect(plan.map((entry) => entry.caseId)).toContain("skill-diagnostic:skvm:linux:clean:diagnostic-task");
    expect(plan.every((entry) => !entry.caseId.includes("skill-review:skvm:linux:clean:diagnostic-task"))).toBe(true);
    expect(plan.every((entry) => !entry.caseId.includes("skill-diagnostic:skvm:linux:clean:review-task"))).toBe(true);
    expect(plan.find((entry) => entry.caseId.startsWith("skill-review:"))).toMatchObject({
      skillProvenance: "real-public",
      evidenceWeight: "main-real",
    });
    expect(plan.find((entry) => entry.caseId.startsWith("skill-diagnostic:"))).toMatchObject({
      skillProvenance: "adapted-public",
      evidenceWeight: "support-real",
    });

    const skillTexts = await Promise.all(plan.map((entry) => Bun.file(entry.skillPath!).text()));
    expect(skillTexts.some((text) => text.includes("Review source text."))).toBe(true);
    expect(skillTexts.some((text) => text.includes("Diagnostic source text."))).toBe(true);
  });

  test("buildPlan materializes a paired development calibration from a runtime source envelope", async () => {
    const rootDir = await createTasksAuthoredPilotRoot();
    const args: RealAgentRunArgs = {
      model: "test/model",
      adapter: "bare-agent",
      ...defaultRunIdentityArgs,
      outDir: join(rootDir, "out"),
      limit: 4,
      execute: false,
      retries: 0,
      retryDelayMs: 1000,
      rootDir,
      corpus: "pilot",
      allowTasksAuthored: true,
      skills: new Set(["env-manager"]),
      systems: new Set(["no-skill", "original"]),
      contexts: new Set(["clean"]),
      agents: new Set(["skvm"]),
      environments: new Set(["windows"]),
      tasks: new Set(["env-dev-1", "env-dev-2"]),
    };

    const plan = await buildPlan(args);

    expect(plan).toHaveLength(4);
    expect(plan.map((entry) => entry.system)).toEqual(["no-skill", "original", "no-skill", "original"]);
    expect(plan.filter((entry) => entry.system === "no-skill").every((entry) => entry.skillPath === undefined)).toBe(true);
    const originalRows = plan.filter((entry) => entry.system === "original");
    expect(originalRows).toHaveLength(2);
    expect(await Bun.file(originalRows[0]!.skillPath!).text()).toBe(
      "# Environment Variable Manager\n\nAudit environment variables without leaking secrets.\n",
    );
  });

  test("buildPlan rejects every path that would turn pre-IR calibration into a general status bypass", async () => {
    const rootDir = await createTasksAuthoredPilotRoot();
    const valid: RealAgentRunArgs = {
      model: "test/model",
      adapter: "bare-agent",
      ...defaultRunIdentityArgs,
      outDir: join(rootDir, "out"),
      limit: 4,
      execute: false,
      retries: 0,
      retryDelayMs: 1000,
      rootDir,
      corpus: "pilot",
      allowTasksAuthored: true,
      skills: new Set(["env-manager"]),
      systems: new Set(["no-skill", "original"]),
      contexts: new Set(["clean"]),
      agents: new Set(["skvm"]),
      environments: new Set(["windows"]),
      tasks: new Set(["env-dev-1", "env-dev-2"]),
    };
    const invalidCases: [string, RealAgentRunArgs][] = [
      ["--corpus=pilot", { ...valid, corpus: "calibration" }],
      ["exactly one explicit --skills", { ...valid, skills: undefined }],
      ["exactly one explicit --skills", { ...valid, skills: new Set(["env-manager", "other"]) }],
      ["exactly no-skill,original", { ...valid, systems: new Set(["original"]) }],
      ["exactly no-skill,original", { ...valid, systems: new Set(["no-skill", "original", "ir-static"]) }],
      ["--contexts=clean", { ...valid, contexts: new Set(["noisy"]) }],
      ["explicit development --tasks", { ...valid, tasks: undefined }],
      ["development tasks", { ...valid, tasks: new Set(["env-dev-1", "env-heldout-1"]) }],
      ["does not accept --ir-override-dir", { ...valid, irOverrideDir: "profiled" }],
      ["complete no-skill/original pairs", { ...valid, limit: 1 }],
    ];

    for (const [message, args] of invalidCases) {
      expect(buildPlan(args)).rejects.toThrow(message);
    }
  });

  test("buildPlan rejects tasks-authored source metadata that does not match the source file", async () => {
    const rootDir = await createTasksAuthoredPilotRoot();
    await writeFile(
      join(rootDir, "benchmarks/skill-ir/pilots/env-manager/source/SKILL.md"),
      "# Tampered after intake\n",
      "utf8",
    );

    expect(buildPlan({
      model: "test/model",
      adapter: "bare-agent",
      ...defaultRunIdentityArgs,
      outDir: join(rootDir, "out"),
      limit: 2,
      execute: false,
      retries: 0,
      retryDelayMs: 1000,
      rootDir,
      corpus: "pilot",
      allowTasksAuthored: true,
      skills: new Set(["env-manager"]),
      systems: new Set(["no-skill", "original"]),
      contexts: new Set(["clean"]),
      tasks: new Set(["env-dev-1"]),
    })).rejects.toThrow("Skill source digest mismatch");
  });

  test("buildPlan repeats limited matrix rows with complete identity and distinct artifact paths", async () => {
    const rootDir = await createMultiSkillRoot();
    const args: RealAgentRunArgs = {
      model: "xty/gpt-4.1-mini",
      modelFamily: "gpt",
      adapter: "bare-agent",
      adapterVersion: "workspace-2026-07-15",
      repetitions: 3,
      panelConfigId: "env-manager-calibration-v1",
      outDir: join(rootDir, "out"),
      limit: 1,
      execute: false,
      retries: 0,
      retryDelayMs: 1000,
      rootDir,
      corpus: "calibration",
      systems: new Set(["original"]),
      contexts: new Set(["clean"]),
    };

    const plan = await buildPlan(args);

    expect(plan).toHaveLength(3);
    expect(plan.map((entry) => entry.caseId)).toEqual([
      "skill-review:skvm:linux:clean:review-task",
      "skill-review:skvm:linux:clean:review-task",
      "skill-review:skvm:linux:clean:review-task",
    ]);
    expect(plan.map((entry) => entry.runIndex)).toEqual([1, 2, 3]);
    expect(
      plan.map(({ model, modelFamily, adapter, adapterVersion, panelConfigId }) => ({
        model,
        modelFamily,
        adapter,
        adapterVersion,
        panelConfigId,
      })),
    ).toEqual(
      Array.from({ length: 3 }, () => ({
        model: "xty/gpt-4.1-mini",
        modelFamily: "gpt",
        adapter: "bare-agent",
        adapterVersion: "workspace-2026-07-15",
        panelConfigId: "env-manager-calibration-v1",
      })),
    );
    expect(new Set(plan.map((entry) => entry.taskPath)).size).toBe(3);
    expect(plan.map((entry) => entry.taskPath)).toEqual([
      expect.stringContaining(join("original", "run-1", "task", "task.json")),
      expect.stringContaining(join("original", "run-2", "task", "task.json")),
      expect.stringContaining(join("original", "run-3", "task", "task.json")),
    ]);
    expect(plan.every((entry) => entry.skillPath !== undefined)).toBe(true);
    expect(new Set(plan.map((entry) => entry.skillPath)).size).toBe(3);
    expect(plan.map((entry) => entry.skillPath)).toEqual([
      expect.stringContaining(join("original", "run-1", "skill", "SKILL.md")),
      expect.stringContaining(join("original", "run-2", "skill", "SKILL.md")),
      expect.stringContaining(join("original", "run-3", "skill", "SKILL.md")),
    ]);
    expect(new Set(plan.map((entry) => entry.workDir)).size).toBe(3);
    expect(plan.map((entry) => entry.workDir)).toEqual([
      expect.stringContaining(join("original", "run-1", "workdir")),
      expect.stringContaining(join("original", "run-2", "workdir")),
      expect.stringContaining(join("original", "run-3", "workdir")),
    ]);
    expect((await Promise.all(plan.map(async (entry) => (await stat(entry.workDir)).isDirectory()))).every(Boolean)).toBe(
      true,
    );
    expect(plan.every((entry) => entry.command.includes(`--workdir=${entry.workDir}`))).toBe(true);
  });

  test("buildPlan can narrow runs by agent, environment, and task id", async () => {
    const rootDir = await createMultiSkillRoot();
    const args: RealAgentRunArgs = {
      model: "test/model",
      adapter: "bare-agent",
      ...defaultRunIdentityArgs,
      outDir: join(rootDir, "out"),
      limit: 10,
      execute: false,
      retries: 0,
      retryDelayMs: 1000,
      rootDir,
      corpus: "calibration",
      systems: new Set(["original", "ir-profile"]),
      contexts: new Set(["clean"]),
      agents: new Set(["codex"]),
      environments: new Set(["windows"]),
      tasks: new Set(["diagnostic-task"]),
    };

    const plan = await buildPlan(args);

    expect(plan.map((entry) => entry.caseId)).toEqual([
      "skill-diagnostic:codex:windows:clean:diagnostic-task",
      "skill-diagnostic:codex:windows:clean:diagnostic-task",
    ]);
    expect(plan.map((entry) => entry.system)).toEqual(["original", "ir-profile"]);
  });

  test("buildPlan materializes only explicit development artifact runs with package identity", async () => {
    const { packageDir, lockPath } = await createExecutableArtifactPackage();
    const outDir = await mkdtemp(join(tmpdir(), "skill-ir-artifact-plan-"));
    tempDirs.push(outDir);
    const args: RealAgentRunArgs = {
      corpus: "pilot",
      model: "xty/gpt-4.1-mini",
      modelFamily: "gpt",
      adapter: "bare-agent",
      adapterVersion: "workspace-executable-artifact-v1",
      repetitions: 2,
      panelConfigId: "env-manager-executable-artifact-v1-check-only",
      outDir,
      limit: 2,
      execute: false,
      retries: 0,
      retryDelayMs: 0,
      rootDir: projectRoot,
      allowArtifactDevelopmentReplay: true,
      artifactPackageDir: packageDir,
      artifactLockPath: lockPath,
      artifactRepairMode: "check-only",
      skills: new Set(["env-manager"]),
      systems: new Set(["ir-artifact-dev"]),
      contexts: new Set(["clean"]),
      agents: new Set(["skvm"]),
      environments: new Set(["windows"]),
      tasks: new Set([
        "env-manager-node-audit-dev-001",
        "env-manager-vite-audit-dev-002",
      ]),
    };

    const plan = await buildPlan(args);

    expect(plan).toHaveLength(4);
    expect(plan.every((entry) => entry.system === "ir-artifact-dev")).toBe(true);
    expect(plan.every((entry) => entry.artifactPackageDir === packageDir)).toBe(true);
    expect(plan.every((entry) => entry.artifactRepairMode === "check-only")).toBe(true);
    expect(plan.map((entry) => entry.artifactScope?.taskSplit)).toEqual([
      "development",
      "development",
      "development",
      "development",
    ]);
    expect(await readFile(plan[0]!.skillPath!, "utf8")).toContain("## Executable Artifacts");
  });

  test("buildPlan rejects every path that broadens artifact development replay", async () => {
    const { packageDir, lockPath } = await createExecutableArtifactPackage();
    const outDir = await mkdtemp(join(tmpdir(), "skill-ir-artifact-guards-"));
    tempDirs.push(outDir);
    const valid: RealAgentRunArgs = {
      corpus: "pilot",
      model: "xty/gpt-4.1-mini",
      modelFamily: "gpt",
      adapter: "bare-agent",
      adapterVersion: "workspace-executable-artifact-v1",
      repetitions: 2,
      panelConfigId: "env-manager-executable-artifact-v1-check-only",
      outDir,
      limit: 2,
      execute: false,
      retries: 0,
      retryDelayMs: 0,
      rootDir: projectRoot,
      allowArtifactDevelopmentReplay: true,
      artifactPackageDir: packageDir,
      artifactLockPath: lockPath,
      artifactRepairMode: "check-only",
      skills: new Set(["env-manager"]),
      systems: new Set(["ir-artifact-dev"]),
      contexts: new Set(["clean"]),
      agents: new Set(["skvm"]),
      environments: new Set(["windows"]),
      tasks: new Set(["env-manager-node-audit-dev-001", "env-manager-vite-audit-dev-002"]),
    };
    const invalid: Array<[string, RealAgentRunArgs]> = [
      ["requires --allow-artifact-development-replay", { ...valid, allowArtifactDevelopmentReplay: false }],
      ["--corpus=pilot", { ...valid, corpus: "calibration" }],
      ["exactly one", { ...valid, skills: new Set(["env-manager", "other"]) }],
      ["exactly ir-artifact-dev", { ...valid, systems: new Set(["ir-static"]) }],
      ["--contexts=clean", { ...valid, contexts: new Set(["noisy"]) }],
      ["development --tasks", { ...valid, tasks: undefined }],
      ["--artifact-package-dir", { ...valid, artifactPackageDir: undefined }],
      ["--artifact-lock", { ...valid, artifactLockPath: undefined }],
      ["--artifact-repair-mode", { ...valid, artifactRepairMode: undefined }],
      ["--ir-override-dir", { ...valid, irOverrideDir: "other" }],
      ["cannot be combined", { ...valid, allowDevelopmentReplay: true }],
    ];
    for (const [message, args] of invalid) {
      await expect(buildPlan(args)).rejects.toThrow(message);
    }

    const lock = JSON.parse(await readFile(lockPath, "utf8")) as { package: { manifestSha256: string } };
    lock.package.manifestSha256 = "0".repeat(64);
    await writeJson(lockPath, lock);
    await expect(buildPlan(valid)).rejects.toThrow("lock package manifest digest mismatch");
  });

  test("plans explicit v2 development rows only with a matching temporary semantic lock", async () => {
    const { packageDir, lockPath } = await createSemanticArtifactPackage();
    const outDir = await mkdtemp(join(tmpdir(), "skill-ir-semantic-artifact-plan-"));
    tempDirs.push(outDir);
    const valid: RealAgentRunArgs = {
      corpus: "pilot",
      model: "xty/gpt-4.1-mini",
      modelFamily: "gpt",
      adapter: "bare-agent",
      adapterVersion: "workspace-semantic-artifact-v2-test",
      repetitions: 1,
      panelConfigId: "env-manager-semantic-artifact-v2-test-only",
      outDir,
      limit: 2,
      execute: false,
      retries: 0,
      retryDelayMs: 0,
      rootDir: projectRoot,
      allowArtifactDevelopmentReplay: true,
      artifactPackageDir: packageDir,
      artifactLockPath: lockPath,
      artifactRepairMode: "one-repair",
      skills: new Set(["env-manager"]),
      systems: new Set(["ir-artifact-dev"]),
      contexts: new Set(["clean"]),
      agents: new Set(["skvm"]),
      environments: new Set(["windows"]),
      tasks: new Set(["env-manager-node-audit-dev-001", "env-manager-vite-audit-dev-002"]),
    };

    const plan = await buildPlan(valid);
    expect(plan).toHaveLength(2);
    expect(plan.every((entry) => entry.artifactPackageDir === packageDir)).toBe(true);
    expect(plan.every((entry) => entry.artifactRepairMode === "one-repair")).toBe(true);
    expect(await readFile(plan[0]!.skillPath!, "utf8")).toContain("## Executable Semantic Artifact");

    const v1 = await createExecutableArtifactPackage();
    await expect(buildPlan({ ...valid, artifactLockPath: v1.lockPath })).rejects.toThrow(/lock|catalog|schema/i);
    await expect(buildPlan({
      ...valid,
      tasks: new Set(["env-manager-python-audit-heldout-001"]),
    })).rejects.toThrow(/development|lock|task/i);
  });

  test("plans V3 shared-generation rows only through the frozen public-contract lock", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "skill-ir-public-contract-plan-"));
    tempDirs.push(outDir);
    const valid: RealAgentRunArgs = {
      corpus: "pilot",
      model: "xty/gpt-5.6-sol",
      modelFamily: "gpt",
      adapter: "bare-agent",
      adapterVersion: "workspace-public-contract-v3",
      repetitions: 2,
      panelConfigId: "env-manager-public-contract-artifact-v3-development",
      outDir,
      limit: 4,
      execute: false,
      retries: 0,
      retryDelayMs: 0,
      rootDir: projectRoot,
      allowArtifactDevelopmentReplay: true,
      artifactPackageDir: join(
        projectRoot,
        "benchmarks/skill-ir/pilots/env-manager/packages/executable-public-contract-artifact-v3",
      ),
      artifactLockPath: join(
        projectRoot,
        "benchmarks/skill-ir/pilots/env-manager/env-manager-public-contract-artifact-v3-lock.json",
      ),
      artifactRepairMode: "one-repair",
      skills: new Set(["env-manager"]),
      systems: new Set(["ir-public-artifact-dev"]),
      contexts: new Set(["clean"]),
      agents: new Set(["skvm"]),
      environments: new Set(["windows"]),
      tasks: new Set(["env-manager-node-audit-dev-001", "env-manager-vite-audit-dev-002"]),
    };

    const plan = await buildPlan(valid);
    expect(plan).toHaveLength(4);
    expect(plan.every((entry) => entry.system === "ir-public-artifact-dev")).toBe(true);
    expect(plan.every((entry) => entry.artifactRepairMode === "one-repair")).toBe(true);
    expect(await readFile(plan[0]!.skillPath!, "utf8")).toContain("Executable Public Contract Artifact");

    await expect(buildPlan({ ...valid, artifactRepairMode: "check-only" }))
      .rejects.toThrow("requires one-repair execution");
    await expect(buildPlan({ ...valid, systems: new Set(["ir-artifact-dev"]) }))
      .rejects.toThrow("requires system ir-public-artifact-dev");
  });

  test("plans V4 deterministic-first rows only through the contract-repair system and lock", async () => {
    const { packageDir, lockPath } = await createContractRepairArtifactPackage();
    const outDir = await mkdtemp(join(tmpdir(), "skill-ir-contract-repair-plan-"));
    tempDirs.push(outDir);
    const valid: RealAgentRunArgs = {
      corpus: "pilot",
      model: "xty/gpt-5.6-sol",
      modelFamily: "gpt",
      adapter: "bare-agent",
      adapterVersion: "workspace-contract-repair-v4",
      repetitions: 2,
      panelConfigId: "env-manager-contract-repair-v4-development",
      outDir,
      limit: 4,
      execute: false,
      retries: 0,
      retryDelayMs: 1,
      rootDir: projectRoot,
      allowArtifactDevelopmentReplay: true,
      artifactPackageDir: packageDir,
      artifactLockPath: lockPath,
      artifactRepairMode: "one-repair",
      skills: new Set(["env-manager"]),
      systems: new Set(["ir-contract-artifact-dev"]),
      contexts: new Set(["clean"]),
      agents: new Set(["skvm"]),
      environments: new Set(["windows"]),
      tasks: new Set(["env-manager-node-audit-dev-001", "env-manager-vite-audit-dev-002"]),
    };

    const plan = await buildPlan(valid);
    expect(plan).toHaveLength(4);
    expect(plan.every((entry) => entry.system === "ir-contract-artifact-dev")).toBe(true);
    expect(plan.every((entry) => entry.artifactRepairMode === "one-repair")).toBe(true);
    expect(await readFile(plan[0]!.skillPath!, "utf8")).toContain("Deterministic Contract Repair");
    await expect(buildPlan({ ...valid, systems: new Set(["ir-public-artifact-dev"]) }))
      .rejects.toThrow("requires system ir-contract-artifact-dev");
    await expect(buildPlan({ ...valid, artifactRepairMode: "check-only" }))
      .rejects.toThrow("requires one-repair execution");
    await expect(buildPlan({ ...valid, panelConfigId: "different-panel" }))
      .rejects.toThrow("panel identity mismatch");
  });

  test("buildPlan rejects a final IR directory without provenance", async () => {
    const rootDir = await createMultiSkillRoot();
    await writeJson(join(rootDir, "benchmarks/skill-ir/tasks/review.json"), {
      schemaVersion: "skill-ir-tasks/v1",
      skillId: "skill-review",
      tasks: [{ id: "review-task", split: "held-out", prompt: "Review task prompt.", successCriteria: [] }],
    });
    const overrideDir = join(rootDir, "profiled-ir");
    await writeJson(
      join(overrideDir, "skill-review.json"),
      irFixture("skill-review", "Profiled Review Skill", "Profiled review source text."),
    );
    await writeJson(
      join(overrideDir, "skill-diagnostic.json"),
      irFixture("skill-diagnostic", "Profiled Diagnostic Skill", "Profiled diagnostic source text."),
    );

    const args: RealAgentRunArgs = {
      model: "test/model",
      adapter: "bare-agent",
      ...defaultRunIdentityArgs,
      outDir: join(rootDir, "out"),
      limit: 1,
      execute: false,
      retries: 0,
      retryDelayMs: 1000,
      rootDir,
      corpus: "calibration",
      irOverrideDir: overrideDir,
      systems: new Set(["ir-pgo"]),
      contexts: new Set(["clean"]),
      tasks: new Set(["review-task"]),
    };

    expect(buildPlan(args)).rejects.toThrow("provenance.json");
  });

  test("buildPlan accepts untampered development-derived Final IR only on held-out tasks", async () => {
    const rootDir = await createMultiSkillRoot();
    await writeJson(join(rootDir, "benchmarks/skill-ir/tasks/review.json"), {
      schemaVersion: "skill-ir-tasks/v1",
      skillId: "skill-review",
      tasks: [{ id: "review-task", split: "held-out", prompt: "Review task prompt.", successCriteria: [] }],
    });

    const artifactRoot = join(rootDir, "profiled-ir");
    const finalIRDir = join(artifactRoot, "final-ir");
    const finalReview = irFixture("skill-review", "Profiled Review Skill", "Profiled review source text.");
    await writeJson(join(artifactRoot, "overlay/skill-review.json"), { annotations: [] });
    await writeJson(join(finalIRDir, "skill-review.json"), finalReview);
    await writeJson(
      join(finalIRDir, "skill-diagnostic.json"),
      irFixture("skill-diagnostic", "Profiled Diagnostic Skill", "Profiled diagnostic source text."),
    );
    const resultsPath = join(rootDir, "results/development.jsonl");
    await mkdir(dirname(resultsPath), { recursive: true });
    await writeFile(
      resultsPath,
      `${JSON.stringify({ taskSplit: "development", system: "original" })}\n`,
      "utf8",
    );
    const baseIRPath = join(rootDir, "benchmarks/skill-ir/ir/review.json");
    const manifestPath = join(rootDir, "benchmarks/skill-ir/corpus/corpora/calibration.json");
    const provenance = await buildFinalIRProvenance({
      rootDir,
      artifactRoot,
      corpus: "calibration",
      manifestPath,
      resultsPath,
      skills: [
        {
          skillId: "skill-review",
          sourceSha256: sha256Bytes(Buffer.from("Review source text.", "utf8")),
          baseIRPath,
          annotationCount: 1,
        },
      ],
    });
    await writeJson(join(artifactRoot, "provenance.json"), provenance);

    const args: RealAgentRunArgs = {
      model: "test/model",
      adapter: "bare-agent",
      ...defaultRunIdentityArgs,
      outDir: join(rootDir, "out"),
      limit: 3,
      execute: false,
      retries: 0,
      retryDelayMs: 1000,
      rootDir,
      corpus: "calibration",
      irOverrideDir: finalIRDir,
      systems: new Set(["original", "ir-static", "ir-pgo"]),
      contexts: new Set(["clean"]),
      tasks: new Set(["review-task"]),
    };

    const plan = await buildPlan(args);
    expect(plan).toHaveLength(3);
    const textBySystem = new Map(
      await Promise.all(plan.map(async (entry) => [entry.system, await Bun.file(entry.skillPath!).text()] as const)),
    );
    expect(textBySystem.get("original")).toBe("Review source text.");
    expect(textBySystem.get("ir-static")).toContain("# Review Skill");
    expect(textBySystem.get("ir-static")).not.toContain("Profiled Review Skill");
    expect(textBySystem.get("ir-pgo")).toContain("Profiled Review Skill");

    await writeJson(join(finalIRDir, "skill-review.json"), {
      ...finalReview,
      intent: "Tampered after validation.",
    });
    expect(buildPlan(args)).rejects.toThrow("final IR digest mismatch");
  });

  test("buildPlan rejects ir-pgo when no development-derived IR override is provided", async () => {
    const rootDir = await createMultiSkillRoot();
    const args: RealAgentRunArgs = {
      model: "test/model",
      adapter: "bare-agent",
      ...defaultRunIdentityArgs,
      outDir: join(rootDir, "out"),
      limit: 1,
      execute: false,
      retries: 0,
      retryDelayMs: 1000,
      rootDir,
      corpus: "calibration",
      systems: new Set(["ir-pgo"]),
      contexts: new Set(["clean"]),
    };

    expect(buildPlan(args)).rejects.toThrow("ir-pgo requires --ir-override-dir");
  });

  test("assertRequiredEnv fails before execution when a required env var is blank", () => {
    expect(() =>
      assertRequiredEnv(
        {
          model: "test/model",
          adapter: "bare-agent",
          ...defaultRunIdentityArgs,
          outDir: "out",
          limit: 1,
          execute: true,
          retries: 0,
          retryDelayMs: 1000,
          rootDir: ".",
          corpus: "calibration",
          requireEnv: new Set(["SKVM_XTY_API_KEY", "SKVM_CACHE"]),
        },
        { SKVM_XTY_API_KEY: "", SKVM_CACHE: "cache" },
      ),
    ).toThrow("Missing required environment variable(s): SKVM_XTY_API_KEY");
  });
});
