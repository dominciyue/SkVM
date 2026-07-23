from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workdir", required=True)
    args = parser.parse_args()
    workdir = Path(args.workdir).resolve()
    contract_path = Path(__file__).resolve().parents[1] / "schemas" / "review-report-contract.json"
    contract = json.loads(contract_path.read_text(encoding="utf-8"))
    report_path = workdir / "markdown" / "document" / "document+审核报告.md"
    deliverable_path = workdir / "markdown" / "document" / "document+最终成果.md"
    errors = []

    if not report_path.is_file():
        errors.append({"code": "MISSING_REVIEW_REPORT", "relativePath": "markdown/document/document+审核报告.md"})
    else:
        report = report_path.read_text(encoding="utf-8")
        for label in contract["requiredLabels"]:
            if label not in report:
                errors.append({
                    "code": "MISSING_CANONICAL_LABEL",
                    "relativePath": "markdown/document/document+审核报告.md",
                    "contractRef": "review-report-contract/v1",
                })
                break
        outcome_label = contract["requiredLabels"][1]
        outcome = next(
            (line[len(outcome_label):].strip() for line in report.splitlines() if line.startswith(outcome_label)),
            "",
        )
        approved = outcome == contract["outcomes"]["approved"]
        rejected_non_law = outcome == contract["outcomes"]["rejectedNonLaw"]
        if approved and not deliverable_path.is_file():
            errors.append({
                "code": "DELIVERABLE_POLICY_MISMATCH",
                "relativePath": "markdown/document/document+最终成果.md",
                "contractRef": "review-report-contract/v1",
            })
        if rejected_non_law and deliverable_path.exists():
            errors.append({
                "code": "DELIVERABLE_POLICY_MISMATCH",
                "relativePath": "markdown/document/document+最终成果.md",
                "contractRef": "review-report-contract/v1",
            })

    print(json.dumps({
        "schemaVersion": "skill-artifact-validation-report/v1",
        "status": "pass" if not errors else "fail",
        "errors": errors,
    }, ensure_ascii=True))


if __name__ == "__main__":
    main()
