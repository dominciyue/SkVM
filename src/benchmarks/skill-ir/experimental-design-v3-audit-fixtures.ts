import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assessExperimentalDesignV3Allocation,
  deriveExperimentalDesignV3LimitationFlags,
  parseExperimentalDesignV3Study,
  type ExperimentalDesignV3AllocationRow,
  type ExperimentalDesignV3Study,
} from "./experimental-design-v3-contract.ts";
import {
  hashAuditFixtureDirectory,
  type BenchmarkContractAuditManifest,
} from "./benchmark-contract-audit.ts";
import { sha256Bytes } from "./source-fixture.ts";

const V3_ROOT = "benchmarks/skill-ir/pilots/experimental-design/v3";
const TASKS_PATH = `${V3_ROOT}/development/tasks.json`;
const CONTRACT_PATH = `${V3_ROOT}/public-contract.json`;
const SOURCE_AUDIT_PATH = `${V3_ROOT}/public-contract-source-audit.json`;
const SCORER_PATH = "src/bench/evaluators/experimental-design-grade-v3.ts";
const AUDIT_ROOT = `${V3_ROOT}/audit-fixtures`;
const MANIFEST_PATH = `${V3_ROOT}/benchmark-contract-audit.json`;

const DEVELOPMENT_TASK_IDS = [
  "experimental-design-v3-stratified-dev-001",
  "experimental-design-v3-cluster-sequential-dev-002",
] as const;

type TaskSet = {
  tasks: Array<{
    id: string;
    fixtures: Record<string, string>;
  }>;
};

type FixtureFiles = Record<string, string>;
type Canary = BenchmarkContractAuditManifest["canaries"][number];

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function makeStudy(
  assignmentLevel: "individual" | "cluster",
  strata: boolean,
  sequentialEnrollment: boolean,
  suffix: string,
): ExperimentalDesignV3Study {
  const prefix = assignmentLevel === "cluster" ? "cluster" : "unit";
  return parseExperimentalDesignV3Study({
    studyId: `audit-${suffix}`,
    question: "Which public arm improves the observable response?",
    assignmentLevel,
    assignmentUnit: assignmentLevel === "cluster" ? "cohort" : "participant",
    analysisUnit: assignmentLevel === "cluster" ? "cohort" : "participant",
    response: "public_outcome",
    arms: ["control", "intervention"],
    seed: 101,
    nuisanceFactors: strata ? ["site"] : [],
    sequentialEnrollment,
    units: Array.from({ length: 8 }, (_, index) => ({
      id: `${prefix}-${index + 1}`,
      ...(strata ? { stratum: index % 2 === 0 ? "north" : "south" } : {}),
    })),
  });
}

function legalAllocation(
  study: ExperimentalDesignV3Study,
  variant: 0 | 1,
): ExperimentalDesignV3AllocationRow[] {
  const offsets = new Map<string, number>();
  const rows = study.units.map((unit, index) => {
    const stratum = unit.stratum ?? "";
    const partitionIndex = offsets.get(stratum) ?? 0;
    offsets.set(stratum, partitionIndex + 1);
    return {
      order: index + 1,
      unitId: unit.id,
      stratum,
      arm: study.arms[(partitionIndex + variant) % study.arms.length]!,
    };
  });
  return variant === 0 ? rows : [...rows].reverse();
}

function allocationCsv(rows: readonly ExperimentalDesignV3AllocationRow[]): string {
  return [
    "order,unit_id,stratum,arm",
    ...rows.map((row) =>
      [row.order, row.unitId, row.stratum, row.arm]
        .map((value) => {
          const text = String(value);
          return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
        })
        .join(","),
    ),
    "",
  ].join("\n");
}

function armCounts(
  study: ExperimentalDesignV3Study,
  rows: readonly ExperimentalDesignV3AllocationRow[],
): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(
    study.arms.map((arm) => [arm, 0]),
  );
  for (const row of rows) counts[row.arm] = (counts[row.arm] ?? 0) + 1;
  return counts;
}

function evidence(
  study: ExperimentalDesignV3Study,
  rows: readonly ExperimentalDesignV3AllocationRow[],
  designProperties: ReturnType<
    typeof assessExperimentalDesignV3Allocation
  >["properties"],
): Record<string, unknown> {
  return {
    studyId: study.studyId,
    assignmentUnit: study.assignmentUnit,
    analysisUnit: study.analysisUnit,
    response: study.response,
    seed: study.seed,
    allocationPath: "design/allocation.csv",
    allocationRows: rows.length,
    armCounts: armCounts(study, rows),
    designProperties,
    limitationFlags: deriveExperimentalDesignV3LimitationFlags(study),
  };
}

function report(value: Record<string, unknown>, chinese = false): string {
  return [
    chinese ? "# 公开设计报告" : "# Public design report",
    chinese
      ? "正文措辞可以变化，结构化证据用于确定性交叉验证。"
      : "Prose may vary; structured evidence supports deterministic checks.",
    "```json design-evidence",
    JSON.stringify(value, null, 2),
    "```",
    "",
  ].join("\n");
}

function validFixture(
  study: ExperimentalDesignV3Study,
  contractText: string,
  options: { variant?: 0 | 1; chinese?: boolean; method?: string } = {},
): FixtureFiles {
  const rows = legalAllocation(study, options.variant ?? 1);
  const assessment = assessExperimentalDesignV3Allocation(study, rows);
  if (
    !assessment.coverageValid ||
    !assessment.armsValid ||
    !assessment.strataValid ||
    !assessment.sequentialValid
  ) {
    throw new Error(`Generated allocation is not valid for ${study.studyId}`);
  }
  const designProperties = assessment.properties;
  return {
    "study.json": json(study),
    "design-contract.json": contractText,
    "design/design-plan.json": json({
      studyId: study.studyId,
      method: options.method ?? `Public alternative for ${study.studyId}`,
      assignmentLevel: study.assignmentLevel,
      assignmentUnit: study.assignmentUnit,
      analysisUnit: study.analysisUnit,
      response: study.response,
      arms: study.arms,
      seed: study.seed,
      allocationPath: "design/allocation.csv",
      designProperties,
      implementationMetadata: { alternative: true },
    }),
    "design/allocation.csv": allocationCsv(rows),
    "design/design-report.md": report(
      {
        ...evidence(study, rows, designProperties),
        warnings: ["Free-form warning text is not scored."],
        extraEvidence: { allowed: true },
      },
      options.chinese,
    ),
  };
}

function parseFixtureStudy(files: FixtureFiles): ExperimentalDesignV3Study {
  return parseExperimentalDesignV3Study(JSON.parse(files["study.json"]!));
}

function parseFixtureAllocation(files: FixtureFiles): ExperimentalDesignV3AllocationRow[] {
  const lines = files["design/allocation.csv"]!.trim().split(/\r\n?|\n/u);
  return lines.slice(1).map((line) => {
    const [order, unitId, stratum, arm] = line.split(",");
    return { order: Number(order), unitId: unitId!, stratum: stratum!, arm: arm! };
  });
}

function reportWithEvidence(
  files: FixtureFiles,
  value: Record<string, unknown>,
): FixtureFiles {
  return { ...files, "design/design-report.md": report(value) };
}

async function writeFixture(rootDir: string, name: string, files: FixtureFiles): Promise<void> {
  const fixtureRoot = path.join(rootDir, ...AUDIT_ROOT.split("/"), name);
  await rm(fixtureRoot, { recursive: true, force: true });
  for (const [relativePath, contents] of Object.entries(files)) {
    const target = path.join(fixtureRoot, ...relativePath.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents, "utf8");
  }
}

function mutateJsonFile(
  files: FixtureFiles,
  relativePath: string,
  mutate: (value: any) => void,
): FixtureFiles {
  const next = { ...files };
  const value = JSON.parse(next[relativePath]!);
  mutate(value);
  next[relativePath] = json(value);
  return next;
}

function createFixtureMatrix(
  taskSet: TaskSet,
): Map<string, FixtureFiles> {
  const taskById = new Map(taskSet.tasks.map((task) => [task.id, task]));
  const taskFixtures = DEVELOPMENT_TASK_IDS.map((taskId) => taskById.get(taskId)!.fixtures);
  const contractText = taskFixtures[0]!["design-contract.json"]!;
  const developmentStudies = DEVELOPMENT_TASK_IDS.map((taskId) =>
    parseExperimentalDesignV3Study(
      JSON.parse(taskById.get(taskId)!.fixtures["study.json"]!),
    ),
  );
  const [stratifiedDevelopment, clusterSequentialDevelopment] = developmentStudies;
  const fixtures = new Map<string, FixtureFiles>();

  const canonical = validFixture(stratifiedDevelopment!, contractText, { variant: 0 });
  const clusterCanonical = validFixture(clusterSequentialDevelopment!, contractText, {
    variant: 1,
  });
  canonical["study.json"] = taskFixtures[0]!["study.json"]!;
  canonical["design-contract.json"] = taskFixtures[0]!["design-contract.json"]!;
  clusterCanonical["study.json"] = taskFixtures[1]!["study.json"]!;
  clusterCanonical["design-contract.json"] = taskFixtures[1]!["design-contract.json"]!;
  fixtures.set("canonical-complete", canonical);
  fixtures.set("alt-cluster-sequential", clusterCanonical);
  fixtures.set(
    "alt-report-chinese",
    {
      ...validFixture(stratifiedDevelopment!, contractText, {
      variant: 1,
      chinese: true,
      method: "公开的分层平衡替代方案",
      }),
      "study.json": taskFixtures[0]!["study.json"]!,
      "design-contract.json": taskFixtures[0]!["design-contract.json"]!,
    },
  );
  fixtures.set(
    "alt-report-chinese-cluster",
    {
      ...validFixture(clusterSequentialDevelopment!, contractText, {
      variant: 0,
      chinese: true,
      method: "公开的聚类序贯替代方案",
      }),
      "study.json": taskFixtures[1]!["study.json"]!,
      "design-contract.json": taskFixtures[1]!["design-contract.json"]!,
    },
  );

  for (const [name, level, strata, sequential] of [
    ["alt-individual-plain", "individual", false, false],
    ["alt-individual-strata", "individual", true, false],
    ["alt-individual-sequential", "individual", false, true],
    ["alt-individual-strata-sequential", "individual", true, true],
    ["alt-cluster-plain", "cluster", false, false],
    ["alt-cluster-strata", "cluster", true, false],
    ["alt-cluster-strata-sequential", "cluster", true, true],
  ] as const) {
    fixtures.set(
      name,
      validFixture(makeStudy(level, strata, sequential, name), contractText, {
        variant: 1,
        chinese: name.endsWith("sequential"),
      }),
    );
  }

  fixtures.set("invalid-protected-input", {
    ...canonical,
    "study.json": `${canonical["study.json"]} `,
  });
  const missingArtifact = { ...canonical };
  delete missingArtifact["design/design-report.md"];
  fixtures.set("invalid-missing-artifact", missingArtifact);
  fixtures.set("invalid-root-extra-file", {
    ...canonical,
    "notes.txt": "extra root output\n",
  });
  fixtures.set("invalid-root-extra-file-cluster", {
    ...clusterCanonical,
    "notes.txt": "extra root output\n",
  });
  fixtures.set("invalid-root-extra-directory", {
    ...canonical,
    "scratch/.keep": "extra root directory\n",
  });
  fixtures.set("invalid-root-extra-directory-cluster", {
    ...clusterCanonical,
    "scratch/.keep": "extra root directory\n",
  });

  const canonicalRows = parseFixtureAllocation(canonical);
  fixtures.set("invalid-unit-coverage", {
    ...canonical,
    "design/allocation.csv": allocationCsv(canonicalRows.slice(0, -1)),
  });
  fixtures.set("invalid-arm", {
    ...canonical,
    "design/allocation.csv": allocationCsv([
      { ...canonicalRows[0]!, arm: "unknown-arm" },
      ...canonicalRows.slice(1),
    ]),
  });
  fixtures.set(
    "invalid-plan-properties",
    mutateJsonFile(canonical, "design/design-plan.json", (plan) => {
      plan.designProperties.balancesWithinStrata = false;
    }),
  );

  const clusterPlain = validFixture(
    makeStudy("cluster", false, false, "invalid-cluster-split"),
    contractText,
  );
  fixtures.set(
    "invalid-cluster-split",
    mutateJsonFile(clusterPlain, "study.json", (value) => {
      value.units[0].memberAssignments = [
        { memberId: "member-1", arm: "control" },
        { memberId: "member-2", arm: "intervention" },
      ];
    }),
  );
  fixtures.set(
    "invalid-duplicate-unit",
    mutateJsonFile(canonical, "study.json", (value) => {
      value.units[1].id = value.units[0].id;
    }),
  );
  fixtures.set(
    "invalid-mixed-strata",
    mutateJsonFile(canonical, "study.json", (value) => {
      delete value.units[0].stratum;
    }),
  );

  const stratumRows = canonicalRows.map((row) =>
    row.stratum === "site-a" ? { ...row, arm: "control" } : row,
  );
  fixtures.set("invalid-stratum-balance", {
    ...canonical,
    "design/allocation.csv": allocationCsv(stratumRows),
  });
  const sequentialRows = parseFixtureAllocation(clusterCanonical);
  fixtures.set("invalid-sequential-block", {
    ...clusterCanonical,
    "design/allocation.csv": allocationCsv([
      { ...sequentialRows[0]!, arm: "usual-care" },
      { ...sequentialRows[1]!, arm: "usual-care" },
      ...sequentialRows.slice(2),
    ]),
  });

  const canonicalStudy = parseFixtureStudy(canonical);
  const canonicalAssessment = assessExperimentalDesignV3Allocation(
    canonicalStudy,
    canonicalRows,
  );
  const canonicalEvidence = evidence(
    canonicalStudy,
    canonicalRows,
    canonicalAssessment.properties,
  );
  fixtures.set("invalid-report-block", {
    ...canonical,
    "design/design-report.md": "# Missing structured evidence block\n",
  });
  fixtures.set("invalid-report-multiple-blocks", {
    ...canonical,
    "design/design-report.md": `${report(canonicalEvidence)}${report(canonicalEvidence)}`,
  });
  fixtures.set("invalid-report-json", {
    ...canonical,
    "design/design-report.md": "```json design-evidence\n{ trailing: true }\n```\n",
  });
  fixtures.set("invalid-report-duplicate-key", {
    ...canonical,
    "design/design-report.md":
      '```json design-evidence\n{"studyId":"first","studyId":"second"}\n```\n',
  });
  fixtures.set("partial-report-structure", reportWithEvidence(canonical, {}));
  fixtures.set(
    "partial-report-study",
    reportWithEvidence(canonical, {
      studyId: canonicalStudy.studyId,
      assignmentUnit: canonicalStudy.assignmentUnit,
      analysisUnit: canonicalStudy.analysisUnit,
      response: canonicalStudy.response,
      seed: canonicalStudy.seed,
    }),
  );
  const withoutLimitations = { ...canonicalEvidence };
  delete withoutLimitations.designProperties;
  delete withoutLimitations.limitationFlags;
  fixtures.set(
    "partial-report-allocation",
    reportWithEvidence(canonical, withoutLimitations),
  );
  fixtures.set(
    "invalid-limitation-flags",
    reportWithEvidence(canonical, {
      ...canonicalEvidence,
      limitationFlags: ["randomness-not-statistically-audited"],
    }),
  );
  fixtures.set(
    "invalid-report-contradiction",
    reportWithEvidence(canonical, { ...canonicalEvidence, seed: 999 }),
  );
  return fixtures;
}

function canary(
  id: string,
  taskId: (typeof DEVELOPMENT_TASK_IDS)[number],
  criterionId: string,
  role: Canary["role"],
  fixtureName: string,
  fixtureDigests: ReadonlyMap<string, string>,
  expectedPass: boolean,
  expectedScore?: number,
): Canary {
  return {
    id,
    taskId,
    criterionId,
    role,
    fixturePath: `${AUDIT_ROOT}/${fixtureName}`,
    fixtureSha256: fixtureDigests.get(fixtureName)!,
    expectedPass,
    ...(expectedScore === undefined ? {} : { expectedScore }),
  };
}

function createCanaries(fixtureDigests: ReadonlyMap<string, string>): Canary[] {
  const [firstTask, secondTask] = DEVELOPMENT_TASK_IDS;
  const definitions = [
    {
      key: "input",
      criterionId: "design-input-integrity",
      firstAlternative: "alt-report-chinese",
      secondAlternative: "alt-report-chinese-cluster",
      firstInvalid: "invalid-protected-input",
      secondInvalid: "invalid-protected-input",
    },
    {
      key: "artifact",
      criterionId: "design-artifact-contract",
      firstAlternative: "alt-individual-strata-sequential",
      secondAlternative: "alt-cluster-strata-sequential",
      firstInvalid: "invalid-missing-artifact",
      secondInvalid: "invalid-missing-artifact",
    },
    {
      key: "semantics",
      criterionId: "design-semantics",
      firstAlternative: "alt-individual-plain",
      secondAlternative: "alt-cluster-plain",
      firstInvalid: "invalid-plan-properties",
      secondInvalid: "invalid-plan-properties",
    },
    {
      key: "allocation",
      criterionId: "design-allocation-safety",
      firstAlternative: "alt-individual-strata",
      secondAlternative: "alt-cluster-strata",
      firstInvalid: "invalid-unit-coverage",
      secondInvalid: "invalid-sequential-block",
    },
    {
      key: "report",
      criterionId: "design-report-consistency",
      firstAlternative: "alt-individual-sequential",
      secondAlternative: "alt-cluster-strata-sequential",
      firstInvalid: "invalid-report-contradiction",
      secondInvalid: "invalid-limitation-flags",
    },
  ] as const;
  const result: Canary[] = [];
  for (const definition of definitions) {
    result.push(
      canary(
        `${definition.key}-canonical-dev1`,
        firstTask,
        definition.criterionId,
        "canonical-valid",
        "canonical-complete",
        fixtureDigests,
        true,
      ),
      canary(
        `${definition.key}-canonical-dev2`,
        secondTask,
        definition.criterionId,
        "canonical-valid",
        "alt-cluster-sequential",
        fixtureDigests,
        true,
      ),
      canary(
        `${definition.key}-alternative-dev1`,
        firstTask,
        definition.criterionId,
        "alternative-valid",
        definition.firstAlternative,
        fixtureDigests,
        true,
      ),
      canary(
        `${definition.key}-alternative-dev2`,
        secondTask,
        definition.criterionId,
        "alternative-valid",
        definition.secondAlternative,
        fixtureDigests,
        true,
      ),
      canary(
        `${definition.key}-invalid-dev1`,
        firstTask,
        definition.criterionId,
        "invalid-control",
        definition.firstInvalid,
        fixtureDigests,
        false,
      ),
      canary(
        `${definition.key}-invalid-dev2`,
        secondTask,
        definition.criterionId,
        "invalid-control",
        definition.secondInvalid,
        fixtureDigests,
        false,
      ),
    );
  }

  for (const [suffix, firstFixture, secondFixture] of [
    ["root-extra-file", "invalid-root-extra-file", "invalid-root-extra-file-cluster"],
    [
      "root-extra-directory",
      "invalid-root-extra-directory",
      "invalid-root-extra-directory-cluster",
    ],
  ] as const) {
    result.push(
      canary(
        `artifact-${suffix}-dev1`,
        firstTask,
        "design-artifact-contract",
        "invalid-control",
        firstFixture,
        fixtureDigests,
        false,
      ),
      canary(
        `artifact-${suffix}-dev2`,
        secondTask,
        "design-artifact-contract",
        "invalid-control",
        secondFixture,
        fixtureDigests,
        false,
      ),
    );
  }

  for (const [suffix, fixtureName] of [
    ["invalid-arm", "invalid-arm"],
    ["cluster-split", "invalid-cluster-split"],
    ["duplicate-unit", "invalid-duplicate-unit"],
    ["mixed-strata", "invalid-mixed-strata"],
    ["stratum-balance", "invalid-stratum-balance"],
  ] as const) {
    result.push(
      canary(
        `allocation-${suffix}`,
        suffix === "cluster-split" ? secondTask : firstTask,
        "design-allocation-safety",
        "invalid-control",
        fixtureName,
        fixtureDigests,
        false,
      ),
    );
  }

  for (const [suffix, fixtureName, score] of [
    ["missing", "invalid-report-block", 0],
    ["multiple", "invalid-report-multiple-blocks", 0],
    ["invalid-json", "invalid-report-json", 0],
    ["duplicate-key", "invalid-report-duplicate-key", 0],
    ["structure-only", "partial-report-structure", 0.25],
    ["study-only", "partial-report-study", 0.5],
    ["without-limitations", "partial-report-allocation", 0.75],
  ] as const) {
    result.push(
      canary(
        `report-partial-${suffix}`,
        firstTask,
        "design-report-consistency",
        "partial-control",
        fixtureName,
        fixtureDigests,
        true,
        score,
      ),
    );
  }
  return result;
}

function createManifest(
  taskSha256: string,
  scorerSha256: string,
  contractSha256: string,
  sourceAuditSha256: string,
  canaries: Canary[],
): BenchmarkContractAuditManifest {
  const criterionDefinitions = [
    ["design-input-integrity", "input", "protectedInputs", "checkInputIntegrity"],
    ["design-artifact-contract", "artifact", "allowedRootEntries", "checkArtifactContract"],
    ["design-semantics", "semantics", "designProperties", "planMatchesPublicStudy"],
    ["design-allocation-safety", "allocation", "Different legal arm assignments", "checkAllocationSafety"],
    ["design-report-consistency", "report", "reportEvidenceRequiredFields", "checkReportConsistency"],
  ] as const;
  const criteria = criterionDefinitions.map(([criterionId, key]) => ({
    id: criterionId,
    hardGate: true,
    taskIds: [...DEVELOPMENT_TASK_IDS],
    requirementIds: [`${key}-safety`, `${key}-equivalence`],
  }));
  const requirements = criterionDefinitions.flatMap(
    ([criterionId, key, publicQuote, scorerAnchor]) => {
      const criterionCanaries = canaries.filter(
        (entry) => entry.criterionId === criterionId,
      );
      const publicEvidence = [
        {
          kind: "skill-source" as const,
          path: CONTRACT_PATH,
          quote: publicQuote,
        },
      ];
      return [
        {
          id: `${key}-safety`,
          class: "semantic-invariant" as const,
          equivalence: "safety-invariant" as const,
          criterionIds: [criterionId],
          contractTokens: [publicQuote],
          scorerAnchors: [{ quote: scorerAnchor }],
          publicEvidence,
          canaryIds: criterionCanaries
            .filter((entry) =>
              entry.role === "canonical-valid" || entry.role === "invalid-control",
            )
            .map((entry) => entry.id),
        },
        {
          id: `${key}-equivalence`,
          class: "semantic-invariant" as const,
          equivalence: "semantic-equivalence" as const,
          criterionIds: [criterionId],
          contractTokens: [publicQuote],
          scorerAnchors: [{ quote: scorerAnchor }],
          publicEvidence,
          canaryIds: criterionCanaries
            .filter((entry) => entry.role === "alternative-valid")
            .map((entry) => entry.id),
        },
      ];
    },
  );
  return {
    schemaVersion: "skill-ir-benchmark-contract-audit/v1",
    auditId: "experimental-design-v3-benchmark-contract-v1",
    skillId: "experimental-design-v3",
    tasks: { path: TASKS_PATH, sha256: taskSha256 },
    scorer: {
      path: SCORER_PATH,
      sha256: scorerSha256,
      evaluatorId: "skill-ir-experimental-design-v3",
    },
    sources: [
      { path: CONTRACT_PATH, sha256: contractSha256 },
      { path: SOURCE_AUDIT_PATH, sha256: sourceAuditSha256 },
    ],
    scope: { split: "development", taskIds: [...DEVELOPMENT_TASK_IDS] },
    criteria,
    requirements,
    canaries,
  };
}

export async function generateExperimentalDesignV3AuditFixtures(
  rootDir = process.cwd(),
): Promise<BenchmarkContractAuditManifest> {
  const [taskBytes, contractBytes, sourceAuditBytes, scorerBytes] = await Promise.all([
    readFile(path.join(rootDir, ...TASKS_PATH.split("/"))),
    readFile(path.join(rootDir, ...CONTRACT_PATH.split("/"))),
    readFile(path.join(rootDir, ...SOURCE_AUDIT_PATH.split("/"))),
    readFile(path.join(rootDir, ...SCORER_PATH.split("/"))),
  ]);
  const taskSet = JSON.parse(taskBytes.toString("utf8")) as TaskSet;
  const fixtures = createFixtureMatrix(taskSet);
  for (const [name, files] of fixtures) await writeFixture(rootDir, name, files);

  const fixtureDigests = new Map<string, string>();
  for (const name of fixtures.keys()) {
    fixtureDigests.set(
      name,
      await hashAuditFixtureDirectory(
        path.join(rootDir, ...AUDIT_ROOT.split("/"), name),
        rootDir,
      ),
    );
  }
  const manifest = createManifest(
    sha256Bytes(taskBytes),
    sha256Bytes(scorerBytes),
    sha256Bytes(contractBytes),
    sha256Bytes(sourceAuditBytes),
    createCanaries(fixtureDigests),
  );
  const manifestPath = path.join(rootDir, ...MANIFEST_PATH.split("/"));
  await writeFile(manifestPath, json(manifest), "utf8");
  return manifest;
}

if (import.meta.main) {
  const manifest = await generateExperimentalDesignV3AuditFixtures();
  console.log(
    JSON.stringify(
      {
        auditId: manifest.auditId,
        fixtures: new Set(manifest.canaries.map((entry) => entry.fixturePath)).size,
        canaries: manifest.canaries.length,
      },
      null,
      2,
    ),
  );
}
