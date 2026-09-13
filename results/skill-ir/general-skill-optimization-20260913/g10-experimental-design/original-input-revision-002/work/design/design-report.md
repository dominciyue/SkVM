# Experimental design report

## Study and design

- **Study:** `site-stratified-recovery-v2-dev`
- **Question:** Does the intervention reduce recovery time across sites?
- **Assignment unit:** participant (`individual` assignment)
- **Analysis unit:** participant
- **Response:** `recovery_days`
- **Arms:** `control`, `intervention`
- **Nuisance factor:** site
- **Method:** Stratified permuted-block randomization within site, with seed `37`.
- **Allocation artifact:** `design/allocation.csv`

The six participants are preserved exactly once. The allocation is balanced within each site: each site has one intervention assignment and two control assignments. The global arm counts are therefore four control and two intervention; this global imbalance is a diagnostic consequence of the odd number of units in each stratum, not a failure of within-site stratification. Sequential enrollment is not supported because the study does not specify sequential enrollment.

The planned analysis should compare recovery time by arm while retaining site as a stratification/blocking factor. The participant is the independent analysis unit, matching the assignment unit; repeated measurements or lower-level observations, if collected, must not be treated as additional independent participants.

## Limitations

- The schedule is reproducible from the recorded seed and method, but randomness was not statistically audited.
- With only three participants per site, the design provides limited precision and cannot guarantee global arm balance when each stratum has odd size.
- No sequential-enrollment balancing claim is made.

```json design-evidence
{
  "studyId": "site-stratified-recovery-v2-dev",
  "assignmentUnit": "participant",
  "analysisUnit": "participant",
  "response": "recovery_days",
  "seed": 37,
  "allocationPath": "design/allocation.csv",
  "allocationRows": 6,
  "armCounts": {
    "control": 4,
    "intervention": 2
  },
  "designProperties": {
    "preservesAssignmentUnits": true,
    "balancesGlobally": false,
    "balancesWithinStrata": true,
    "supportsSequentialEnrollment": false
  },
  "limitationFlags": [
    "stratified-assignment",
    "randomness-not-statistically-audited"
  ]
}
```
