"""Offline AL evidence, frozen-byte and accounting checks; no provider or target code."""
import hashlib
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[4]


def load(name):
    return json.loads((ROOT / name).read_text(encoding="utf-8"))


def digest(data):
    return hashlib.sha256(data).hexdigest()


def git_bytes(commit, relative):
    return subprocess.check_output(["git", "show", commit + ":" + relative], cwd=REPO)


plan = load("study-plan.json")
baseline = load("implementation-freeze.json")
revision = load("shared-revision/implementation-freeze.json")
verification = load("verification-freeze.json")
plan_bytes = (ROOT / "study-plan.json").read_bytes()
assert baseline["planSha256"] == revision["planSha256"] == digest(plan_bytes)
assert revision["baselineFreezeSha256"] == digest((ROOT / "implementation-freeze.json").read_bytes())
assert revision["registrationSha256"] == digest((ROOT / "shared-revision/registration.json").read_bytes())
assert verification["generationClosed"] is True and verification["providerCallsAfterChange"] == 0
assert verification["sharedRevisionFreezeSha256"] == digest((ROOT / "shared-revision/implementation-freeze.json").read_bytes())
assert verification["planSha256"] == digest(plan_bytes)
for item in baseline["files"]:
    assert digest(git_bytes(baseline["commit"], item["path"])) == item["sha256"], item["path"]
for item in revision["files"]:
    assert digest(git_bytes(revision["commit"], item["path"])) == item["sha256"], item["path"]
for item in verification["files"]:
    assert digest((REPO / item["path"]).read_bytes()) == item["sha256"], item["path"]
    assert digest(git_bytes(verification["commit"], item["path"])) == item["sha256"], item["path"]

bindings = []


def verify_bindings(value):
    if isinstance(value, dict):
        if isinstance(value.get("path"), str) and isinstance(value.get("sha256"), str):
            file = (REPO / value["path"]).resolve()
            assert file.is_relative_to(REPO), value["path"]
            assert digest(file.read_bytes()) == value["sha256"], value["path"]
            bindings.append(value)
        for child in value.values():
            verify_bindings(child)
    elif isinstance(value, list):
        for child in value:
            verify_bindings(child)


verify_bindings(plan)
summary = load("summary.json")
stages = summary["stageUsage"]
usage = summary["usage"]
assert len(stages) == 7
for metric in ["providerCalls", "respondedCalls", "unknownUsageCalls", "unknownCostCalls"]:
    assert sum(stage[metric] for stage in stages.values()) == usage[metric], metric
for metric in ["input", "output", "cacheRead", "cacheWrite"]:
    assert sum(stage["knownTokens"][metric] for stage in stages.values()) == usage["knownTokens"][metric], metric
assert usage["providerCalls"] == usage["respondedCalls"] == usage["unknownCostCalls"] == 64
assert usage["unknownUsageCalls"] == 0 and usage["totalActualUsd"] is None
assert usage["completePromptTokens"] == 430812 + 8960 == 439772
assert usage["totalTokens"] == 439772 + 78113 == 517885
assert summary["quality"]["planned"] == 20
assert summary["quality"]["finalFull"] + summary["quality"]["finalPartial"] + summary["quality"]["finalIncorrect"] + summary["quality"]["blocked"] == 20
assert summary["quality"]["correctDeterminate"] + summary["quality"]["completeConditional"] == summary["quality"]["finalFull"] == 8
assert summary["consumerObligations"]["finalFull"] == 9
assert summary["consumerObligations"]["actual"] == summary["consumerActualExpandedObligations"] == 12
assert summary["consumerObligations"]["planned"] == 16
assert summary["consumerObligations"]["finalFull"] + summary["consumerObligations"]["finalPartial"] + summary["consumerObligations"]["blocked"] == 16
assert summary["sharedRevision"]["results"]["planned"] == 4
assert summary["sharedRevision"]["results"]["finalFull"] == 2
authors = load("evaluator/author-reviews.json")
assert {row["id"] for row in authors["rows"]} == {row["id"] for row in plan["authors"]}
assert sum(row["firstSemanticValid"] is True for row in authors["rows"]) == authors["firstSemanticValid"] == 4
assert sum(row["finalSemanticValid"] is True for row in authors["rows"]) == authors["finalSemanticValid"] == 5
assert summary["authors"]["firstSemanticValid"] == 4 and summary["authors"]["finalSemanticValid"] == 5
for name, expected in [("panel-replay.json", 20), ("consumer-replay.json", 8), ("shared-revision/replay.json", 4)]:
    replay = load(name)
    assert replay["closed"] == replay["planned"] == expected
    assert not any(row["status"] in ["not-dispatched", "completion-unknown"] for row in replay["rows"])
assert summary["targetExecutions"] == 0

json_files = list(ROOT.rglob("*.json"))
jsonl_files = list(ROOT.rglob("*.jsonl"))
for file in json_files:
    json.loads(file.read_text(encoding="utf-8"))
records = 0
for file in jsonl_files:
    for line in file.read_text(encoding="utf-8").splitlines():
        if line.strip():
            json.loads(line)
            records += 1

# Inspect only this stage's artifacts and changes; never read local provider configuration.
changed = subprocess.check_output(["git", "diff", "--name-only", "-z", "8b77dcfc", "--"], cwd=REPO, stderr=subprocess.DEVNULL).decode("utf-8").split("\0")
untracked = subprocess.check_output(["git", "ls-files", "--others", "--exclude-standard", "-z", "examples/authorization-assessment"], cwd=REPO).decode("utf-8").split("\0")
files = {file for file in ROOT.rglob("*") if file.is_file()}
files.update(REPO / name for name in changed + untracked if (REPO / name).is_file())
# A prefix inside a word such as task-dsl-research is a path, not an API-key token.
credential = re.compile(rb"(?<![A-Za-z0-9_-])(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|Bearer\s+[A-Za-z0-9._-]{24,})")
hits = [file for file in files if credential.search(file.read_bytes())]
assert not hits, "Credential candidates detected; values withheld; affected file count=" + str(len(hits))
author_files = sorted(file for file in (ROOT / "author-packages").rglob("*") if file.is_file() and not file.name.startswith("."))
report = {
    "schemaVersion": "authorization-al-evidence-audit/v1",
    "checkedAt": datetime.now(timezone.utc).isoformat(),
    "baselineFrozenGitFiles": len(baseline["files"]),
    "sharedRevisionFrozenGitFiles": len(revision["files"]),
    "activeFrozenLiveAndGitFiles": len(verification["files"]),
    "verificationCommit": verification["commit"],
    "registeredBindingsVerified": len(bindings),
    "jsonFilesParsed": len(json_files),
    "jsonlFilesParsed": len(jsonl_files),
    "jsonlRecordsParsed": records,
    "credentialFilesChecked": len(files),
    "credentialCandidates": 0,
    "authorArtifactBindings": [{"path": file.relative_to(REPO).as_posix(), "sha256": digest(file.read_bytes())} for file in author_files],
    "accounting": {"stages": 7, "providerCalls": 64, "completePromptTokens": 439772, "outputTokens": 78113, "actualUsd": "unknown"},
    "providerCallsThisCheck": 0,
    "targetExecutions": 0,
}
(ROOT / "evidence-audit.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({key: value for key, value in report.items() if key != "authorArtifactBindings"}, ensure_ascii=False))
