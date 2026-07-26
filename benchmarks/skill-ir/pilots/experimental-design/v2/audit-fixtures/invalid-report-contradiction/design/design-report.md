# Public design report
Prose may vary; structured evidence supports deterministic checks.
```json design-evidence
{
  "studyId": "site-stratified-recovery-v2-dev",
  "assignmentUnit": "participant",
  "analysisUnit": "participant",
  "response": "recovery_days",
  "seed": 999,
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
    "randomness-not-statistically-audited",
    "stratified-assignment"
  ]
}
```
