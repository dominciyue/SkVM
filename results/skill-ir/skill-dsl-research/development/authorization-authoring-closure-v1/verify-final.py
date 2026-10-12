import importlib.util
import json
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[4]
checks = {}


def command(name, args):
    result = subprocess.run(args, cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace")
    checks[name] = {"command": args, "exitCode": result.returncode, "output": (result.stdout + result.stderr).strip()}
    return result


engineering = json.loads((BASE / "verification/engineering-stage-2.json").read_text(encoding="utf-8"))
unchanged = command("unchangedProductionSource", ["git", "diff", "--exit-code", "--", "src"])
checks["mainType"] = {
    "exitCode": engineering["freshAfterTestTypeCorrection"]["mainTypeExit"],
    "basis": "Fresh main type result after final production/test changes; source unchanged since c9749483. No repeated main check for result/doc-only edits.",
    "evidence": "verification/engineering-stage-2.json",
}
suite = engineering["affectedAuthorizationSuite"]
checks["affectedAuthorizationSuite"] = {"exitCode": 0 if suite["fail"] == 0 and unchanged.returncode == 0 else 1, **suite, "evidence": "verification/authorization-suite-final.log"}
bun_path = Path(shutil.which("bun"))
npm_native = bun_path.parent / "node_modules/bun/bin/bun.exe"
if npm_native.is_file():
    bun_path = npm_native
command("researchType", [str(bun_path), "x", "tsc", "--noEmit", "-p", str(BASE.relative_to(ROOT) / "tsconfig.json")])
command("documentTests", ["python", "scripts/check_skill_ir_doc_links_test.py"])

changed = subprocess.check_output(["git", "diff", "--name-only", "fde04c26f35635366d4a7e6eddbfce15f309cd1c", "--", "docs", "examples"], cwd=ROOT, text=True, encoding="utf-8").splitlines()
changed = [name for name in changed if name.endswith(".md")]
spec = importlib.util.spec_from_file_location("doc_links", ROOT / "scripts/check_skill_ir_doc_links.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
references = module.check_references(ROOT, changed, set(), retired_pairs=module.read_retired_pairs(ROOT / module.DEFAULT_RETIRED_REFERENCES))
anchor_errors = []
anchors_checked = 0
for source in changed:
    diff = subprocess.check_output(["git", "diff", "--unified=0", "fde04c26f35635366d4a7e6eddbfce15f309cd1c", "--", source], cwd=ROOT, text=True, encoding="utf-8")
    additions = "\n".join(line[1:] for line in diff.splitlines() if line.startswith("+") and not line.startswith("+++"))
    for match in module.MARKDOWN_LINK_RE.finditer(additions):
        target = match.group(1).strip().strip("<>")
        if "#" not in target or target.startswith(("http://", "https://", "mailto:", "/")):
            continue
        raw_path, anchor = target.split("#", 1)
        normalized = module.normalize_target(source, raw_path) if raw_path else source
        if normalized is None:
            continue
        path = ROOT / normalized
        if path.suffix != ".md":
            continue
        anchors_checked += 1
        if not path.is_file() or unquote(anchor) not in module.current_markdown_anchors(path.read_text(encoding="utf-8")):
            anchor_errors.append({"source": source, "target": target})
checks["changedDocumentLinks"] = {"exitCode": 0 if not references["brokenReferences"] and not references["legacyReferences"] and not anchor_errors else 1, "files": changed, **references, "newAnchorsChecked": anchors_checked, "anchorErrors": anchor_errors, "scope": "Changed Markdown only, with existing retired-pair configuration; no full historical scan."}
command("diffCheck", ["git", "diff", "--check"])
verification = {"verifiedAt": datetime.now(timezone.utc).isoformat(), "coreCommit": "c974948365ad8f8df39b280d48271625db02cb7c", "checks": checks, "derivationRepair": "Initial Python invocation could not launch the PowerShell-only bunx shim (WinError 2). Resolved its documented npm native bun executable and used bun x; no production or account-session change.", "limits": "Current affected authorization suite and main type evidence reused while src is unchanged. Research type, doc tests, changed links/anchors and diff are fresh. No all-src run or protected evidence edits."}
(BASE / "verification/final.json").write_text(json.dumps(verification, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"checks": {name: value["exitCode"] for name, value in checks.items()}, "documents": len(changed), "newAnchors": anchors_checked, "anchorErrors": anchor_errors}, ensure_ascii=False))
raise SystemExit(0 if all(c["exitCode"] == 0 for c in checks.values()) else 1)
