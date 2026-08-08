import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { SkillIRSchema } from "../../skill-ir/schema";
import { SkillIRSourceAuditSchema, verifySkillIRSourceAudit } from "../../skill-ir/source-audit";
import { validateSkillIR } from "../../skill-ir/validate";
import { parseSafeRelativePath } from "./artifact-package";
import {
  ExperimentalDesignV2PublicContractSourceAuditSchema,
} from "./experimental-design-v2-contract";
import { ResourceContractSchema } from "./resource-contract";
import { sha256Bytes } from "./source-fixture";
import { assembleValidatedArtifactPackage } from "./validated-artifact-assembly";
import type { ValidatedArtifactExecutionPlan } from "./validated-artifact-catalog";

const DigestRefSchema = z.object({
  path: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

const CompilerInputSchema = z.object({
  rootDir: z.string().min(1),
  sourceFiles: z.array(DigestRefSchema).min(6),
  baseIr: DigestRefSchema,
  sourceAudit: DigestRefSchema,
  resourceContract: DigestRefSchema,
  taskContract: z.object({
    tasks: z.array(z.object({
      id: z.string().regex(/^experimental-design-v2-[a-z0-9-]+-dev-[0-9]+$/),
      prompt: z.string().min(1),
    }).strict()).length(2),
  }).strip(),
}).strict();

export type ExperimentalDesignV2ArtifactCompilerInput = z.input<typeof CompilerInputSchema>;

const PILOT_DIR = "benchmarks/skill-ir/pilots/experimental-design";
const V2_DIR = `${PILOT_DIR}/v2`;
const COMPILER_ID = "experimental-design-v2-artifact-compiler";
const COMPILER_VERSION = "v1";

const COMPILER_CONFIG = {
  catalog: "validated-skill-artifact/v1",
  assemblyAdapter: "validated-artifact-assembly-adapter/v1",
  compiler: COMPILER_ID,
  compilerVersion: COMPILER_VERSION,
  contract: "skill-ir-experimental-design-public-contract/v2",
  allocationProfile: "public-balanced-round-robin/v1",
  shell: false,
};

const RUNTIME_SOURCE = String.raw`from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

PROTECTED = ["study.json", "design-contract.json"]
OUTPUTS = [
    "design/design-plan.json",
    "design/allocation.csv",
    "design/design-report.md",
]
PROPERTY_KEYS = [
    "preservesAssignmentUnits",
    "balancesGlobally",
    "balancesWithinStrata",
    "supportsSequentialEnrollment",
]


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def validate_contract(contract):
    if contract.get("schemaVersion") != "skill-ir-experimental-design-public-contract/v2":
        raise ValueError("unsupported public contract")
    if contract.get("protectedInputs") != PROTECTED or contract.get("outputs") != OUTPUTS:
        raise ValueError("public path contract mismatch")
    if contract.get("designPropertyKeys") != PROPERTY_KEYS:
        raise ValueError("public property contract mismatch")
    if contract.get("reportEvidenceOpening") != "\x60\x60\x60json design-evidence":
        raise ValueError("public report contract mismatch")


def validate_study(study):
    required = [
        "studyId", "question", "assignmentLevel", "assignmentUnit", "analysisUnit",
        "response", "arms", "seed", "nuisanceFactors", "sequentialEnrollment", "units",
    ]
    if any(name not in study for name in required):
        raise ValueError("study is missing required public fields")
    if study["assignmentLevel"] not in ("individual", "cluster"):
        raise ValueError("unsupported assignment level")
    if not isinstance(study["seed"], int) or isinstance(study["seed"], bool) or study["seed"] < 0:
        raise ValueError("seed must be a nonnegative integer")
    arms = study["arms"]
    units = study["units"]
    if len(arms) < 2 or len(set(arms)) != len(arms) or any(not isinstance(value, str) or not value for value in arms):
        raise ValueError("arms must be unique nonempty strings")
    ids = [unit.get("id") for unit in units]
    if not ids or len(ids) != len(set(ids)) or any(not isinstance(value, str) or not value for value in ids):
        raise ValueError("unit ids must be unique nonempty strings")
    strata = [("stratum" in unit and isinstance(unit.get("stratum"), str) and bool(unit.get("stratum"))) for unit in units]
    if any(strata) and not all(strata):
        raise ValueError("stratum must be present on every unit or none")


def partitions(study):
    result = {}
    for unit in study["units"]:
        result.setdefault(unit.get("stratum", ""), []).append(unit)
    return list(result.items())


def allocation_for(study):
    arms = study["arms"]
    assigned = {}
    for partition_index, (_, units) in enumerate(partitions(study)):
        start = (study["seed"] + partition_index) % len(arms)
        for index, unit in enumerate(units):
            assigned[unit["id"]] = arms[(start + index) % len(arms)]
    return [
        {
            "order": index + 1,
            "unit_id": unit["id"],
            "stratum": unit.get("stratum", ""),
            "arm": assigned[unit["id"]],
        }
        for index, unit in enumerate(study["units"])
    ]


def balanced(arms, assigned):
    counts = [sum(1 for value in assigned if value == arm) for arm in arms]
    return max(counts) - min(counts) <= 1


def sequential_valid(arms, assigned):
    for offset in range(0, len(assigned), len(arms)):
        block = assigned[offset:offset + len(arms)]
        if len(block) == len(arms):
            if len(set(block)) != len(arms) or any(value not in arms for value in block):
                return False
        elif not balanced(arms, block):
            return False
    return True


def assess(study, rows):
    by_id = {}
    duplicate = False
    for row in rows:
        duplicate = duplicate or row["unit_id"] in by_id
        by_id.setdefault(row["unit_id"], row)
    units = study["units"]
    coverage = (
        not duplicate and len(rows) == len(units) and len(by_id) == len(units)
        and all(unit["id"] in by_id for unit in units)
        and all(by_id[unit["id"]]["order"] == index + 1 for index, unit in enumerate(units))
    )
    arms_valid = all(row["arm"] in study["arms"] for row in rows)
    labels_valid = all(
        row["stratum"] == unit.get("stratum", "")
        for unit in units for row in [by_id.get(unit["id"], {})]
    ) if coverage else False
    partition_arms = []
    for _, partition_units in partitions(study):
        partition_arms.append([by_id[unit["id"]]["arm"] for unit in partition_units] if coverage else [])
    global_balanced = coverage and arms_valid and balanced(study["arms"], [row["arm"] for row in rows])
    partition_balanced = coverage and arms_valid and all(balanced(study["arms"], values) for values in partition_arms)
    block_valid = coverage and arms_valid and all(sequential_valid(study["arms"], values) for values in partition_arms)
    has_strata = all("stratum" in unit for unit in units)
    properties = {
        "preservesAssignmentUnits": coverage,
        "balancesGlobally": global_balanced,
        "balancesWithinStrata": has_strata and labels_valid and partition_balanced,
        "supportsSequentialEnrollment": study["sequentialEnrollment"] and labels_valid and block_valid,
    }
    safe = coverage and arms_valid and labels_valid and (partition_balanced if has_strata else global_balanced)
    safe = safe and (not study["sequentialEnrollment"] or block_valid)
    return safe, properties


def limitation_flags(study):
    flags = {"randomness-not-statistically-audited"}
    if study["assignmentLevel"] == "cluster":
        flags.add("cluster-assignment")
    if all("stratum" in unit for unit in study["units"]):
        flags.add("stratified-assignment")
    if study["sequentialEnrollment"]:
        flags.add("sequential-enrollment")
    if study["analysisUnit"] != study["assignmentUnit"]:
        flags.add("analysis-unit-differs")
    return sorted(flags)


def method_text(study):
    features = []
    if study["assignmentLevel"] == "cluster":
        features.append("cluster-unit")
    if all("stratum" in unit for unit in study["units"]):
        features.append("within-stratum")
    if study["sequentialEnrollment"]:
        features.append("sequential-block")
    return "deterministic balanced assignment" + (" (" + ", ".join(features) + ")" if features else "")


def parse_allocation(path):
    with path.open("r", encoding="utf-8", newline="") as stream:
        reader = csv.DictReader(stream)
        if reader.fieldnames != ["order", "unit_id", "stratum", "arm"]:
            raise ValueError("invalid allocation header")
        rows = []
        for raw in reader:
            rows.append({
                "order": int(raw["order"]),
                "unit_id": raw["unit_id"],
                "stratum": raw["stratum"],
                "arm": raw["arm"],
            })
    return rows


def arm_counts(study, rows):
    return {arm: sum(1 for row in rows if row["arm"] == arm) for arm in study["arms"]}


def evidence_for(study, rows, properties):
    return {
        "studyId": study["studyId"],
        "assignmentUnit": study["assignmentUnit"],
        "analysisUnit": study["analysisUnit"],
        "response": study["response"],
        "seed": study["seed"],
        "allocationPath": "design/allocation.csv",
        "allocationRows": len(rows),
        "armCounts": arm_counts(study, rows),
        "designProperties": properties,
        "limitationFlags": limitation_flags(study),
    }


def generate(workdir):
    study = load_json(workdir / "study.json")
    contract = load_json(workdir / "design-contract.json")
    validate_contract(contract)
    validate_study(study)
    rows = allocation_for(study)
    safe, properties = assess(study, rows)
    if not safe:
        raise ValueError("generated allocation does not satisfy public invariants")
    output = workdir / "design"
    output.mkdir(parents=True, exist_ok=True)
    plan = {
        "schemaVersion": "experimental-design-plan/v2",
        "studyId": study["studyId"],
        "method": method_text(study),
        "assignmentLevel": study["assignmentLevel"],
        "assignmentUnit": study["assignmentUnit"],
        "analysisUnit": study["analysisUnit"],
        "response": study["response"],
        "arms": study["arms"],
        "seed": study["seed"],
        "allocationPath": "design/allocation.csv",
        "designProperties": properties,
    }
    (output / "design-plan.json").write_text(json.dumps(plan, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    with (output / "allocation.csv").open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=["order", "unit_id", "stratum", "arm"], lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    evidence = evidence_for(study, rows, properties)
    report = [
        "# Experimental Design Report",
        "",
        "The allocation follows the public unit, balance, and documentation contract.",
        "",
        "\x60\x60\x60json design-evidence",
        json.dumps(evidence, indent=2, ensure_ascii=False),
        "\x60\x60\x60",
        "",
    ]
    (output / "design-report.md").write_text("\n".join(report), encoding="utf-8")


def report_evidence(text):
    lines = text.splitlines()
    openings = [index for index, line in enumerate(lines) if line.rstrip() == "\x60\x60\x60json design-evidence"]
    if len(openings) != 1:
        raise ValueError("invalid evidence opening")
    opening = openings[0]
    closings = [index for index in range(opening + 1, len(lines)) if lines[index].rstrip() == "\x60\x60\x60"]
    if len(closings) != 1:
        raise ValueError("invalid evidence closing")
    return json.loads("\n".join(lines[opening + 1:closings[0]]))


def package_files(workdir):
    files = []
    for path in workdir.rglob("*"):
        if path.is_symlink():
            raise ValueError("symlink is not allowed")
        if path.is_file():
            files.append(path.relative_to(workdir).as_posix())
    return sorted(files)


def validation_error(code, path=None):
    result = {"code": code, "contractRef": "experimental-design-public-contract-v2"}
    if path:
        result["relativePath"] = path
    return result


def validate(workdir):
    errors = []
    try:
        study = load_json(workdir / "study.json")
        contract = load_json(workdir / "design-contract.json")
        validate_contract(contract)
        validate_study(study)
        plan = load_json(workdir / "design" / "design-plan.json")
        rows = parse_allocation(workdir / "design" / "allocation.csv")
        safe, properties = assess(study, rows)
        expected_plan = {
            "studyId": study["studyId"],
            "assignmentLevel": study["assignmentLevel"],
            "assignmentUnit": study["assignmentUnit"],
            "analysisUnit": study["analysisUnit"],
            "response": study["response"],
            "arms": study["arms"],
            "seed": study["seed"],
            "allocationPath": "design/allocation.csv",
            "designProperties": properties,
        }
        if not isinstance(plan.get("method"), str) or not plan["method"].strip():
            errors.append(validation_error("METHOD_MISSING", "design/design-plan.json"))
        if any(plan.get(key) != value for key, value in expected_plan.items()):
            errors.append(validation_error("PLAN_SEMANTIC_MISMATCH", "design/design-plan.json"))
        if not safe:
            errors.append(validation_error("ALLOCATION_INVARIANT_FAILURE", "design/allocation.csv"))
        evidence = report_evidence((workdir / "design" / "design-report.md").read_text(encoding="utf-8"))
        if evidence != evidence_for(study, rows, properties):
            errors.append(validation_error("REPORT_EVIDENCE_MISMATCH", "design/design-report.md"))
        expected_files = sorted(PROTECTED + OUTPUTS)
        if package_files(workdir) != expected_files:
            errors.append(validation_error("EXACT_OUTPUT_SET_MISMATCH"))
    except Exception:
        errors.append(validation_error("ARTIFACT_VALIDATION_FAILED"))
    print(json.dumps({
        "schemaVersion": "skill-artifact-validation-report/v1",
        "status": "pass" if not errors else "fail",
        "errors": errors,
    }, ensure_ascii=True))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["generate", "validate"])
    parser.add_argument("--workdir", required=True)
    args = parser.parse_args()
    workdir = Path(args.workdir).resolve()
    if args.mode == "generate":
        generate(workdir)
    else:
        validate(workdir)


if __name__ == "__main__":
    main()
`;

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function digestRef(rootDir: string, path: string): Promise<{ path: string; sha256: string }> {
  const normalized = parseSafeRelativePath(path);
  return { path: normalized, sha256: sha256Bytes(await readFile(join(rootDir, normalized))) };
}

async function verifiedBytes(rootDir: string, ref: { path: string; sha256: string }): Promise<Uint8Array> {
  const path = parseSafeRelativePath(ref.path);
  const bytes = await readFile(join(rootDir, path));
  const actual = sha256Bytes(bytes);
  if (actual !== ref.sha256) {
    throw new Error(`Compiler input digest mismatch for ${path}: expected ${ref.sha256}, got ${actual}`);
  }
  return bytes;
}

function sourceBySuffix(
  records: Array<{ path: string; sha256: string }>,
  suffix: string,
): { path: string; sha256: string } {
  const matches = records.filter((record) => record.path.replaceAll("\\", "/").endsWith(suffix));
  if (matches.length !== 1) throw new Error(`Experimental-design v2 requires one source ending in ${suffix}`);
  return matches[0]!;
}

function normalizedTextDigest(bytes: Uint8Array): string {
  return sha256Bytes(Buffer.from(Buffer.from(bytes).toString("utf8").replaceAll("\r\n", "\n"), "utf8"));
}

export async function loadExperimentalDesignV2ArtifactCompilerInput(
  rootDir: string,
): Promise<ExperimentalDesignV2ArtifactCompilerInput> {
  const sourcePaths = [
    `${PILOT_DIR}/source/SKILL.md`,
    `${PILOT_DIR}/source/references/randomization_and_blocking.md`,
    `${PILOT_DIR}/source/references/design_types.md`,
    `${PILOT_DIR}/source/scripts/randomization.py`,
    `${V2_DIR}/public-contract.json`,
    `${V2_DIR}/public-contract-source-audit.json`,
  ];
  const tasksValue = JSON.parse(await readFile(join(rootDir, `${V2_DIR}/development/tasks.json`), "utf8")) as {
    skillId?: unknown;
    tasks?: unknown;
  };
  if (tasksValue.skillId !== "experimental-design-v2" || !Array.isArray(tasksValue.tasks)) {
    throw new Error("Experimental-design v2 task registry identity mismatch");
  }
  const tasks = tasksValue.tasks.map((raw) => {
    if (!raw || typeof raw !== "object") throw new Error("Experimental-design v2 task is invalid");
    const task = raw as Record<string, unknown>;
    if (task.split !== "development" || typeof task.id !== "string" || typeof task.prompt !== "string") {
      throw new Error("Experimental-design v2 compiler accepts only development prompt projections");
    }
    return { id: task.id, prompt: task.prompt };
  });
  return {
    rootDir,
    sourceFiles: await Promise.all(sourcePaths.map((path) => digestRef(rootDir, path))),
    baseIr: await digestRef(rootDir, `${PILOT_DIR}/base-ir.json`),
    sourceAudit: await digestRef(rootDir, `${PILOT_DIR}/base-ir-source-audit.json`),
    resourceContract: await digestRef(rootDir, `${PILOT_DIR}/resource-contract.json`),
    taskContract: { tasks },
  };
}

export async function compileExperimentalDesignV2Artifact(
  rawInput: ExperimentalDesignV2ArtifactCompilerInput,
  outDir: string,
): Promise<void> {
  const input = CompilerInputSchema.parse(rawInput);
  const publicContractRef = sourceBySuffix(input.sourceFiles, "/v2/public-contract.json");
  const publicAuditRef = sourceBySuffix(input.sourceFiles, "/v2/public-contract-source-audit.json");
  const [baseIrBytes, sourceAuditBytes, resourceBytes, publicContractBytes, publicAuditBytes] = await Promise.all([
    verifiedBytes(input.rootDir, input.baseIr),
    verifiedBytes(input.rootDir, input.sourceAudit),
    verifiedBytes(input.rootDir, input.resourceContract),
    verifiedBytes(input.rootDir, publicContractRef),
    verifiedBytes(input.rootDir, publicAuditRef),
    ...input.sourceFiles
      .filter((record) => ![publicContractRef.path, publicAuditRef.path].includes(record.path))
      .map((record) => verifiedBytes(input.rootDir, record)),
  ]);
  const baseIr = SkillIRSchema.parse(JSON.parse(Buffer.from(baseIrBytes).toString("utf8")));
  const sourceAudit = SkillIRSourceAuditSchema.parse(JSON.parse(Buffer.from(sourceAuditBytes).toString("utf8")));
  const validation = validateSkillIR(baseIr);
  if (baseIr.id !== "experimental-design" || baseIr.profile.length !== 0
    || validation.errors.length > 0 || validation.warnings.length > 0) {
    throw new Error("Experimental-design v2 requires a valid profile-empty matching base IR");
  }
  const sourceAuditReport = await verifySkillIRSourceAudit(baseIr, sourceAudit, input.rootDir);
  if (sourceAuditReport.errors.length > 0 || sourceAuditReport.warnings.length > 0) {
    throw new Error(`Experimental-design base IR source audit failed: ${[
      ...sourceAuditReport.errors,
      ...sourceAuditReport.warnings,
    ].join("; ")}`);
  }
  const resource = ResourceContractSchema.parse(JSON.parse(Buffer.from(resourceBytes).toString("utf8")));
  if (resource.probe.requiredModules.length !== 0) {
    throw new Error("Experimental-design v2 artifact requires a standard-library-only resource contract");
  }
  const publicContract = JSON.parse(Buffer.from(publicContractBytes).toString("utf8")) as {
    schemaVersion?: unknown;
    protectedInputs?: unknown;
    outputs?: unknown;
  };
  if (publicContract.schemaVersion !== "skill-ir-experimental-design-public-contract/v2"
    || JSON.stringify(publicContract.protectedInputs) !== JSON.stringify(["study.json", "design-contract.json"])
    || JSON.stringify(publicContract.outputs) !== JSON.stringify([
      "design/design-plan.json",
      "design/allocation.csv",
      "design/design-report.md",
    ])) {
    throw new Error("Experimental-design v2 public contract identity mismatch");
  }
  const publicAudit = ExperimentalDesignV2PublicContractSourceAuditSchema.parse(
    JSON.parse(Buffer.from(publicAuditBytes).toString("utf8")),
  );
  for (const entry of publicAudit.entries) {
    const bytes = await readFile(join(input.rootDir, parseSafeRelativePath(entry.source.path)));
    if (normalizedTextDigest(bytes) !== entry.source.sha256
      || !Buffer.from(bytes).toString("utf8").includes(entry.quote)) {
      throw new Error(`Experimental-design v2 public source claim drift: ${entry.claimId}`);
    }
  }

  const skillView = [
    "# Experimental Design - Public Contract Compiled View",
    "",
    "Catalog: validated-skill-artifact/v1",
    "Read study.json and design-contract.json as protected public inputs.",
    "Generate exactly the three declared design outputs with a deterministic balanced allocation.",
    "The method field is descriptive free text; different valid assignments remain acceptable.",
    "Runtime validation checks public invariants. The deterministic offline scorer remains authoritative.",
    "Network, package installation, and shell composition are forbidden.",
    "",
  ].join("\n");
  const reportTemplate = [
    "# Experimental Design Report",
    "",
    "```json design-evidence",
    "{",
    '  "studyId": "{{study_id}}",',
    '  "assignmentUnit": "{{assignment_unit}}",',
    '  "analysisUnit": "{{analysis_unit}}",',
    '  "response": "{{response}}",',
    '  "seed": {{seed}},',
    '  "allocationPath": "design/allocation.csv",',
    '  "allocationRows": {{allocation_rows}},',
    '  "armCounts": {{arm_counts}},',
    '  "designProperties": {{design_properties}},',
    '  "limitationFlags": {{limitation_flags}}',
    "}",
    "```",
    "",
  ].join("\n");
  const executionPlan: ValidatedArtifactExecutionPlan = {
    schemaVersion: "skill-artifact-execution-plan/v1",
    entrypoint: "validate-design-v2",
    nodes: [
      {
        id: "generate-design-v2",
        kind: "process",
        dependsOn: [],
        command: {
          interpreter: { env: resource.interpreter.env, fallback: resource.interpreter.fallbackCommand },
          artifactId: "design-v2-generator",
          args: ["generate", "--workdir", "{workdir}"],
          envAllowlist: [resource.interpreter.env],
        },
        timeoutMs: 30_000,
      },
      {
        id: "validate-design-v2",
        kind: "validate",
        dependsOn: ["generate-design-v2"],
        command: {
          interpreter: { env: resource.interpreter.env, fallback: resource.interpreter.fallbackCommand },
          artifactId: "design-v2-checker",
          args: ["validate", "--workdir", "{workdir}"],
          envAllowlist: [resource.interpreter.env],
        },
        timeoutMs: 30_000,
      },
    ],
  };
  const promptProjection = input.taskContract.tasks
    .map((task) => ({ id: task.id, prompt: task.prompt }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const adapter = {
    schemaVersion: "validated-artifact-assembly-adapter/v1" as const,
    catalog: "validated-skill-artifact/v1" as const,
    skillId: "experimental-design",
    adapterId: "experimental-design-v2-public-contract",
    version: "v1",
    compiler: {
      id: COMPILER_ID,
      version: COMPILER_VERSION,
      configSha256: sha256Bytes(Buffer.from(JSON.stringify(COMPILER_CONFIG), "utf8")),
    },
    protectedInputs: ["study.json", "design-contract.json"],
    generatedOutputs: [...(publicContract.outputs as string[])],
    executionPlan,
    artifactLayout: [
      { id: "skill-ir", path: "skill-ir.json", kind: "skill-ir" as const },
      { id: "skill-view", path: "skill.md", kind: "skill-view" as const },
      { id: "design-v2-generator", path: "artifacts/scripts/generate_design_v2.py", kind: "script" as const },
      { id: "design-v2-checker", path: "artifacts/checks/validate_design_v2.py", kind: "check" as const },
      { id: "design-v2-contract", path: "artifacts/schemas/design-contract.json", kind: "schema" as const },
      { id: "design-v2-report-template", path: "artifacts/templates/design-report.md", kind: "template" as const },
      { id: "design-v2-tool-plan", path: "artifacts/tool-plans/experimental-design.json", kind: "tool-plan" as const },
      { id: "design-v2-resource-policy", path: "validation-policy.json", kind: "validation-policy" as const },
      { id: "design-v2-validation-notes", path: "validation-notes.json", kind: "validation-notes" as const },
    ],
  };
  await assembleValidatedArtifactPackage({
    adapter,
    provenanceInputs: {
      sourceClosure: input.sourceFiles.map((record) => ({
        path: parseSafeRelativePath(record.path),
        sha256: record.sha256,
      })).sort((left, right) => left.path.localeCompare(right.path)),
      baseIr: { path: parseSafeRelativePath(input.baseIr.path), sha256: input.baseIr.sha256 },
      sourceAudit: { path: parseSafeRelativePath(input.sourceAudit.path), sha256: input.sourceAudit.sha256 },
      resourceContract: {
        path: parseSafeRelativePath(input.resourceContract.path),
        sha256: input.resourceContract.sha256,
      },
      taskContract: {
        taskIds: promptProjection.map((task) => task.id),
        promptDigest: sha256Bytes(Buffer.from(JSON.stringify(promptProjection), "utf8")),
      },
    },
    artifactPayloads: [
      { id: "skill-ir", bytes: baseIrBytes },
      { id: "skill-view", bytes: skillView },
      { id: "design-v2-generator", bytes: RUNTIME_SOURCE },
      { id: "design-v2-checker", bytes: RUNTIME_SOURCE },
      { id: "design-v2-contract", bytes: publicContractBytes },
      { id: "design-v2-report-template", bytes: reportTemplate },
      { id: "design-v2-tool-plan", bytes: jsonText({
        schemaVersion: "experimental-design-tool-plan/v2",
        mode: "public-balanced-deterministic-process",
        interpreter: resource.interpreter,
        inputs: ["study.json", "design-contract.json"],
        outputs: publicContract.outputs,
        shell: false,
        network: resource.network,
        packageInstall: resource.packageInstall,
      }) },
      { id: "design-v2-resource-policy", bytes: jsonText({
        schemaVersion: "experimental-design-artifact-validation-policy/v2",
        protectedInputs: publicContract.protectedInputs,
        exactOutputs: publicContract.outputs,
        checks: ["public-study", "allocation-invariants", "plan-semantics", "report-evidence", "exact-output-set"],
        scorerAuthority: "skill-ir-experimental-design-v2",
      }) },
      { id: "design-v2-validation-notes", bytes: jsonText({
        schemaVersion: "skill-artifact-validation-notes/v1",
        status: "candidate",
        publicContract: "experimental-design-public-contract-v2",
        developmentGatePassed: false,
        heldOutExecutionAllowed: false,
        entersMainClaim: false,
        modelGenerationTokens: 0,
      }) },
    ],
  }, outDir);
}
