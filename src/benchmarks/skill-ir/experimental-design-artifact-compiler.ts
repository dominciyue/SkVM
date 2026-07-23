import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { z } from "zod"
import { SkillIRSchema } from "../../skill-ir/schema.ts"
import {
  type ValidatedArtifactExecutionPlan,
  type ValidatedArtifactManifest,
  type ValidatedArtifactProvenance,
  type ValidatedArtifactRecord,
  validateValidatedArtifactPackage,
} from "./validated-artifact-catalog.ts"
import { parseSafeRelativePath } from "./artifact-package.ts"
import { ResourceContractSchema } from "./resource-contract.ts"
import { sha256Bytes } from "./source-fixture.ts"

const DigestRefInputSchema = z.object({
  path: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
}).strict()

const ExperimentalDesignArtifactCompilerInputSchema = z.object({
  rootDir: z.string().min(1),
  sourceFiles: z.array(DigestRefInputSchema).min(2),
  baseIr: DigestRefInputSchema,
  sourceAudit: DigestRefInputSchema,
  resourceContract: DigestRefInputSchema,
  taskContract: z.object({
    tasks: z.array(z.object({
      id: z.string().regex(/^experimental-design-[a-z0-9-]+-dev-[0-9]+$/),
      prompt: z.string().min(1),
    }).strict()).min(1),
  }).strip(),
}).strict()

export type ExperimentalDesignArtifactCompilerInput =
  z.input<typeof ExperimentalDesignArtifactCompilerInputSchema>

const FORBIDDEN_EVIDENCE_CLASSES = [
  "evaluator-payload",
  "held-out",
  "runtime-output",
  "profile-feedback",
  "secret-value",
] as const

const COMPILER_CONFIG = {
  catalog: "validated-skill-artifact/v1",
  adapter: "experimental-design-validated-artifact-compiler",
  version: "v1",
  phenotype: "seeded-randomization",
  executionMode: "direct-deterministic-process",
  randomAlgorithm: "xorshift32-fisher-yates-v1",
  shell: false,
}

const DESIGN_GENERATOR_SOURCE = `from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

MASK = 0xFFFFFFFF


def seeded_shuffle(values, seed):
    result = list(values)
    state = int(seed) & MASK or 1

    def random_value():
        nonlocal state
        state ^= (state << 13) & MASK
        state &= MASK
        state ^= state >> 17
        state &= MASK
        state ^= (state << 5) & MASK
        state &= MASK
        return state / 4294967296

    for index in range(len(result) - 1, 0, -1):
        target = int(random_value() * (index + 1))
        result[index], result[target] = result[target], result[index]
    return result


def method_for(study):
    if study["assignmentLevel"] == "cluster":
        return "cluster-randomized"
    if any("stratum" in unit for unit in study["units"]):
        return "stratified-block"
    if study["sequentialEnrollment"]:
        return "permuted-block"
    return "simple-randomized"


def allocation_for(study):
    method = method_for(study)
    arms = study["arms"]
    rows = []
    if method == "stratified-block":
        strata = {}
        for unit in study["units"]:
            strata.setdefault(unit.get("stratum", ""), []).append(unit)
        for stratum_index, (stratum, units) in enumerate(strata.items()):
            for index, unit in enumerate(seeded_shuffle(units, study["seed"] + stratum_index * 2)):
                rows.append((unit["id"], stratum, arms[index % len(arms)]))
    elif method == "permuted-block":
        for offset in range(0, len(study["units"]), len(arms)):
            block = study["units"][offset:offset + len(arms)]
            block_arms = seeded_shuffle(arms, study["seed"] + offset)
            for index, unit in enumerate(block):
                rows.append((unit["id"], unit.get("stratum", ""), block_arms[index]))
    else:
        for index, unit in enumerate(seeded_shuffle(study["units"], study["seed"])):
            rows.append((unit["id"], unit.get("stratum", ""), arms[index % len(arms)]))
    return rows


def nuisance_handling(study, method):
    if method == "stratified-block":
        return [f"stratify:{name}" for name in study["nuisanceFactors"]] or ["stratify:declared-stratum"]
    if method == "cluster-randomized":
        return ["cluster-randomization"] + [f"model:{name}" for name in study["nuisanceFactors"]]
    if method == "permuted-block":
        return ["block:enrollment-order"] + [f"model:{name}" for name in study["nuisanceFactors"]]
    return ["seeded-randomization"] + [f"model:{name}" for name in study["nuisanceFactors"]]


def validate_study(study):
    required = [
        "studyId", "question", "assignmentLevel", "assignmentUnit", "analysisUnit",
        "response", "arms", "seed", "nuisanceFactors", "sequentialEnrollment", "units",
    ]
    if any(name not in study for name in required):
        raise ValueError("study.json is missing a required public field")
    if study["assignmentLevel"] not in ("individual", "cluster"):
        raise ValueError("assignmentLevel must be individual or cluster")
    if len(study["arms"]) < 2 or len(study["units"]) < 2:
        raise ValueError("at least two arms and units are required")
    ids = [unit["id"] for unit in study["units"]]
    if len(ids) != len(set(ids)):
        raise ValueError("unit ids must be unique")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workdir", required=True)
    args = parser.parse_args()
    workdir = Path(args.workdir).resolve()
    study = json.loads((workdir / "study.json").read_text(encoding="utf-8"))
    validate_study(study)
    method = method_for(study)
    rows = allocation_for(study)
    output_dir = workdir / "design"
    output_dir.mkdir(parents=True, exist_ok=True)

    handling = nuisance_handling(study, method)
    plan = {
        "schemaVersion": "experimental-design-plan/v1",
        "studyId": study["studyId"],
        "method": method,
        "assignmentLevel": study["assignmentLevel"],
        "assignmentUnit": study["assignmentUnit"],
        "analysisUnit": study["analysisUnit"],
        "response": study["response"],
        "arms": study["arms"],
        "seed": study["seed"],
        "nuisanceHandling": handling,
        "replicationUnit": study["assignmentUnit"],
        "pseudoreplicationWarning": (
            f"{study['assignmentUnit']} is the independent replicate; repeated measurements "
            "do not create additional independent replicates."
        ),
        "allocationPath": "design/allocation.csv",
        "analysisNotes": [
            f"Analyze at the {study['analysisUnit']} level.",
            "Represent declared blocks, strata, clusters, and nesting in the analysis.",
        ],
    }
    (output_dir / "design-plan.json").write_text(
        json.dumps(plan, indent=2, ensure_ascii=False) + "\\n", encoding="utf-8"
    )
    with (output_dir / "allocation.csv").open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream, lineterminator="\\n")
        writer.writerow(["order", "unit_id", "stratum", "arm"])
        for order, (unit_id, stratum, arm) in enumerate(rows, start=1):
            writer.writerow([order, unit_id, stratum, arm])

    report = [
        "# Experimental Design Report",
        f"Study ID: {study['studyId']}",
        f"Method: {method}",
        f"Randomization unit: {study['assignmentUnit']}",
        f"Analysis unit: {study['analysisUnit']}",
        f"Response: {study['response']}",
        f"Seed: {study['seed']}",
        f"Nuisance handling: {', '.join(handling)}",
        f"Replication note: {study['assignmentUnit']} is the independent replicate.",
        "Allocation schedule: design/allocation.csv",
        "",
    ]
    (output_dir / "design-report.md").write_text("\\n".join(report), encoding="utf-8")


if __name__ == "__main__":
    main()
`

const DESIGN_CHECKER_SOURCE = `from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

MASK = 0xFFFFFFFF


def seeded_shuffle(values, seed):
    result = list(values)
    state = int(seed) & MASK or 1

    def random_value():
        nonlocal state
        state ^= (state << 13) & MASK
        state &= MASK
        state ^= state >> 17
        state &= MASK
        state ^= (state << 5) & MASK
        state &= MASK
        return state / 4294967296

    for index in range(len(result) - 1, 0, -1):
        target = int(random_value() * (index + 1))
        result[index], result[target] = result[target], result[index]
    return result


def method_for(study):
    if study.get("assignmentLevel") == "cluster":
        return "cluster-randomized"
    if any("stratum" in unit for unit in study.get("units", [])):
        return "stratified-block"
    if study.get("sequentialEnrollment"):
        return "permuted-block"
    return "simple-randomized"


def allocation_for(study):
    method = method_for(study)
    arms = study["arms"]
    rows = []
    if method == "stratified-block":
        strata = {}
        for unit in study["units"]:
            strata.setdefault(unit.get("stratum", ""), []).append(unit)
        for stratum_index, (stratum, units) in enumerate(strata.items()):
            for index, unit in enumerate(seeded_shuffle(units, study["seed"] + stratum_index * 2)):
                rows.append((unit["id"], stratum, arms[index % len(arms)]))
    elif method == "permuted-block":
        for offset in range(0, len(study["units"]), len(arms)):
            block = study["units"][offset:offset + len(arms)]
            block_arms = seeded_shuffle(arms, study["seed"] + offset)
            for index, unit in enumerate(block):
                rows.append((unit["id"], unit.get("stratum", ""), block_arms[index]))
    else:
        for index, unit in enumerate(seeded_shuffle(study["units"], study["seed"])):
            rows.append((unit["id"], unit.get("stratum", ""), arms[index % len(arms)]))
    return [
        {"order": str(index), "unit_id": unit_id, "stratum": stratum, "arm": arm}
        for index, (unit_id, stratum, arm) in enumerate(rows, start=1)
    ]


def error(code, path, contract):
    return {"code": code, "relativePath": path, "contractRef": contract}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workdir", required=True)
    args = parser.parse_args()
    workdir = Path(args.workdir).resolve()
    errors = []
    study_path = workdir / "study.json"
    plan_path = workdir / "design" / "design-plan.json"
    allocation_path = workdir / "design" / "allocation.csv"
    report_path = workdir / "design" / "design-report.md"

    try:
        study = json.loads(study_path.read_text(encoding="utf-8"))
    except Exception:
        study = None
        errors.append(error("INVALID_STUDY_INPUT", "study.json", "study-contract/v1"))

    try:
        plan = json.loads(plan_path.read_text(encoding="utf-8"))
    except Exception:
        plan = None
        errors.append(error("INVALID_DESIGN_PLAN", "design/design-plan.json", "experimental-design-plan/v1"))

    if study and plan:
        expected = {
            "studyId": study.get("studyId"),
            "method": method_for(study),
            "assignmentLevel": study.get("assignmentLevel"),
            "assignmentUnit": study.get("assignmentUnit"),
            "analysisUnit": study.get("analysisUnit"),
            "response": study.get("response"),
            "arms": study.get("arms"),
            "seed": study.get("seed"),
            "replicationUnit": study.get("assignmentUnit"),
            "allocationPath": "design/allocation.csv",
        }
        if any(plan.get(key) != value for key, value in expected.items()):
            errors.append(error("DESIGN_PLAN_MISMATCH", "design/design-plan.json", "experimental-design-plan/v1"))
        if "independent" not in str(plan.get("pseudoreplicationWarning", "")).lower():
            errors.append(error("REPLICATION_WARNING_MISSING", "design/design-plan.json", "experimental-design-plan/v1"))

    if study:
        try:
            with allocation_path.open("r", encoding="utf-8", newline="") as stream:
                rows = list(csv.DictReader(stream))
            ids = [row.get("unit_id") for row in rows]
            expected_ids = [unit.get("id") for unit in study.get("units", [])]
            if (
                list(rows[0].keys()) != ["order", "unit_id", "stratum", "arm"]
                or len(rows) != len(expected_ids)
                or sorted(ids) != sorted(expected_ids)
                or any(row.get("arm") not in study.get("arms", []) for row in rows)
            ):
                raise ValueError("allocation mismatch")
            if rows != allocation_for(study):
                errors.append(error(
                    "ALLOCATION_SEED_MISMATCH",
                    "design/allocation.csv",
                    "xorshift32-fisher-yates-v1",
                ))
        except Exception:
            errors.append(error("ALLOCATION_MISMATCH", "design/allocation.csv", "allocation-contract/v1"))

        try:
            report = report_path.read_text(encoding="utf-8")
            required = [
                f"Study ID: {study['studyId']}",
                f"Method: {method_for(study)}",
                f"Randomization unit: {study['assignmentUnit']}",
                f"Analysis unit: {study['analysisUnit']}",
                f"Response: {study['response']}",
                f"Seed: {study['seed']}",
                "Allocation schedule: design/allocation.csv",
            ]
            if not all(value in report for value in required):
                raise ValueError("report mismatch")
        except Exception:
            errors.append(error("DESIGN_REPORT_MISMATCH", "design/design-report.md", "design-report-contract/v1"))

    print(json.dumps({
        "schemaVersion": "skill-artifact-validation-report/v1",
        "status": "pass" if not errors else "fail",
        "errors": errors,
    }, ensure_ascii=True))


if __name__ == "__main__":
    main()
`

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

async function verifiedBytes(
  rootDir: string,
  ref: { path: string; sha256: string },
): Promise<Uint8Array> {
  const relativePath = parseSafeRelativePath(ref.path)
  const bytes = await readFile(join(rootDir, relativePath))
  const actual = sha256Bytes(bytes)
  if (actual !== ref.sha256) {
    throw new Error(
      `Compiler input digest mismatch for ${relativePath}: expected ${ref.sha256}, got ${actual}`,
    )
  }
  return bytes
}

async function digestRef(rootDir: string, relativePath: string) {
  const normalized = parseSafeRelativePath(relativePath)
  return {
    path: normalized,
    sha256: sha256Bytes(await readFile(join(rootDir, normalized))),
  }
}

export async function loadExperimentalDesignArtifactCompilerInput(
  rootDir: string,
): Promise<ExperimentalDesignArtifactCompilerInput> {
  const pilotDir = "benchmarks/skill-ir/pilots/experimental-design"
  const sourcePaths = [
    `${pilotDir}/source/SKILL.md`,
    `${pilotDir}/source/references/randomization_and_blocking.md`,
    `${pilotDir}/source/references/design_types.md`,
    `${pilotDir}/source/scripts/randomization.py`,
  ]
  const tasksValue = JSON.parse(
    await readFile(join(rootDir, `${pilotDir}/tasks.json`), "utf8"),
  ) as { skillId?: unknown; tasks?: unknown }
  if (tasksValue.skillId !== "experimental-design" || !Array.isArray(tasksValue.tasks)) {
    throw new Error("Experimental-design compiler task registry identity mismatch")
  }
  const tasks = tasksValue.tasks.flatMap((raw): Array<{ id: string; prompt: string }> => {
    if (typeof raw !== "object" || raw === null) return []
    const task = raw as Record<string, unknown>
    if (task.split !== "development") return []
    if (typeof task.id !== "string" || typeof task.prompt !== "string") {
      throw new Error("Experimental-design development task projection is invalid")
    }
    return [{ id: task.id, prompt: task.prompt }]
  })
  if (tasks.length === 0) {
    throw new Error("Experimental-design compiler requires development task prompts")
  }
  return {
    rootDir,
    sourceFiles: await Promise.all(sourcePaths.map((path) => digestRef(rootDir, path))),
    baseIr: await digestRef(rootDir, `${pilotDir}/base-ir.json`),
    sourceAudit: await digestRef(rootDir, `${pilotDir}/base-ir-source-audit.json`),
    resourceContract: await digestRef(rootDir, `${pilotDir}/resource-contract.json`),
    taskContract: { tasks },
  }
}

function sourceBySuffix(
  records: Array<{ path: string; sha256: string }>,
  suffix: string,
): { path: string; sha256: string } {
  const matches = records.filter((record) => record.path.replaceAll("\\", "/").endsWith(suffix))
  if (matches.length !== 1) {
    throw new Error(`Experimental-design compiler requires one source ending in ${suffix}`)
  }
  return matches[0]!
}

async function ensureEmptyOutputDirectory(outDir: string): Promise<void> {
  await mkdir(outDir, { recursive: true })
  const pending = [outDir]
  while (pending.length > 0) {
    const directory = pending.pop()!
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        throw new Error(`Experimental-design artifact output must not contain files: ${outDir}`)
      }
      pending.push(join(directory, entry.name))
    }
  }
}

async function writeArtifact(
  outDir: string,
  record: Omit<ValidatedArtifactRecord, "sha256">,
  bytes: Uint8Array | string,
): Promise<ValidatedArtifactRecord> {
  const destination = join(outDir, record.path)
  await mkdir(dirname(destination), { recursive: true })
  const content = typeof bytes === "string" ? Buffer.from(bytes, "utf8") : bytes
  await writeFile(destination, content)
  return { ...record, sha256: sha256Bytes(content) }
}

export async function compileExperimentalDesignArtifact(
  rawInput: ExperimentalDesignArtifactCompilerInput,
  outDir: string,
): Promise<void> {
  const input = ExperimentalDesignArtifactCompilerInputSchema.parse(rawInput)
  await ensureEmptyOutputDirectory(outDir)

  const skillSourceRef = sourceBySuffix(input.sourceFiles, "/source/SKILL.md")
  const [skillSource, baseIrBytes, sourceAuditBytes, resourceBytes] = await Promise.all([
    verifiedBytes(input.rootDir, skillSourceRef),
    verifiedBytes(input.rootDir, input.baseIr),
    verifiedBytes(input.rootDir, input.sourceAudit),
    verifiedBytes(input.rootDir, input.resourceContract),
    ...input.sourceFiles
      .filter((record) => record.path !== skillSourceRef.path)
      .map((record) => verifiedBytes(input.rootDir, record)),
  ])
  const sourceText = Buffer.from(skillSource).toString("utf8")
  if (!sourceText.includes("Everything is seeded")) {
    throw new Error("Missing seeded allocation evidence in public skill source")
  }
  if (!sourceText.includes("CLUSTER-randomized")) {
    throw new Error("Missing cluster randomization evidence in public skill source")
  }

  const baseIr = SkillIRSchema.parse(JSON.parse(Buffer.from(baseIrBytes).toString("utf8")))
  if (baseIr.id !== "experimental-design" || baseIr.profile.length !== 0) {
    throw new Error("Experimental-design compiler requires a profile-empty matching base IR")
  }
  const sourceAudit = JSON.parse(Buffer.from(sourceAuditBytes).toString("utf8")) as {
    skillId?: unknown
    excludedEvidenceClasses?: unknown
  }
  if (sourceAudit.skillId !== "experimental-design") {
    throw new Error("Experimental-design compiler source-audit identity mismatch")
  }
  const exclusions = sourceAudit.excludedEvidenceClasses
  if (!Array.isArray(exclusions) ||
    !["evaluator-payload", "held-out", "runtime-output", "profile-feedback"].every(
      (value) => exclusions.includes(value),
    )) {
    throw new Error("Experimental-design source audit does not exclude forbidden evidence")
  }
  const resource = ResourceContractSchema.parse(
    JSON.parse(Buffer.from(resourceBytes).toString("utf8")),
  )
  if (resource.probe.requiredModules.length !== 0) {
    throw new Error("Experimental-design v1 artifact requires a standard-library-only contract")
  }

  const contract = {
    schemaVersion: "experimental-design-public-contract/v1",
    protectedInput: "study.json",
    generatedOutputs: [
      "design/design-plan.json",
      "design/allocation.csv",
      "design/design-report.md",
    ],
    methods: [
      "cluster-randomized",
      "stratified-block",
      "permuted-block",
      "simple-randomized",
    ],
    randomAlgorithm: "xorshift32-fisher-yates-v1",
    csvColumns: ["order", "unit_id", "stratum", "arm"],
  }
  const skillView = [
    "# Experimental Design - Compiled Artifact View",
    "",
    "Catalog: validated-skill-artifact/v1",
    "Phenotype: seeded randomization and allocation planning.",
    "Execution: direct deterministic Python process followed by runtime validation.",
    "Network and package installation are forbidden.",
    "The deterministic offline scorer remains the task-success authority.",
    "",
  ].join("\n")
  const reportTemplate = [
    "# Experimental Design Report",
    "Study ID: {{study_id}}",
    "Method: {{method}}",
    "Randomization unit: {{assignment_unit}}",
    "Analysis unit: {{analysis_unit}}",
    "Response: {{response}}",
    "Seed: {{seed}}",
    "Nuisance handling: {{nuisance_handling}}",
    "Replication note: {{replication_note}}",
    "Allocation schedule: design/allocation.csv",
    "",
  ].join("\n")
  const toolPlan = {
    schemaVersion: "experimental-design-tool-plan/v1",
    mode: "direct-deterministic-process",
    interpreter: resource.interpreter,
    input: "study.json",
    outputs: contract.generatedOutputs,
    shell: false,
    network: resource.network,
    packageInstall: resource.packageInstall,
  }

  const artifacts: ValidatedArtifactRecord[] = []
  artifacts.push(await writeArtifact(outDir, {
    id: "skill-ir",
    path: "skill-ir.json",
    kind: "skill-ir",
  }, baseIrBytes))
  artifacts.push(await writeArtifact(outDir, {
    id: "skill-view",
    path: "skill.md",
    kind: "skill-view",
  }, skillView))
  artifacts.push(await writeArtifact(outDir, {
    id: "design-generator",
    path: "artifacts/scripts/generate_design.py",
    kind: "script",
  }, DESIGN_GENERATOR_SOURCE))
  artifacts.push(await writeArtifact(outDir, {
    id: "design-checker",
    path: "artifacts/checks/validate_design.py",
    kind: "check",
  }, DESIGN_CHECKER_SOURCE))
  artifacts.push(await writeArtifact(outDir, {
    id: "design-contract",
    path: "artifacts/schemas/design-contract.json",
    kind: "schema",
  }, jsonText(contract)))
  artifacts.push(await writeArtifact(outDir, {
    id: "design-report-template",
    path: "artifacts/templates/design-report.md",
    kind: "template",
  }, reportTemplate))
  artifacts.push(await writeArtifact(outDir, {
    id: "design-tool-plan",
    path: "artifacts/tool-plans/experimental-design.json",
    kind: "tool-plan",
  }, jsonText(toolPlan)))
  artifacts.push(await writeArtifact(outDir, {
    id: "design-resource-policy",
    path: "validation-policy.json",
    kind: "validation-policy",
  }, resourceBytes))
  artifacts.push(await writeArtifact(outDir, {
    id: "design-validation-notes",
    path: "validation-notes.json",
    kind: "validation-notes",
  }, jsonText({
    schemaVersion: "skill-artifact-validation-notes/v1",
    status: "candidate",
    mechanismValidationEvidence: "external-required",
    developmentGatePassed: false,
    heldOutExecutionAllowed: false,
    entersMainClaim: false,
  })))

  const executionPlan: ValidatedArtifactExecutionPlan = {
    schemaVersion: "skill-artifact-execution-plan/v1",
    entrypoint: "validate-design",
    nodes: [
      {
        id: "generate-design",
        kind: "process",
        dependsOn: [],
        command: {
          interpreter: {
            env: resource.interpreter.env,
            fallback: resource.interpreter.fallbackCommand,
          },
          artifactId: "design-generator",
          args: ["--workdir", "{workdir}"],
          envAllowlist: [resource.interpreter.env],
        },
        timeoutMs: 30_000,
      },
      {
        id: "validate-design",
        kind: "validate",
        dependsOn: ["generate-design"],
        command: {
          interpreter: {
            env: resource.interpreter.env,
            fallback: resource.interpreter.fallbackCommand,
          },
          artifactId: "design-checker",
          args: ["--workdir", "{workdir}"],
          envAllowlist: [resource.interpreter.env],
        },
        timeoutMs: 30_000,
      },
    ],
  }
  const executionPlanText = jsonText(executionPlan)
  await writeFile(join(outDir, "execution-plan.json"), executionPlanText, "utf8")

  const promptProjection = input.taskContract.tasks
    .map((task) => ({ id: task.id, prompt: task.prompt }))
    .sort((a, b) => a.id.localeCompare(b.id))
  const provenance: ValidatedArtifactProvenance = {
    schemaVersion: "validated-skill-artifact-provenance/v1",
    catalog: "validated-skill-artifact/v1",
    skillId: "experimental-design",
    constructionSplit: "development",
    compiler: {
      id: "experimental-design-validated-artifact-compiler",
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
        taskIds: promptProjection.map((task) => task.id),
        promptDigest: sha256Bytes(Buffer.from(JSON.stringify(promptProjection), "utf8")),
      },
    },
    forbiddenEvidenceClasses: [...FORBIDDEN_EVIDENCE_CLASSES],
    artifacts,
  }
  const provenanceText = jsonText(provenance)
  await writeFile(join(outDir, "package-provenance.json"), provenanceText, "utf8")

  const manifest: ValidatedArtifactManifest = {
    schemaVersion: "validated-skill-artifact-manifest/v1",
    catalog: "validated-skill-artifact/v1",
    skillId: "experimental-design",
    provenance: {
      path: "package-provenance.json",
      sha256: sha256Bytes(Buffer.from(provenanceText, "utf8")),
    },
    executionPlan: {
      path: "execution-plan.json",
      sha256: sha256Bytes(Buffer.from(executionPlanText, "utf8")),
    },
    protectedInputs: ["study.json"],
    generatedOutputs: [...contract.generatedOutputs],
    artifacts,
  }
  await writeFile(join(outDir, "package-manifest.json"), jsonText(manifest), "utf8")
  await validateValidatedArtifactPackage(outDir)
}
