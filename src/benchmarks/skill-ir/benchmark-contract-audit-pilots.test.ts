import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import {
  BenchmarkContractAuditManifestSchema,
} from "./benchmark-contract-audit";
import { runBenchmarkContractAudit } from "./benchmark-contract-audit-run";

const PILOTS = [
  {
    id: "env-manager",
    expectedIssues: [
      ["EXACT_CONTRACT_NOT_PUBLIC", "env-exact-classification-membership@env-manager-node-audit-dev-001"],
      ["EXACT_CONTRACT_NOT_PUBLIC", "env-exact-classification-membership@env-manager-vite-audit-dev-002"],
      ["EXACT_CONTRACT_NOT_PUBLIC", "env-exact-schema-rules@env-manager-node-audit-dev-001"],
      ["EXACT_CONTRACT_NOT_PUBLIC", "env-exact-schema-rules@env-manager-vite-audit-dev-002"],
    ],
  },
  {
    id: "law-to-markdown",
    expectedIssues: [
      ["CANARY_OUTCOME_MISMATCH", "law-alternative-approved-wording"],
      ["CANARY_OUTCOME_MISMATCH", "law-alternative-review-wording"],
    ],
  },
  {
    id: "experimental-design",
    expectedIssues: [
      ["CANARY_OUTCOME_MISMATCH", "design-allocation-cluster-alternative"],
      ["CANARY_OUTCOME_MISMATCH", "design-allocation-stratified-alternative"],
      ["CANARY_OUTCOME_MISMATCH", "design-assignment-cluster-wording"],
      ["CANARY_OUTCOME_MISMATCH", "design-assignment-stratified-wording"],
      ["CANARY_OUTCOME_MISMATCH", "design-report-cluster-chinese"],
      ["CANARY_OUTCOME_MISMATCH", "design-report-stratified-chinese"],
      ["EXACT_CONTRACT_NOT_PUBLIC", "design-private-method-enum@experimental-design-cluster-dev-002"],
      ["EXACT_CONTRACT_NOT_PUBLIC", "design-private-method-enum@experimental-design-stratified-dev-001"],
      ["EXACT_CONTRACT_NOT_PUBLIC", "design-private-method-mapping@experimental-design-cluster-dev-002"],
      ["EXACT_CONTRACT_NOT_PUBLIC", "design-private-method-mapping@experimental-design-stratified-dev-001"],
      ["EXACT_CONTRACT_NOT_PUBLIC", "design-private-plan-strictness@experimental-design-cluster-dev-002"],
      ["EXACT_CONTRACT_NOT_PUBLIC", "design-private-plan-strictness@experimental-design-stratified-dev-001"],
      ["EXACT_CONTRACT_NOT_PUBLIC", "design-private-schema-version@experimental-design-cluster-dev-002"],
      ["EXACT_CONTRACT_NOT_PUBLIC", "design-private-schema-version@experimental-design-stratified-dev-001"],
    ],
  },
] as const;

describe("Wave A benchmark contract audits", () => {
  test("keeps failed Wave A benchmarks at support-real weight with an audit locator", async () => {
    const corpus = JSON.parse(
      await readFile("benchmarks/skill-ir/corpus/corpora/pilot.json", "utf8"),
    ) as {
      skills: Array<{
        id: string;
        wave: string;
        evidenceWeight: string;
        benchmarkContractAuditPath?: string;
      }>;
    };
    const frozenDiagnosticIds = new Set<string>(PILOTS.map((pilot) => pilot.id));
    const waveA = corpus.skills.filter((skill) =>
      skill.wave === "A" && frozenDiagnosticIds.has(skill.id));

    expect(waveA.map((skill) => ({
      id: skill.id,
      evidenceWeight: skill.evidenceWeight,
      auditPath: skill.benchmarkContractAuditPath,
    })).sort((left, right) => left.id.localeCompare(right.id))).toEqual(PILOTS.map((pilot) => ({
      id: pilot.id,
      evidenceWeight: "support-real",
      auditPath: `benchmarks/skill-ir/pilots/${pilot.id}/benchmark-contract-audit.json`,
    })).sort((left, right) => left.id.localeCompare(right.id)));

    const intake = JSON.parse(
      await readFile("benchmarks/skill-ir/corpus/real-skill-intake.json", "utf8"),
    ) as { candidates: Array<{ id: string; evidenceWeight: string }> };
    for (const pilot of PILOTS) {
      expect(intake.candidates.find((candidate) => candidate.id === pilot.id)?.evidenceWeight)
        .toBe("support-real");
    }
  });

  for (const pilot of PILOTS) {
    test(`${pilot.id} remains a frozen diagnostic failure`, async () => {
      const path = `benchmarks/skill-ir/pilots/${pilot.id}/benchmark-contract-audit.json`;
      const manifest = BenchmarkContractAuditManifestSchema.parse(
        JSON.parse(await readFile(path, "utf8")),
      );
      const report = await runBenchmarkContractAudit(manifest);

      expect(report.status).toBe("failed");
      expect(report.issues.map((issue) => [issue.code, issue.subjectId])).toEqual(
        pilot.expectedIssues.map((issue) => [...issue]),
      );

      const serialized = JSON.stringify(report);
      expect(serialized).not.toContain("TEST_ONLY_");
      expect(serialized).not.toContain("payload");
      expect(serialized).not.toContain("held-out");
      expect(serialized).not.toContain("model-output");
    });
  }
});
