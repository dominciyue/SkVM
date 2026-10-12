# Source program execution

Mode: consume; policy: progressive; status: current.

Source meanings remain unreviewed; this is not request-wide certification.

## Current result

```json
{
  "initialRevision": "5443a836c2950d236707fd39d19bc6e12cb773b294706c9fa00859d782ae7d10",
  "currentRevision": "5443a836c2950d236707fd39d19bc6e12cb773b294706c9fa00859d782ae7d10",
  "inputs": {
    "actor": null,
    "request": {
      "document_id": 10
    },
    "documents": {
      "finiteRecords": 2
    },
    "model_grants": {
      "finiteRecords": 2
    },
    "object_grants": {
      "finiteRecords": 1
    }
  },
  "termination": "endpoint-authentication-denied",
  "conditions": [],
  "gaps": [
    "No target creation or storage access is executed.",
    "DRF inherited create and relation-field implementation is not included in this task's allowed snapshot.",
    "Effective grant rows and ORM user identity by primary key are supplied development facts; deployed authentication/backend state remains unknown."
  ]
}
```

Detailed inputs and events: execution.json. In a live session use authorization_program_details with a stepId/questionId.

## 1. authenticated — rejected

IsAuthenticated is the first inherited endpoint permission; fixture authentication is an explicit fact.

Executor: host; meaning: authored-program. Source: src/documents/views.py:4696–4710.

```json
{
  "inputs": {
    "test": {
      "truth": "false",
      "residual": null,
      "missingBindings": [],
      "trace": [
        {
          "op": "is-null",
          "truth": "true"
        },
        {
          "op": "not",
          "truth": "false"
        },
        {
          "op": "all",
          "truth": "false"
        }
      ],
      "diagnostics": [],
      "valueTrace": [
        {
          "known": true,
          "value": null,
          "residual": {
            "literal": null
          },
          "missingBindings": [],
          "diagnostics": [],
          "origin": "binding"
        }
      ]
    }
  },
  "outputs": {
    "value": false,
    "known": true
  },
  "gaps": []
}
```

## Draft proposals

0 retained proposals. Full candidates and diagnostics are in execution.json/report.json.
