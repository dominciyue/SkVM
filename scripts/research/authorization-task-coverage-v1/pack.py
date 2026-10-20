"""Lossless BS evidence packaging, adapted from BR's verified archive workflow.

Originals remain in place. Unpack refuses different existing bytes and confines
all writes to this result directory. Registered shared source remains in its
existing repository/archive provenance; no target service is accessed.
"""
import hashlib
import json
import shutil
import sys
import tarfile
from pathlib import Path

repo = Path(__file__).resolve().parents[3]
base = repo / "results/skill-ir/skill-dsl-research/development/authorization-task-coverage-v1"
archive_path = base / "archives/full-evidence.tar.gz"
manifest_path = base / "verification/evidence-bundle.json"
patterns = [
    "runs/**/*", "authoring/*-process.json", "authoring/*-proposals.json",
    "verification/*-archive/**/*", "verification/ordinary-*/**/*",
    "verification/portable-*/**/*", "verification/download-compatibility/**/*",
    "verification/cli-*.txt", "evaluation/*/matrix.json",
    "evaluation/case-inputs/**/*",
]

def digest(file):
    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()

def verify(manifest, unpack=False):
    combined = hashlib.sha256()
    for part in manifest["parts"]:
        file = base / part["path"]
        assert file.resolve().is_relative_to(base.resolve())
        assert digest(file) == part["sha256"]
        with file.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                combined.update(chunk)
    assert combined.hexdigest() == manifest["archiveSha256"]
    if not archive_path.exists():
        with archive_path.open("xb") as target:
            for part in manifest["parts"]:
                with (base / part["path"]).open("rb") as source:
                    shutil.copyfileobj(source, target)
    assert digest(archive_path) == manifest["archiveSha256"]
    with tarfile.open(archive_path, "r:gz") as archive:
        assert archive.getnames() == [row["path"] for row in manifest["files"]]
        for row in manifest["files"]:
            member = archive.getmember(row["path"])
            assert member.isfile()
            assert hashlib.file_digest(archive.extractfile(member), "sha256").hexdigest() == row["sha256"]
            if unpack:
                target = (base / row["path"]).resolve()
                assert target.is_relative_to(base.resolve())
                if target.exists():
                    assert digest(target) == row["sha256"], "Refuse to overwrite changed evidence: " + row["path"]
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with target.open("xb") as output, archive.extractfile(member) as source:
                        shutil.copyfileobj(source, output)

def main():
    command = sys.argv[1] if len(sys.argv) > 1 else "verify"
    if command == "pack":
        ledger = json.loads((base / "attempts.json").read_text(encoding="utf-8"))
        assert all(e["status"] not in ("running", "unknown") and e.get("lifecycle", {}).get("localExecution") == "closed" for e in ledger)
        assert not archive_path.exists() and not manifest_path.exists()
        files = sorted({p for pattern in patterns for p in base.glob(pattern) if p.is_file()})
        assert not any(p.is_symlink() for p in files)
        rows = [{"path": p.relative_to(base).as_posix(), "bytes": p.stat().st_size, "sha256": digest(p)} for p in files]
        archive_path.parent.mkdir(exist_ok=True)
        with tarfile.open(archive_path, "w:gz", compresslevel=6) as archive:
            for file in files:
                archive.add(file, arcname=file.relative_to(base).as_posix(), recursive=False)
        parts = []
        with archive_path.open("rb") as archive:
            for number, chunk in enumerate(iter(lambda: archive.read(64 * 1024 * 1024), b""), 1):
                file = archive_path.with_name(f"full-evidence.tar.gz.part{number:03}")
                with file.open("xb") as part:
                    part.write(chunk)
                parts.append({"path": file.relative_to(base).as_posix(), "bytes": len(chunk), "sha256": hashlib.sha256(chunk).hexdigest()})
        manifest = {"schemaVersion": "bs-lossless-evidence/v1", "archiveSha256": digest(archive_path), "archiveBytes": archive_path.stat().st_size, "parts": parts, "files": rows, "originalsRetainedLocally": True, "losslessReadbackVerified": False}
        verify(manifest)
        manifest["losslessReadbackVerified"] = True
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    elif command in ("verify", "unpack"):
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        verify(manifest, command == "unpack")
    else:
        raise ValueError("pack|verify|unpack")
    print(json.dumps({"command": command, "files": len(manifest["files"]), "parts": len(manifest["parts"]), "losslessReadbackVerified": True}))

if __name__ == "__main__":
    main()
