#!/usr/bin/env python3
"""Offline GitHub Actions workflow inventory.

This is an evidence collector, not a semantic security assessor. It records
workflow/job token permissions and every ``uses`` reference with source lines.
It uses only Python's standard library and never executes workflow content.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

KEY_RE = re.compile(r"^(?P<indent> *)(?P<key>[^:#][^:]*?):(?:[ \t]*(?P<value>.*?))?[ \t]*$")


def strip_comment(value: str) -> str:
    quote = None
    escaped = False
    for i, char in enumerate(value):
        if escaped:
            escaped = False
        elif char == "\\" and quote == '"':
            escaped = True
        elif char in "'\"":
            quote = None if quote == char else (char if quote is None else quote)
        elif char == "#" and quote is None and (i == 0 or value[i - 1].isspace()):
            return value[:i].rstrip()
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
    if value.lower() in ("true", "false"):
        return value.lower() == "true"
    return value


def parsed_key(text: str):
    match = KEY_RE.match(text)
    if not match:
        return None
    return len(match.group("indent")), match.group("key").strip(), match.group("value") or ""


def rows(lines):
    for number, raw in enumerate(lines, 1):
        text = raw.rstrip("\r\n")
        if not text.strip() or text.lstrip().startswith("#") or text.strip() in ("---", "..."):
            continue
        yield number, text


def omitted_permission() -> dict[str, Any]:
    return {"state": "omitted", "values": {}, "line": None, "evidence": None}


def permission_at(items: list[tuple[int, str]], index: int, indent: int, value: str) -> tuple[dict[str, Any], int]:
    """Read a permissions scalar or its immediately nested permission map."""
    evidence_line = items[index][1].strip()
    clean = strip_comment(value).strip()
    if clean == "{}":
        return {"state": "explicit_empty", "values": {}, "line": items[index][0], "evidence": evidence_line}, index + 1
    if clean:
        # Flow maps are retained as raw evidence rather than guessed.
        return {"state": "declared", "values": {"_raw": scalar(clean)}, "line": items[index][0], "evidence": evidence_line}, index + 1

    values: dict[str, Any] = {}
    j = index + 1
    while j < len(items):
        number, text = items[j]
        child = parsed_key(text)
        if not child or child[0] <= indent:
            break
        child_indent, child_key, child_value = child
        # Only immediate children belong to this permission mapping.
        if child_indent == indent + 2:
            values[child_key] = scalar(child_value)
        j += 1
    return {"state": "declared", "values": values, "line": items[index][0], "evidence": evidence_line}, j


def inventory_file(path: Path, root: Path) -> dict[str, Any]:
    lines = path.read_text(encoding="utf-8").splitlines()
    items = list(rows(lines))
    relative = path.relative_to(root).as_posix()
    top_indent = min((len(text) - len(text.lstrip(" ")) for _, text in items), default=0)
    workflow_permissions = omitted_permission()
    jobs: list[dict[str, Any]] = []
    action_uses: list[dict[str, Any]] = []

    jobs_index = None
    jobs_indent = None
    for i, (number, text) in enumerate(items):
        parsed = parsed_key(text)
        if not parsed:
            continue
        indent, key, value = parsed
        if indent == top_indent and key == "permissions":
            workflow_permissions, _ = permission_at(items, i, indent, value)
        if indent == top_indent and key == "jobs":
            jobs_index, jobs_indent = i, indent

    if jobs_index is not None:
        current = None
        current_indent = None
        i = jobs_index + 1
        while i < len(items):
            number, text = items[i]
            parsed = parsed_key(text)
            if not parsed:
                i += 1
                continue
            indent, key, value = parsed
            if indent <= jobs_indent:
                break
            if indent == jobs_indent + 2:
                current = {"name": key, "line": number, "evidence": text.strip(), "permissions": omitted_permission()}
                jobs.append(current)
                current_indent = indent
                # A reusable workflow can occur as the job's uses value.
                if key == "uses":
                    action_uses.append({"job": None, "kind": "reusable_workflow", "reference": scalar(value), "line": number, "evidence": text.strip()})
            elif current is not None and indent == current_indent + 2 and key == "permissions":
                current["permissions"], consumed = permission_at(items, i, indent, value)
                i = consumed - 1
            i += 1

    # Record every uses key, associating it with the most recent declared job.
    # The duplicate-line guard also preserves a direct job-level reusable workflow.
    seen = {entry["line"] for entry in action_uses}
    active_job = None
    for number, text in items:
        parsed = parsed_key(text)
        if not parsed:
            continue
        indent, key, value = parsed
        if jobs_indent is not None and indent == jobs_indent + 2:
            active_job = key
        if key == "uses" and number not in seen:
            action_uses.append({
                "job": active_job,
                "kind": "action_or_reusable_workflow",
                "reference": scalar(value),
                "line": number,
                "evidence": text.strip(),
            })
    action_uses.sort(key=lambda entry: entry["line"])

    return {
        "path": relative,
        "workflow_permissions": workflow_permissions,
        "jobs": jobs,
        "action_uses": action_uses,
        "line_count": len(lines),
    }


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(f"usage: {Path(argv[0]).name} WORKFLOW_DIRECTORY OUTPUT_JSON", file=sys.stderr)
        return 2
    root = Path(argv[1]).resolve()
    output = Path(argv[2])
    if not root.is_dir():
        print(f"error: workflow directory does not exist: {root}", file=sys.stderr)
        return 2
    files = sorted(path for path in root.rglob("*") if path.is_file() and path.suffix.lower() in (".yml", ".yaml"))
    document = {
        "schema": "github-actions-workflow-inventory/v1",
        "offline": True,
        "yaml_parser": "line-oriented standard-library subset; see workflow-inventory.md",
        "workflow_directory": str(root),
        "files": [inventory_file(path, root) for path in files],
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(document, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"inventoried {len(files)} YAML file(s) -> {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
