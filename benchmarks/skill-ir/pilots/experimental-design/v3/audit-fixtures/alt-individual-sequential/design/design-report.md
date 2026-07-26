# 公开设计报告
正文措辞可以变化，结构化证据用于确定性交叉验证。
```json design-evidence
{
  "studyId": "audit-alt-individual-sequential",
  "assignmentUnit": "participant",
  "analysisUnit": "participant",
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
    "balancesWithinStrata": false,
    "supportsSequentialEnrollment": true
  },
  "limitationFlags": [
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
