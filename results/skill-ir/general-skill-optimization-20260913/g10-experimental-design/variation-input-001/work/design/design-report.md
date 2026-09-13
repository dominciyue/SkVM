# Experimental Design Report

## Study and design

The study asks whether the reminder program improves clinic-level screening uptake during enrollment. The clinic is both the indivisible assignment unit and the analysis unit. The response is `screening_rate`, and the public comparison arms are `usual-care` and `reminder`.

A seeded 1:1 permuted-block cluster randomization was generated with seed 91. Assignments follow the stable order of clinics in `study.json`, with fixed blocks of two clinics. Every complete sequential block therefore contains each arm exactly once. The resulting global allocation is balanced at three clinics per arm. No strata were supplied, so stratified randomization was not applicable; the within-strata requirement is satisfied vacuously rather than through creation of an artificial stratum.

The auditable assignment schedule is stored at `design/allocation.csv`. Each of the six public clinic IDs appears exactly once, and no individual or nested member assignments have been introduced.

## Analysis implications and limitations

The confirmatory treatment comparison must use clinics as the independent replicates. Clinic-level screening rates may be compared directly with a clinic-level model. If lower-level patient observations are later analyzed instead, the analysis must account for clustering and must not treat patients within a clinic as independently randomized replicates.

Only six clinics are randomized, so treatment-effect precision and robustness to chance baseline imbalance may be limited. Fixed blocks of size two protect balance throughout enrollment but can make later assignments more predictable if prior assignments and the block size are visible; allocation concealment should therefore be maintained. The schedule is reproducible from the documented method and seed, but the statistical quality of the pseudorandom number generator and realized randomness were not independently audited.

## Contract evidence

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
  ],
  "sourceClaims": [
    "assignment-unit-contract",
    "cluster-unit-contract",
    "stratified-balance-contract",
    "sequential-balance-contract",
    "design-documentation-contract",
    "randomness-expectation-contract"
  ]
}
```
