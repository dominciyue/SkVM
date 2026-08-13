import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { SkillIRSchema } from "../../skill-ir/schema";
import type { ScoredAgentRunRow } from "./scoring";
import {
  buildDualSourceFeedbackArtifacts,
  buildDualSourceFeedbackArtifactsV2,
  parseDualSourceFeedbackArgs,
  runDualSourceFeedbackCompiler,
  runDualSourceFeedbackCompilerV2,
} from "./dual-source-feedback-run";
import { FinalIRProvenanceSchema } from "./final-ir-provenance";
import { sha256Bytes } from "./source-fixture";
import { buildPlan, type RealAgentRunArgs } from "./real-agent-run";
import { DualSourceRepairEvidenceV2Schema } from "./repair-evidence";

const rootDir = join(import.meta.dir, "../../..");
const resultsPath = join(rootDir, "results/skill-ir/env-manager-static-v1-2026-07-15/scored-results.jsonl");
const baseIRPath = join(rootDir, "benchmarks/skill-ir/pilots/env-manager/base-ir.json");
const tempDirs: string[] = [];

async function readRows(): Promise<ScoredAgentRunRow[]> {
  return (await readFile(resultsPath, "utf8"))
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line) as ScoredAgentRunRow);
}

afterEach(async () => {
  for (const path of tempDirs.splice(0)) {
    await rm(path, { recursive: true, force: true });
  }
});

describe("dual-source feedback compiler", () => {
  test("parses the generic admitted-evidence compiler mode without legacy Env options", () => {
    expect(parseDualSourceFeedbackArgs([
      "--corpus=pilot",
      "--root-dir=D:/repo",
      "--repair-evidence=results/admission.json",
      "--out-dir=results/final-ir",
    ])).toEqual({
      corpus: "pilot",
      rootDir: "D:/repo",
      repairEvidencePath: "results/admission.json",
      outDir: "results/final-ir",
    });
  });

  test("compiles only eligible v2 admission evidence and preserves its directive identity", async () => {
    const baseIR = SkillIRSchema.parse(JSON.parse(await readFile(baseIRPath, "utf8")));
    const evidence = DualSourceRepairEvidenceV2Schema.parse({
      schemaVersion: "skill-ir-repair-evidence/v2" as const,
      policyVersion: "dual-source-residual/v2" as const,
      skillId: "env-manager",
      experimentId: "env-manager-static-v1",
      catalogId: "env-manager-public-residuals",
      catalogScope: "prospective-development" as const,
      repairCatalog: "typed-output-repair/v1" as const,
      sourceSystems: ["original", "ir-static"] as ["original", "ir-static"],
      stability: { minDistinctTasks: 2, minRepetitionsPerTask: 2 },
      bindings: Object.fromEntries([
        "staticLock", "staticGate", "executionEnvelopes", "scoredResults", "baseIR", "sourceAudit", "mappingCatalog",
      ].map((key, index) => [key, { path: `${key}.json`, sha256: String(index + 1).repeat(64) }])),
      admission: { status: "eligible" as const, reasons: [] },
      records: ["node-dev", "vite-dev"].flatMap((taskId) => [1, 2].map((runIndex) => ({
        evidenceId: `e-${taskId}-${runIndex}`, taskId, runIndex, criterionId: "json-schema-contract",
        lineage: "reproduced" as const, repairKind: "json-schema-contract" as const,
        targetRef: "rule-json-schema-contract",
      }))),
      repairs: [{
        id: "repair-json-schema-contract",
        kind: "json-schema-contract" as const,
        targetRef: "rule-json-schema-contract",
        distinctTaskCount: 2,
        observationCount: 4,
        minRepetitionsPerTask: 2,
        taskIds: ["node-dev", "vite-dev"],
        evidenceIds: ["e-node-dev-1", "e-node-dev-2", "e-vite-dev-1", "e-vite-dev-2"],
      }],
      resolvedCriteria: [], regressions: [], unstableCriteria: [], unmappedCriteria: [],
    });

    const artifacts = buildDualSourceFeedbackArtifactsV2(evidence, baseIR, {
      repairCatalog: "typed-output-repair/v1",
    });

    expect(artifacts.overlay.repairs?.[0]?.id).toBe("repair-json-schema-contract");
    expect(artifacts.finalIR.profile).toHaveLength(1);
    expect(artifacts.summary.evidencePolicy).toBe("dual-source-residual/v2");
  });

  test("refuses to compile a typed stop into an overlay", async () => {
    const baseIR = SkillIRSchema.parse(JSON.parse(await readFile(baseIRPath, "utf8")));
    const stopped = DualSourceRepairEvidenceV2Schema.parse({
      schemaVersion: "skill-ir-repair-evidence/v2" as const,
      policyVersion: "dual-source-residual/v2" as const,
      skillId: "env-manager",
      experimentId: "env-manager-static-v1",
      catalogId: "env-manager-public-residuals",
      catalogScope: "prospective-development" as const,
      repairCatalog: "typed-output-repair/v1" as const,
      sourceSystems: ["original", "ir-static"] as ["original", "ir-static"],
      stability: { minDistinctTasks: 2, minRepetitionsPerTask: 2 },
      bindings: Object.fromEntries([
        "staticLock", "staticGate", "executionEnvelopes", "scoredResults", "baseIR", "sourceAudit", "mappingCatalog",
      ].map((key) => [key, { path: `${key}.json`, sha256: "a".repeat(64) }])),
      admission: { status: "no-reproducible-residual" as const, reasons: ["none"] },
      records: [], repairs: [], resolvedCriteria: [], regressions: [], unstableCriteria: [], unmappedCriteria: [],
    });

    expect(() => buildDualSourceFeedbackArtifactsV2(stopped, baseIR)).toThrow("not eligible");
  });

  test("rejects a compiler repair-catalog override that differs from admitted evidence", async () => {
    const baseIR = SkillIRSchema.parse(JSON.parse(await readFile(baseIRPath, "utf8")));
    const eligible = DualSourceRepairEvidenceV2Schema.parse({
      schemaVersion: "skill-ir-repair-evidence/v2" as const,
      policyVersion: "dual-source-residual/v2" as const,
      skillId: "env-manager", experimentId: "env-manager-static-v1", catalogId: "public-residuals",
      catalogScope: "prospective-development" as const, repairCatalog: "typed-output-repair/v1" as const,
      sourceSystems: ["original", "ir-static"] as ["original", "ir-static"],
      stability: { minDistinctTasks: 2, minRepetitionsPerTask: 2 },
      bindings: Object.fromEntries([
        "staticLock", "staticGate", "executionEnvelopes", "scoredResults", "baseIR", "sourceAudit", "mappingCatalog",
      ].map((key) => [key, { path: `${key}.json`, sha256: "a".repeat(64) }])),
      admission: { status: "eligible" as const, reasons: [] }, records: ["one", "two"].flatMap((taskId) => [1, 2].map((runIndex) => ({
        evidenceId: `${taskId}-${runIndex}`, taskId, runIndex, criterionId: "json-schema-contract",
        lineage: "reproduced" as const, repairKind: "json-schema-contract" as const,
        targetRef: "rule-json-schema-contract",
      }))), repairs: [{
        id: "repair-json-schema-contract", kind: "json-schema-contract" as const,
        targetRef: "rule-json-schema-contract", distinctTaskCount: 2, observationCount: 4,
        minRepetitionsPerTask: 2, taskIds: ["one", "two"], evidenceIds: ["one-1", "one-2", "two-1", "two-2"],
      }], resolvedCriteria: [], regressions: [], unstableCriteria: [], unmappedCriteria: [],
    });

    expect(() => buildDualSourceFeedbackArtifactsV2(eligible, baseIR, {
      repairCatalog: "typed-output-repair/v2",
    })).toThrow("repair catalog mismatch");
  });

  test("builds two generic typed repairs from the frozen env-manager residuals", async () => {
    const baseIR = SkillIRSchema.parse(JSON.parse(await readFile(baseIRPath, "utf8")));
    const baseDigest = sha256Bytes(await readFile(baseIRPath));

    const artifacts = buildDualSourceFeedbackArtifacts(await readRows(), baseIR, {
      skillId: "env-manager",
      lineageCatalog: "env-manager/v1",
      minDistinctTasks: 2,
    });

    expect(artifacts.evidence.records).toHaveLength(8);
    expect(artifacts.overlay.repairCatalog).toBe("typed-output-repair/v1");
    expect(artifacts.overlay.repairs?.map((repair) => repair.kind)).toEqual([
      "json-schema-contract",
      "source-qualified-finding",
    ]);
    expect(artifacts.overlay.annotations.map((annotation) => annotation.targetRef)).toEqual([
      "rule-json-schema-contract",
      "rule-source-qualified-findings",
    ]);
    expect(artifacts.finalIR.profile).toHaveLength(2);
    expect(artifacts.finalIR.rules.some((rule) => rule.id === "rule-json-schema-contract")).toBe(true);
    expect(artifacts.finalIR.rules.some((rule) => rule.id === "rule-source-qualified-findings")).toBe(true);
    expect(sha256Bytes(await readFile(baseIRPath))).toBe(baseDigest);

    const serialized = JSON.stringify(artifacts);
    for (const forbidden of ["APP_PORT", "SENDGRID_API_KEY", "src/auth.js", "TEST_ONLY_"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  test("binds repair catalog v2 into the overlay and contract-aware Final IR", async () => {
    const baseIR = SkillIRSchema.parse(JSON.parse(await readFile(baseIRPath, "utf8")));
    const artifacts = buildDualSourceFeedbackArtifacts(await readRows(), baseIR, {
      skillId: "env-manager",
      lineageCatalog: "env-manager/v1",
      minDistinctTasks: 2,
      repairCatalog: "typed-output-repair/v2",
    });

    expect(artifacts.overlay.repairCatalog).toBe("typed-output-repair/v2");
    expect(artifacts.summary.repairCatalog).toBe("typed-output-repair/v2");
    expect(artifacts.finalIR.rules.find((rule) => rule.id === "rule-json-schema-contract")?.normalizedForm)
      .toContain("explicit runtime output contract takes precedence");
  });

  test("writes and development-validates a provenance-v3 package from admitted v2 evidence", async () => {
    const workDir = await mkdtemp(join(rootDir, ".tmp-dual-source-feedback-v2-"));
    tempDirs.push(workDir);
    const bindingPaths = {
      staticLock: join(workDir, "static-lock.json"),
      staticGate: join(workDir, "static-gate.json"),
      executionEnvelopes: join(workDir, "execution-envelopes.jsonl"),
      scoredResults: resultsPath,
      baseIR: baseIRPath,
      sourceAudit: join(workDir, "source-audit.json"),
      mappingCatalog: join(workDir, "mapping-catalog.json"),
    };
    for (const [name, filePath] of Object.entries(bindingPaths)) {
      if (name !== "scoredResults" && name !== "baseIR") await writeFile(filePath, `${name}\n`, "utf8");
    }
    const bindings = Object.fromEntries(await Promise.all(Object.entries(bindingPaths).map(async ([name, filePath]) => [
      name,
      {
        path: relative(rootDir, filePath).replaceAll("\\", "/"),
        sha256: sha256Bytes(await Bun.file(filePath).bytes()),
      },
    ])));
    const evidence = DualSourceRepairEvidenceV2Schema.parse({
      schemaVersion: "skill-ir-repair-evidence/v2",
      policyVersion: "dual-source-residual/v2",
      skillId: "env-manager",
      experimentId: "synthetic-compiler-contract",
      catalogId: "synthetic-public-residuals",
      catalogScope: "prospective-development",
      repairCatalog: "typed-output-repair/v1",
      sourceSystems: ["original", "ir-static"],
      stability: { minDistinctTasks: 2, minRepetitionsPerTask: 2 },
      bindings,
      admission: { status: "eligible", reasons: [] },
      records: ["node-dev", "vite-dev"].flatMap((taskId) => [1, 2].map((runIndex) => ({
        evidenceId: `e-${taskId}-${runIndex}`,
        taskId,
        runIndex,
        criterionId: "json-schema-contract",
        lineage: "reproduced" as const,
        repairKind: "json-schema-contract" as const,
        targetRef: "rule-json-schema-contract",
      }))),
      repairs: [{
        id: "repair-json-schema-contract",
        kind: "json-schema-contract",
        targetRef: "rule-json-schema-contract",
        distinctTaskCount: 2,
        observationCount: 4,
        minRepetitionsPerTask: 2,
        taskIds: ["node-dev", "vite-dev"],
        evidenceIds: ["e-node-dev-1", "e-node-dev-2", "e-vite-dev-1", "e-vite-dev-2"],
      }],
      resolvedCriteria: [], regressions: [], unstableCriteria: [], unmappedCriteria: [],
    });
    const evidencePath = join(workDir, "admission-evidence.json");
    const outDir = join(workDir, "compiled");
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

    await runDualSourceFeedbackCompilerV2({
      corpus: "pilot",
      rootDir,
      repairEvidencePath: evidencePath,
      outDir,
    });

    const provenance = FinalIRProvenanceSchema.parse(JSON.parse(await readFile(join(outDir, "provenance.json"), "utf8")));
    expect(provenance.schemaVersion).toBe("skill-ir-final-provenance/v3");
    expect(JSON.parse(await readFile(join(outDir, "final-ir/env-manager.json"), "utf8")).profile).toHaveLength(1);

    const replayArgs: RealAgentRunArgs = {
      corpus: "pilot", rootDir, model: "test/model", modelFamily: "test", adapter: "bare-agent",
      adapterVersion: "workspace", panelConfigId: "single-run", repetitions: 1,
      outDir: join(workDir, "replay"), limit: 2, execute: false, retries: 0, retryDelayMs: 1000,
      allowDevelopmentReplay: true, irOverrideDir: join(outDir, "final-ir"), skills: new Set(["env-manager"]),
      systems: new Set(["ir-pgo-dev"]), contexts: new Set(["clean"]), agents: new Set(["skvm"]),
      environments: new Set(["windows"]),
      tasks: new Set(["env-manager-node-audit-dev-001", "env-manager-vite-audit-dev-002"]),
    };
    await expect(buildPlan(replayArgs)).resolves.toHaveLength(2);
    await expect(buildPlan({
      ...replayArgs,
      allowDevelopmentReplay: false,
      systems: new Set(["ir-pgo"]),
      tasks: new Set(["env-manager-python-audit-heldout-001"]),
      limit: 1,
    })).rejects.toThrow("development-only");
  });

  test("writes a provenance-v2 artifact package whose digests validate", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "dual-source-feedback-"));
    tempDirs.push(outDir);

    await runDualSourceFeedbackCompiler({
      corpus: "pilot",
      rootDir,
      resultsPath,
      outDir,
      skillId: "env-manager",
      lineageCatalog: "env-manager/v1",
      minDistinctTasks: 2,
    });

    const [evidenceText, overlayText, finalText, provenanceText] = await Promise.all([
      readFile(join(outDir, "repair-evidence.json"), "utf8"),
      readFile(join(outDir, "overlay/env-manager.json"), "utf8"),
      readFile(join(outDir, "final-ir/env-manager.json"), "utf8"),
      readFile(join(outDir, "provenance.json"), "utf8"),
    ]);
    const provenance = FinalIRProvenanceSchema.parse(JSON.parse(provenanceText));

    expect(provenance.schemaVersion).toBe("skill-ir-final-provenance/v2");
    if (provenance.schemaVersion !== "skill-ir-final-provenance/v2") {
      throw new Error("expected provenance v2");
    }
    expect(provenance.repairEvidence.sha256).toBe(sha256Bytes(Buffer.from(evidenceText)));
    expect(provenance.skills[0]?.overlay.sha256).toBe(sha256Bytes(Buffer.from(overlayText)));
    expect(provenance.skills[0]?.finalIR.sha256).toBe(sha256Bytes(Buffer.from(finalText)));
    expect(JSON.parse(finalText).profile).toHaveLength(2);

    const packageText = [evidenceText, overlayText, finalText, provenanceText].join("\n");
    for (const forbidden of ["APP_PORT", "SENDGRID_API_KEY", "src/auth.js", "TEST_ONLY_", '"expected"', '"payload"']) {
      expect(packageText).not.toContain(forbidden);
    }

    const replayArgs: RealAgentRunArgs = {
      corpus: "pilot",
      rootDir,
      model: "xty/gpt-4.1-mini",
      modelFamily: "gpt",
      adapter: "bare-agent",
      adapterVersion: "workspace-dual-overlay-v1",
      panelConfigId: "env-manager-dual-overlay-dev-v1",
      repetitions: 1,
      outDir: join(outDir, "replay"),
      limit: 2,
      execute: false,
      retries: 0,
      retryDelayMs: 1000,
      allowDevelopmentReplay: true,
      irOverrideDir: join(outDir, "final-ir"),
      skills: new Set(["env-manager"]),
      systems: new Set(["ir-pgo-dev"]),
      contexts: new Set(["clean"]),
      agents: new Set(["skvm"]),
      environments: new Set(["windows"]),
      tasks: new Set(["env-manager-node-audit-dev-001", "env-manager-vite-audit-dev-002"]),
    };
    const replayPlan = await buildPlan(replayArgs);
    expect(replayPlan).toHaveLength(2);
    expect(replayPlan.every((entry) => entry.system === "ir-pgo-dev")).toBe(true);
    expect(await readFile(replayPlan[0]!.skillPath!, "utf8")).toContain("rule-json-schema-contract");

    await expect(buildPlan({ ...replayArgs, allowDevelopmentReplay: false })).rejects.toThrow(
      "--allow-development-replay",
    );
    await expect(buildPlan({
      ...replayArgs,
      tasks: new Set(["env-manager-python-audit-heldout-001"]),
      limit: 1,
    })).rejects.toThrow("development tasks only");

    await writeFile(join(outDir, "repair-evidence.json"), `${evidenceText}\n`, "utf8");
    await expect(buildPlan(replayArgs)).rejects.toThrow("repair evidence digest mismatch");
  });
});
