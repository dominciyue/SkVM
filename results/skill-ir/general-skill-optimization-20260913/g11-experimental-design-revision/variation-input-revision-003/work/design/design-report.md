# Experimental design report

## Study

- **Study ID:** `clinic-sequential-screening-v2-dev`
- **Question:** Does the reminder program improve screening uptake during enrollment?
- **Response:** `screening_rate`
- **Assignment level/unit:** cluster / clinic
- **Analysis unit:** clinic
- **Arms:** `usual-care`, `reminder`

## Design and allocation

This is a two-arm, cluster-randomized, seeded permuted-block design. Each clinic is an indivisible assignment unit, and the allocation is fixed before enrollment in the stable order supplied by `study.json`. The randomization seed is `91`. Blocks contain one clinic per arm, so each complete sequential block is balanced; the final block is also complete here. There are no supplied strata, so `stratum` is intentionally blank for every allocation row. The allocation is recorded at `design/allocation.csv`.

The six clinics are allocated three to each arm. The assignment schedule is:

| Enrollment order | Clinic | Arm |
|---:|---|---|
| 1 | clinic-01 | reminder |
| 2 | clinic-02 | usual-care |
| 3 | clinic-03 | usual-care |
| 4 | clinic-04 | reminder |
| 5 | clinic-05 | usual-care |
| 6 | clinic-06 | reminder |

Because treatment is assigned to clinics, the clinic—not people screened within a clinic—is the independent unit for the primary comparison. The analysis should respect the cluster assignment and avoid treating within-clinic observations as independent replicates. The enrollment-order nuisance factor is handled by the sequential permuted blocks; if additional operational time effects arise, record them for analysis.

## Design evidence

```json design-evidence
{
  "studyId": "clinic-sequential-screening-v2-dev",
  "assignmentUnit": "clinic",
  "analysisUnit": "clinic",
  "response": "screening_rate",
  "seed": 91,
  "allocationPath": "design/allocation.csv",
  "allocationRows": 6,
  "armCounts": {
    "usual-care": 3,
    "reminder": 3
  },
  "designProperties": {
    "preservesAssignmentUnits": true,
    "balancesGlobally": true,
    "balancesWithinStrata": true,
    "supportsSequentialEnrollment": true
  },
  "limitationFlags": [
    "cluster-assignment",
    "sequential-enrollment",
    "randomness-not-statistically-audited"
  ]
}
```

## Limitations and implementation notes

- Only six clinics are randomized; inference is therefore based on a small number of independent clusters.
- No stratification variable was provided, so no between-stratum balance can be assessed.
- The seeded schedule is reproducible and auditable, but the randomness itself has not been statistically audited.
- Preserve the allocation order and analyze clinic-level screening rates (or use a cluster-aware model if individual-level records are retained).
