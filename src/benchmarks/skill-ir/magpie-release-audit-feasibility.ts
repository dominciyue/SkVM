import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const GitShaSchema = z.string().regex(/^[0-9a-f]{40}$/u);
const FrozenSourceSchema = z.object({
  path: z.string().min(1),
  rawUrl: z.string().url(),
  gitBlobSha: GitShaSchema,
  sha256: Sha256Schema,
  bytes: z.number().int().positive(),
}).strict();

export const MagpieReleaseAuditFeasibilitySchema = z.object({
  schemaVersion: z.literal("skill-ir-magpie-release-audit-feasibility/v1"),
  auditId: z.literal("magpie-release-audit-step-1"),
  status: z.literal("go-to-step-2-after-user-confirmation"),
  upstream: z.object({
    repository: z.literal("https://github.com/apache/magpie"),
    commit: z.literal("453dd9f20bdebe9d4458d84682bd707be1414f80"),
    evalTreeGitSha: z.literal("d7bea29471e00f49144d9c909d665c62186e879b"),
    sources: z.array(FrozenSourceSchema).length(4),
    suites: z.tuple([
      z.object({ id: z.literal("step-0-preflight"), cases: z.literal(3), deterministicPredicates: z.literal(1), judgePredicates: z.literal(0) }).strict(),
      z.object({ id: z.literal("step-1-gather-record"), cases: z.literal(2), deterministicPredicates: z.literal(2), judgePredicates: z.literal(2) }).strict(),
      z.object({ id: z.literal("step-2-assemble-record"), cases: z.literal(4), deterministicPredicates: z.literal(1), judgePredicates: z.literal(6) }).strict(),
    ]),
    totalPublicCases: z.literal(9),
    promptConstruction: z.object({
      skillSectionSelectedByExactHeading: z.literal(true),
      sectionEndsAtNextPeerOrParentHeading: z.literal(true),
      outputSpecAppended: z.literal(true),
      publicReportInjectedIntoFixedTemplate: z.literal(true),
      finalPromptJoin: z.literal("system_prompt + LF + LF + user_prompt"),
    }).strict(),
  }).strict(),
  originalBaseline: z.object({
    status: z.literal("feasible-with-new-project-measurement-identity"),
    promptIdentityReproducible: z.literal(true),
    upstreamHarnessCapturesModelTokens: z.literal(false),
    upstreamHarnessTelemetry: z.literal("stdout-stderr-exit-code-only"),
    projectRuntimeCapturesModelTokens: z.literal(true),
    projectRuntimeEvidencePath: z.literal("src/core/pi-runtime.ts"),
    existingBaselineRows: z.literal(0),
    requiredFreezeInputs: z.tuple([
      z.literal("fixed upstream commit and exact source digests"),
      z.literal("exact suite, case, extracted skill section, output spec, and user prompt bytes"),
      z.literal("model, provider, adapter, temperature policy, timeout policy, and project runner closure"),
      z.literal("fresh original rows with input, output, cache-read, and cache-write token telemetry"),
    ]),
    prohibition: z.literal("Upstream expected.json and assertions are checker-only and must never enter the original model prompt or artifact compiler input."),
  }).strict(),
  solidification: z.object({
    status: z.literal("feasible-with-bounded-domain-patch"),
    restrictedDslContribution: z.tuple([
      z.literal("read fixed structured JSON and select JSON-pointer fields"),
      z.literal("enumerate JSON object keys"),
      z.literal("sort and deduplicate string collections"),
      z.literal("write deterministic JSON records"),
    ]),
    boundedPatchResponsibilities: z.tuple([
      z.literal("parse the public release-audit fixture format and normalize URLs and release fields"),
      z.literal("derive MISSING versus REDACTED and binding-voter roster handles"),
      z.literal("detect the fixed-contract forged-instruction patterns without executing them"),
      z.literal("render the audit-record Markdown template and required-field schema violations"),
    ]),
    initialScope: z.literal("fixed public Step 0-2 fixtures; no live GitHub, mail archive, SVN, private tracker, or PR side effect"),
    estimatedPatchPhysicalLoc: z.object({ minimum: z.literal(240), maximum: z.literal(360) }).strict(),
    broadCrossFieldCountsImplemented: z.literal(false),
    claim: z.literal("The deterministic record core is solidifiable, but live source discovery and open-ended privacy or injection judgment remain outside the first artifact boundary."),
  }).strict(),
  machineChecker: z.object({
    status: z.literal("feasible-but-must-replace-upstream-judge-authority"),
    upstreamJudgePredicatesReusableAsMachineAuthority: z.literal(false),
    deterministicAuthority: z.tuple([
      z.literal("strict output key and type validation"),
      z.literal("exact fixture-derived field and sentinel consistency"),
      z.literal("required-field schema-violation set equality"),
      z.literal("email and forbidden private-source marker absence"),
      z.literal("baseline-pass plus targeted mutation-fail checks"),
    ]),
    estimatedPhysicalLoc: z.object({ minimum: z.literal(260), maximum: z.literal(420) }).strict(),
    estimatedHumanHours: z.object({ minimum: z.literal(4), maximum: z.literal(8) }).strict(),
    estimateStatus: z.literal("prospective-estimate-not-measured"),
  }).strict(),
  risks: z.tuple([
    z.literal("The upstream harness does not expose token usage, so using it alone would leave break-even not computable."),
    z.literal("Eight upstream assertions use an LLM judge and cannot qualify machine-checked quality without deterministic replacements."),
    z.literal("A fixed-fixture artifact would not prove live-network or unseen-release generalization."),
  ]),
  accounting: z.object({
    cloneOperations: z.literal(0),
    importedFiles: z.literal(0),
    externalExecutions: z.literal(0),
    modelCalls: z.literal(0),
    apiCalls: z.literal(0),
    paidCalls: z.literal(0),
    baselineRows: z.literal(0),
    heldOutAccesses: z.literal(0),
  }).strict(),
  decision: z.object({
    candidate: z.literal("apache-magpie-release-audit-report"),
    switchCandidate: z.literal(false),
    step1Complete: z.literal(true),
    step2Started: z.literal(false),
    requiresUserConfirmation: z.literal(true),
    nextStep: z.literal("After explicit confirmation, import only the frozen public source/eval slice, implement deterministic checker and artifact TDD, then freeze a new original-versus-artifact measurement identity before any model call."),
  }).strict(),
  claimBoundary: z.literal("This report is a zero-execution feasibility decision based on fixed-commit public source bytes read in memory. It establishes neither release-audit correctness, imported fixture identity, an original token baseline, artifact quality, break-even, nor external-skill generalization."),
}).strict();

export type MagpieReleaseAuditFeasibility = z.infer<typeof MagpieReleaseAuditFeasibilitySchema>;

const Commit = "453dd9f20bdebe9d4458d84682bd707be1414f80";
const rawUrl = (path: string) => `https://raw.githubusercontent.com/apache/magpie/${Commit}/${path}`;

export function buildMagpieReleaseAuditFeasibility(): MagpieReleaseAuditFeasibility {
  return MagpieReleaseAuditFeasibilitySchema.parse({
    schemaVersion: "skill-ir-magpie-release-audit-feasibility/v1",
    auditId: "magpie-release-audit-step-1",
    status: "go-to-step-2-after-user-confirmation",
    upstream: {
      repository: "https://github.com/apache/magpie",
      commit: Commit,
      evalTreeGitSha: "d7bea29471e00f49144d9c909d665c62186e879b",
      sources: [
        { path: "skills/release-audit-report/SKILL.md", rawUrl: rawUrl("skills/release-audit-report/SKILL.md"), gitBlobSha: "5a9740001a7a12886bcdf9b50581e53118f7580d", sha256: "750e114c6954d0982cd1090c2d06723934c91be31df612cfb58e13abc7f04f93", bytes: 20807 },
        { path: "skills/release-audit-report/audit-record-schema.md", rawUrl: rawUrl("skills/release-audit-report/audit-record-schema.md"), gitBlobSha: "a692eb289c6cae70c9b828342a9a0fcf843d87e4", sha256: "7d66edadc52e0b6f13f0ab4135dff4d6415a9a4d4ec6a41bdca2c735539fc8d4", bytes: 3739 },
        { path: "tools/skill-evals/evals/release-audit-report/README.md", rawUrl: rawUrl("tools/skill-evals/evals/release-audit-report/README.md"), gitBlobSha: "b4395b9e2bbc3471d66ec6cc5e2355c803c6410e", sha256: "647b5af2d8d3ab355b4845fe098e30b07adf574ec7e438659e6de037620524bd", bytes: 3479 },
        { path: "tools/skill-evals/src/skill_evals/runner.py", rawUrl: rawUrl("tools/skill-evals/src/skill_evals/runner.py"), gitBlobSha: "7b3b49d6fab851a44021465ce87f8d27a5632cd1", sha256: "9b1f8d46f6211155adfa420bd857e085f110d38e0041683cebf4d3dc908262f0", bytes: 53270 },
      ],
      suites: [
        { id: "step-0-preflight", cases: 3, deterministicPredicates: 1, judgePredicates: 0 },
        { id: "step-1-gather-record", cases: 2, deterministicPredicates: 2, judgePredicates: 2 },
        { id: "step-2-assemble-record", cases: 4, deterministicPredicates: 1, judgePredicates: 6 },
      ],
      totalPublicCases: 9,
      promptConstruction: {
        skillSectionSelectedByExactHeading: true,
        sectionEndsAtNextPeerOrParentHeading: true,
        outputSpecAppended: true,
        publicReportInjectedIntoFixedTemplate: true,
        finalPromptJoin: "system_prompt + LF + LF + user_prompt",
      },
    },
    originalBaseline: {
      status: "feasible-with-new-project-measurement-identity",
      promptIdentityReproducible: true,
      upstreamHarnessCapturesModelTokens: false,
      upstreamHarnessTelemetry: "stdout-stderr-exit-code-only",
      projectRuntimeCapturesModelTokens: true,
      projectRuntimeEvidencePath: "src/core/pi-runtime.ts",
      existingBaselineRows: 0,
      requiredFreezeInputs: [
        "fixed upstream commit and exact source digests",
        "exact suite, case, extracted skill section, output spec, and user prompt bytes",
        "model, provider, adapter, temperature policy, timeout policy, and project runner closure",
        "fresh original rows with input, output, cache-read, and cache-write token telemetry",
      ],
      prohibition: "Upstream expected.json and assertions are checker-only and must never enter the original model prompt or artifact compiler input.",
    },
    solidification: {
      status: "feasible-with-bounded-domain-patch",
      restrictedDslContribution: [
        "read fixed structured JSON and select JSON-pointer fields",
        "enumerate JSON object keys",
        "sort and deduplicate string collections",
        "write deterministic JSON records",
      ],
      boundedPatchResponsibilities: [
        "parse the public release-audit fixture format and normalize URLs and release fields",
        "derive MISSING versus REDACTED and binding-voter roster handles",
        "detect the fixed-contract forged-instruction patterns without executing them",
        "render the audit-record Markdown template and required-field schema violations",
      ],
      initialScope: "fixed public Step 0-2 fixtures; no live GitHub, mail archive, SVN, private tracker, or PR side effect",
      estimatedPatchPhysicalLoc: { minimum: 240, maximum: 360 },
      broadCrossFieldCountsImplemented: false,
      claim: "The deterministic record core is solidifiable, but live source discovery and open-ended privacy or injection judgment remain outside the first artifact boundary.",
    },
    machineChecker: {
      status: "feasible-but-must-replace-upstream-judge-authority",
      upstreamJudgePredicatesReusableAsMachineAuthority: false,
      deterministicAuthority: [
        "strict output key and type validation",
        "exact fixture-derived field and sentinel consistency",
        "required-field schema-violation set equality",
        "email and forbidden private-source marker absence",
        "baseline-pass plus targeted mutation-fail checks",
      ],
      estimatedPhysicalLoc: { minimum: 260, maximum: 420 },
      estimatedHumanHours: { minimum: 4, maximum: 8 },
      estimateStatus: "prospective-estimate-not-measured",
    },
    risks: [
      "The upstream harness does not expose token usage, so using it alone would leave break-even not computable.",
      "Eight upstream assertions use an LLM judge and cannot qualify machine-checked quality without deterministic replacements.",
      "A fixed-fixture artifact would not prove live-network or unseen-release generalization.",
    ],
    accounting: {
      cloneOperations: 0,
      importedFiles: 0,
      externalExecutions: 0,
      modelCalls: 0,
      apiCalls: 0,
      paidCalls: 0,
      baselineRows: 0,
      heldOutAccesses: 0,
    },
    decision: {
      candidate: "apache-magpie-release-audit-report",
      switchCandidate: false,
      step1Complete: true,
      step2Started: false,
      requiresUserConfirmation: true,
      nextStep: "After explicit confirmation, import only the frozen public source/eval slice, implement deterministic checker and artifact TDD, then freeze a new original-versus-artifact measurement identity before any model call.",
    },
    claimBoundary: "This report is a zero-execution feasibility decision based on fixed-commit public source bytes read in memory. It establishes neither release-audit correctness, imported fixture identity, an original token baseline, artifact quality, break-even, nor external-skill generalization.",
  });
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

if (import.meta.main) {
  const reportArg = process.argv.slice(2).find((entry) => entry.startsWith("--report="))?.slice("--report=".length);
  if (!reportArg) throw new Error("Magpie feasibility requires --report");
  const report = buildMagpieReleaseAuditFeasibility();
  await writeJsonAtomic(resolve(reportArg), report);
  process.stdout.write(`${JSON.stringify({ status: report.status, accounting: report.accounting, decision: report.decision }, null, 2)}\n`);
}
