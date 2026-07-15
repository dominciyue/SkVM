import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SkillIRSchema } from "../../skill-ir/schema";
import type { ScoredAgentRunRow } from "./scoring";
import {
  buildDualSourceFeedbackArtifacts,
  runDualSourceFeedbackCompiler,
} from "./dual-source-feedback-run";
import { FinalIRProvenanceSchema } from "./final-ir-provenance";
import { sha256Bytes } from "./source-fixture";
import { buildPlan, type RealAgentRunArgs } from "./real-agent-run";

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
