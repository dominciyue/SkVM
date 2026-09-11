---
name: distributed-gpu-training-and-scheduling
description: Configures Kubernetes Volcano gang scheduling and fractional GPU training jobs. Use when authoring distributed PyTorch training manifests, PodGroup CRDs, queue specs, or dry-run validating GPU resource configurations.
---

# Distributed GPU Training and Scheduling

## Overview

Provision gang-scheduled GPU worker pods with Volcano Scheduler, configure fractional GPU sharing (MIG/HAMi), and validate manifests before cluster apply to prevent resource deadlocks and partial worker allocation.

## When to Use

- authoring or reviewing K8s distributed training manifests
- configuring Volcano PodGroup `minMember` and queue specifications
- enabling fractional GPU requests for shared clusters
- debugging training jobs stuck in Pending state
- validating YAML before production apply
- designing NCCL multi-node PyTorch jobs

## Decision Framework

| Scenario | Setting |
|----------|---------|
| All workers must start together | PodGroup `minMember` = total workers |
| Queue quota exhausted | Adjust `capability` in `queue.yaml` |
| Partial GPU per pod | Request `nvidia.com/mig-1g.10gb` keys |
| Master-worker topology | Volcano Job with separate tasks |
| Pre-apply validation | `python training/validate_k8s.py` |

## Workflow

1. Define **Queue** GPU quota in `k8s/volcano/queue.yaml`.
2. Configure **PodGroup** gang scheduling in `k8s/volcano/podgroup.yaml` (`minMember`, `queue`, `minResources`).
3. Author **Job** manifest in `k8s/volcano/training-job.yaml` with fractional GPU requests and `schedulerName: volcano`.
4. Mount shared memory (`emptyDir` medium Memory) for NCCL.
5. Dry-run validate: `python training/validate_k8s.py` — all checks must PASS.
6. Run unit tests: `pytest tests/test_k8s_validation.py -v`.

## Anti-Patterns

- Using default scheduler for multi-GPU gang jobs
- `minMember: 1` for distributed training
- Missing GPU requests on worker containers
- No shared memory volume for PyTorch distributed
- Applying manifests without dry-run validation

## Common Rationalizations

| Rationalization | Reality |
| --- | --- |
| "Kubernetes will eventually schedule all pods." | Partial allocation causes NCCL hangs and wasted GPU time. |
| "We don't need Volcano." | Gang scheduling prevents deadlock in GPU-contended clusters. |
| "Fractional GPU is too complex." | MIG/HAMi improves utilization; configure explicitly in manifests. |
| "YAML looks fine visually." | Use `validate_k8s.py` — subtle missing keys cause production failures. |

## Red Flags

- pods Pending while GPUs appear available
- training hangs at NCCL init
- Job missing `minAvailable`
- no fractional GPU keys in resource requests
- schedulerName not set to `volcano`

## Verification

- [ ] PodGroup `minMember` ensures simultaneous worker provisioning
- [ ] Queue declares `nvidia.com/gpu` capability
- [ ] Job uses `schedulerName: volcano` and `minAvailable >= 2`
- [ ] Fractional GPU keys in container resource requests
- [ ] `python training/validate_k8s.py` exits 0
- [ ] Checklist: `references/volcano-gang-scheduling-checklist.md` complete

## Implementation References

- Manifests: `k8s/volcano/`
- Validator: `training/validate_k8s.py`
- Preset: `presets/kubernetes-gpu-mlops.yaml`

## Related Skills

- Pairs with: `mlflow-model-registry-and-continuous-training`
- See: `starter-packs/gpu-training-starter.yaml`
