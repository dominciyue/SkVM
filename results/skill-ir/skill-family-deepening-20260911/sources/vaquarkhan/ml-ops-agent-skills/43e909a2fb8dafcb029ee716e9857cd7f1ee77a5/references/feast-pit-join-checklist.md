# Feast Point-in-Time Join Checklist

Use when building offline training datasets or validating feature retrieval for leakage.

> **Provenance:** Feast project documentation (point-in-time joins); ML feature store best practices (Tecton, Databricks); internal MLOps platform patterns v1.1.

- [ ] Entity DataFrame has `user_id` and `event_timestamp`
- [ ] Feature views use correct `timestamp_field` and `created_timestamp_column`
- [ ] Offline batch features do not leak future labels
- [ ] Online features materialized to Redis with TTL configured
- [ ] Historical retrieval uses `get_historical_features`, not latest snapshot
- [ ] Training dataset validated for join mismatches
- [ ] Feature column null rates documented and handled

## Sources

| Source | URL | Last reviewed |
|--------|-----|---------------|
| Feast — Point-in-time joins | https://docs.feast.dev/getting-started/concepts/point-in-time-joins | 2026-06-14 |
| Feast — Feature views | https://docs.feast.dev/getting-started/concepts/feature-view | 2026-06-14 |
| Tecton — Feature store concepts | https://docs.tecton.ai/ | 2026-06-14 |
| Databricks — Feature engineering best practices | https://docs.databricks.com/en/machine-learning/feature-store/index.html | 2026-06-14 |
| Runnable reference | `feature_store/retrieval.py` | 2026-06-14 |
