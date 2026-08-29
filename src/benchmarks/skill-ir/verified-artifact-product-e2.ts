import { lstat, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";
import { runVerifiedArtifactCli } from "../../skill-ir/verified-artifact-cli";
import {
  VerifiedArtifactProductCostReportSchema,
  VerifiedArtifactWorkflowConfigSchema,
} from "../../skill-ir/verified-artifact-product";
import { constructDomainSkillCandidates } from "./automatic-domain-construction";
import { sha256Bytes } from "./source-fixture";

const ProbeRoot = "benchmarks/skill-ir/pilots/package-inventory-probe";
const ConfigPath = `${ProbeRoot}/verified-artifact-product-e2.json`;
const PublicWorkdirPath = `${ProbeRoot}/public-workdir`;
const OutputPath = "package-inventory.json";

const ProspectiveAuthoringSchema = z.object({
  schemaVersion: z.literal("skill-ir-e2-probe-authoring-measurement/v1"),
  probeId: z.literal("package-inventory-probe"),
  status: z.literal("complete"),
  measurementStartedAt: z.string().datetime(),
  measurementCompletedAt: z.string().datetime(),
  humanMinutes: z.number().int().positive(),
  measurementMethod: z.literal("prospective-wall-clock"),
  laborBoundary: z.string().min(1),
  breakdownHumanMinutes: z.object({
    sourceAndPublicFixture: z.number().int().nonnegative(),
    thinTaskDescription: z.number().int().nonnegative(),
    reviewedPlanAndPatch: z.number().int().nonnegative(),
    productProbeImplementationAndVerification: z.number().int().nonnegative(),
  }).strict(),
  scope: z.array(z.string().min(1)).min(1),
  paidModelCalls: z.literal(0),
  heldOutAccesses: z.literal(0),
  evaluatorPayloadAccesses: z.literal(0),
}).strict().superRefine((measurement, context) => {
  const sum = Object.values(measurement.breakdownHumanMinutes).reduce((total, value) => total + value, 0);
  if (sum !== measurement.humanMinutes) {
    context.addIssue({ code: "custom", message: "prospective authoring breakdown does not sum to total human minutes" });
  }
});

const DigestRecordSchema = z.object({
  path: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  bytes: z.number().int().nonnegative(),
}).strict();

export const E2ProbeReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-verified-artifact-e2-probe/v1"),
  probeId: z.literal("package-inventory-probe"),
  status: z.literal("complete"),
  minimumInputs: z.tuple([
    z.literal("public-skill-source"),
    z.literal("thin-task-description"),
    z.literal("public-workdir"),
    z.literal("reviewed-plan"),
    z.literal("review-patch"),
  ]),
  accounting: z.object({
    actualPaidModelCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
    evaluatorPayloadAccesses: z.literal(0),
    taskSetAccesses: z.literal(0),
    scorerAccesses: z.literal(0),
    coreBranchDelta: z.literal(0),
    legacyPlanAuditPaidCallsField: z.literal(1),
  }).strict(),
  publicInputs: z.array(DigestRecordSchema).length(2),
  authoring: z.object({
    prospectiveTotal: ProspectiveAuthoringSchema,
    taskDescription: z.object({ humanMinutes: z.number().int().nonnegative(), physicalLoc: z.number().int().positive() }).strict(),
    reviewedPlan: z.object({ physicalLoc: z.number().int().positive() }).strict(),
    reviewPatch: z.object({ physicalLoc: z.number().int().positive() }).strict(),
    combinedReviewAdapter: z.object({ humanMinutes: z.number().int().nonnegative(), physicalLoc: z.number().int().positive() }).strict(),
    acceptanceHumanMinutesPerArtifact: z.number().positive(),
  }).strict(),
  semanticAccounting: z.object({
    fromSkillSourceUnits: z.number().int().nonnegative(),
    fromTaskDeclarationUnits: z.number().int().nonnegative(),
    automationProduced: z.object({
      contractBindings: z.number().int().nonnegative(),
      irTaskAbiBindings: z.number().int().nonnegative(),
      validationPredicates: z.number().int().nonnegative(),
      genericDeterministicPredicates: z.number().int().nonnegative(),
    }).strict(),
    automatic: z.object({
      deterministicGate: z.enum(["passed", "failed"]),
      packageCandidate: z.literal("non-executable"),
      semanticParity: z.literal("not-established"),
      humanGapCount: z.number().int().nonnegative(),
    }).strict(),
    declaration: z.object({
      thinness: z.enum(["within-limit", "declaration-heavy"]),
      physicalLoc: z.number().int().positive(),
      semanticEntries: z.number().int().nonnegative(),
    }).strict(),
    humanReview: z.object({
      planPhysicalLoc: z.number().int().positive(),
      patchPhysicalLoc: z.number().int().positive(),
      combinedPhysicalLoc: z.number().int().positive(),
      humanMinutes: z.number().int().nonnegative(),
      requiredCapabilities: z.tuple([
        z.literal("enumerate-json-object-keys"),
        z.literal("sort-and-deduplicate-strings"),
        z.literal("derive-cross-field-counts"),
      ]),
    }).strict(),
    unresolved: z.array(z.string().min(1)).min(1),
  }).strict(),
  determinism: z.object({
    fullChainRuns: z.literal(2),
    artifactClosureEqual: z.boolean(),
    outputClosureEqual: z.boolean(),
    protectedInputsPreserved: z.boolean(),
  }).strict(),
  runs: z.array(z.object({
    id: z.enum(["run-1", "run-2"]),
    productPath: z.string().min(1),
    workdirPath: z.string().min(1),
    outputPath: z.string().min(1),
    artifactClosureSha256: z.string().regex(/^[0-9a-f]{64}$/u),
    outputSha256: z.string().regex(/^[0-9a-f]{64}$/u),
  }).strict()).length(2),
  productCost: VerifiedArtifactProductCostReportSchema,
  claimBoundary: z.string().min(1),
}).strict();

export type PackageInventoryE2Report = z.infer<typeof E2ProbeReportSchema>;

function contained(rootDir: string, path: string): string {
  if (!path || isAbsolute(path) || path.includes("\\")
    || path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`unsafe relative path: ${path}`);
  }
  const root = resolve(rootDir);
  const target = resolve(root, ...path.split("/"));
  const fromRoot = relative(root, target);
  if (fromRoot === ".." || fromRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
    || isAbsolute(fromRoot)) throw new Error(`path escapes root: ${path}`);
  return target;
}

function portable(path: string): string {
  return path.replaceAll("\\", "/");
}

function physicalLoc(text: string): number {
  return text.split(/\r?\n/u).filter((line) => line.trim()).length;
}

async function materializePublicWorkdir(rootDir: string, workDir: string) {
  await mkdir(workDir, { recursive: true });
  if ((await readdir(workDir)).length > 0) throw new Error(`E2 workdir must be empty: ${workDir}`);
  const fixtureDir = contained(rootDir, PublicWorkdirPath);
  const entries = await readdir(fixtureDir, { withFileTypes: true });
  const publicInputs = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    const source = join(fixtureDir, entry.name);
    const info = await lstat(source);
    if (!entry.isFile() || info.isSymbolicLink()) throw new Error(`E2 public fixture must be a regular file: ${entry.name}`);
    const bytes = await readFile(source);
    const destination = contained(workDir, entry.name);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
    publicInputs.push(DigestRecordSchema.parse({
      path: entry.name,
      sha256: sha256Bytes(bytes),
      bytes: bytes.byteLength,
    }));
  }
  if (JSON.stringify(publicInputs.map((entry) => entry.path)) !== JSON.stringify([
    "package-inventory-interface.json",
    "package.json",
  ])) throw new Error("E2 public workdir fixture identity drift");
  return publicInputs;
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

export async function runPackageInventoryE2Probe(options: {
  rootDir: string;
  runRoot: string;
  acceptedAt: string;
  acceptanceHumanMinutesPerArtifact: number;
  acceptanceNote: string;
}): Promise<PackageInventoryE2Report> {
  const rootDir = resolve(options.rootDir);
  const runRoot = resolve(options.runRoot);
  await mkdir(runRoot, { recursive: true });
  if ((await readdir(runRoot)).length > 0) throw new Error(`E2 run root must be empty: ${runRoot}`);
  const config = VerifiedArtifactWorkflowConfigSchema.parse(JSON.parse(
    await readFile(contained(rootDir, ConfigPath), "utf8"),
  ));
  const prospectiveAuthoring = ProspectiveAuthoringSchema.parse(JSON.parse(
    await readFile(contained(rootDir, `${ProbeRoot}/prospective-authoring.json`), "utf8"),
  ));
  const construction = await constructDomainSkillCandidates(rootDir, {
    schemaVersion: "skill-ir-domain-automatic-construction-input/v1",
    source: config.source,
    taskDescription: config.taskDescription,
  });
  const publicInputs = await materializePublicWorkdir(rootDir, join(runRoot, "run-1/workdir"));
  await materializePublicWorkdir(rootDir, join(runRoot, "run-2/workdir"));
  const runs = [];
  const products = [];
  for (const id of ["run-1", "run-2"] as const) {
    const workdirPath = `${id}/workdir`;
    const productPath = `${id}/product`;
    const product = await runVerifiedArtifactCli([
      `--root=${rootDir}`,
      `--config=${ConfigPath}`,
      `--workdir=${join(runRoot, workdirPath)}`,
      `--out=${join(runRoot, productPath)}`,
      "--accept",
      `--accepted-at=${options.acceptedAt}`,
      `--human-minutes=${options.acceptanceHumanMinutesPerArtifact}`,
      `--note=${options.acceptanceNote}`,
    ], rootDir);
    const outputPath = `${workdirPath}/${OutputPath}`;
    const outputBytes = await readFile(join(runRoot, outputPath));
    products.push(product);
    runs.push({
      id,
      productPath,
      workdirPath,
      outputPath,
      artifactClosureSha256: product.artifact.closureSha256,
      outputSha256: sha256Bytes(outputBytes),
    });
  }
  const descriptionText = await readFile(contained(rootDir, config.taskDescription.path), "utf8");
  const planText = await readFile(contained(rootDir, config.review.automaticPlan.path), "utf8");
  const patchText = await readFile(contained(rootDir, config.review.patch.path), "utf8");
  const report = E2ProbeReportSchema.parse({
    schemaVersion: "skill-ir-verified-artifact-e2-probe/v1",
    probeId: "package-inventory-probe",
    status: "complete",
    minimumInputs: [
      "public-skill-source",
      "thin-task-description",
      "public-workdir",
      "reviewed-plan",
      "review-patch",
    ],
    accounting: {
      actualPaidModelCalls: construction.audit.paidCalls,
      heldOutAccesses: construction.audit.heldOutAccesses,
      evaluatorPayloadAccesses: construction.audit.evaluatorPayloadAccesses,
      taskSetAccesses: 0,
      scorerAccesses: 0,
      coreBranchDelta: config.review.coreBranchDelta,
      legacyPlanAuditPaidCallsField: JSON.parse(planText).audit.paidCalls,
    },
    publicInputs,
    authoring: {
      prospectiveTotal: prospectiveAuthoring,
      taskDescription: {
        humanMinutes: config.taskDescription.authoring.humanMinutes,
        physicalLoc: physicalLoc(descriptionText),
      },
      reviewedPlan: { physicalLoc: physicalLoc(planText) },
      reviewPatch: { physicalLoc: physicalLoc(patchText) },
      combinedReviewAdapter: {
        humanMinutes: config.review.humanMinutes,
        physicalLoc: config.review.physicalLoc,
      },
      acceptanceHumanMinutesPerArtifact: options.acceptanceHumanMinutesPerArtifact,
    },
    semanticAccounting: {
      fromSkillSourceUnits: construction.semanticAccounting.fromSkillSource.units.length,
      fromTaskDeclarationUnits: construction.semanticAccounting.fromTaskDeclaration.units.length,
      automationProduced: construction.semanticAccounting.automationProduced,
      automatic: {
        deterministicGate: construction.validationPlan.deterministicGate.status,
        packageCandidate: construction.packageCandidate.status,
        semanticParity: construction.semanticParity.status,
        humanGapCount: construction.semanticAccounting.stillRequiresHuman.length,
      },
      declaration: {
        thinness: construction.thinness.status,
        physicalLoc: construction.thinness.loc,
        semanticEntries: construction.thinness.semanticEntries,
      },
      humanReview: {
        planPhysicalLoc: physicalLoc(planText),
        patchPhysicalLoc: physicalLoc(patchText),
        combinedPhysicalLoc: config.review.physicalLoc,
        humanMinutes: config.review.humanMinutes,
        requiredCapabilities: [
          "enumerate-json-object-keys",
          "sort-and-deduplicate-strings",
          "derive-cross-field-counts",
        ],
      },
      unresolved: [
        "legacy restricted-plan audit ABI cannot represent an actually zero-paid manually authored plan",
        "automatic construction remains a non-executable candidate and does not establish semantic parity",
        "B-default quality is user-accepted rather than machine-checked",
        "no original recurring model-token baseline exists, so token break-even is not computable",
        "no human-time valuation policy exists, so total-cost break-even is not computable",
      ],
    },
    determinism: {
      fullChainRuns: 2,
      artifactClosureEqual: runs[0]!.artifactClosureSha256 === runs[1]!.artifactClosureSha256,
      outputClosureEqual: runs[0]!.outputSha256 === runs[1]!.outputSha256,
      protectedInputsPreserved: products.every((product) => product.runEvidence.protectedInputsPreserved),
    },
    runs,
    productCost: products[0]!.cost,
    claimBoundary: "This controlled in-repository probe establishes product-chain executability and deterministic closure only. It does not establish machine-checked semantic quality, a positive token break-even, research eligibility, external-skill generalization, or full automation.",
  });
  await writeJsonAtomic(join(runRoot, "report.json"), report);
  return report;
}

function flag(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return args.find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const rootDir = resolve(flag(args, "root") ?? process.cwd());
  const runRoot = flag(args, "run-root");
  const acceptedAt = flag(args, "accepted-at");
  const acceptanceNote = flag(args, "note");
  const acceptanceHumanMinutesPerArtifact = Number(flag(args, "human-minutes"));
  if (!runRoot || !acceptedAt || !acceptanceNote
    || !Number.isFinite(acceptanceHumanMinutesPerArtifact) || acceptanceHumanMinutesPerArtifact <= 0) {
    throw new Error("E2 requires --run-root, --accepted-at, --human-minutes, and --note");
  }
  const report = await runPackageInventoryE2Probe({
    rootDir,
    runRoot: resolve(rootDir, runRoot),
    acceptedAt,
    acceptanceHumanMinutesPerArtifact,
    acceptanceNote,
  });
  process.stdout.write(`${JSON.stringify({
    status: report.status,
    accounting: report.accounting,
    determinism: report.determinism,
    productCost: report.productCost,
    unresolved: report.semanticAccounting.unresolved,
  }, null, 2)}\n`);
}
