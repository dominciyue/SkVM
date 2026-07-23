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
        json.dumps(plan, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    with (output_dir / "allocation.csv").open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream, lineterminator="\n")
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
    (output_dir / "design-report.md").write_text("\n".join(report), encoding="utf-8")


if __name__ == "__main__":
    main()
