import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path
from typing import Any

from skill_ir_pairing import PAIRING_IDENTITY_FIELDS, PairingKey, pairing_key


SLICE_FIELDS = [
    "dimension",
    "value",
    "system",
    "row_count",
    "successes",
    "mean_success",
    "rule_violations",
    "mean_latency_ms",
    "mean_token_cost",
    "paired_cases",
    "paired_delta_success",
    "regression_count",
    "negative_delta_count",
    "infrastructure_failures",
    "agent_failures",
]

PAIRED_FIELDS = [
    "caseId",
    *PAIRING_IDENTITY_FIELDS,
    "skill",
    "task",
    "taskSplit",
    "agent",
    "environment",
    "context",
    "system",
    "baseline_system",
    "baseline_success",
    "system_success",
    "delta_success",
    "comparison",
    "baseline_rule_violations",
    "system_rule_violations",
    "baseline_failure_type",
    "system_failure_type",
    "latency_ms_delta",
    "token_cost_delta",
    "failed_criteria",
]


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def optional_number(row: dict[str, Any], field: str) -> float | None:
    value = row.get(field)
    if value is None or isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def mean_or_zero(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def success_value(row: dict[str, Any]) -> float:
    return 1.0 if row.get("success") else 0.0


def task_index_key(row: dict[str, Any]) -> str:
    return f"{row.get('skill', '')}:{row.get('task', '')}"


def task_split(row: dict[str, Any], task_split_by_key: dict[str, str] | None = None) -> str:
    if row.get("taskSplit"):
        return str(row["taskSplit"])
    if task_split_by_key:
        return task_split_by_key.get(task_index_key(row), "unknown")
    return "unknown"


def build_task_split_index_from_manifest(manifest_path: Path, root_dir: Path) -> dict[str, str]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    index: dict[str, str] = {}
    for skill in manifest.get("skills", []):
        skill_id = skill["id"]
        tasks_path = skill.get("tasksPath")
        if not tasks_path:
            continue
        task_set = json.loads((root_dir / tasks_path).read_text(encoding="utf-8"))
        for task in task_set.get("tasks", []):
            index[f"{skill_id}:{task['id']}"] = task.get("split", "unknown")
    return index


def build_baseline_by_case(
    rows: list[dict[str, Any]], baseline_system: str
) -> dict[PairingKey, dict[str, Any]]:
    baseline: dict[PairingKey, dict[str, Any]] = {}
    for row in rows:
        key = pairing_key(row)
        if row.get("system") == baseline_system and key is not None:
            baseline[key] = row
    return baseline


def summarize_slice_rows(
    rows: list[dict[str, Any]],
    dimension: str,
    value: str,
    baseline_system: str,
) -> list[dict[str, Any]]:
    baseline_by_case = build_baseline_by_case(rows, baseline_system)
    by_system: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_system[str(row["system"])].append(row)

    summary = []
    for system, system_rows in sorted(by_system.items()):
        successes = [success_value(row) for row in system_rows]
        latencies = [n for row in system_rows if (n := optional_number(row, "latencyMs")) is not None]
        token_costs = [n for row in system_rows if (n := optional_number(row, "tokenCost")) is not None]
        deltas = []
        regressions = 0
        negative_deltas = 0
        for row in system_rows:
            key = pairing_key(row)
            baseline = baseline_by_case.get(key) if key is not None else None
            if not baseline or system == baseline_system:
                continue
            if row.get("failureType") == "infrastructure" or baseline.get("failureType") == "infrastructure":
                continue
            delta = success_value(row) - success_value(baseline)
            deltas.append(delta)
            if delta < 0:
                negative_deltas += 1
            if success_value(baseline) == 1.0 and success_value(row) == 0.0:
                regressions += 1

        summary.append(
            {
                "dimension": dimension,
                "value": value,
                "system": system,
                "row_count": len(system_rows),
                "successes": int(sum(successes)),
                "mean_success": mean_or_zero(successes),
                "rule_violations": sum(int(row.get("ruleViolations", 0)) for row in system_rows),
                "mean_latency_ms": mean_or_zero(latencies),
                "mean_token_cost": mean_or_zero(token_costs),
                "paired_cases": len(deltas),
                "paired_delta_success": mean_or_zero(deltas),
                "regression_count": regressions,
                "negative_delta_count": negative_deltas,
                "infrastructure_failures": sum(1 for row in system_rows if row.get("failureType") == "infrastructure"),
                "agent_failures": sum(1 for row in system_rows if row.get("failureType") == "agent"),
            }
        )
    return summary


def summarize_slices(
    rows: list[dict[str, Any]],
    baseline_system: str = "original",
    task_split_by_key: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    dimensions = {
        "context": lambda row: str(row.get("context", "unknown")),
        "skill": lambda row: str(row.get("skill", "unknown")),
        "taskSplit": lambda row: task_split(row, task_split_by_key),
        "skillProvenance": lambda row: str(row.get("skillProvenance", "unknown")),
        "evidenceWeight": lambda row: str(row.get("evidenceWeight", "unknown")),
    }
    summary = []
    for dimension, value_fn in dimensions.items():
        groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in rows:
            groups[value_fn(row)].append(row)
        for value, group_rows in sorted(groups.items()):
            summary.extend(summarize_slice_rows(group_rows, dimension, value, baseline_system))
    return summary


def comparison_label(delta: float) -> str:
    if delta > 0:
        return "gain"
    if delta < 0:
        return "regression"
    return "same"


def build_paired_delta_rows(
    rows: list[dict[str, Any]],
    baseline_system: str = "original",
    task_split_by_key: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    baseline_by_case = build_baseline_by_case(rows, baseline_system)
    paired = []
    for row in rows:
        system = str(row.get("system"))
        if system == baseline_system:
            continue
        case_id = row.get("caseId")
        key = pairing_key(row)
        baseline = baseline_by_case.get(key) if key is not None else None
        if not baseline:
            continue
        delta = success_value(row) - success_value(baseline)
        paired.append(
            {
                "caseId": case_id,
                **{field: row.get(field, "") for field in PAIRING_IDENTITY_FIELDS},
                "skill": row.get("skill", ""),
                "task": row.get("task", ""),
                "taskSplit": task_split(row, task_split_by_key),
                "agent": row.get("agent", ""),
                "environment": row.get("environment", ""),
                "context": row.get("context", ""),
                "system": system,
                "baseline_system": baseline_system,
                "baseline_success": baseline.get("success"),
                "system_success": row.get("success"),
                "delta_success": delta,
                "comparison": comparison_label(delta),
                "baseline_rule_violations": baseline.get("ruleViolations", 0),
                "system_rule_violations": row.get("ruleViolations", 0),
                "baseline_failure_type": baseline.get("failureType", ""),
                "system_failure_type": row.get("failureType", ""),
                "latency_ms_delta": (optional_number(row, "latencyMs") or 0.0)
                - (optional_number(baseline, "latencyMs") or 0.0),
                "token_cost_delta": (optional_number(row, "tokenCost") or 0.0)
                - (optional_number(baseline, "tokenCost") or 0.0),
                "failed_criteria": "; ".join(str(item) for item in row.get("failedCriteria", [])),
            }
        )
    return sorted(
        paired,
        key=lambda row: (
            str(row["caseId"]),
            *(str(row[field]) for field in PAIRING_IDENTITY_FIELDS),
            str(row["system"]),
        ),
    )


def write_csv(rows: list[dict[str, Any]], fieldnames: list[str], path: Path) -> None:
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Write Skill IR slice and paired-delta analysis CSVs.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--slices-out", required=True)
    parser.add_argument("--paired-out", required=True)
    parser.add_argument("--baseline", default="original")
    parser.add_argument("--manifest")
    parser.add_argument("--root-dir", default=".")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root_dir = Path(args.root_dir)
    task_split_by_key = (
        build_task_split_index_from_manifest(Path(args.manifest), root_dir) if args.manifest else {}
    )
    rows = read_jsonl(Path(args.input))
    write_csv(
        summarize_slices(rows, baseline_system=args.baseline, task_split_by_key=task_split_by_key),
        SLICE_FIELDS,
        Path(args.slices_out),
    )
    write_csv(
        build_paired_delta_rows(rows, baseline_system=args.baseline, task_split_by_key=task_split_by_key),
        PAIRED_FIELDS,
        Path(args.paired_out),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
