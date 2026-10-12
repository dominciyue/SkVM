import json
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[6]
sys.path.insert(0, str(root / "scripts"))
import check_skill_ir_doc_links as checker

changed = subprocess.check_output(["git", "diff", "--name-only", "-z", "2c64f50f"], cwd=root).decode("utf-8").split("\0")
new = subprocess.check_output(["git", "ls-files", "--others", "--exclude-standard", "-z"], cwd=root).decode("utf-8").split("\0")
paths = [p for p in changed + new if p and p.endswith(".md")]
legacy = checker.read_legacy_paths(checker.resolve_legacy_path(root, None))
retired = checker.read_retired_pairs(checker.resolve_retired_reference_path(root, None))
manifest = json.loads((root / checker.DEFAULT_GOVERNANCE_MANIFEST).read_text(encoding="utf-8"))
result = checker.check_references(root, paths, legacy, retired_pairs=retired)
result["governance"] = checker.check_governance(root, manifest, legacy)
result["scope"] = "Current modified/new Markdown since BH takeover; full historical scan separately observed 10 old result-artifact retired links, no governance errors. Historical evidence was not edited."
Path(__file__).with_name("current-doc-links.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(result, ensure_ascii=False))
raise SystemExit(bool(result["brokenReferences"] or result["legacyReferences"] or result["governance"]["errors"]))
