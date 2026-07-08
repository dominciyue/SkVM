import csv
import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any


SUMMARY_FIELDS = [
    "system",
    "mean_success",
    "worst_case_success",
    "variance",
    "rule_violations",
    "paired_cases",
    "paired_delta_success",
    "regression_count",
    "negative_delta_count",
    "infrastructure_failures",
    "agent_failures",
]


def read_jsonl(path: Path):
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)


def success_value(row: dict[str, Any]) -> float:
    return 1.0 if row["success"] else 0.0


def build_baseline_by_case(rows: list[dict[str, Any]], baseline_system: str) -> dict[str, float]:
    baseline_by_case: dict[str, float] = {}
    for row in rows:
        case_id = row.get("caseId")
        if row["system"] == baseline_system and case_id and row.get("failureType") != "infrastructure":
            baseline_by_case[str(case_id)] = success_value(row)
    return baseline_by_case


def summarize(rows: list[dict[str, Any]], baseline_system: str = "original") -> list[dict[str, Any]]:
    by_system: dict[str, list[float]] = defaultdict(list)
    by_setting: dict[tuple[str, str, str, str], list[float]] = defaultdict(list)
    violations: dict[str, int] = defaultdict(int)
    deltas: dict[str, list[float]] = defaultdict(list)
    regressions: dict[str, int] = defaultdict(int)
    negative_deltas: dict[str, int] = defaultdict(int)
    infrastructure_failures: dict[str, int] = defaultdict(int)
    agent_failures: dict[str, int] = defaultdict(int)
    baseline_by_case = build_baseline_by_case(rows, baseline_system)

    for row in rows:
        system = row["system"]
        success = success_value(row)
        by_system[system].append(success)
        setting = (system, row["agent"], row["environment"], row["context"])
        by_setting[setting].append(success)
        violations[system] += int(row.get("ruleViolations", 0))
        if row.get("failureType") == "infrastructure":
            infrastructure_failures[system] += 1
        elif row.get("failureType") == "agent":
            agent_failures[system] += 1

        case_id = row.get("caseId")
        if (
            case_id
            and str(case_id) in baseline_by_case
            and system != baseline_system
            and row.get("failureType") != "infrastructure"
        ):
            delta = success - baseline_by_case[str(case_id)]
            deltas[system].append(delta)
            if delta < 0:
                negative_deltas[system] += 1
            if baseline_by_case[str(case_id)] == 1.0 and success == 0.0:
                regressions[system] += 1

    summary = []
    for system, values in sorted(by_system.items()):
        setting_rates = [
            sum(v) / len(v)
            for (setting_system, _agent, _environment, _context), v in by_setting.items()
            if setting_system == system
        ]
        system_deltas = deltas.get(system, [])
        summary.append(
            {
                "system": system,
                "mean_success": sum(values) / len(values),
                "worst_case_success": min(setting_rates),
                "variance": statistics.pvariance(setting_rates) if len(setting_rates) > 1 else 0.0,
                "rule_violations": violations[system],
                "paired_cases": len(system_deltas),
                "paired_delta_success": sum(system_deltas) / len(system_deltas) if system_deltas else 0.0,
                "regression_count": regressions[system],
                "negative_delta_count": negative_deltas[system],
                "infrastructure_failures": infrastructure_failures[system],
                "agent_failures": agent_failures[system],
            }
        )
    return summary


def write_summary_csv(summary: list[dict[str, Any]], path: Path) -> None:
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=SUMMARY_FIELDS)
        writer.writeheader()
        writer.writerows(summary)


def main(argv: list[str]) -> int:
    if len(argv) not in (3, 4):
        raise SystemExit(
            "usage: python scripts/analyze_skill_ir_results.py input.jsonl output.csv [baseline_system]"
        )

    baseline_system = argv[3] if len(argv) == 4 else "original"
    rows = list(read_jsonl(Path(argv[1])))
    summary = summarize(rows, baseline_system=baseline_system)
    write_summary_csv(summary, Path(argv[2]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
