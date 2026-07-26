# 公开设计报告
正文措辞可以变化，结构化证据用于确定性交叉验证。
```json design-evidence
{
  "studyId": "site-stratified-recovery-v3-dev",
  "assignmentUnit": "participant",
  "analysisUnit": "participant",
  "response": "recovery_days",
  "seed": 37,
  "allocationPath": "design/allocation.csv",
  "allocationRows": 6,
  "armCounts": {
    "control": 2,
    "intervention": 4
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
  ],
  "warnings": [
    "Free-form warning text is not scored."
  ],
  "extraEvidence": {
    "allowed": true
  }
}
```
