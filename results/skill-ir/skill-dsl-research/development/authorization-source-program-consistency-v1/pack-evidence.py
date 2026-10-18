"""Lossless publication bundle. Original local evidence remains in place."""
import hashlib
import json
import tarfile
from pathlib import Path

base = Path(__file__).resolve().parent
patterns = ["runs/**/*", "authoring/*-process.json", "authoring/*-proposals.json", "verification/*-archive/**/*", "verification/ordinary-zero/**/*", "verification/portable-copy/**/*"]
files = sorted({p for pattern in patterns for p in base.glob(pattern) if p.is_file()})
rows = [{"path": p.relative_to(base).as_posix(), "bytes": p.stat().st_size, "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]
target = base / "archives/full-evidence.tar.gz"
target.parent.mkdir(exist_ok=True)
with tarfile.open(target, "w:gz", compresslevel=6) as archive:
    for p in files:
        archive.add(p, arcname=p.relative_to(base).as_posix(), recursive=False)
with tarfile.open(target, "r:gz") as archive:
    for row in rows:
        stream = archive.extractfile(row["path"])
        assert stream is not None
        assert hashlib.sha256(stream.read()).hexdigest() == row["sha256"], row["path"]
result = {"schemaVersion": "bq-lossless-evidence/v1", "archive": target.relative_to(base).as_posix(), "archiveSha256": hashlib.sha256(target.read_bytes()).hexdigest(), "archiveBytes": target.stat().st_size, "originalsRetainedLocally": True, "losslessReadbackVerified": True, "files": rows}
(base / "verification/evidence-bundle.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"files": len(rows), "archiveBytes": result["archiveBytes"], "losslessReadbackVerified": True}))
