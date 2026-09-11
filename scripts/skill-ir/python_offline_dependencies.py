"""Snapshot installed Python distributions for explicit offline development reproduction."""
import argparse
import gzip
import hashlib
import importlib.metadata as metadata
import io
import json
import re
import sys
import sysconfig
import tarfile
from pathlib import Path, PurePosixPath

from packaging.markers import default_environment
from packaging.requirements import Requirement
from packaging.specifiers import SpecifierSet
from packaging.utils import canonicalize_name


def digest(data):
    return hashlib.sha256(data).hexdigest()


def resolve_closure(roots, lookup=metadata.distribution):
    environment = {**default_environment(), "extra": ""}
    pending = [Requirement(root) for root in roots]
    rows = {}
    while pending:
        requirement = pending.pop(0)
        if requirement.marker and not requirement.marker.evaluate(environment):
            continue
        if requirement.extras or requirement.url:
            raise ValueError("dependency extras/direct URLs unsupported")
        name = canonicalize_name(requirement.name)
        distribution = lookup(name)
        if canonicalize_name(distribution.metadata["Name"]) != name:
            raise ValueError("distribution identity mismatch")
        if not requirement.specifier.contains(distribution.version, prereleases=True):
            raise ValueError("dependency version mismatch: " + str(requirement))
        python_requirement = distribution.metadata.get("Requires-Python")
        if python_requirement and not SpecifierSet(python_requirement).contains(environment["python_full_version"], prereleases=True):
            raise ValueError("Python version mismatch: " + name)
        if name in rows:
            continue
        requirements = []
        for text in distribution.requires or []:
            parsed = Requirement(text)
            active = not parsed.marker or parsed.marker.evaluate(environment)
            requirements.append({"text": text, "active": bool(active)})
            if active:
                pending.append(parsed)
        rows[name] = {"name": name, "version": distribution.version, "requiresPython": python_requirement, "requirements": requirements}
    return [rows[name] for name in sorted(rows)]


def safe_name(name):
    if not isinstance(name, str) or not name or re.search(r"[\\:\x00-\x1f]", name):
        raise ValueError("unsafe archive path")
    path = PurePosixPath(name)
    if not path.parts or path.is_absolute() or any(part in (".", "..") for part in path.parts) or str(path) != name:
        raise ValueError("noncanonical archive path")
    if any(part.endswith((".", " ")) or re.fullmatch(r"(?i:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?", part) for part in path.parts):
        raise ValueError("nonportable Windows archive path")
    return name


def entries(manifest):
    if manifest.get("schemaVersion") != "python-offline-dependencies/v1" or not isinstance(manifest.get("files"), list):
        raise ValueError("invalid dependency manifest")
    result = {}
    for item in manifest["files"]:
        name = safe_name(item["path"])
        if name.casefold() in result or type(item["bytes"]) is not int or not 0 <= item["bytes"] <= 134217728 or not re.fullmatch(r"[0-9a-f]{64}", item["sha256"]):
            raise ValueError("duplicate/invalid dependency entry")
        result[name.casefold()] = item
    if not result or len(result) > 100000 or sum(item["bytes"] for item in result.values()) > 536870912:
        raise ValueError("dependency manifest budget")
    return {item["path"]: item for item in result.values()}


def checked_file(root, item):
    path = root.joinpath(*PurePosixPath(item["path"]).parts)
    if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()) or not path.is_file():
        raise ValueError("dependency file missing/outside root")
    data = path.read_bytes()
    if len(data) != item["bytes"] or digest(data) != item["sha256"]:
        raise ValueError("dependency file digest mismatch: " + item["path"])
    return data


def inventory(roots, site_root=None, lookup=metadata.distribution):
    site = Path(site_root or sysconfig.get_paths()["purelib"]).resolve()
    distributions = resolve_closure(roots, lookup)
    files, excluded = {}, []
    for row in distributions:
        distribution = lookup(row["name"])
        if distribution.version != row["version"] or distribution.files is None:
            raise ValueError("distribution changed or has no file inventory")
        for declared in distribution.files:
            path = Path(distribution.locate_file(declared))
            resolved = path.resolve()
            if not resolved.is_relative_to(site):
                launchers = {name + suffix for entry in distribution.entry_points if entry.group == "console_scripts"
                             for name in [entry.name] for suffix in ("", ".exe", "-script.py")}
                if resolved.parent.name.lower() not in ("scripts", "bin") or resolved.name not in launchers:
                    raise ValueError("external non-entrypoint distribution resource: " + str(declared))
                excluded.append({"distribution": row["name"], "path": str(declared), "reason": "external-entrypoint-not-used-by-python-module-execution"})
                continue
            if path.suffix == ".pyc" or "__pycache__" in path.parts:
                excluded.append({"distribution": row["name"], "path": str(declared), "reason": "regenerable-bytecode"})
                continue
            if path.is_symlink() or not path.is_file():
                raise ValueError("missing/nonregular distribution file: " + str(path))
            name = safe_name(resolved.relative_to(site).as_posix())
            data = path.read_bytes()
            item = {"path": name, "bytes": len(data), "sha256": digest(data), "distributions": [row["name"]]}
            if name in files:
                if files[name]["sha256"] != item["sha256"]:
                    raise ValueError("distribution file collision")
                files[name]["distributions"].append(row["name"])
            else:
                files[name] = item
    manifest = {"schemaVersion": "python-offline-dependencies/v1", "exposure": "development", "roots": roots,
                "runtime": {"python": sys.version, "executable": sys.executable, "executableSha256": digest(Path(sys.executable).read_bytes()), "markerEnvironment": default_environment()},
                "distributions": distributions, "files": [files[name] for name in sorted(files)], "excluded": excluded,
                "provenance": "Installed distribution snapshot, not independently attested registry supply chain",
                "projectRemoteCalls": 0, "projectModelCalls": 0, "paidCalls": 0}
    entries(manifest)
    return site, manifest


def pack_archive(root, manifest, archive):
    root, archive = Path(root).resolve(), Path(archive)
    validated = [(item, checked_file(root, item)) for item in entries(manifest).values()]
    with archive.open("xb") as raw:
        with gzip.GzipFile(filename="", fileobj=raw, mode="wb", mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode="w") as handle:
                for item, data in sorted(validated, key=lambda pair: pair[0]["path"]):
                    info = tarfile.TarInfo(item["path"])
                    info.size, info.mode, info.mtime = len(data), 0o644, 0
                    handle.addfile(info, io.BytesIO(data))
    data = archive.read_bytes()
    return {"name": archive.name, "bytes": len(data), "sha256": digest(data)}


def verify_directory(manifest, root):
    root = Path(root).resolve()
    expected = entries(manifest)
    actual = set()
    for path in root.rglob("*"):
        if path.is_symlink():
            raise ValueError("dependency directory contains link")
        if path.is_file():
            actual.add(path.relative_to(root).as_posix())
    if actual != set(expected):
        raise ValueError("dependency directory file set mismatch")
    for item in expected.values():
        checked_file(root, item)
    return {"status": "pass", "files": len(expected), "bytes": sum(item["bytes"] for item in expected.values())}


def extract_archive(manifest, archive, target):
    target = Path(target)
    if target.is_symlink() or not target.is_dir() or any(target.iterdir()):
        raise ValueError("explicit empty target directory required")
    data = Path(archive).read_bytes()
    binding = manifest["archive"]
    if len(data) != binding["bytes"] or digest(data) != binding["sha256"]:
        raise ValueError("archive digest mismatch")
    expected, validated = entries(manifest), {}
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as handle:
        for member in handle:
            name = safe_name(member.name)
            if name not in expected or name in validated or not member.isfile() or member.size != expected[name]["bytes"]:
                raise ValueError("archive member set/type/size mismatch")
            payload = handle.extractfile(member).read(expected[name]["bytes"] + 1)
            if len(payload) != expected[name]["bytes"] or digest(payload) != expected[name]["sha256"]:
                raise ValueError("archive member digest mismatch")
            validated[name] = payload
    if set(validated) != set(expected):
        raise ValueError("archive member set incomplete")
    # No file writes until all members have been checked.
    for name, payload in validated.items():
        path = target.joinpath(*PurePosixPath(name).parts)
        if not path.resolve().is_relative_to(target.resolve()):
            raise ValueError("target path escaped")
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("xb") as output:
            output.write(payload)
    return verify_directory(manifest, target)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["pack", "extract", "verify"])
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--archive")
    parser.add_argument("--target")
    args = parser.parse_args()
    if args.mode == "pack":
        if not args.archive or Path(args.manifest).exists():
            raise ValueError("new manifest and archive required")
        site, manifest = inventory(["pytest==8.3.3", "httpx==0.27.0"])
        manifest["archive"] = pack_archive(site, manifest, args.archive)
        with Path(args.manifest).open("x", encoding="utf-8", newline="\n") as output:
            json.dump(manifest, output, indent=2, ensure_ascii=False)
            output.write("\n")
        print(json.dumps({"status": "pass", "distributions": len(manifest["distributions"]), "files": len(manifest["files"]), "archive": manifest["archive"]}))
    else:
        manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
        if not args.target:
            raise ValueError("explicit target required")
        print(json.dumps(extract_archive(manifest, args.archive, args.target) if args.mode == "extract" else verify_directory(manifest, args.target)))


if __name__ == "__main__":
    main()
