# Public design report
Prose may vary; structured evidence supports deterministic checks.
```json design-evidence
{
  "studyId": "clinic-sequential-screening-v3-dev",
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
    "randomness-not-statistically-audited",
    "sequential-enrollment"
  ],
  "warnings": [
    "Free-form warning text is not scored."
  ],
  "extraEvidence": {
    "allowed": true
  }
}
```
