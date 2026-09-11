import hashlib
import importlib.util
import io
import tarfile
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("offline", Path(__file__).with_name("python_offline_dependencies.py"))
offline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(offline)


def digest(data):
    return hashlib.sha256(data).hexdigest()


class OfflineTests(unittest.TestCase):
    def sample(self, root):
        data = b"# deterministic synthetic package\n"
        (root / "a.py").write_bytes(data)
        return {"schemaVersion": "python-offline-dependencies/v1", "files": [
            {"path": "a.py", "bytes": len(data), "sha256": digest(data)}
        ]}

    def test_round_trip_and_drift(self):
        with tempfile.TemporaryDirectory(prefix="skvm-python-pack-") as directory:
            root = Path(directory) / "source"
            root.mkdir()
            manifest = self.sample(root)
            archive = Path(directory) / "deps.tgz"
            manifest["archive"] = offline.pack_archive(root, manifest, archive)
            target = Path(directory) / "target"
            target.mkdir()
            self.assertEqual(offline.extract_archive(manifest, archive, target)["files"], 1)
            self.assertEqual(offline.verify_directory(manifest, target)["files"], 1)
            (target / "a.py").write_text("changed", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "digest"):
                offline.verify_directory(manifest, target)
            with self.assertRaisesRegex(ValueError, "empty"):
                offline.extract_archive(manifest, archive, target)
            archive.write_bytes(archive.read_bytes() + b"drift")
            other = Path(directory) / "other"
            other.mkdir()
            with self.assertRaisesRegex(ValueError, "archive digest"):
                offline.extract_archive(manifest, archive, other)

    def test_bad_archive_members_never_extract(self):
        for kind in ["traversal", "duplicate", "symlink", "wrong-bytes"]:
            with self.subTest(kind=kind), tempfile.TemporaryDirectory(prefix="skvm-python-bad-") as directory:
                root = Path(directory) / "source"
                root.mkdir()
                manifest = self.sample(root)
                archive = Path(directory) / "bad.tgz"
                with tarfile.open(archive, "w:gz") as handle:
                    info = tarfile.TarInfo("../escape.py" if kind == "traversal" else "a.py")
                    data = b"wrong" if kind == "wrong-bytes" else (root / "a.py").read_bytes()
                    info.size = len(data)
                    if kind == "symlink":
                        info.type = tarfile.SYMTYPE
                        info.linkname = "../escape.py"
                    handle.addfile(info, io.BytesIO(data))
                    if kind == "duplicate":
                        handle.addfile(info, io.BytesIO(data))
                manifest["archive"] = {"sha256": digest(archive.read_bytes()), "bytes": archive.stat().st_size}
                target = Path(directory) / "target"
                target.mkdir()
                with self.assertRaises(ValueError):
                    offline.extract_archive(manifest, archive, target)
                self.assertEqual(list(target.iterdir()), [])
                self.assertFalse((Path(directory) / "escape.py").exists())

    def test_manifest_paths_and_source_drift(self):
        for name in ["../escape.py", "/absolute", "a\\b", "C:escape", "a/../b", "a//b"]:
            with self.subTest(name=name), tempfile.TemporaryDirectory(prefix="skvm-python-name-") as directory:
                root = Path(directory)
                manifest = self.sample(root)
                manifest["files"][0]["path"] = name
                with self.assertRaises(ValueError):
                    offline.pack_archive(root, manifest, root / "bad.tgz")
        with tempfile.TemporaryDirectory(prefix="skvm-python-drift-") as directory:
            root = Path(directory)
            manifest = self.sample(root)
            (root / "a.py").write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "digest"):
                offline.pack_archive(root, manifest, root / "bad.tgz")

    def test_dependency_markers_versions_and_extras_are_explicit(self):
        class Distribution:
            def __init__(self, name, version, requires):
                self.metadata = {"Name": name, "Requires-Python": ">=3.8"}
                self.version = version
                self.requires = requires
        registry = {"root": Distribution("root", "1", ["dep>=2", 'absent; python_version < "1"']), "dep": Distribution("dep", "2", [])}
        rows = offline.resolve_closure(["root==1"], registry.__getitem__)
        self.assertEqual({row["name"] for row in rows}, {"root", "dep"})
        self.assertFalse(next(row for row in rows if row["name"] == "root")["requirements"][1]["active"])
        registry["dep"].version = "1"
        with self.assertRaisesRegex(ValueError, "version"):
            offline.resolve_closure(["root==1"], registry.__getitem__)
        registry["root"].requires = ["dep[optional]"]
        with self.assertRaisesRegex(ValueError, "extras"):
            offline.resolve_closure(["root==1"], registry.__getitem__)

    def test_external_non_entrypoint_is_not_silently_excluded(self):
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory(prefix="skvm-python-inventory-") as directory:
            site = Path(directory) / "site"
            site.mkdir()
            (site / "a.py").write_bytes(b"# source")
            outside = Path(directory) / "outside.dat"
            outside.write_bytes(b"required resource")
            distribution = SimpleNamespace(metadata={"Name": "root"}, version="1", requires=[],
                files=[Path("a.py"), Path("../outside.dat")], entry_points=[], locate_file=lambda path: site / path)
            with self.assertRaisesRegex(ValueError, "external non-entrypoint"):
                offline.inventory(["root==1"], site_root=site, lookup=lambda name: distribution)
            distribution.files = [Path("a.py"), Path("../Scripts/tool.exe")]
            distribution.entry_points = [SimpleNamespace(group="console_scripts", name="tool")]
            _, manifest = offline.inventory(["root==1"], site_root=site, lookup=lambda name: distribution)
            self.assertEqual(len(manifest["files"]), 1)
            self.assertEqual(len(manifest["excluded"]), 1)

    def test_nonportable_names(self):
        for name in [".", "NUL", "a.", "space ", "folder/CON.txt"]:
            with self.subTest(name=name), self.assertRaises(ValueError):
                offline.safe_name(name)


if __name__ == "__main__":
    unittest.main()
