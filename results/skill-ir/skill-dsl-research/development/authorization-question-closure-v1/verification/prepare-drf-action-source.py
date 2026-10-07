"""Add one retained wheel source; never change frozen sources or input allowlists."""
import hashlib
import io
import json
from pathlib import Path
import zipfile

AY_ROOT = Path(__file__).resolve().parents[1]
BASE_ROOT = AY_ROOT.parent / "authorization-focused-closure-v1"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def retain(file, data):
    file.parent.mkdir(parents=True, exist_ok=True)
    if file.exists():
        if file.read_bytes() != data:
            raise RuntimeError(f"Retained bytes differ: {file}")
        return
    with file.open("xb") as stream:
        stream.write(data)


def prepare():
    provenance_file = BASE_ROOT / "source-provenance/locked-framework-v1.json"
    provenance_bytes = provenance_file.read_bytes()
    provenance = json.loads(provenance_bytes)
    dependency = provenance["dependency"]
    wheel_file = BASE_ROOT / "source-provenance/djangorestframework-3.18.1-py3-none-any.whl"
    wheel_bytes = wheel_file.read_bytes()
    if dependency["version"] != "3.18.1" or digest(wheel_bytes) != dependency["sha256"]:
        raise RuntimeError("Retained wheel pin mismatch")
    source_root = BASE_ROOT / "model/source/paperless-framework-v1"
    frozen = provenance["appFiles"] + provenance["dependencyFiles"]
    for source in frozen:
        if digest((source_root / source["path"]).read_bytes()) != source["sha256"]:
            raise RuntimeError(f"Frozen source changed: {source['path']}")
    name = "rest_framework/decorators.py"
    with zipfile.ZipFile(io.BytesIO(wheel_bytes)) as archive:
        data = archive.read(name)
    destination = AY_ROOT / "source-provenance/rest_framework-3.18.1" / name
    retain(destination, data)
    record = {
        "schemaVersion": "authorization-framework-source-supplement/v1",
        "date": "2026-10-08",
        "purpose": "DRF action mapping source work; no original attempt promotion",
        "originalProvenance": "../authorization-focused-closure-v1/source-provenance/locked-framework-v1.json",
        "originalProvenanceSha256": digest(provenance_bytes),
        "dependency": dependency,
        "source": {"wheelEntry": name, "path": destination.relative_to(AY_ROOT).as_posix(), "indexPath": "framework/rest_framework-3.18.1/" + name, "sha256": digest(data), "bytes": len(data)},
        "frozenSourcesVerified": len(frozen),
        "originalSourceTreeUnmodified": True,
        "originalInputsAndAllowlistsUnmodified": True,
        "newModelInputRegistered": False,
        "modelExecutions": 0,
        "targetExecutions": 0,
        "networkRequests": 0,
        "semanticAnswersIncluded": False,
    }
    retain(AY_ROOT / "source-provenance/drf-action-source-v1.json", (json.dumps(record, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    if provenance_file.read_bytes() != provenance_bytes:
        raise RuntimeError("Original provenance changed concurrently")
    return {"sourceSha256": digest(data), "sourceBytes": len(data), "frozenSourcesVerified": len(frozen), "modelExecutions": 0, "targetExecutions": 0}


if __name__ == "__main__":
    print(json.dumps(prepare(), ensure_ascii=False))
