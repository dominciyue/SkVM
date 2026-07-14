import csv
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from analyze_skill_ir_results import read_jsonl, summarize, write_summary_csv


class AnalyzeSkillIRResultsTest(unittest.TestCase):
    def test_repeated_cases_pair_by_complete_run_identity(self):
        identity = {
            "caseId": "case-repeat",
            "model": "xty/gpt-4.1-mini",
            "modelFamily": "gpt",
            "adapter": "bare-agent",
            "adapterVersion": "workspace",
            "panelConfigId": "pilot-v1",
            "agent": "a1",
            "environment": "linux",
            "context": "clean",
            "ruleViolations": 0,
        }
        rows = [
            {**identity, "system": "original", "runIndex": 1, "success": True},
            {**identity, "system": "original", "runIndex": 2, "success": False},
            {**identity, "system": "ir-profile", "runIndex": 1, "success": False},
            {**identity, "system": "ir-profile", "runIndex": 2, "success": True},
        ]

        summary = {row["system"]: row for row in summarize(rows, baseline_system="original")}

        self.assertEqual(summary["ir-profile"]["paired_cases"], 2)
        self.assertEqual(summary["ir-profile"]["paired_delta_success"], 0.0)
        self.assertEqual(summary["ir-profile"]["regression_count"], 1)
        self.assertEqual(summary["ir-profile"]["negative_delta_count"], 1)

    def test_identically_partial_identities_do_not_pair(self):
        common = {
            "caseId": "case-partial",
            "model": "xty/gpt-4.1-mini",
            "runIndex": 1,
            "agent": "a1",
            "environment": "linux",
            "context": "clean",
            "ruleViolations": 0,
        }
        rows = [
            {**common, "system": "original", "success": True},
            {**common, "system": "ir-profile", "success": False},
        ]

        summary = {row["system"]: row for row in summarize(rows, baseline_system="original")}

        self.assertEqual(summary["ir-profile"]["paired_cases"], 0)

    def test_model_family_mismatch_does_not_pair(self):
        identity = {
            "caseId": "case-family",
            "model": "xty/gpt-4.1-mini",
            "adapter": "bare-agent",
            "adapterVersion": "workspace",
            "panelConfigId": "pilot-v1",
            "runIndex": 1,
            "agent": "a1",
            "environment": "linux",
            "context": "clean",
            "ruleViolations": 0,
        }
        rows = [
            {**identity, "system": "original", "modelFamily": "gpt", "success": True},
            {**identity, "system": "ir-profile", "modelFamily": "llama", "success": False},
        ]

        summary = {row["system"]: row for row in summarize(rows, baseline_system="original")}

        self.assertEqual(summary["ir-profile"]["paired_cases"], 0)

    def test_invalid_run_index_does_not_pair(self):
        identity = {
            "caseId": "case-invalid",
            "model": "xty/gpt-4.1-mini",
            "modelFamily": "gpt",
            "adapter": "bare-agent",
            "adapterVersion": "workspace",
            "panelConfigId": "pilot-v1",
            "runIndex": 0,
            "agent": "a1",
            "environment": "linux",
            "context": "clean",
            "ruleViolations": 0,
        }
        rows = [
            {**identity, "system": "original", "success": True},
            {**identity, "system": "ir-profile", "success": False},
        ]

        summary = {row["system"]: row for row in summarize(rows, baseline_system="original")}

        self.assertEqual(summary["ir-profile"]["paired_cases"], 0)

    def test_fully_legacy_rows_pair_by_case_id(self):
        common = {
            "caseId": "case-legacy",
            "agent": "a1",
            "environment": "linux",
            "context": "clean",
            "ruleViolations": 0,
        }
        rows = [
            {**common, "system": "original", "success": True},
            {**common, "system": "ir-profile", "success": False},
        ]

        summary = {row["system"]: row for row in summarize(rows, baseline_system="original")}

        self.assertEqual(summary["ir-profile"]["paired_cases"], 1)
        self.assertEqual(summary["ir-profile"]["paired_delta_success"], -1.0)

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
                "latencyMs": 100,
                "tokenCost": 40,
            },
            {
                "caseId": "skill-review:a1:linux:noisy:task-1",
                "system": "original",
                "agent": "a1",
                "environment": "linux",
                "context": "noisy",
                "success": True,
                "ruleViolations": 1,
                "latencyMs": 300,
                "tokenCost": 80,
            },
            {
                "caseId": "skill-review:a1:linux:clean:task-1",
                "system": "ir-profile",
                "agent": "a1",
                "environment": "linux",
                "context": "clean",
                "success": False,
                "ruleViolations": 2,
                "latencyMs": 200,
                "tokenCost": 100,
            },
            {
                "caseId": "skill-review:a1:linux:noisy:task-1",
                "system": "ir-profile",
                "agent": "a1",
                "environment": "linux",
                "context": "noisy",
                "success": True,
                "ruleViolations": 0,
                "latencyMs": 400,
                "tokenCost": 300,
            },
        ]

        summary = {row["system"]: row for row in summarize(rows, baseline_system="original")}

        self.assertEqual(summary["original"]["mean_success"], 1.0)
        self.assertEqual(summary["original"]["worst_case_success"], 1.0)
        self.assertEqual(summary["original"]["regression_count"], 0)
        self.assertEqual(summary["original"]["mean_latency_ms"], 200.0)
        self.assertEqual(summary["original"]["mean_token_cost"], 60.0)
        self.assertEqual(summary["ir-profile"]["mean_success"], 0.5)
        self.assertEqual(summary["ir-profile"]["worst_case_success"], 0.0)
        self.assertEqual(summary["ir-profile"]["paired_cases"], 2)
        self.assertEqual(summary["ir-profile"]["paired_delta_success"], -0.5)
        self.assertEqual(summary["ir-profile"]["regression_count"], 1)
        self.assertEqual(summary["ir-profile"]["negative_delta_count"], 1)
        self.assertEqual(summary["ir-profile"]["rule_violations"], 2)
        self.assertEqual(summary["ir-profile"]["infrastructure_failures"], 0)
        self.assertEqual(summary["ir-profile"]["agent_failures"], 0)
        self.assertEqual(summary["ir-profile"]["mean_latency_ms"], 300.0)
        self.assertEqual(summary["ir-profile"]["mean_token_cost"], 200.0)

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
        self.assertIn("mean_latency_ms", csv_rows[0])
        self.assertIn("mean_token_cost", csv_rows[0])
        self.assertIn("infrastructure_failures", csv_rows[0])
        self.assertIn("agent_failures", csv_rows[0])


if __name__ == "__main__":
    unittest.main()
