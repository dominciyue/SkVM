"""Retain the locked View/public-export/decorator sources without target imports."""
import hashlib
import io
import json
from pathlib import Path
import tomllib
from urllib.request import urlopen
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
    lock_bytes = (BASE_ROOT / "source-provenance/uv.lock").read_bytes()
    if digest(lock_bytes) != provenance["lock"]["sha256"]:
        raise RuntimeError("Original lock SHA mismatch")
    packages = [p for p in tomllib.loads(lock_bytes.decode("utf-8"))["package"] if p["name"] == "django"]
    if len(packages) != 1 or packages[0]["version"] != "5.2.16" or len(packages[0]["wheels"]) != 1:
        raise RuntimeError("Original View package pin is not unique")
    package = packages[0]
    wheel = package["wheels"][0]
    expected_sha = wheel["hash"].removeprefix("sha256:")
    destination_root = AY_ROOT / "source-provenance/django-5.2.16"
    wheel_file = destination_root / "django-5.2.16-py3-none-any.whl"
    network_requests = 0
    if wheel_file.exists():
        wheel_bytes = wheel_file.read_bytes()
    else:
        with urlopen(wheel["url"], timeout=45) as response:
            wheel_bytes = response.read()
        network_requests = 1
    if digest(wheel_bytes) != expected_sha or len(wheel_bytes) != wheel["size"]:
        raise RuntimeError("View wheel SHA/size mismatch")
    frozen = provenance["appFiles"] + provenance["dependencyFiles"]
    source_root = BASE_ROOT / "model/source/paperless-framework-v1"
    for source in frozen:
        if digest((source_root / source["path"]).read_bytes()) != source["sha256"]:
            raise RuntimeError(f"Frozen source changed: {source['path']}")
    retain(wheel_file, wheel_bytes)
    sources = []
    with zipfile.ZipFile(io.BytesIO(wheel_bytes)) as archive:
        for name in ["django/views/generic/__init__.py", "django/views/generic/base.py", "django/utils/decorators.py"]:
            data = archive.read(name)
            destination = destination_root / name
            retain(destination, data)
            sources.append({"wheelEntry": name, "path": destination.relative_to(AY_ROOT).as_posix(), "indexPath": "framework/django-5.2.16/" + name, "sha256": digest(data), "bytes": len(data)})
    record = {
        "schemaVersion": "authorization-framework-source-supplement/v1", "date": "2026-10-08",
        "purpose": "Locked View base/public re-export/decorator source work; request/class transformation adoption remains unproven",
        "originalProvenance": "../authorization-focused-closure-v1/source-provenance/locked-framework-v1.json",
        "originalProvenanceSha256": digest(provenance_bytes), "lock": provenance["lock"],
        "dependency": {"name": package["name"], "version": package["version"], "url": wheel["url"], "sha256": expected_sha},
        "wheelPath": wheel_file.relative_to(AY_ROOT).as_posix(), "sources": sources,
        "frozenSourcesVerified": len(frozen), "originalSourceTreeUnmodified": True,
        "originalInputsAndAllowlistsUnmodified": True, "newModelInputRegistered": False,
        "modelExecutions": 0, "targetExecutions": 0, "semanticAnswersIncluded": False,
    }
    retain(AY_ROOT / "source-provenance/django-view-source-v1.json", (json.dumps(record, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    if provenance_file.read_bytes() != provenance_bytes or (BASE_ROOT / "source-provenance/uv.lock").read_bytes() != lock_bytes:
        raise RuntimeError("Original provenance changed concurrently")
    return {"dependency": record["dependency"], "sources": sources, "frozenSourcesVerified": len(frozen), "networkRequests": network_requests, "modelExecutions": 0, "targetExecutions": 0}


if __name__ == "__main__":
    print(json.dumps(prepare(), ensure_ascii=False))
