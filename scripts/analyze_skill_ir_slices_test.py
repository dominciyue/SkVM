import csv
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from analyze_skill_ir_slices import (
    build_paired_delta_rows,
    build_task_split_index_from_manifest,
    summarize_slices,
    write_csv,
)


class AnalyzeSkillIRSlicesTest(unittest.TestCase):
    def test_summarize_slices_reports_context_skill_and_split_metrics(self):
        rows = [
            {
                "caseId": "skill-review:a1:linux:clean:task-dev",
                "system": "original",
                "skill": "skill-review",
                "agent": "a1",
                "environment": "linux",
                "context": "clean",
                "task": "task-dev",
                "taskSplit": "development",
                "success": True,
                "ruleViolations": 0,
                "latencyMs": 100,
                "tokenCost": 10,
            },
            {
                "caseId": "skill-review:a1:linux:clean:task-dev",
                "system": "ir-profile",
                "skill": "skill-review",
                "agent": "a1",
                "environment": "linux",
                "context": "clean",
                "task": "task-dev",
                "taskSplit": "development",
                "success": False,
                "ruleViolations": 1,
                "latencyMs": 200,
                "tokenCost": 30,
            },
            {
                "caseId": "skill-report:a1:linux:noisy:task-held",
                "system": "original",
                "skill": "skill-report",
                "agent": "a1",
                "environment": "linux",
                "context": "noisy",
                "task": "task-held",
                "success": False,
                "ruleViolations": 2,
                "latencyMs": 300,
                "tokenCost": 50,
            },
            {
                "caseId": "skill-report:a1:linux:noisy:task-held",
                "system": "ir-profile",
                "skill": "skill-report",
                "agent": "a1",
                "environment": "linux",
                "context": "noisy",
                "task": "task-held",
                "success": True,
                "ruleViolations": 0,
                "latencyMs": 400,
                "tokenCost": 70,
            },
        ]
        task_split_by_key = {
            "skill-report:task-held": "held-out",
        }

        summary = summarize_slices(rows, task_split_by_key=task_split_by_key)
        by_key = {(row["dimension"], row["value"], row["system"]): row for row in summary}

        self.assertEqual(by_key[("context", "clean", "original")]["mean_success"], 1.0)
        self.assertEqual(by_key[("context", "clean", "ir-profile")]["mean_success"], 0.0)
        self.assertEqual(by_key[("context", "noisy", "ir-profile")]["paired_delta_success"], 1.0)
        self.assertEqual(by_key[("skill", "skill-report", "original")]["rule_violations"], 2)
        self.assertEqual(by_key[("taskSplit", "held-out", "ir-profile")]["row_count"], 1)
        self.assertEqual(by_key[("taskSplit", "held-out", "ir-profile")]["mean_token_cost"], 70.0)

    def test_build_paired_delta_rows_reports_gains_and_regressions(self):
        rows = [
            {
                "caseId": "case-gain",
                "system": "original",
                "skill": "skill-a",
                "agent": "a1",
                "environment": "linux",
                "context": "clean",
                "task": "task-1",
                "success": False,
                "ruleViolations": 1,
                "latencyMs": 100,
                "tokenCost": 10,
                "failedCriteria": ["criterion"],
            },
            {
                "caseId": "case-gain",
                "system": "ir-profile",
                "skill": "skill-a",
                "agent": "a1",
                "environment": "linux",
                "context": "clean",
                "task": "task-1",
                "success": True,
                "ruleViolations": 0,
                "latencyMs": 150,
                "tokenCost": 18,
                "failedCriteria": [],
            },
            {
                "caseId": "case-regression",
                "system": "original",
                "skill": "skill-a",
                "agent": "a1",
                "environment": "linux",
                "context": "noisy",
                "task": "task-2",
                "success": True,
                "ruleViolations": 0,
                "latencyMs": 100,
                "tokenCost": 10,
                "failedCriteria": [],
            },
            {
                "caseId": "case-regression",
                "system": "ir-profile",
                "skill": "skill-a",
                "agent": "a1",
                "environment": "linux",
                "context": "noisy",
                "task": "task-2",
                "success": False,
                "ruleViolations": 1,
                "latencyMs": 130,
                "tokenCost": 16,
                "failedCriteria": ["criterion"],
            },
        ]

        deltas = build_paired_delta_rows(rows)

        self.assertEqual([row["delta_success"] for row in deltas], [1.0, -1.0])
        self.assertEqual(deltas[0]["comparison"], "gain")
        self.assertEqual(deltas[1]["comparison"], "regression")
        self.assertEqual(deltas[0]["token_cost_delta"], 8.0)
        self.assertEqual(deltas[1]["latency_ms_delta"], 30.0)

    def test_manifest_task_split_index_and_writer(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "benchmarks/skill-ir/corpus").mkdir(parents=True)
            (root / "benchmarks/skill-ir/tasks").mkdir(parents=True)
            (root / "benchmarks/skill-ir/corpus/manifest.json").write_text(
                '{"skills":[{"id":"skill-a","tasksPath":"benchmarks/skill-ir/tasks/a.json"}]}',
                encoding="utf-8",
            )
            (root / "benchmarks/skill-ir/tasks/a.json").write_text(
                '{"skillId":"skill-a","tasks":[{"id":"task-1","split":"held-out","prompt":"","successCriteria":[]}]}',
                encoding="utf-8",
            )
            out = root / "out.csv"

            index = build_task_split_index_from_manifest(root / "benchmarks/skill-ir/corpus/manifest.json", root)
            write_csv([{"a": 1, "b": "x"}], ["a", "b"], out)

            self.assertEqual(index, {"skill-a:task-1": "held-out"})
            with out.open("r", encoding="utf-8", newline="") as f:
                rows = list(csv.DictReader(f))
            self.assertEqual(rows, [{"a": "1", "b": "x"}])


if __name__ == "__main__":
    unittest.main()
