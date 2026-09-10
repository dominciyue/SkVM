# Volcano Gang Scheduling Checklist

Use when deploying multi-GPU PyTorch training jobs on Kubernetes with Volcano.

> **Provenance:** Volcano Scheduler documentation; Kubernetes batch scheduling patterns; NVIDIA MIG GPU sharing guides.

- [ ] PodGroup `minMember` matches required worker count
- [ ] Queue declares GPU capability quota
- [ ] Job `schedulerName` is `volcano`
- [ ] Job `minAvailable` >= 2 for gang scheduling
- [ ] Fractional GPU keys present (`nvidia.com/gpu`, MIG partitions)
- [ ] Shared memory volume mounted for distributed training
- [ ] Dry-run validation passes: `python training/validate_k8s.py`

## Sources

| Source | URL | Last reviewed |
|--------|-----|---------------|
| Volcano — Gang scheduling | https://volcano.sh/en/docs/v1-7-0/ | 2026-06-14 |
| Volcano — PodGroup | https://volcano.sh/en/docs/tutorials/ | 2026-06-14 |
| Kubernetes — Batch workloads | https://kubernetes.io/docs/concepts/workloads/controllers/job/ | 2026-06-14 |
| NVIDIA — MIG user guide | https://docs.nvidia.com/datacenter/tesla/mig-user-guide/ | 2026-06-14 |
| Runnable reference | `k8s/volcano/` | 2026-06-14 |
| Runnable reference | `training/validate_k8s.py` | 2026-06-14 |
