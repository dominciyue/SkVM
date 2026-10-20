"""Check BS document links; distinguish inherited broken links from additions."""
import json
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote

repo = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(repo / "scripts"))
from check_skill_ir_doc_links import current_markdown_anchors

base = repo / "results/skill-ir/skill-dsl-research/development/authorization-task-coverage-v1"
files = [
    "docs/skill-ir/current-status.md", "docs/skill-ir/developer-guide.md",
    "docs/skill-ir/skill-ir-aot-optimization-plan.md",
    "docs/skill-ir/skill-ir-aot-optimization-spec.md",
    "docs/skill-ir/skill-dsl-research.md",
    "docs/superpowers/plans/2026-10-20-authorization-task-coverage-and-semantic-transfer.md",
    "examples/authorization-assessment/shared-link-workflow/README.md",
    "examples/authorization-assessment/issue-create-workflow/README.md",
    str((base / "execution.md").relative_to(repo)).replace("\\", "/"),
]
broken, inherited = [], []
for name in files:
    source = repo / name
    text = source.read_text(encoding="utf-8")
    previous = subprocess.run(["git", "show", f"b21b077d:{name}"], cwd=repo, capture_output=True, encoding="utf-8")
    old_links = set(re.findall(r"\[[^\]]*\]\(([^)]+)\)", previous.stdout)) if previous.returncode == 0 else set()
    for raw in set(re.findall(r"\[[^\]]*\]\(([^)]+)\)", text)):
        if raw.startswith(("http:", "https:", "mailto:", "codex:")):
            continue
        target, _, anchor = unquote(raw.strip("<>")).partition("#")
        resolved = (source.parent / target).resolve() if target else source
        reason = "missing-target" if not resolved.is_file() else None
        if not reason and anchor and resolved.suffix == ".md":
            if anchor not in current_markdown_anchors(resolved.read_text(encoding="utf-8")):
                reason = "missing-anchor"
        if reason:
            (inherited if raw in old_links else broken).append({"source": name, "target": raw, "reason": reason})
result = {"files": files, "newBrokenLinks": broken, "inheritedBrokenLinks": inherited, "exitCode": int(bool(broken))}
(base / "verification/document-links.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"files": len(files), "newBroken": len(broken), "inherited": len(inherited)}))
sys.exit(result["exitCode"])
