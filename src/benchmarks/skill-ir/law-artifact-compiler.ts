import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import {
  type ValidatedArtifactExecutionPlan,
  type ValidatedArtifactManifest,
  type ValidatedArtifactProvenance,
  type ValidatedArtifactRecord,
  validateValidatedArtifactPackage,
} from "./validated-artifact-catalog";
import { parseSafeRelativePath } from "./artifact-package";
import { ResourceContractSchema } from "./resource-contract";
import { sha256Bytes } from "./source-fixture";

const DigestRefInputSchema = z.object({
  path: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

const LawArtifactCompilerInputSchema = z.object({
  rootDir: z.string().min(1),
  sourceFiles: z.array(DigestRefInputSchema).min(4),
  baseIr: DigestRefInputSchema,
  sourceAudit: DigestRefInputSchema,
  resourceContract: DigestRefInputSchema,
  taskContract: z.object({
    tasks: z.array(z.object({
      id: z.string().regex(/^law-to-markdown-[a-z0-9-]+-dev-[0-9]+$/),
      prompt: z.string().min(1),
    }).strict()).min(1),
  }).strip(),
}).strict();

export type LawArtifactCompilerInput = z.input<typeof LawArtifactCompilerInputSchema>;

const FORBIDDEN_EVIDENCE_CLASSES = [
  "evaluator-payload",
  "held-out",
  "runtime-output",
  "profile-feedback",
  "secret-value",
] as const;

const COMPILER_CONFIG = {
  catalog: "validated-skill-artifact/v1",
  adapter: "law-to-markdown-validated-artifact-compiler",
  version: "v1",
  executionMode: "direct-deterministic-process",
  artifactLevel: "minimal",
  lawDecision: "auto",
  shell: false,
};

const LAW_CHECKER_SOURCE = `from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workdir", required=True)
    args = parser.parse_args()
    workdir = Path(args.workdir).resolve()
    contract_path = Path(__file__).resolve().parents[1] / "schemas" / "review-report-contract.json"
    contract = json.loads(contract_path.read_text(encoding="utf-8"))
    report_path = workdir / "markdown" / "document" / "document+审核报告.md"
    deliverable_path = workdir / "markdown" / "document" / "document+最终成果.md"
    errors = []

    if not report_path.is_file():
        errors.append({"code": "MISSING_REVIEW_REPORT", "relativePath": "markdown/document/document+审核报告.md"})
    else:
        report = report_path.read_text(encoding="utf-8")
        for label in contract["requiredLabels"]:
            if label not in report:
                errors.append({
                    "code": "MISSING_CANONICAL_LABEL",
                    "relativePath": "markdown/document/document+审核报告.md",
                    "contractRef": "review-report-contract/v1",
                })
                break
        outcome_label = contract["requiredLabels"][1]
        outcome = next(
            (line[len(outcome_label):].strip() for line in report.splitlines() if line.startswith(outcome_label)),
            "",
        )
        approved = outcome == contract["outcomes"]["approved"]
        rejected_non_law = outcome == contract["outcomes"]["rejectedNonLaw"]
        if approved and not deliverable_path.is_file():
            errors.append({
                "code": "DELIVERABLE_POLICY_MISMATCH",
                "relativePath": "markdown/document/document+最终成果.md",
                "contractRef": "review-report-contract/v1",
            })
        if rejected_non_law and deliverable_path.exists():
            errors.append({
                "code": "DELIVERABLE_POLICY_MISMATCH",
                "relativePath": "markdown/document/document+最终成果.md",
                "contractRef": "review-report-contract/v1",
            })

    print(json.dumps({
        "schemaVersion": "skill-artifact-validation-report/v1",
        "status": "pass" if not errors else "fail",
        "errors": errors,
    }, ensure_ascii=True))


if __name__ == "__main__":
    main()
`;

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function verifiedBytes(
  rootDir: string,
  ref: { path: string; sha256: string },
): Promise<Uint8Array> {
  const path = parseSafeRelativePath(ref.path);
  const bytes = await readFile(join(rootDir, path));
  const actual = sha256Bytes(bytes);
  if (actual !== ref.sha256) {
    throw new Error(`Compiler input digest mismatch for ${path}: expected ${ref.sha256}, got ${actual}`);
  }
  return bytes;
}

async function digestRef(rootDir: string, path: string): Promise<{ path: string; sha256: string }> {
  const normalized = parseSafeRelativePath(path);
  return { path: normalized, sha256: sha256Bytes(await readFile(join(rootDir, normalized))) };
}

export async function loadLawArtifactCompilerInput(
  rootDir: string,
): Promise<LawArtifactCompilerInput> {
  const pilotDir = "benchmarks/skill-ir/pilots/law-to-markdown";
  const sourcePaths = [
    `${pilotDir}/source/SKILL.md`,
    `${pilotDir}/source/scripts/cn_law_normalizer.py`,
    `${pilotDir}/source/scripts/law_to_markdown.py`,
    `${pilotDir}/source/scripts/stage3_checker.py`,
  ];
  const tasksValue = JSON.parse(await readFile(join(rootDir, `${pilotDir}/tasks.json`), "utf8")) as {
    skillId?: unknown;
    tasks?: unknown;
  };
  if (tasksValue.skillId !== "law-to-markdown" || !Array.isArray(tasksValue.tasks)) {
    throw new Error("Law compiler task registry identity mismatch");
  }
  const tasks = tasksValue.tasks.flatMap((raw): Array<{ id: string; prompt: string }> => {
    if (typeof raw !== "object" || raw === null) return [];
    const task = raw as Record<string, unknown>;
    if (task.split !== "development") return [];
    if (typeof task.id !== "string" || typeof task.prompt !== "string") {
      throw new Error("Law compiler development task projection is invalid");
    }
    return [{ id: task.id, prompt: task.prompt }];
  });
  if (tasks.length === 0) throw new Error("Law compiler requires development task prompts");
  return {
    rootDir,
    sourceFiles: await Promise.all(sourcePaths.map((path) => digestRef(rootDir, path))),
    baseIr: await digestRef(rootDir, `${pilotDir}/base-ir.json`),
    sourceAudit: await digestRef(rootDir, `${pilotDir}/base-ir-source-audit.json`),
    resourceContract: await digestRef(rootDir, `${pilotDir}/resource-contract.json`),
    taskContract: { tasks },
  };
}

function sourceBySuffix(
  records: Array<{ path: string; sha256: string }>,
  suffix: string,
): { path: string; sha256: string } {
  const matches = records.filter((record) => record.path.replaceAll("\\", "/").endsWith(suffix));
  if (matches.length !== 1) {
    throw new Error(`Law compiler requires exactly one source file ending in ${suffix}`);
  }
  return matches[0]!;
}

function reportContractFromPublicSource(source: string) {
  const evidence = {
    title: "# 文档转换审核报告",
    inputLabel: "输入文件：",
    outcomeLabel: "最终审核结论：",
    deliveryLabel: "- 是否可交付：",
    approved: "通过",
    rejectedNonLaw: "拒绝（非法律文档）",
    rejectedCheckFailed: "拒绝（检查未通过）",
  };
  for (const value of Object.values(evidence)) {
    if (!source.includes(value)) {
      throw new Error(`Missing canonical report evidence in public bundled script: ${value}`);
    }
  }
  return {
    schemaVersion: "law-review-report-contract/v1",
    title: evidence.title,
    requiredLabels: [evidence.inputLabel, evidence.outcomeLabel, evidence.deliveryLabel],
    outcomes: {
      approved: evidence.approved,
      rejectedNonLaw: evidence.rejectedNonLaw,
      rejectedCheckFailed: evidence.rejectedCheckFailed,
    },
    deliverableValues: ["是", "否"],
  };
}

function reportTemplate(contract: ReturnType<typeof reportContractFromPublicSource>): string {
  return [
    contract.title,
    "",
    "## 1. 文档基本信息",
    "",
    `${contract.requiredLabels[0]}{{input_file}}`,
    `${contract.requiredLabels[1]}{{review_outcome}}`,
    "",
    "## 6. 最终结论",
    "",
    `- 审核结论：{{review_outcome}}`,
    `${contract.requiredLabels[2]}{{deliverable}}`,
    "",
  ].join("\n");
}

async function ensureEmptyOutputDirectory(outDir: string): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const pending = [outDir];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        throw new Error(`Law artifact output directory must not contain files: ${outDir}`);
      }
      pending.push(join(directory, entry.name));
    }
  }
}

async function writeArtifact(
  outDir: string,
  record: Omit<ValidatedArtifactRecord, "sha256">,
  bytes: Uint8Array | string,
): Promise<ValidatedArtifactRecord> {
  const path = join(outDir, record.path);
  await mkdir(dirname(path), { recursive: true });
  const content = typeof bytes === "string" ? Buffer.from(bytes, "utf8") : bytes;
  await writeFile(path, content);
  return { ...record, sha256: sha256Bytes(content) };
}

export async function compileLawValidatedArtifact(
  rawInput: LawArtifactCompilerInput,
  outDir: string,
): Promise<void> {
  const input = LawArtifactCompilerInputSchema.parse(rawInput);
  await ensureEmptyOutputDirectory(outDir);

  const skillSourceRef = sourceBySuffix(input.sourceFiles, "/source/SKILL.md");
  const normalizerRef = sourceBySuffix(input.sourceFiles, "/scripts/cn_law_normalizer.py");
  const converterRef = sourceBySuffix(input.sourceFiles, "/scripts/law_to_markdown.py");
  const stage3Ref = sourceBySuffix(input.sourceFiles, "/scripts/stage3_checker.py");
  const [skillSource, normalizer, converter, stage3, baseIr, sourceAudit, resourceBytes] =
    await Promise.all([
      verifiedBytes(input.rootDir, skillSourceRef),
      verifiedBytes(input.rootDir, normalizerRef),
      verifiedBytes(input.rootDir, converterRef),
      verifiedBytes(input.rootDir, stage3Ref),
      verifiedBytes(input.rootDir, input.baseIr),
      verifiedBytes(input.rootDir, input.sourceAudit),
      verifiedBytes(input.rootDir, input.resourceContract),
    ]);
  const resourceContract = ResourceContractSchema.parse(JSON.parse(Buffer.from(resourceBytes).toString("utf8")));
  const sourceAuditValue = JSON.parse(Buffer.from(sourceAudit).toString("utf8")) as {
    skillId?: unknown;
    excludedEvidenceClasses?: unknown;
  };
  if (sourceAuditValue.skillId !== "law-to-markdown") {
    throw new Error("Law compiler source audit skill identity mismatch");
  }
  const exclusions = sourceAuditValue.excludedEvidenceClasses;
  if (!Array.isArray(exclusions) || !["evaluator-payload", "held-out", "runtime-output", "profile-feedback"]
    .every((value) => exclusions.includes(value))) {
    throw new Error("Law compiler source audit does not exclude forbidden evidence classes");
  }

  const converterText = Buffer.from(converter).toString("utf8");
  const contract = reportContractFromPublicSource(converterText);
  const skillView = [
    "# Law to Markdown - Compiled Artifact View",
    "",
    "Catalog: validated-skill-artifact/v1",
    "Execution: direct deterministic Python process, followed by runtime validation.",
    "Network and package installation are forbidden.",
    "The deterministic offline scorer remains the task-success authority.",
    "",
    Buffer.from(skillSource).toString("utf8").split(/\r?\n/u)[0] ?? "",
    "",
  ].join("\n");
  const toolPlan = {
    schemaVersion: "law-to-markdown-tool-plan/v1",
    mode: "direct-deterministic-process",
    interpreter: resourceContract.interpreter,
    input: "document.txt",
    outputDirectory: "markdown",
    arguments: [
      "--law-decision",
      "auto",
      "--artifact-level",
      "minimal",
    ],
    shell: false,
    network: resourceContract.network,
    packageInstall: resourceContract.packageInstall,
  };

  const artifacts: ValidatedArtifactRecord[] = [];
  artifacts.push(await writeArtifact(outDir, {
    id: "skill-ir",
    path: "skill-ir.json",
    kind: "skill-ir",
  }, baseIr));
  artifacts.push(await writeArtifact(outDir, {
    id: "skill-view",
    path: "skill.md",
    kind: "skill-view",
  }, skillView));
  artifacts.push(await writeArtifact(outDir, {
    id: "law-normalizer",
    path: "artifacts/scripts/cn_law_normalizer.py",
    kind: "script",
  }, normalizer));
  artifacts.push(await writeArtifact(outDir, {
    id: "law-converter",
    path: "artifacts/scripts/law_to_markdown.py",
    kind: "script",
  }, converter));
  artifacts.push(await writeArtifact(outDir, {
    id: "law-stage3-checker",
    path: "artifacts/scripts/stage3_checker.py",
    kind: "script",
  }, stage3));
  artifacts.push(await writeArtifact(outDir, {
    id: "law-runtime-checker",
    path: "artifacts/checks/law_artifact_check.py",
    kind: "check",
  }, LAW_CHECKER_SOURCE));
  artifacts.push(await writeArtifact(outDir, {
    id: "law-review-template",
    path: "artifacts/templates/review-report-contract.md",
    kind: "template",
  }, reportTemplate(contract)));
  artifacts.push(await writeArtifact(outDir, {
    id: "law-review-schema",
    path: "artifacts/schemas/review-report-contract.json",
    kind: "schema",
  }, jsonText(contract)));
  artifacts.push(await writeArtifact(outDir, {
    id: "law-tool-plan",
    path: "artifacts/tool-plans/law-to-markdown.json",
    kind: "tool-plan",
  }, jsonText(toolPlan)));
  artifacts.push(await writeArtifact(outDir, {
    id: "law-resource-policy",
    path: "validation-policy.json",
    kind: "validation-policy",
  }, resourceBytes));
  artifacts.push(await writeArtifact(outDir, {
    id: "law-validation-notes",
    path: "validation-notes.json",
    kind: "validation-notes",
  }, jsonText({
    schemaVersion: "skill-artifact-validation-notes/v1",
    status: "candidate",
    mechanismValidationEvidence: "external-required",
    developmentGatePassed: false,
    heldOutExecutionAllowed: false,
    entersMainClaim: false,
  })));

  const executionPlan: ValidatedArtifactExecutionPlan = {
    schemaVersion: "skill-artifact-execution-plan/v1",
    entrypoint: "validate-output",
    nodes: [
      {
        id: "convert-document",
        kind: "process",
        dependsOn: [],
        command: {
          interpreter: {
            env: resourceContract.interpreter.env,
            fallback: resourceContract.interpreter.fallbackCommand,
          },
          artifactId: "law-converter",
          args: [
            "document.txt",
            "--out-dir",
            "markdown",
            "--law-decision",
            "auto",
            "--artifact-level",
            "minimal",
          ],
          envAllowlist: [resourceContract.interpreter.env],
        },
        timeoutMs: 120_000,
      },
      {
        id: "validate-output",
        kind: "validate",
        dependsOn: ["convert-document"],
        command: {
          interpreter: {
            env: resourceContract.interpreter.env,
            fallback: resourceContract.interpreter.fallbackCommand,
          },
          artifactId: "law-runtime-checker",
          args: ["--workdir", "{workdir}"],
          envAllowlist: [resourceContract.interpreter.env],
        },
        timeoutMs: 30_000,
      },
    ],
  };
  const executionPlanText = jsonText(executionPlan);
  const executionPlanDigest = sha256Bytes(Buffer.from(executionPlanText, "utf8"));
  await writeFile(join(outDir, "execution-plan.json"), executionPlanText, "utf8");

  const taskIds = input.taskContract.tasks.map((task) => task.id).sort();
  const promptProjection = input.taskContract.tasks
    .map((task) => ({ id: task.id, prompt: task.prompt }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const provenance: ValidatedArtifactProvenance = {
    schemaVersion: "validated-skill-artifact-provenance/v1",
    catalog: "validated-skill-artifact/v1",
    skillId: "law-to-markdown",
    constructionSplit: "development",
    compiler: {
      id: "law-to-markdown-validated-artifact-compiler",
      version: "v1",
      configSha256: sha256Bytes(Buffer.from(JSON.stringify(COMPILER_CONFIG), "utf8")),
    },
    inputs: {
      sourceClosure: input.sourceFiles.map((record) => ({
        path: parseSafeRelativePath(record.path),
        sha256: record.sha256,
      })).sort((a, b) => a.path.localeCompare(b.path)),
      baseIr: { path: parseSafeRelativePath(input.baseIr.path), sha256: input.baseIr.sha256 },
      sourceAudit: {
        path: parseSafeRelativePath(input.sourceAudit.path),
        sha256: input.sourceAudit.sha256,
      },
      resourceContract: {
        path: parseSafeRelativePath(input.resourceContract.path),
        sha256: input.resourceContract.sha256,
      },
      taskContract: {
        taskIds,
        promptDigest: sha256Bytes(Buffer.from(JSON.stringify(promptProjection), "utf8")),
      },
    },
    forbiddenEvidenceClasses: [...FORBIDDEN_EVIDENCE_CLASSES],
    artifacts,
  };
  const provenanceText = jsonText(provenance);
  const provenanceDigest = sha256Bytes(Buffer.from(provenanceText, "utf8"));
  await writeFile(join(outDir, "package-provenance.json"), provenanceText, "utf8");

  const manifest: ValidatedArtifactManifest = {
    schemaVersion: "validated-skill-artifact-manifest/v1",
    catalog: "validated-skill-artifact/v1",
    skillId: "law-to-markdown",
    provenance: { path: "package-provenance.json", sha256: provenanceDigest },
    executionPlan: { path: "execution-plan.json", sha256: executionPlanDigest },
    protectedInputs: ["document.txt"],
    generatedOutputs: ["markdown/document"],
    artifacts,
  };
  await writeFile(join(outDir, "package-manifest.json"), jsonText(manifest), "utf8");
  await validateValidatedArtifactPackage(outDir);
}
