import tempfile
import unittest
from pathlib import Path

from check_skill_ir_doc_links import check_references, resolve_legacy_path


class SkillIrDocLinkCheckTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        (self.root / "docs" / "skill-ir").mkdir(parents=True)

    def tearDown(self):
        self.temp_dir.cleanup()

    def write(self, relative_path: str, text: str) -> None:
        path = self.root / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def test_accepts_existing_explicit_and_relative_document_links(self):
        self.write("docs/skill-ir/README.md", "# Entry\n")
        self.write(
            "docs/skill-ir/component.md",
            "See `docs/skill-ir/README.md` and [entry](README.md#start).\n",
        )

        result = check_references(
            self.root,
            ["docs/skill-ir/README.md", "docs/skill-ir/component.md"],
            set(),
        )

        self.assertEqual(result["brokenReferences"], [])
        self.assertEqual(result["legacyReferences"], [])
        self.assertEqual(result["scannedFiles"], 2)

    def test_reports_missing_document_targets(self):
        self.write(
            "docs/skill-ir/component.md",
            "See `docs/skill-ir/missing.md` and [other](other.md).\n",
        )

        result = check_references(
            self.root,
            ["docs/skill-ir/component.md"],
            set(),
        )

        self.assertEqual(
            {(item["source"], item["target"]) for item in result["brokenReferences"]},
            {
                ("docs/skill-ir/component.md", "docs/skill-ir/missing.md"),
                ("docs/skill-ir/component.md", "docs/skill-ir/other.md"),
            },
        )

    def test_reports_legacy_references_even_when_target_exists(self):
        self.write("docs/skill-ir/old.md", "# Old\n")
        self.write("src/example.ts", 'const doc = "docs/skill-ir/old.md";\n')

        result = check_references(
            self.root,
            ["docs/skill-ir/old.md", "src/example.ts"],
            {"docs/skill-ir/old.md"},
        )

        self.assertEqual(result["brokenReferences"], [])
        self.assertEqual(
            result["legacyReferences"],
            [{"source": "src/example.ts", "target": "docs/skill-ir/old.md"}],
        )

    def test_allows_history_to_record_a_removed_legacy_path(self):
        self.write(
            "docs/skill-ir/history.md",
            "Retired: `docs/skill-ir/old.md`.\n",
        )

        result = check_references(
            self.root,
            ["docs/skill-ir/history.md"],
            {"docs/skill-ir/old.md"},
        )

        self.assertEqual(result["brokenReferences"], [])
        self.assertEqual(result["legacyReferences"], [])

    def test_ignores_references_inside_files_scheduled_for_removal(self):
        self.write("docs/skill-ir/old-a.md", "See `docs/skill-ir/old-b.md`.\n")
        self.write("docs/skill-ir/old-b.md", "# Old B\n")

        result = check_references(
            self.root,
            ["docs/skill-ir/old-a.md", "docs/skill-ir/old-b.md"],
            {"docs/skill-ir/old-a.md", "docs/skill-ir/old-b.md"},
        )

        self.assertEqual(result["brokenReferences"], [])
        self.assertEqual(result["legacyReferences"], [])

    def test_ignores_relative_links_outside_skill_ir_document_namespaces(self):
        self.write("docs/architecture.md", "See [protocol](skvm/grade-protocols.md).\n")

        result = check_references(
            self.root,
            ["docs/architecture.md"],
            set(),
        )

        self.assertEqual(result["brokenReferences"], [])

    def test_ignores_explicitly_excluded_source_files(self):
        self.write(
            "scripts/fixture_paths.txt",
            "docs/skill-ir/old.md\n",
        )

        result = check_references(
            self.root,
            ["scripts/fixture_paths.txt"],
            {"docs/skill-ir/old.md"},
            {"scripts/fixture_paths.txt"},
        )

        self.assertEqual(result["brokenReferences"], [])
        self.assertEqual(result["legacyReferences"], [])
        self.assertEqual(result["scannedFiles"], 0)

    def test_uses_repository_legacy_list_by_default_when_present(self):
        self.write("scripts/skill_ir_legacy_doc_paths.txt", "docs/skill-ir/old.md\n")

        resolved = resolve_legacy_path(self.root, None)

        self.assertEqual(
            resolved,
            self.root / "scripts" / "skill_ir_legacy_doc_paths.txt",
        )


if __name__ == "__main__":
    unittest.main()
