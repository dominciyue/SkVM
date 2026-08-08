from __future__ import annotations

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
