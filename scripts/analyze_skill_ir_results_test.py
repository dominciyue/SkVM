import csv
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from analyze_skill_ir_results import read_jsonl, summarize, write_summary_csv


class AnalyzeSkillIRResultsTest(unittest.TestCase):
    def test_summarize_reports_success_stability_and_paired_deltas(self):
        rows = [
            {
                "caseId": "skill-review:a1:linux:clean:task-1",
                "system": "original",
                "agent": "a1",
                "environment": "linux",
                "context": "clean",
                "success": True,
                "ruleViolations": 0,
            },
            {
                "caseId": "skill-review:a1:linux:noisy:task-1",
                "system": "original",
                "agent": "a1",
                "environment": "linux",
                "context": "noisy",
                "success": True,
                "ruleViolations": 1,
            },
            {
                "caseId": "skill-review:a1:linux:clean:task-1",
                "system": "ir-profile",
                "agent": "a1",
                "environment": "linux",
                "context": "clean",
                "success": False,
                "ruleViolations": 2,
            },
            {
                "caseId": "skill-review:a1:linux:noisy:task-1",
                "system": "ir-profile",
                "agent": "a1",
                "environment": "linux",
                "context": "noisy",
                "success": True,
                "ruleViolations": 0,
            },
        ]

        summary = {row["system"]: row for row in summarize(rows, baseline_system="original")}

        self.assertEqual(summary["original"]["mean_success"], 1.0)
        self.assertEqual(summary["original"]["worst_case_success"], 1.0)
        self.assertEqual(summary["original"]["regression_count"], 0)
        self.assertEqual(summary["ir-profile"]["mean_success"], 0.5)
        self.assertEqual(summary["ir-profile"]["worst_case_success"], 0.0)
        self.assertEqual(summary["ir-profile"]["paired_cases"], 2)
        self.assertEqual(summary["ir-profile"]["paired_delta_success"], -0.5)
        self.assertEqual(summary["ir-profile"]["regression_count"], 1)
        self.assertEqual(summary["ir-profile"]["negative_delta_count"], 1)
        self.assertEqual(summary["ir-profile"]["rule_violations"], 2)
        self.assertEqual(summary["ir-profile"]["infrastructure_failures"], 0)
        self.assertEqual(summary["ir-profile"]["agent_failures"], 0)

    def test_summarize_counts_failure_types_separately(self):
        rows = [
            {
                "caseId": "skill-review:a1:linux:clean:task-1",
                "system": "original",
                "agent": "a1",
                "environment": "linux",
                "context": "clean",
                "success": False,
                "ruleViolations": 0,
                "failureType": "infrastructure",
            },
            {
                "caseId": "skill-review:a1:linux:clean:task-1",
                "system": "ir-static",
                "agent": "a1",
                "environment": "linux",
                "context": "clean",
                "success": False,
                "ruleViolations": 2,
                "failureType": "agent",
            },
            {
                "caseId": "skill-review:a1:linux:noisy:task-1",
                "system": "ir-static",
                "agent": "a1",
                "environment": "linux",
                "context": "noisy",
                "success": True,
                "ruleViolations": 0,
            },
        ]

        summary = {row["system"]: row for row in summarize(rows, baseline_system="original")}

        self.assertEqual(summary["original"]["infrastructure_failures"], 1)
        self.assertEqual(summary["original"]["agent_failures"], 0)
        self.assertEqual(summary["ir-static"]["infrastructure_failures"], 0)
        self.assertEqual(summary["ir-static"]["agent_failures"], 1)
        self.assertEqual(summary["ir-static"]["rule_violations"], 2)
        self.assertEqual(summary["ir-static"]["paired_cases"], 0)

    def test_paired_deltas_skip_infrastructure_failures_on_either_side(self):
        rows = [
            {
                "caseId": "case-1",
                "system": "original",
                "agent": "a1",
                "environment": "linux",
                "context": "clean",
                "success": False,
                "ruleViolations": 0,
                "failureType": "infrastructure",
            },
            {
                "caseId": "case-1",
                "system": "ir-static",
                "agent": "a1",
                "environment": "linux",
                "context": "clean",
                "success": True,
                "ruleViolations": 0,
            },
            {
                "caseId": "case-2",
                "system": "original",
                "agent": "a1",
                "environment": "linux",
                "context": "clean",
                "success": True,
                "ruleViolations": 0,
            },
            {
                "caseId": "case-2",
                "system": "ir-static",
                "agent": "a1",
                "environment": "linux",
                "context": "clean",
                "success": False,
                "ruleViolations": 0,
                "failureType": "infrastructure",
            },
        ]

        summary = {row["system"]: row for row in summarize(rows, baseline_system="original")}

        self.assertEqual(summary["ir-static"]["paired_cases"], 0)
        self.assertEqual(summary["ir-static"]["paired_delta_success"], 0.0)
        self.assertEqual(summary["ir-static"]["regression_count"], 0)

    def test_read_jsonl_skips_empty_lines_and_writer_preserves_fields(self):
        with tempfile.TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "results.jsonl"
            output_path = Path(tmp) / "summary.csv"
            input_path.write_text(
                "\n".join(
                    [
                        '{"caseId":"c1","system":"original","agent":"a1","environment":"linux","context":"clean","success":true,"ruleViolations":0}',
                        "",
                        '{"caseId":"c1","system":"ir-static","agent":"a1","environment":"linux","context":"clean","success":true,"ruleViolations":0}',
                    ]
                ),
                encoding="utf-8",
            )

            rows = list(read_jsonl(input_path))
            write_summary_csv(summarize(rows), output_path)

            with output_path.open("r", encoding="utf-8", newline="") as f:
                csv_rows = list(csv.DictReader(f))

        self.assertEqual(len(rows), 2)
        self.assertEqual(csv_rows[0]["system"], "ir-static")
        self.assertIn("paired_delta_success", csv_rows[0])
        self.assertIn("regression_count", csv_rows[0])
        self.assertIn("infrastructure_failures", csv_rows[0])
        self.assertIn("agent_failures", csv_rows[0])


if __name__ == "__main__":
    unittest.main()
