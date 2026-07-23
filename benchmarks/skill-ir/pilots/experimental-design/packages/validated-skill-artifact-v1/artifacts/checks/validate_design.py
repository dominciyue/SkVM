from __future__ import annotations

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
