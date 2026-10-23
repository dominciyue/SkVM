"""BU reuses the existing lossless archive engine; originals remain local."""
import importlib.util
from pathlib import Path

previous=Path(__file__).resolve().parents[1]/'authorization-task-coverage-v1/pack.py'
spec=importlib.util.spec_from_file_location('bu_archive_engine',previous)
engine=importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)
engine.base=engine.repo/'results/skill-ir/skill-dsl-research/development/authorization-source-differential-v1'
engine.archive_path=engine.base/'archives/full-evidence.tar.gz'
engine.manifest_path=engine.base/'verification/evidence-bundle.json'
engine.patterns=[
    'runs/**/*','automatic/*-process.json','automatic/*-proposals.json',
    'verification/ordinary-*/**/*','verification/portable-*/**/*',
    'verification/preflight.json','evaluation/M-initial-check.json',
]
if __name__=='__main__':
    engine.main()
