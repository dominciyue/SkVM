# Public design report
Prose may vary; structured evidence supports deterministic checks.
```json design-evidence
{
  "studyId": "audit-alt-cluster-strata",
  "assignmentUnit": "cohort",
  "analysisUnit": "cohort",
  "response": "public_outcome",
  "seed": 101,
  "allocationPath": "design/allocation.csv",
  "allocationRows": 8,
  "armCounts": {
    "control": 4,
    "intervention": 4
  },
  "designProperties": {
    "preservesAssignmentUnits": true,
    "balancesGlobally": true,
    "balancesWithinStrata": true,
    "supportsSequentialEnrollment": false
  },
  "limitationFlags": [
    "cluster-assignment",
    "randomness-not-statistically-audited",
    "stratified-assignment"
  ],
  "warnings": [
    "Free-form warning text is not scored."
  ],
  "extraEvidence": {
    "allowed": true
  }
}
```
