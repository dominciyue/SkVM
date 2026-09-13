# Experimental design report

## Design summary

The study asks whether the reminder program improves clinic-level screening uptake during enrollment. The six clinics are indivisible assignment units and are also the analysis units. Clinics are assigned 1:1 to `usual-care` or `reminder` using seeded permuted blocks of size two in the stable order supplied in `study.json`. The seed is `91`.

Each consecutive complete block contains each arm exactly once: clinics 01–02, 03–04, and 05–06. This supports balanced sequential enrollment and produces an overall allocation of three clinics per arm. No strata were supplied, so stratified assignment and within-stratum balance are not applicable. The allocation is recorded at `design/allocation.csv`.

## Conduct and analysis

Implement the assigned program for each clinic as a whole; do not assign or analyze nested participants as if they were independently randomized. Preserve allocation concealment until each clinic is irreversibly enrolled where operationally feasible. Measure `screening_rate` consistently for every clinic. The primary treatment comparison must use clinic-level observations and should report the arm effect with uncertainty; individual-level records, if collected, are nested measurements rather than independent treatment replicates.

The design follows the assignment-unit contract by allocating each listed clinic exactly once, the cluster-unit contract by keeping each clinic indivisible, the sequential-balance contract through complete two-clinic blocks, and the design-documentation contract by recording the method, seed, and schedule. The stratified-balance contract is not applicable because no unit has a stratum. Seeded generation provides reproducibility, but the randomness-expectation contract is documented rather than statistically audited here.

## Limitations

Only six randomized clinics are available, so treatment-effect precision and degrees of freedom will be limited. Clinic-level assignment must be retained in analysis to avoid pseudoreplication. Fixed small blocks can make later assignments predictable if prior allocations and block size are visible; conceal the schedule from personnel enrolling clinics. The schedule was deterministically generated from the declared algorithm and seed, but no statistical test of random-number quality was performed.

## Machine-readable design evidence

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
    "balancesWithinStrata": false,
    "supportsSequentialEnrollment": true
  },
  "limitationFlags": [
    "cluster-assignment",
    "sequential-enrollment",
    "randomness-not-statistically-audited"
  ]
}
```
