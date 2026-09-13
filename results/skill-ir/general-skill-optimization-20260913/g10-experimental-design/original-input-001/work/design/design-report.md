# Experimental design report

## Study

- **Study ID:** `site-stratified-recovery-v2-dev`
- **Question:** Does the intervention reduce recovery time across sites?
- **Assignment unit:** participant (`assignmentLevel: individual`)
- **Analysis unit:** participant
- **Response:** `recovery_days`
- **Arms:** `control`, `intervention`
- **Seed:** `37`

## Design and allocation

The design uses seeded stratified permuted-block randomization, with assignment randomized independently within each site stratum. Each site has three participants, so the allocation uses a balanced partial block: site-a receives two intervention and one control assignments, while site-b receives one intervention and two control assignments. The global totals are balanced at three participants per arm. The allocation preserves every study participant exactly once and follows the stable input order in the `order` column.

The allocation schedule is at `design/allocation.csv`. The assignment level and analysis unit are both participant, so repeated observations, if collected, must not be treated as independent participants.

## Limitations and diagnostics

- `stratified-assignment`: present because every unit has a nonempty site stratum.
- `randomness-not-statistically-audited`: present because the seeded schedule is reproducible but no statistical audit of randomness was performed.
- Cluster assignment, sequential enrollment, and assignment/analysis-unit mismatch are not applicable.

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
    "control": 3,
    "intervention": 3
  },
  "designProperties": {
    "preservesAssignmentUnits": true,
    "balancesGlobally": true,
    "balancesWithinStrata": true,
    "supportsSequentialEnrollment": false
  },
  "limitationFlags": [
    "stratified-assignment",
    "randomness-not-statistically-audited"
  ]
}
```
