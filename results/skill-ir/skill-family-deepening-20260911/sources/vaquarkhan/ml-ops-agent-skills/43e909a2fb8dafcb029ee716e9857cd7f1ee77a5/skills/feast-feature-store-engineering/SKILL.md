---
name: feast-feature-store-engineering
description: Implements Feast feature stores with offline Parquet and online Redis retrieval. Use when defining features, building point-in-time training datasets, or eliminating training-serving skew between batch and realtime paths.
---

# Feast Feature Store Engineering

## Overview

Define Feast entities and feature views, materialize offline (Parquet/S3) and online (Redis) stores, and build **point-in-time correct** training datasets via `get_historical_features` to prevent target leakage and training-serving skew.

## When to Use

- creating or updating Feast feature definitions
- implementing historical feature retrieval for training
- verifying online feature freshness for real-time inference
- debugging training-serving skew or label leakage
- designing TTL and materialization schedules
- onboarding new entities or feature views

## Decision Framework

| Question | Guidance |
|----------|----------|
| Batch vs online? | Batch FeatureView for training; online=True for inference path |
| TTL too long? | Risk stale features in inference — tune per feature volatility |
| Need PIT join? | Always use `event_timestamp` in entity_df |
| Feature missing online? | Check materialization job and Redis connectivity |
| Local dev without Feast? | Mock FeatureStore in tests; install feast for integration |

## Workflow

1. Define **Entity** and **FeatureViews** in `feature_store/feature_repo/features.py`.
2. Configure stores in `feature_store/feature_repo/feature_store.yaml` (Redis online, file offline).
3. Generate sample Parquet via `feature_store/feature_repo/generate_sample_data.py`.
4. Implement PIT retrieval in `feature_store/retrieval.py` using `get_historical_features`.
5. Validate no leakage with `_validate_no_leakage` after join.
6. Test online path with `get_online_features` (mock Redis in unit tests).
7. Run `pytest tests/test_feature_store.py -v`.

## Anti-Patterns

- Using latest feature snapshot for all training timestamps (leakage)
- Same FeatureView for batch and realtime without TTL distinction
- Skipping `created_timestamp_column` in FileSource
- Joining labels from future-dated rows
- Online store without materialization job

## Common Rationalizations

| Rationalization | Reality |
| --- | --- |
| "We can join in pandas later." | Ad-hoc joins introduce leakage; Feast PIT is the contract. |
| "Online store is optional." | Inference latency and skew explode without online features. |
| "One FeatureView is enough." | Separate batch/offline and realtime/online views reduce skew. |
| "TTL doesn't matter at our scale." | Stale features silently degrade model quality. |

## Red Flags

- training dataset built without `event_timestamp`
- features retrieved after label timestamp
- no integration test for PIT accuracy
- Redis and offline schemas diverge
- agent hardcodes feature values instead of Feast retrieval

## Verification

- [ ] At least one Entity and two FeatureViews (batch offline + online realtime)
- [ ] Point-in-time join validated — no future feature leakage
- [ ] Online retrieval tested (mock or live Redis)
- [ ] `_validate_no_leakage` passes on sample entity_df
- [ ] Feature freshness documented with TTL rationale
- [ ] Checklist: `references/feast-pit-join-checklist.md` complete

## Implementation References

- Retrieval: `feature_store/retrieval.py`
- Definitions: `feature_store/feature_repo/features.py`
- Config: `feature_store/feature_repo/feature_store.yaml`

## Related Skills

- Upstream: `data-validation-and-contract-testing`
- Downstream: `mlflow-model-registry-and-continuous-training`
