"""Explicit extraction fallback: exact upstream access files, minimal store type shim.

This does NOT execute the complete upstream module or its database layer.
Only the two access files' control flow is original. SHA256s document extraction.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[4]
SOURCE = ROOT / ".tmp/bt-source/memos-cb42e326ba9cc266a6a9570c53e0fe04c62793f4"
TARGET = ROOT / ".tmp/bt-source/memos-extracted"
RESULT = ROOT / "results/skill-ir/skill-dsl-research/development/authorization-semantic-validation-v1/source"
for directory in [TARGET / "core/access", TARGET / "store", RESULT]:
    directory.mkdir(parents=True, exist_ok=True)
hashes = {}
for name in ["memo.go", "memo_resolve.go"]:
    src = SOURCE / "core/access" / name
    dst = TARGET / "core/access" / name
    shutil.copyfile(src, dst)
    hashes[name] = hashlib.sha256(src.read_bytes()).hexdigest()
    assert src.read_bytes() == dst.read_bytes()
shutil.copyfile(Path(__file__).with_name("memos_access_test.go"), TARGET / "core/access/bt_semantic_test.go")
(TARGET / "go.mod").write_text("module github.com/usememos/memos\n\ngo 1.27.0\n", encoding="utf-8")
# Field names/types/constants copied in reduced form from store/{common,user,memo,space,attachment}.go.
# No storage behavior is implemented. The fake in the test supplies rows and errors.
(TARGET / "store/shim.go").write_text("""package store
type RowStatus string
const (Normal RowStatus = "NORMAL"; Archived RowStatus = "ARCHIVED")
type Role string
const (RoleAdmin Role = "ADMIN"; RoleUser Role = "USER")
type Visibility string
const (Public Visibility = "PUBLIC"; Protected Visibility = "PROTECTED"; Private Visibility = "PRIVATE"; SpaceAudience Visibility = "SPACE")
type User struct { ID int32; RowStatus RowStatus; Role Role }
type Memo struct { ID int32; CreatorID int32; SpaceID *int32; Visibility Visibility; RowStatus RowStatus }
type Attachment struct { CreatorID int32 }
type Space struct {}
type SpaceMemberRole string
const (SpaceMemberRoleAdmin SpaceMemberRole = "ADMIN"; SpaceMemberRoleUser SpaceMemberRole = "USER")
func (r SpaceMemberRole) IsActiveMember() bool { return r == SpaceMemberRoleAdmin || r == SpaceMemberRoleUser }
type SpaceMember struct { Role SpaceMemberRole }
type FindUser struct { ID *int32 }
type FindSpace struct { ID *int32 }
type FindSpaceMember struct { SpaceID *int32; UserID *int32 }
""", encoding="utf-8")
env = {**os.environ, "GOTOOLCHAIN": "local", "GOPROXY": "off", "GOSUMDB": "off",
       "GOCACHE": str(ROOT / ".tmp/bt-source/gocache")}
result = subprocess.run([str(ROOT / ".tmp/bt-source/toolchain/go/bin/go.exe"), "test", "./core/access",
                         "-run", "TestBT", "-count=1", "-v"], cwd=TARGET, env=env,
                        capture_output=True, text=True, timeout=120)
(RESULT / "M-extracted-test-output.txt").write_text(result.stdout + result.stderr, encoding="utf-8")
(RESULT / "M-extraction.json").write_text(json.dumps({
    "evidenceKind": "extracted-original-control-flow-with-store-type-shim",
    "commit": "cb42e326ba9cc266a6a9570c53e0fe04c62793f4", "sourceHashes": hashes,
    "shimSha256": hashlib.sha256((TARGET / "store/shim.go").read_bytes()).hexdigest(),
    "exitCode": result.returncode, "isolatedSourceTestExecutions": 1,
    "fullUpstreamModuleExecutions": 0, "businessServiceOrDatabaseExecutions": 0,
    "limits": ["No transport handler or converter execution", "Reduced store types replace the full store package",
               "Fake rows/errors; no real storage; source semantics outside copied functions require review"]
}, indent=2) + "\n", encoding="utf-8")
print(result.stdout + result.stderr)
raise SystemExit(result.returncode)
