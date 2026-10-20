"""BT uses the existing lossless archive implementation; originals stay local."""
import importlib.util
from pathlib import Path

previous = Path(__file__).resolve().parents[1] / "authorization-task-coverage-v1/pack.py"
spec = importlib.util.spec_from_file_location("bt_archive_engine", previous)
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)
engine.base = engine.repo / "results/skill-ir/skill-dsl-research/development/authorization-semantic-validation-v1"
engine.archive_path = engine.base / "archives/full-evidence.tar.gz"
engine.manifest_path = engine.base / "verification/evidence-bundle.json"
engine.patterns = [
    "runs/**/*", "automatic/*-process.json", "automatic/*-proposals.json",
    "verification/ordinary-*/**/*", "verification/portable-*/**/*",
    "verification/cli-*.txt", "verification/*-reference-check.json",
    "verification/preflight.json", "evaluation/client-packets.json",
]
if __name__ == "__main__":
    engine.main()
