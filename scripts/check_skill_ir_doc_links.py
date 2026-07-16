import argparse
import json
import posixpath
import re
import subprocess
from pathlib import Path
from typing import Iterable


EXPLICIT_DOC_RE = re.compile(r"docs/(?:skill-ir|superpowers)/[A-Za-z0-9_./-]+\.md")
MARKDOWN_LINK_RE = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
DOC_NAMESPACES = ("docs/skill-ir/", "docs/superpowers/")
DEFAULT_IGNORED_SOURCES = {"scripts/check_skill_ir_doc_links_test.py"}


def normalize_target(source: str, raw_target: str) -> str | None:
    target = raw_target.strip().strip("<>").split("#", 1)[0]
    if not target or target.startswith(("http://", "https://", "mailto:", "/")):
        return None
    if not target.lower().endswith(".md"):
        return None
    if target.startswith("docs/"):
        return posixpath.normpath(target)
    return posixpath.normpath(posixpath.join(posixpath.dirname(source), target))


def references_in_text(source: str, text: str) -> set[str]:
    references = set(EXPLICIT_DOC_RE.findall(text))
    for match in MARKDOWN_LINK_RE.finditer(text):
        target = normalize_target(source, match.group(1))
        if target and target.startswith(DOC_NAMESPACES):
            references.add(target)
    return references


def check_references(
    root: Path,
    tracked_paths: Iterable[str],
    legacy_paths: set[str],
    ignored_sources: set[str] | None = None,
) -> dict:
    broken: list[dict[str, str]] = []
    legacy: list[dict[str, str]] = []
    scanned = 0

    ignored = ignored_sources or set()
    for source in sorted(set(tracked_paths)):
        if source in legacy_paths or source in ignored:
            continue
        path = root / source
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        scanned += 1
        for target in sorted(references_in_text(source, text)):
            if source == "docs/skill-ir/history.md" and target in legacy_paths:
                continue
            item = {"source": source, "target": target}
            if not (root / target).is_file():
                broken.append(item)
            if target in legacy_paths:
                legacy.append(item)

    return {
        "schemaVersion": "skill-ir-doc-link-check/v1",
        "scannedFiles": scanned,
        "brokenReferences": broken,
        "legacyReferences": legacy,
    }


def git_tracked_paths(root: Path) -> list[str]:
    output = subprocess.check_output(
        ["git", "ls-files", "-z"],
        cwd=root,
    )
    return [item.decode("utf-8") for item in output.split(b"\0") if item]


def read_legacy_paths(path: Path | None) -> set[str]:
    if path is None:
        return set()
    return {
        line.strip().replace("\\", "/")
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    }


def resolve_legacy_path(root: Path, raw_path: str | None) -> Path | None:
    if raw_path:
        return Path(raw_path).resolve()
    default_path = root / "scripts" / "skill_ir_legacy_doc_paths.txt"
    return default_path if default_path.is_file() else None


def main() -> int:
    parser = argparse.ArgumentParser(description="Check tracked Skill IR documentation references.")
    parser.add_argument("--root", default=".", help="Repository root.")
    parser.add_argument("--legacy-paths", help="UTF-8 file containing one absorbed documentation path per line.")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    legacy_path = resolve_legacy_path(root, args.legacy_paths)
    ignored_sources = set(DEFAULT_IGNORED_SOURCES)
    if legacy_path is not None:
        try:
            ignored_sources.add(legacy_path.relative_to(root).as_posix())
        except ValueError:
            pass
    result = check_references(
        root,
        git_tracked_paths(root),
        read_legacy_paths(legacy_path),
        ignored_sources,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 1 if result["brokenReferences"] or result["legacyReferences"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
