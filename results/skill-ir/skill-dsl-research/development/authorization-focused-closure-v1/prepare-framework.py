"""Retain a locked dependency source revision; never alter historical inputs."""
import hashlib
import io
import json
from pathlib import Path
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent
APP_REF = "126ec414a8b65158368653a2604ae58415e43103"
VERSION = "3.18.1"
WHEEL_SHA = "f1409d698967aaf82d5d98d76b549c8fba8bd92ebd0d83d24454508f72168dc2"
WHEEL_URL = "https://files.pythonhosted.org/packages/e8/83/5ed615e47339d8e65f62eb1a8133f8f046492eb3a25ad40d90acb9a208b3/djangorestframework-3.18.1-py3-none-any.whl"
SOURCE_FILES = ["__init__.py", "mixins.py", "generics.py", "views.py", "viewsets.py", "permissions.py", "serializers.py", "fields.py", "routers.py"]

def digest(data):
    return hashlib.sha256(data).hexdigest()

def save(file, data):
    file.parent.mkdir(parents=True, exist_ok=True)
    if file.exists():
        if file.read_bytes() != data:
            raise RuntimeError(f"Retained source bytes differ: {file.name}")
        return
    with file.open("xb") as stream:
        stream.write(data)

def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")

def fetch(url):
    with urllib.request.urlopen(url, timeout=60) as response:
        return response.read()

def retained_or_fetch(name, url):
    file = ROOT / "source-provenance" / name
    return file.read_bytes() if file.exists() else fetch(url)

def prepare():
    manifest_path = ROOT / "manifest.json"
    original_manifest = manifest_path.read_bytes()
    manifest = json.loads(original_manifest)
    if any(t.get("activeInput") for t in manifest["tasks"] if t["id"].startswith("paperless-")):
        raise RuntimeError("Source revision already registered; inspect its retained hashes instead of replacing it")
    bundle = ROOT / "model" / "source" / "paperless-framework-v1"
    lock_url = f"https://raw.githubusercontent.com/paperless-ngx/paperless-ngx/{APP_REF}/uv.lock"
    project_url = f"https://raw.githubusercontent.com/paperless-ngx/paperless-ngx/{APP_REF}/pyproject.toml"
    lock = retained_or_fetch("uv.lock", lock_url)
    project = retained_or_fetch("pyproject.toml", project_url)
    wheel = retained_or_fetch("djangorestframework-3.18.1-py3-none-any.whl", WHEEL_URL)
    lock_text = lock.decode("utf-8")
    package = lock_text.split('name = "djangorestframework"', 1)[1].split("[[package]]", 1)[0]
    if f'version = "{VERSION}"' not in package or WHEEL_URL not in package or WHEEL_SHA not in package or digest(wheel) != WHEEL_SHA:
        raise RuntimeError("Locked dependency/version/hash mismatch")
    save(ROOT / "source-provenance" / "uv.lock", lock)
    save(ROOT / "source-provenance" / "pyproject.toml", project)
    save(ROOT / "source-provenance" / "djangorestframework-3.18.1-py3-none-any.whl", wheel)
    first = next(t for t in manifest["tasks"] if t["id"] == "paperless-share-create")
    source_input = ROOT / first["inputFile"]
    original = json.loads(source_input.read_bytes())
    old_root = (source_input.parent / original["sourceRoot"]).resolve()
    # Copy exactly the already indexed original files, not an expanded app tree.
    report = json.loads((ROOT / "runs/debug-paperless-share-create-D-F/attempt-1/report.json").read_bytes())
    app_files = report["report"]["sourceFiles"]
    for file in app_files:
        data = (old_root / file["path"]).read_bytes()
        if digest(data) != file["sha256"]:
            raise RuntimeError("Original app source changed")
        save(bundle / file["path"], data)
    framework_files = []
    with zipfile.ZipFile(io.BytesIO(wheel)) as archive:
        for name in SOURCE_FILES:
            data = archive.read(f"rest_framework/{name}")
            relative = f"framework/rest_framework-{VERSION}/rest_framework/{name}"
            save(bundle / relative, data)
            framework_files.append({"path": relative, "sha256": digest(data), "bytes": len(data)})
        license_name = "djangorestframework-3.18.1.dist-info/licenses/LICENSE.md"
        save(bundle / "framework/LICENSE", archive.read(license_name))
    provenance = {"schemaVersion": "authorization-at-source-revision/v1", "revision": "locked-framework-v1", "appRepository": original["repository"], "appRef": APP_REF, "lock": {"url": lock_url, "sha256": digest(lock)}, "project": {"url": project_url, "sha256": digest(project)}, "dependency": {"name": "djangorestframework", "version": VERSION, "url": WHEEL_URL, "sha256": WHEEL_SHA}, "appFiles": app_files, "dependencyFiles": framework_files, "targetExecuted": False, "semanticAnswersIncluded": False, "arms": ["M-L", "M-F", "D-F"], "historicalSourceUnmodified": True}
    provenance_file = ROOT / "source-provenance/locked-framework-v1.json"
    save(provenance_file, encoded(provenance))
    save(bundle / "source_identity.py", f'# App source: {original["repository"]}@{APP_REF}\n# Dependency source: djangorestframework=={VERSION}; wheel SHA256 {WHEEL_SHA}\n# Dependency identity is locked by the app uv.lock. Source only; no target execution.\n'.encode())
    for task in manifest["tasks"]:
        if not task["id"].startswith("paperless-"):
            continue
        input_file = ROOT / task["inputFile"]
        if digest(input_file.read_bytes()) != task["inputSha256"]:
            raise RuntimeError("Registered original input changed")
        current = json.loads(input_file.read_bytes())
        current["sourceRoot"] = "../source/paperless-framework-v1"
        current["allowedPaths"] += [f"framework/rest_framework-{VERSION}/rest_framework", "source_identity.py"]
        relative = f'model/inputs/{task["id"]}--framework-v1.json'
        data = encoded(current)
        save(ROOT / relative, data)
        task["activeInput"] = {"file": relative, "sha256": digest(data), "revision": "locked-framework-v1", "provenance": "source-provenance/locked-framework-v1.json", "provenanceSha256": digest(provenance_file.read_bytes())}
        manifest["modelInputAllowlist"].append(relative)
    for row in manifest["rows"] + manifest["authors"]:
        if row.get("sourceSkill"):
            row["sourceSkillSha256"] = digest((ROOT / row["sourceSkill"]).read_bytes())
    if manifest_path.read_bytes() != original_manifest:
        raise RuntimeError("Manifest changed concurrently")
    manifest_path.write_bytes(encoded(manifest))
    return {"revision": "locked-framework-v1", "appFiles": len(app_files), "dependencyFiles": len(framework_files), "actualProviderCalls": 0, "downloadedBytes": len(lock) + len(project) + len(wheel)}

if __name__ == "__main__":
    print(json.dumps(prepare(), ensure_ascii=False))
