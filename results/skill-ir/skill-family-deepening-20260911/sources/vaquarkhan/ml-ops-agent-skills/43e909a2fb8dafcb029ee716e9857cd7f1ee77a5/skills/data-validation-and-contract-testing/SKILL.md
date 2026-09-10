---
name: data-validation-and-contract-testing
description: Validates upstream data with Great Expectations and dbt contracts. Use when building ingestion pipelines, detecting schema drift or volume anomalies, or halting bad data before feature store or training consumption.
---

# Data Validation and Contract Testing

## Overview

Enforce upstream data quality before any downstream ML consumption using Great Expectations (GX) expectation suites and dbt-enforced data contracts. The ingestion pipeline must **halt** on schema drift, null violations, statistical range failures, or volume anomalies — never silently pass poisoned data to Feast or training.

## When to Use

- building or modifying raw ingestion pipelines
- detecting schema drift, type changes, or new/missing columns
- defining dbt contract YAML for downstream tables
- writing tests that halt on poisoned data streams
- investigating silent model degradation caused by upstream data changes
- designing CI gates for data publish paths

## Decision Framework

| Signal | Action |
|--------|--------|
| New raw data source | Start with `templates/model-contract.yaml` + GX suite |
| Column added/removed | Update GX + dbt contract; fail pipeline until aligned |
| Volume spike/drop | Volume check in `DataIngestionPipeline._check_volume` |
| Downstream training skew | Trace back — validate PIT inputs were GX-clean |
| Local dev without GX | Install `great-expectations` or run mocked tests only |

## Workflow

1. **Define schema contract** in `data/dbt/models/schema.yml` with enforced columns, types, and semantic tests.
2. **Build GX suite** in `data/expectations/build_suite.py` — schema, nulls, ranges, uniqueness, volume.
3. **Wire pipeline** in `data/ingestion_pipeline.py` — `_check_volume` before `validate`; raise `DataValidationError` on failure.
4. **Initialize GX project** via `initialize_ge_project()` copying bundled `great_expectations.yml`.
5. **Add pytest cases** in `tests/test_data_validation.py` for valid streams and poisoned schema/null/range/volume cases.
6. **Run validation**: `pytest tests/test_data_validation.py -v` (skipped locally if GX not installed).

## Anti-Patterns

- Validating only row count without schema checks
- Logging validation failures without halting the pipeline
- Allowing dbt models to run on unvalidated raw tables
- Hard-coding column lists in application code instead of GX suite
- Skipping volume bounds ("small batch won't matter")

## Common Rationalizations

| Rationalization | Reality |
| --- | --- |
| "GX is overkill for our CSV." | One schema drift event corrupts every downstream model. |
| "dbt tests are enough." | dbt runs after landing; GX gates ingestion before persistence. |
| "We'll fix bad rows inline." | Silent fixes hide drift; fail fast and alert owners. |
| "Volume checks caused false alarms once." | Tune bounds; do not remove volume gates entirely. |

## Red Flags

- pipeline continues after validation failure
- no pytest case for poisoned data
- dbt contract `enforced: false`
- expectation suite not version-controlled
- agents modifying raw data to pass checks instead of fixing upstream

## Verification

- [ ] GX suite includes schema, null, range, uniqueness, and volume checks
- [ ] dbt contract enforced on `validated_events` model
- [ ] Poisoned data tests assert halt with `DataValidationError`
- [ ] Volume anomaly raises before GX validator runs
- [ ] No placeholder or TODO logic in validation paths
- [ ] `python scripts/validate-skills.py` passes for this skill

## Implementation References

- Pipeline: `data/ingestion_pipeline.py`
- GX config: `data/great_expectations/great_expectations.yml`
- dbt contract: `data/dbt/models/schema.yml`
- Checklist: `references/feast-pit-join-checklist.md` (downstream impact)

## Related Skills

- Upstream: `data-validation-and-contract-testing`
- Downstream: `feast-feature-store-engineering`
