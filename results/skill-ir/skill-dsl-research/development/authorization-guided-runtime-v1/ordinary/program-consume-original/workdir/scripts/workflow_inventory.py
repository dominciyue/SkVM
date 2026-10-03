#!/usr/bin/env python3
"""Create an offline evidence inventory for GitHub Actions workflow YAML.

This intentionally parses a documented, line-oriented YAML subset. It never
executes workflow content and does not make security judgments.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

KEY_RE = re.compile(r"^(?P<indent> *)(?P<key>[^:#][^:]*?):(?:[ \t]*(?P<value>.*?))?[ \t]*$")
YAML_SUFFIXES = {".yml", ".yaml"}


def strip_comment(value: str) -> str:
    quote: str | None = None
    escaped = False
    for index, char in enumerate(value):
        if escaped:
            escaped = False
        elif char == "\\" and quote == '"':
            escaped = True
        elif char in "'\"":
            quote = None if quote == char else (char if quote is None else quote)
        elif char == "#" and quote is None and (index == 0 or value[index - 1].isspace()):
            return value[:index].rstrip()
    return value.rstrip()


def scalar(value: str) -> Any:
    value = strip_comment(value).strip()
    if value == "":
        return None
    if value == "{}":
        return {}
    if value == "[]":
        return []
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
        return value[1:-1]
    if value.lower() in {"true", "false"}:
        return value.lower() == "true"
    return value


def parsed_key(text: str) -> tuple[int, str, str] | None:
    match = KEY_RE.match(text)
    if not match:
        return None
    indent = len(match.group("indent"))
    key = match.group("key").strip()
    # Treat a sequence item's inline mapping key (`- uses:`) as nested content.
    if key.startswith("- "):
        indent += 2
        key = key[2:].strip()
    return indent, key, match.group("value") or ""


def significant_rows(lines: list[str]) -> list[tuple[int, str]]:
    result = []
    for number, text in enumerate(lines, 1):
        if not text.strip() or text.lstrip().startswith("#") or text.strip() in {"---", "..."}:
            continue
        result.append((number, text))
    return result


def omitted_permission() -> dict[str, Any]:
    return {"state": "omitted", "values": {}, "line": None, "evidence": None}


def read_permission(
    rows: list[tuple[int, str]], index: int, indent: int, value: str
) -> tuple[dict[str, Any], int]:
    number, text = rows[index]
    clean = strip_comment(value).strip()
    base = {"line": number, "evidence": text.strip()}
    if clean == "{}":
        return {"state": "explicit_empty", "values": {}, **base}, index + 1
    if clean:
        return {"state": "declared", "values": {"_scalar": scalar(clean)}, **base}, index + 1

    values: dict[str, Any] = {}
    cursor = index + 1
    while cursor < len(rows):
        child = parsed_key(rows[cursor][1])
        if not child or child[0] <= indent:
            break
        child_indent, child_key, child_value = child
        if child_indent == indent + 2:
            values[child_key] = scalar(child_value)
        cursor += 1
    state = "declared" if values else "declared_null"
    return {"state": state, "values": values, **base}, cursor


def inventory_file(path: Path, root: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8-sig")
    lines = text.splitlines()
    if any("\t" in line[: len(line) - len(line.lstrip())] for line in lines):
        raise ValueError("tab indentation is unsupported")
    rows = significant_rows(lines)
    relative = path.relative_to(root).as_posix()
    top_indent = min((len(text) - len(text.lstrip(" ")) for _, text in rows), default=0)
    workflow_permissions = omitted_permission()
    jobs_indent: int | None = None
    jobs_row: int | None = None

    for index, (_, text) in enumerate(rows):
        parsed = parsed_key(text)
        if not parsed:
            continue
        indent, key, value = parsed
        if indent == top_indent and key == "permissions":
            workflow_permissions, _ = read_permission(rows, index, indent, value)
        elif indent == top_indent and key == "jobs":
            jobs_row, jobs_indent = index, indent

    jobs: list[dict[str, Any]] = []
    if jobs_row is not None and jobs_indent is not None:
        cursor = jobs_row + 1
        while cursor < len(rows):
            number, text = rows[cursor]
            parsed = parsed_key(text)
            if not parsed:
                cursor += 1
                continue
            indent, key, value = parsed
            if indent <= jobs_indent:
                break
            if indent == jobs_indent + 2:
                job = {
                    "name": key,
                    "line": number,
                    "evidence": text.strip(),
                    "permissions": omitted_permission(),
                }
                jobs.append(job)
                job_indent = indent
                lookahead = cursor + 1
                while lookahead < len(rows):
                    child = parsed_key(rows[lookahead][1])
                    if not child or child[0] <= job_indent:
                        break
                    if child[0] == job_indent + 2 and child[1] == "permissions":
                        job["permissions"], lookahead = read_permission(
                            rows, lookahead, child[0], child[2]
                        )
                        continue
                    lookahead += 1
                cursor = lookahead
                continue
            cursor += 1

    action_uses: list[dict[str, Any]] = []
    active_job: str | None = None
    if jobs_indent is not None:
        for number, text in rows:
            parsed = parsed_key(text)
            if not parsed:
                continue
            indent, key, value = parsed
            if indent <= jobs_indent and key != "jobs":
                active_job = None
            elif indent == jobs_indent + 2:
                active_job = key
                # A job-level uses invokes a reusable workflow.
                if strip_comment(value).strip() and key == "uses":
                    active_job = None
            if key == "uses" and indent > jobs_indent:
                action_uses.append(
                    {
                        "job": active_job,
                        "kind": "reusable_workflow" if indent == jobs_indent + 4 else "action",
                        "reference": scalar(value),
                        "line": number,
                        "evidence": text.strip(),
                    }
                )

    return {
        "path": relative,
        "workflow_permissions": workflow_permissions,
        "jobs": jobs,
        "action_uses": action_uses,
        "line_count": len(lines),
    }


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Inventory GitHub Actions permissions and uses references without executing workflows."
    )
    parser.add_argument("workflow_directory", help="directory recursively containing .yml/.yaml workflows")
    parser.add_argument("output_json", help="JSON file to create")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    root = Path(args.workflow_directory).resolve()
    output = Path(args.output_json)
    if not root.is_dir():
        print(json.dumps({"status": "error", "error": f"not a directory: {root}"}), file=sys.stderr)
        return 2

    files = sorted(path for path in root.rglob("*") if path.is_file() and path.suffix.lower() in YAML_SUFFIXES)
    inventories = []
    errors = []
    for path in files:
        try:
            inventories.append(inventory_file(path, root))
        except (OSError, UnicodeError, ValueError) as error:
            errors.append({"path": path.relative_to(root).as_posix(), "error": str(error)})

    if errors:
        print(json.dumps({"status": "error", "errors": errors}, ensure_ascii=False), file=sys.stderr)
        return 1

    document = {
        "schema": "github-actions-workflow-inventory/v1",
        "offline": True,
        "yaml_parser": "line-oriented subset documented in references/workflow-inventory.md",
        "workflow_directory": str(root),
        "files": inventories,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(document, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "status": "ok",
                "output": str(output),
                "files": len(inventories),
                "next_step": "Review the inventory semantically; it is evidence, not a security verdict.",
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
