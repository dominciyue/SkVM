import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { parse as parseYaml } from "yaml";

const PRIOR_CLASS_PROOF_ROOT = "results/skill-ir/skill-family-class-proof-20260911";
const PRIOR_API_INPUT_ROOT = "results/skill-ir/skill-family-deepening-20260911/api-inputs";
const CURRENT_RESULT_ROOT = "results/skill-ir/skill-family-current-v2-source-repair-001";

export const N1_SELECTED_SOURCE_IDS = [
  "candidate-060",
  "candidate-063",
  "candidate-066",
  "candidate-067",
  "candidate-087",
  "candidate-091",
  "candidate-111",
  "candidate-112",
  "candidate-216",
  "candidate-217",
  "candidate-226",
  "candidate-227",
] as const;

export const N1_METADATA_CANDIDATE_IDS = [
  "candidate-028",
  "candidate-034",
  "candidate-084",
  "candidate-097",
  "candidate-243",
] as const;

const N1_SOURCE_ROLES: Record<string, string> = {
  "candidate-060": "api-task-duty-source",
  "candidate-063": "adjacent-contract-authoring-contrast",
  "candidate-066": "api-task-duty-source",
  "candidate-067": "out-of-class-e2e-contrast",
  "candidate-087": "adjacent-contract-authoring-contrast",
  "candidate-091": "api-task-duty-source",
  "candidate-111": "api-task-duty-source",
  "candidate-112": "adjacent-contract-authoring-contrast",
  "candidate-216": "in-class-unsupported-duty-source",
  "candidate-217": "in-class-unsupported-duty-source",
  "candidate-226": "api-task-duty-source",
  "candidate-227": "in-class-unsupported-duty-source",
};

const N1_MAPPING_CANDIDATES = [
  {
    candidateId: "candidate-060",
    obligationIds: [
      "event4u-app/agent-config:src/skills/api-testing/SKILL.md:duty-010-valid-request",
      "event4u-app/agent-config:src/skills/api-testing/SKILL.md:duty-017-wrong-type",
    ],
    targetRequirementKinds: ["valid-minimal", "valid-full", "constraint-negative"],
  },
  {
    candidateId: "candidate-066",
    obligationIds: [
      "fishzjp/qa-skills:skills/api-testing/SKILL.md:duty-009-requested-output-format",
      "fishzjp/qa-skills:skills/api-testing/SKILL.md:duty-027-negative-fuzzing",
    ],
    targetRequirementKinds: ["pytest-output", "constraint-negative"],
  },
  {
    candidateId: "candidate-111",
    obligationIds: [
      "LambdaTest/agent-skills:api-skill/api-to-testcase-generator/SKILL.md:duty-010-valid-request",
      "LambdaTest/agent-skills:api-skill/api-to-testcase-generator/SKILL.md:duty-018-missing-required",
      "LambdaTest/agent-skills:api-skill/api-to-testcase-generator/SKILL.md:duty-019-out-of-range",
    ],
    targetRequirementKinds: ["valid-minimal", "valid-full", "required-omission", "constraint-negative"],
  },
  {
    candidateId: "candidate-217",
    obligationIds: [
      "pactflow/pactflow-agent-skills:plugins/swagger-contract-testing/skills/openapi-parser/SKILL.md:duty-005-references",
      "pactflow/pactflow-agent-skills:plugins/swagger-contract-testing/skills/openapi-parser/SKILL.md:duty-012-valid-request",
      "pactflow/pactflow-agent-skills:plugins/swagger-contract-testing/skills/openapi-parser/SKILL.md:duty-018-requested-output-format",
    ],
    targetRequirementKinds: ["source-closure", "valid-minimal", "valid-full", "unresolved-native-drift-output"],
  },
];

type SourceEvidence = {
  row: any;
  body: Uint8Array;
  bodyRepoPath?: string;
  resources: Array<{ row: any; bytes: Uint8Array; repoPath?: string }>;
};

type ApiInputEvidence = { row: any; document: Uint8Array; repoPath?: string };

export type N1CorpusBuildInput = {
  policy: {
    selectedIds: string[] | readonly string[];
    metadataCandidateIds: string[] | readonly string[];
    sourceRoles: Record<string, string>;
    mappingCandidates: Array<{ candidateId: string; obligationIds: string[]; targetRequirementKinds: string[] }>;
  };
  sources: SourceEvidence[];
  responsibilities: any[];
  metadataCandidates: any[];
  apiInputManifest: any;
  apiInputs: ApiInputEvidence[];
  reviewExposures: any[];
  evidence: Record<"sourceLedger" | "responsibilityLedger" | "candidatePool" | "apiInputs", { path: string; sha256: string }>;
};

const HEX_40 = /^[0-9a-f]{40}$/u;
const HEX_64 = /^[0-9a-f]{64}$/u;
const SOURCE_ROLES = new Set([
  "api-task-duty-source",
  "in-class-unsupported-duty-source",
  "adjacent-contract-authoring-contrast",
  "out-of-class-e2e-contrast",
]);

function fail(message: string): never {
  throw new Error(`invalid N1 corpus: ${message}`);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeRelative(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || !value
    || isAbsolute(value)
    || /^[A-Za-z]:[\\/]/u.test(value)
    || value.startsWith("\\\\")
    || value.split(/[\\/]+/u).includes("..")
  ) fail(`${label} must be a safe relative path`);
  return value.replaceAll("\\", "/");
}

function unique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) fail(`duplicate ${label}`);
}

function verifyBytes(bytes: Uint8Array, expectedBytes: unknown, expectedSha256: unknown, label: string): void {
  if (!Number.isInteger(expectedBytes) || expectedBytes !== bytes.byteLength) fail(`${label} byte length mismatch`);
  if (typeof expectedSha256 !== "string" || !HEX_64.test(expectedSha256) || sha256(bytes) !== expectedSha256) fail(`${label} digest mismatch`);
}

function locatorLineCount(text: string): number {
  return text.split(/\r?\n/u).length;
}

function verifyDutyLocators(source: SourceEvidence, duties: any[]): void {
  const sources = new Map<string, number>([[source.row.skillPath, locatorLineCount(Buffer.from(source.body).toString("utf8"))]]);
  for (const resource of source.resources) sources.set(resource.row.sourcePath, locatorLineCount(Buffer.from(resource.bytes).toString("utf8")));
  for (const duty of duties) {
    if (typeof duty.sourceLocator !== "string") fail(`duty without source locator for ${source.row.candidateId}`);
    const match = /^(.*):(\d+)$/u.exec(duty.sourceLocator);
    if (!match) fail(`unparseable duty locator ${duty.sourceLocator}`);
    const lineCount = sources.get(match[1]!);
    const line = Number(match[2]);
    if (lineCount === undefined || !Number.isInteger(line) || line < 1 || line > lineCount) fail(`unresolved duty locator ${duty.sourceLocator}`);
  }
}

function parseApiDocument(input: ApiInputEvidence): any {
  const text = Buffer.from(input.document).toString("utf8");
  try {
    return input.row.format === "json" ? JSON.parse(text) : parseYaml(text);
  } catch (error) {
    fail(`API input ${input.row.inputId} parse failure: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function buildN1CorpusLedgers(input: N1CorpusBuildInput) {
  const selectedIds = [...input.policy.selectedIds];
  const metadataIds = [...input.policy.metadataCandidateIds];
  unique(selectedIds, "selected source id");
  unique(metadataIds, "metadata candidate id");
  if (selectedIds.length < 12 || selectedIds.length > 20) fail("selected body count must be between 12 and 20");
  if (metadataIds.length !== 5) fail("exactly 5 metadata-only candidates are required");
  for (const evidence of Object.values(input.evidence)) {
    safeRelative(evidence.path, "evidence path");
    if (!HEX_64.test(evidence.sha256)) fail("evidence digest");
  }

  const sourceById = new Map(input.sources.map((source) => [source.row.candidateId, source]));
  const responsibilityById = new Map(input.responsibilities.map((row) => [row.candidateId, row]));
  const sourceRows = selectedIds.map((candidateId) => {
    const source = sourceById.get(candidateId);
    if (!source) fail(`missing selected source ${candidateId}`);
    const row = source.row;
    if (typeof row.repository !== "string" || typeof row.skillId !== "string" || !HEX_40.test(row.commit) || !HEX_40.test(row.sha)) fail(`source identity ${candidateId}`);
    verifyBytes(source.body, row.bodyBytes, row.bodySha256, `body ${candidateId}`);
    const role = input.policy.sourceRoles[candidateId];
    if (!role || !SOURCE_ROLES.has(role)) fail(`source role ${candidateId}`);
    const responsibilities = responsibilityById.get(candidateId);
    if (!responsibilities || responsibilities.skillId !== row.skillId || !Array.isArray(responsibilities.duties)) fail(`missing responsibility row ${candidateId}`);
    const resources = source.resources.map((resource) => {
      verifyBytes(resource.bytes, resource.row.bytes, resource.row.sha256, `resource ${candidateId}:${resource.row.sourcePath}`);
      return {
        sourcePath: safeRelative(resource.row.sourcePath, "resource source path"),
        path: safeRelative(resource.repoPath ?? resource.row.localPath, "resource local path"),
        sha256: resource.row.sha256,
        bytes: resource.row.bytes,
        byteVerification: "passed",
      };
    });
    if (resources.length !== (row.directResources?.length ?? 0)) fail(`direct resource count ${candidateId}`);
    verifyDutyLocators(source, responsibilities.duties);
    return {
      candidateId,
      skillId: row.skillId,
      repository: row.repository,
      commit: row.commit,
      skillPath: safeRelative(row.skillPath, "skill path"),
      gitBlob: row.sha,
      license: {
        spdx: typeof row.license === "string" && row.license ? row.license : null,
        redistributionStatus: typeof row.license === "string" && row.license ? "recorded-license" : "redistribution-review-needed",
      },
      corpusRole: role,
      scopeAssessment: "duty-level-only",
      acquisition: "reused-archived-development",
      body: {
        path: safeRelative(source.bodyRepoPath ?? row.bodyPath, "body path"),
        sha256: row.bodySha256,
        bytes: row.bodyBytes,
        completeness: "complete-archived-body",
        byteVerification: "passed",
      },
      directResources: resources,
    };
  });
  const repositoryOrigins = new Set(sourceRows.map(({ repository }) => repository)).size;
  if (repositoryOrigins < 6) fail("at least 6 repository origins are required");

  const dutyMembers = selectedIds.map((candidateId) => {
    const source = sourceRows.find((row) => row.candidateId === candidateId)!;
    const responsibility = responsibilityById.get(candidateId)!;
    const counts = {
      duties: responsibility.duties.length,
      constructible: responsibility.duties.filter((duty: any) => duty.role === "in-class-constructible").length,
      unsupported: responsibility.duties.filter((duty: any) => duty.role === "in-class-unsupported").length,
      outsideClass: responsibility.duties.filter((duty: any) => duty.role === "outside-class").length,
      unmappedOrUnresolved: responsibility.duties.filter((duty: any) => duty.role === null || duty.role === undefined).length,
    };
    for (const [field, expected] of [["coreConstructible", counts.constructible], ["outsideClass", counts.outsideClass], ["unresolved", counts.unsupported + counts.unmappedOrUnresolved]] as const) {
      if (Number(responsibility[field]) !== expected) fail(`${candidateId} ${field} count mismatch`);
    }
    return {
      candidateId,
      skillId: source.skillId,
      repository: source.repository,
      corpusRole: source.corpusRole,
      inventoryAuthority: "agent-reviewed-existing-ledger",
      semanticReview: "not-human-reviewed",
      counts,
      duties: responsibility.duties,
    };
  });

  const mappingCandidates = input.policy.mappingCandidates.map((candidate) => {
    const member = dutyMembers.find((row) => row.candidateId === candidate.candidateId);
    if (!member) fail(`mapping candidate is outside selected corpus ${candidate.candidateId}`);
    const dutyIds = new Set(member.duties.map((duty: any) => duty.obligationId));
    for (const obligationId of candidate.obligationIds) if (!dutyIds.has(obligationId)) fail(`mapping obligation missing ${obligationId}`);
    return {
      ...candidate,
      skillId: member.skillId,
      repository: member.repository,
      mappingOrigin: "agent-reviewed-existing-ledger",
      reviewStatus: "requires-contract-adapter-review",
      residualScopePreserved: true,
    };
  });
  if (new Set(mappingCandidates.map(({ repository }) => repository)).size < 3) fail("mapping candidates require 3 repository origins");

  const metadataById = new Map(input.metadataCandidates.map((row) => [row.candidateId, row]));
  const metadataOnlyCandidates = metadataIds.map((candidateId) => {
    const row = metadataById.get(candidateId);
    if (!row) fail(`missing metadata-only candidate ${candidateId}`);
    if (row.bodyRead !== false) fail(`metadata-only candidate ${candidateId} must retain bodyRead=false`);
    return {
      candidateId,
      repository: row.repository,
      skillPath: safeRelative(row.path, "metadata skill path"),
      gitBlob: row.sha,
      recordedLicense: row.license ?? null,
      redistributionStatus: row.license ? "recorded-license" : "redistribution-review-needed",
      source: row.source,
      bodyRead: false,
      selectionStatus: "metadata-only-candidate",
      eligibility: "not-assessed-until-authorized-body-read",
    };
  });
  if (new Set(metadataOnlyCandidates.map(({ repository }) => repository)).size !== metadataOnlyCandidates.length) fail("metadata-only candidates must be repository-distinct");

  const apiRows = input.apiInputs.map((apiInput) => {
    const row = apiInput.row;
    verifyBytes(apiInput.document, row.byteLength, row.sha256, `API input ${row.inputId}`);
    const parsed = parseApiDocument(apiInput);
    const openapiVersion = typeof parsed?.openapi === "string" ? parsed.openapi : null;
    const originalUpstreamUrl = typeof row.originalUpstreamUrl === "string" ? row.originalUpstreamUrl : null;
    return {
      inputId: row.inputId,
      provider: row.provider,
      providerEvidence: {
        infoTitle: typeof parsed?.info?.title === "string" ? parsed.info.title : null,
        infoContactUrl: typeof parsed?.info?.contact?.url === "string" ? parsed.info.contact.url : null,
        firstServerUrl: typeof parsed?.servers?.[0]?.url === "string" ? parsed.servers[0].url : null,
      },
      openapiVersion,
      apiVersion: typeof parsed?.info?.version === "string" ? parsed.info.version : null,
      profileCompatibility: /^3\.0(?:\.|$)/u.test(openapiVersion ?? "") ? "oas3.0" : "unsupported-or-unresolved-dialect",
      sourceRepository: input.apiInputManifest.repository,
      sourceCommit: input.apiInputManifest.commit,
      sourcePath: row.sourcePath,
      mirrorUrl: row.sourceUrl,
      originalUpstreamUrl,
      upstreamIdentityStatus: originalUpstreamUrl ? "recorded" : "not-recorded-in-prior-ledger",
      isAggregatorMirror: true,
      developmentExposed: true,
      format: row.format,
      path: safeRelative(apiInput.repoPath ?? `${PRIOR_API_INPUT_ROOT}/${row.localPath}`, "API input path"),
      sha256: row.sha256,
      bytes: row.byteLength,
      qualification: row.qualification,
    };
  });
  if (apiRows.length < 6) fail("at least 6 API input documents are required");
  const providerCount = new Set(apiRows.map(({ provider }) => provider)).size;
  if (providerCount < 3) fail("at least 3 API providers are required");

  const dutyTotals = dutyMembers.reduce((totals, member) => ({
    duties: totals.duties + member.counts.duties,
    constructible: totals.constructible + member.counts.constructible,
    unsupported: totals.unsupported + member.counts.unsupported,
    outsideClass: totals.outsideClass + member.counts.outsideClass,
    unmappedOrUnresolved: totals.unmappedOrUnresolved + member.counts.unmappedOrUnresolved,
  }), { duties: 0, constructible: 0, unsupported: 0, outsideClass: 0, unmappedOrUnresolved: 0 });

  return {
    sourceLedger: {
      schemaVersion: "skill-family-current-v2-source-ledger/v1",
      identity: "skill-family-current-v2-source-repair-001",
      selectionPolicy: "fixed archived development bodies; 12 bodies across 6 repository origins; no outcome-based replacement",
      evidence: input.evidence,
      summary: {
        bodies: sourceRows.length,
        repositoryOrigins,
        directResources: sourceRows.reduce((sum, row) => sum + row.directResources.length, 0),
        acquisitionRequests: 0,
      },
      rows: sourceRows,
    },
    dutyMatrix: {
      schemaVersion: "skill-family-current-v2-duty-matrix/v1",
      identity: "skill-family-current-v2-source-repair-001",
      inventoryLimit: "existing agent-reviewed ledger; duty text and locators preserved; not a human agreement measurement",
      sourceEvidence: input.evidence.responsibilityLedger,
      summary: { members: dutyMembers.length, ...dutyTotals, mappingCandidates: mappingCandidates.length },
      mappingCandidates,
      members: dutyMembers,
    },
    exposureLedger: {
      schemaVersion: "skill-family-current-v2-exposure-ledger/v1",
      identity: "skill-family-current-v2-source-repair-001",
      selectedBodies: sourceRows.map((row) => ({ candidateId: row.candidateId, repository: row.repository, exposure: "development-exposed", bodyReadBeforeN1: true })),
      reviewExposures: input.reviewExposures,
      metadataOnlyCandidates,
      apiInputs: {
        sourceManifest: { repository: input.apiInputManifest.repository, commit: input.apiInputManifest.commit, provenanceLimit: input.apiInputManifest.provenanceLimit },
        summary: {
          documents: apiRows.length,
          providers: providerCount,
          aggregatorMirrors: apiRows.filter(({ isAggregatorMirror }) => isAggregatorMirror).length,
          originalUpstreamUrlsKnown: apiRows.filter(({ originalUpstreamUrl }) => originalUpstreamUrl !== null).length,
        },
        rows: apiRows,
      },
      protectedReads: { heldOut: 0, q1Reserved: 0, prospective: 0 },
      acquisition: { sourceApiCalls: 0, modelCalls: 0, paidCalls: 0, reason: "all N1 bodies and metadata were reused from committed development archives" },
    },
  };
}

async function readBoundJson(root: string, relativePath: string): Promise<{ value: any; evidence: { path: string; sha256: string } }> {
  const bytes = await readFile(join(root, relativePath));
  return { value: JSON.parse(bytes.toString("utf8")), evidence: { path: relativePath, sha256: sha256(bytes) } };
}

export async function buildN1CorpusFromRepository(root: string) {
  const source = await readBoundJson(root, `${PRIOR_CLASS_PROOF_ROOT}/source-ledger.json`);
  const responsibility = await readBoundJson(root, `${PRIOR_CLASS_PROOF_ROOT}/responsibility-ledger.json`);
  const candidates = await readBoundJson(root, `${PRIOR_CLASS_PROOF_ROOT}/candidate-pool.json`);
  const apiManifest = await readBoundJson(root, `${PRIOR_API_INPUT_ROOT}/inputs.json`);
  const stage = await readBoundJson(root, `${CURRENT_RESULT_ROOT}/stage-manifest.json`);
  const sourceById = new Map(source.value.rows.map((row: any) => [row.candidateId, row]));
  const selectedSources: SourceEvidence[] = [];
  for (const candidateId of N1_SELECTED_SOURCE_IDS) {
    const row: any = sourceById.get(candidateId);
    if (!row) fail(`prior source ledger is missing ${candidateId}`);
    const bodyRepoPath = `${PRIOR_CLASS_PROOF_ROOT}/${row.bodyPath}`;
    const resources = [];
    for (const resource of row.directResources ?? []) {
      const repoPath = `${PRIOR_CLASS_PROOF_ROOT}/${resource.localPath}`;
      resources.push({ row: resource, bytes: await readFile(join(root, repoPath)), repoPath });
    }
    selectedSources.push({ row, body: await readFile(join(root, bodyRepoPath)), bodyRepoPath, resources });
  }
  const responsibilityById = new Map(responsibility.value.rows.map((row: any) => [row.candidateId, row]));
  const candidateById = new Map(candidates.value.candidates.map((row: any) => [row.candidateId, row]));
  const apiInputs: ApiInputEvidence[] = [];
  for (const row of apiManifest.value.inputs) {
    const repoPath = `${PRIOR_API_INPUT_ROOT}/${row.localPath}`;
    apiInputs.push({ row, document: await readFile(join(root, repoPath)), repoPath });
  }
  return buildN1CorpusLedgers({
    policy: {
      selectedIds: N1_SELECTED_SOURCE_IDS,
      metadataCandidateIds: N1_METADATA_CANDIDATE_IDS,
      sourceRoles: N1_SOURCE_ROLES,
      mappingCandidates: N1_MAPPING_CANDIDATES,
    },
    sources: selectedSources,
    responsibilities: N1_SELECTED_SOURCE_IDS.map((candidateId) => responsibilityById.get(candidateId)),
    metadataCandidates: N1_METADATA_CANDIDATE_IDS.map((candidateId) => candidateById.get(candidateId)),
    apiInputManifest: apiManifest.value,
    apiInputs,
    reviewExposures: stage.value.exposureLedger.entries,
    evidence: {
      sourceLedger: source.evidence,
      responsibilityLedger: responsibility.evidence,
      candidatePool: candidates.evidence,
      apiInputs: apiManifest.evidence,
    },
  });
}

async function writeOnceOrVerify(path: string, value: unknown): Promise<"written" | "reused"> {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  try {
    await writeFile(path, text, { flag: "wx" });
    return "written";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = await readFile(path, "utf8");
    if (existing !== text) fail(`existing evidence differs at ${path}`);
    return "reused";
  }
}

export async function writeN1CorpusFromRepository(root: string) {
  const result = await buildN1CorpusFromRepository(root);
  const corpusRoot = join(root, CURRENT_RESULT_ROOT, "corpus");
  await mkdir(corpusRoot, { recursive: true });
  const outputs = [
    ["source-ledger.json", result.sourceLedger],
    ["duty-matrix.json", result.dutyMatrix],
    ["exposure-ledger.json", result.exposureLedger],
  ] as const;
  const files = [];
  for (const [name, value] of outputs) {
    const state = await writeOnceOrVerify(join(corpusRoot, name), value);
    const bytes = await readFile(join(corpusRoot, name));
    files.push({ path: `${CURRENT_RESULT_ROOT}/corpus/${name}`, sha256: sha256(bytes), bytes: bytes.byteLength, state });
  }
  return { result, files };
}
