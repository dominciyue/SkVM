import hashlib
import json
import re
import subprocess
from pathlib import Path

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[4]
directories = [BASE, ROOT / "results/local-download"]
files = [p for directory in directories for p in directory.rglob("*") if p.is_file() and "__pycache__" not in p.parts]
oversized = [str(p.relative_to(ROOT)) for p in files if p.stat().st_size >= 100_000_000]
markers = re.compile(rb"(?:sk-proj-[A-Za-z0-9_-]{30,}|sk-[A-Za-z0-9]{30,}|Bearer\s+[A-Za-z0-9._~-]{30,})")
matches = [str(p.relative_to(ROOT)) for p in files if markers.search(p.read_bytes())]
frozen = BASE / "authoring/automatic-program.json"
expected = json.loads((BASE / "quality.json").read_text(encoding="utf-8"))["frozenProgram"]["sha256"]
actual = hashlib.sha256(frozen.read_bytes()).hexdigest()
ignored = subprocess.check_output(["git", "ls-files", "--others", "--ignored", "--exclude-standard", "-z", "--", str(BASE.relative_to(ROOT)), "results/local-download"], cwd=ROOT).decode("utf-8").split("\0")
ignored = [p for p in ignored if p]
unexpected_ignored = [p for p in ignored if "/.skvm/skills/" not in p and "/__pycache__/" not in p]
working_blob = subprocess.check_output(["git", "hash-object", "--no-filters", str(frozen.relative_to(ROOT))], cwd=ROOT).decode().strip()
staged_blob = subprocess.check_output(["git", "rev-parse", ":" + frozen.relative_to(ROOT).as_posix()], cwd=ROOT).decode().strip()
result = {"files": len(files), "totalBytes": sum(p.stat().st_size for p in files), "largestFileBytes": max(p.stat().st_size for p in files), "filesAtOrAbove100MB": oversized, "credentialMarkerFiles": matches, "credentialScanScope": "Known account key/Bearer markers in new BI/current public-example evidence; no full historical scan and no secret contents printed.", "frozenOriginalSha256": actual, "frozenHashMatches": actual == expected, "stagedFrozenGitBlob": staged_blob, "stagedFrozenBytesMatch": staged_blob == working_blob, "ignoredReproducibleCopies": len(ignored), "unexpectedIgnoredEvidence": unexpected_ignored, "retention": "198 generated .skvm skill materialization files remain locally ignored; unchanged original 22-file skill and actual startup/tool/raw/session evidence are retained in the repository. Original model evidence, zero-model results and relocation archives are published. No local-only evidence deleted or moved; reproducible Python caches retain existing ignore policy."}
(BASE / "verification/publication-preparation.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(result, ensure_ascii=False))
raise SystemExit(1 if oversized or matches or actual != expected or staged_blob != working_blob or unexpected_ignored else 0)
