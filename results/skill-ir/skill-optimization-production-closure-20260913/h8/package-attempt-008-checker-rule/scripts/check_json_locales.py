#!/usr/bin/env python3
"""Check key and placeholder parity across nested JSON locale files."""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any

PLACEHOLDER_RE = re.compile(
    r"{{\s*[A-Za-z_][\w.-]*\s*}}|(?<!{){\s*[A-Za-z_][\w.-]*\s*}(?!})|%(?:\d+\$)?[sdif]"
)


def locale_arg(value: str) -> tuple[str, Path]:
    if "=" not in value:
        raise argparse.ArgumentTypeError("expected LOCALE=PATH")
    locale, path = value.split("=", 1)
    if not locale or not path:
        raise argparse.ArgumentTypeError("expected nonempty LOCALE=PATH")
    return locale, Path(path)


def flatten(value: Any, prefix: str = "") -> dict[str, str]:
    if isinstance(value, dict):
        result: dict[str, str] = {}
        for key, child in value.items():
            if not isinstance(key, str) or not key:
                raise ValueError("locale object keys must be nonempty strings")
            child_prefix = f"{prefix}.{key}" if prefix else key
            result.update(flatten(child, child_prefix))
        return result
    if not prefix:
        raise ValueError("locale root must be a JSON object")
    if not isinstance(value, str):
        raise ValueError(f"locale value at {prefix!r} must be a string")
    return {prefix: value}


def load_locale(path: Path) -> dict[str, str]:
    with path.open("r", encoding="utf-8") as handle:
        return flatten(json.load(handle))


def placeholders(text: str) -> Counter[str]:
    return Counter(match.group(0).replace(" ", "") for match in PLACEHOLDER_RE.finditer(text))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Compare nested JSON locale keys and common placeholder tokens."
    )
    parser.add_argument(
        "--reference",
        required=True,
        type=locale_arg,
        metavar="LOCALE=PATH",
        help="primary locale and JSON path",
    )
    parser.add_argument(
        "--locale",
        action="append",
        default=[],
        type=locale_arg,
        metavar="LOCALE=PATH",
        help="translated locale and JSON path; repeat for each locale",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    entries = [args.reference, *args.locale]
    labels = [label for label, _ in entries]
    if len(labels) != len(set(labels)):
        print(json.dumps({"ok": False, "error": "duplicate locale label"}))
        return 2

    try:
        loaded = {label: load_locale(path) for label, path in entries}
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        return 2

    reference_label, _ = args.reference
    reference = loaded[reference_label]
    reference_keys = set(reference)
    missing: dict[str, list[str]] = {}
    extra: dict[str, list[str]] = {}
    mismatches: list[dict[str, Any]] = []

    for label, values in loaded.items():
        keys = set(values)
        missing[label] = sorted(reference_keys - keys)
        extra[label] = sorted(keys - reference_keys)
        if label == reference_label:
            continue
        for key in sorted(reference_keys & keys):
            expected = placeholders(reference[key])
            actual = placeholders(values[key])
            if expected != actual:
                mismatches.append(
                    {
                        "locale": label,
                        "key": key,
                        "referencePlaceholders": sorted(expected.elements()),
                        "actualPlaceholders": sorted(actual.elements()),
                    }
                )

    ok = not any(missing.values()) and not any(extra.values()) and not mismatches
    result = {
        "ok": ok,
        "referenceLocale": reference_label,
        "keyCount": len(reference_keys),
        "missingKeys": missing,
        "extraKeys": extra,
        "placeholderMismatches": mismatches,
    }
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
