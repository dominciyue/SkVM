from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


HEADING_RE = re.compile(r"^\s{0,3}#{1,6}(?:\s+|$)")
ENUM_RE = re.compile(r"（[一二三四五六七八九十百千]+）")


def _fail(message: str, errors: list[str]) -> None:
    errors.append(message)


def _resolve(root: Path, relative: str, label: str, errors: list[str]) -> Path | None:
    path = (root / relative).resolve()
    try:
        path.relative_to(root)
    except ValueError:
        _fail(f"{label} escapes root: {relative}", errors)
        return None
    return path


def _character_stream(text: str) -> str:
    lines = [HEADING_RE.sub("", line) for line in text.splitlines()]
    return re.sub(r"\s+", "", "\n".join(lines))


def _read_json(path: Path, label: str, errors: list[str]) -> dict[str, Any] | None:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        _fail(f"cannot read {label} as UTF-8 JSON: {exc}", errors)
        return None
    if not isinstance(value, dict):
        _fail(f"{label} must contain a JSON object", errors)
        return None
    return value


def check(root: Path, contract_path: Path, source_path: Path) -> dict[str, Any]:
    root = root.resolve()
    contract_path = contract_path.resolve()
    source_path = source_path.resolve()
    errors: list[str] = []
    checked: list[str] = []

    contract = _read_json(contract_path, "contract", errors)
    if contract is None:
        return {"status": "failed", "errors": errors, "checked": checked}

    outputs = contract.get("outputs")
    protected = contract.get("protectedInputs")
    evidence_rule = contract.get("reviewEvidence")
    if not isinstance(outputs, dict) or not isinstance(outputs.get("review"), str):
        _fail("unsupported contract: outputs.review must be a relative path", errors)
    if not isinstance(protected, list) or not all(isinstance(item, str) for item in protected):
        _fail("unsupported contract: protectedInputs must be a string array", errors)
    if not isinstance(evidence_rule, dict):
        _fail("unsupported contract: reviewEvidence must be an object", errors)
    if errors:
        return {"status": "unsupported", "errors": errors, "checked": checked}

    protected_paths: dict[str, Path] = {}
    for relative in protected:
        path = _resolve(root, relative, "protected input", errors)
        if path is not None:
            protected_paths[relative] = path
            if not path.is_file():
                _fail(f"protected input is missing: {relative}", errors)
    checked.append("protected-input-presence")

    review_rel = outputs["review"]
    review_path = _resolve(root, review_rel, "review output", errors)
    if review_path is None or not review_path.is_file():
        _fail(f"review output is missing: {review_rel}", errors)
        evidence = None
    else:
        try:
            review_text = review_path.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as exc:
            _fail(f"cannot read review output as UTF-8: {exc}", errors)
            review_text = ""

        opening = evidence_rule.get("openingMarker")
        closing = evidence_rule.get("closingMarker")
        block_count = evidence_rule.get("blockCount")
        fields = evidence_rule.get("fields")
        if not isinstance(opening, str) or not isinstance(closing, str):
            _fail("unsupported contract: review evidence markers must be strings", errors)
            evidence = None
        else:
            pattern = re.compile(re.escape(opening) + r"\s*\n(.*?)\n" + re.escape(closing), re.DOTALL)
            blocks = pattern.findall(review_text)
            if not isinstance(block_count, int) or len(blocks) != block_count:
                _fail(f"review evidence block count is {len(blocks)}; expected {block_count}", errors)
            evidence = None
            if len(blocks) == 1:
                try:
                    parsed = json.loads(blocks[0])
                    if isinstance(parsed, dict):
                        evidence = parsed
                    else:
                        _fail("review evidence must be a JSON object", errors)
                except json.JSONDecodeError as exc:
                    _fail(f"review evidence is invalid JSON: {exc}", errors)
            if evidence is not None and isinstance(fields, list):
                expected_fields = set(fields)
                actual_fields = set(evidence)
                if actual_fields != expected_fields:
                    _fail(
                        "review evidence fields differ: "
                        f"expected {sorted(expected_fields)}, got {sorted(actual_fields)}",
                        errors,
                    )
    checked.append("review-evidence-shape")

    deliverable_rel: str | None = None
    if evidence is not None:
        document_class = evidence.get("documentClass")
        classes = evidence_rule.get("documentClasses")
        if isinstance(classes, list) and document_class not in classes:
            _fail(f"unsupported documentClass in review evidence: {document_class!r}", errors)

        if not isinstance(evidence.get("inputPath"), str):
            _fail("review evidence inputPath must be a string", errors)

        declared_deliverable = outputs.get("deliverable")
        evidence_deliverable = evidence.get("deliverable")
        if evidence_deliverable is None:
            if isinstance(declared_deliverable, str):
                path = _resolve(root, declared_deliverable, "deliverable output", errors)
                if path is not None and path.exists():
                    _fail("review says deliverable is null but the declared file exists", errors)
        elif isinstance(evidence_deliverable, str):
            if evidence_deliverable != declared_deliverable:
                _fail("review deliverable does not equal outputs.deliverable", errors)
            else:
                deliverable_rel = evidence_deliverable
        else:
            _fail("review evidence deliverable must be a string or null", errors)
    checked.append("review-output-consistency")

    deliverable_path: Path | None = None
    if deliverable_rel is not None:
        deliverable_path = _resolve(root, deliverable_rel, "deliverable output", errors)
        if deliverable_path is None or not deliverable_path.is_file():
            _fail(f"declared deliverable is missing: {deliverable_rel}", errors)
        elif source_path.is_file():
            try:
                source_text = source_path.read_text(encoding="utf-8")
                output_text = deliverable_path.read_text(encoding="utf-8")
                if _character_stream(source_text) != _character_stream(output_text):
                    _fail("deliverable does not preserve the source character stream", errors)
                if any(len(ENUM_RE.findall(line)) > 1 for line in output_text.splitlines()):
                    _fail("multiple Chinese enumerated items remain on one deliverable line", errors)
                for line in output_text.splitlines():
                    marker = ENUM_RE.search(line)
                    if marker and line[: marker.start()].strip():
                        _fail("a Chinese enumerated item does not begin its own nonempty line", errors)
                        break
            except (OSError, UnicodeError) as exc:
                _fail(f"cannot compare source and deliverable as UTF-8: {exc}", errors)
        else:
            _fail(f"source input is missing: {source_path}", errors)
    checked.extend(["character-stream-preservation", "enumerated-item-lines"])

    if contract.get("exactOutputSet") is True:
        declared = {value for value in outputs.values() if isinstance(value, str)}
        expected = {review_rel}
        if deliverable_rel is not None:
            expected.add(deliverable_rel)
        top_dirs = {Path(value).parts[0] for value in declared if Path(value).parts}
        actual: set[str] = set()
        for top_dir in top_dirs:
            base = _resolve(root, top_dir, "output directory", errors)
            if base is not None and base.exists():
                actual.update(path.relative_to(root).as_posix() for path in base.rglob("*") if path.is_file())
        if actual != expected:
            _fail(f"exact output set differs: expected {sorted(expected)}, got {sorted(actual)}", errors)
        checked.append("exact-output-set")

    return {
        "status": "passed" if not errors else "failed",
        "contract": str(contract_path),
        "root": str(root),
        "checked": checked,
        "errors": errors,
        "residualDuty": "Classification correctness and pre/post hash comparison of protected inputs require agent or external evidence.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Check outputs against a law-to-markdown JSON contract.")
    parser.add_argument("--root", required=True, help="Root directory containing the contract's relative paths")
    parser.add_argument("--contract", required=True, help="Path to the JSON contract")
    parser.add_argument("--source", required=True, help="Source document used to check character preservation")
    args = parser.parse_args()

    result = check(Path(args.root), Path(args.contract), Path(args.source))
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    return 0 if result["status"] == "passed" else 1


if __name__ == "__main__":
    sys.exit(main())
