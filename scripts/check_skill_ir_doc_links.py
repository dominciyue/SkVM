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
DEFAULT_RETIRED_REFERENCES = "scripts/skill_ir_retired_doc_references.json"
DEFAULT_GOVERNANCE_MANIFEST = "scripts/skill_ir_doc_governance.json"


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
    retired_pairs: set[tuple[str, str]] | None = None,
) -> dict:
    broken: list[dict[str, str]] = []
    legacy: list[dict[str, str]] = []
    retired: list[dict[str, str]] = []
    scanned = 0

    ignored = ignored_sources or set()
    allowed_retired = retired_pairs or set()
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
            if source.startswith("results/skill-ir/") and target in legacy_paths:
                retired.append(item)
                continue
            if not (root / target).is_file() and (source, target) in allowed_retired:
                retired.append(item)
                continue
            if not (root / target).is_file():
                broken.append(item)
            if target in legacy_paths:
                legacy.append(item)

    return {
        "schemaVersion": "skill-ir-doc-link-check/v1",
        "scannedFiles": scanned,
        "brokenReferences": broken,
        "legacyReferences": legacy,
        "retiredReferences": retired,
    }


def check_governance(root: Path, manifest: dict, legacy_paths: set[str]) -> dict:
    errors: list[str] = []
    warnings: list[str] = []
    current_rows = manifest.get("currentDocuments", [])
    versioned = manifest.get("versionedMaterials", [])
    current = [row["path"] for row in current_rows]

    for path in current:
        if not (root / path).is_file():
            errors.append(f"missing current document: {path}")
    for path in versioned:
        if not (root / path).is_file():
            errors.append(f"missing versioned material: {path}")
        if path in legacy_paths:
            errors.append(f"versioned material is marked legacy: {path}")

    for path in sorted(set(current) & set(versioned)):
        errors.append(f"current documents and versioned materials overlap: {path}")

    bounds = manifest.get("recommendedCurrentDocumentRange", {})
    minimum = bounds.get("min", 0)
    maximum = bounds.get("max", 10**9)
    if not minimum <= len(current) <= maximum:
        warnings.append(f"current document count outside recommendation: {len(current)}")

    for row in current_rows:
        path = root / row["path"]
        if not path.is_file():
            continue
        line_count = len(path.read_text(encoding="utf-8").splitlines())
        soft_max = row["softMaxLines"]
        if line_count > soft_max:
            warnings.append(
                f"soft line limit exceeded: {row['path']} ({line_count} > {soft_max})"
            )

    return {"errors": errors, "warnings": warnings}


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


def read_retired_pairs(path: Path | None) -> set[tuple[str, str]]:
    if path is None:
        return set()
    value = json.loads(path.read_text(encoding="utf-8"))
    rows = value.get("references") if isinstance(value, dict) else None
    if not isinstance(rows, list):
        raise ValueError("retired reference manifest must contain a references array")
    pairs: set[tuple[str, str]] = set()
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("source"), str) or not isinstance(row.get("target"), str):
            raise ValueError("retired reference row must contain string source and target")
        pairs.add((row["source"].replace("\\", "/"), row["target"].replace("\\", "/")))
    return pairs


def resolve_retired_reference_path(root: Path, raw_path: str | None) -> Path | None:
    if raw_path:
        return Path(raw_path).resolve()
    default_path = root / DEFAULT_RETIRED_REFERENCES
    return default_path if default_path.is_file() else None


def resolve_governance_manifest_path(root: Path, raw_path: str | None) -> Path | None:
    if raw_path:
        return Path(raw_path).resolve()
    default_path = root / DEFAULT_GOVERNANCE_MANIFEST
    return default_path if default_path.is_file() else None


def main() -> int:
    parser = argparse.ArgumentParser(description="Check tracked Skill IR documentation references.")
    parser.add_argument("--root", default=".", help="Repository root.")
    parser.add_argument("--legacy-paths", help="UTF-8 file containing one absorbed documentation path per line.")
    parser.add_argument("--retired-references", help="JSON manifest of exact historical source/withdrawn-target pairs.")
    parser.add_argument("--governance-manifest", help="JSON manifest of current documents and versioned materials.")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    legacy_path = resolve_legacy_path(root, args.legacy_paths)
    retired_path = resolve_retired_reference_path(root, args.retired_references)
    governance_path = resolve_governance_manifest_path(root, args.governance_manifest)
    ignored_sources = set(DEFAULT_IGNORED_SOURCES)
    if legacy_path is not None:
        try:
            ignored_sources.add(legacy_path.relative_to(root).as_posix())
        except ValueError:
            pass
    if retired_path is not None:
        try:
            ignored_sources.add(retired_path.relative_to(root).as_posix())
        except ValueError:
            pass
    governance_manifest: dict | None = None
    if governance_path is not None:
        governance_manifest = json.loads(governance_path.read_text(encoding="utf-8"))
        ignored_sources.update(governance_manifest.get("versionedMaterials", []))
        ignored_sources.update(governance_manifest.get("historicalSources", []))
    legacy_paths = read_legacy_paths(legacy_path)
    result = check_references(
        root,
        git_tracked_paths(root),
        legacy_paths,
        ignored_sources,
        read_retired_pairs(retired_path),
    )
    governance = {"errors": [], "warnings": []}
    if governance_manifest is not None:
        governance = check_governance(
            root,
            governance_manifest,
            legacy_paths,
        )
    result["governanceErrors"] = governance["errors"]
    result["governanceWarnings"] = governance["warnings"]
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 1 if result["brokenReferences"] or result["legacyReferences"] or result["governanceErrors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
