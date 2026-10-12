# Source program execution

Mode: edit; policy: progressive; status: draft-only.

Source meanings remain unreviewed; this is not request-wide certification.

## Current result

```json
{
  "inputs": {}
}
```

Detailed inputs and events: execution.json. In a live session use authorization_program_details with a stepId/questionId.

## Draft proposals

0 retained proposals. Full candidates and diagnostics are in execution.json/report.json.

## Current raw draft

The raw author proposal is retained separately from the active program and candidate preview. A candidate result is not an adopted execution.

```json
{
  "draftRevision": "d4b25da48237c87ac884c6d8e5a76462b3b9b4875e083d09dfc3a007626d5c50",
  "stepOrder": [
    "request_doc",
    "root_id",
    "root_doc",
    "permission_result",
    "permission_guard",
    "result"
  ],
  "diagnostics": [
    {
      "code": "contract-local-shape",
      "path": "sourceDeclarations.0.source",
      "message": "Required",
      "severity": "error"
    },
    {
      "code": "contract-local-shape",
      "path": "sourceDeclarations.0.statements",
      "message": "Required",
      "severity": "error"
    },
    {
      "code": "contract-local-shape",
      "path": "sourceDeclarations.0.",
      "message": "Unrecognized key(s) in object: 'path', 'symbol', 'complete'",
      "severity": "error"
    },
    {
      "code": "contract-local-shape",
      "path": "sourceDeclarations.1.source",
      "message": "Required",
      "severity": "error"
    },
    {
      "code": "contract-local-shape",
      "path": "sourceDeclarations.1.statements",
      "message": "Required",
      "severity": "error"
    },
    {
      "code": "contract-local-shape",
      "path": "sourceDeclarations.1.",
      "message": "Unrecognized key(s) in object: 'path', 'symbol', 'complete'",
      "severity": "error"
    },
    {
      "code": "contract-local-shape",
      "path": "sourceDeclarations.2.source",
      "message": "Required",
      "severity": "error"
    },
    {
      "code": "contract-local-shape",
      "path": "sourceDeclarations.2.statements",
      "message": "Required",
      "severity": "error"
    },
    {
      "code": "contract-local-shape",
      "path": "sourceDeclarations.2.",
      "message": "Unrecognized key(s) in object: 'path', 'symbol', 'complete'",
      "severity": "error"
    },
    {
      "code": "contract-local-shape",
      "path": "sourceDeclarations.3.source",
      "message": "Required",
      "severity": "error"
    },
    {
      "code": "contract-local-shape",
      "path": "sourceDeclarations.3.statements",
      "message": "Required",
      "severity": "error"
    },
    {
      "code": "contract-local-shape",
      "path": "sourceDeclarations.3.",
      "message": "Unrecognized key(s) in object: 'path', 'symbol', 'complete'",
      "severity": "error"
    },
    {
      "code": "contract-local-shape",
      "path": "sourceDeclarations.4.source",
      "message": "Required",
      "severity": "error"
    },
    {
      "code": "contract-local-shape",
      "path": "sourceDeclarations.4.statements",
      "message": "Required",
      "severity": "error"
    },
    {
      "code": "contract-local-shape",
      "path": "sourceDeclarations.4.",
      "message": "Unrecognized key(s) in object: 'path', 'symbol', 'complete'",
      "severity": "error"
    },
    {
      "code": "contract-shape",
      "path": "sourceDeclarations",
      "message": "Array must contain at least 1 element(s)",
      "severity": "error"
    }
  ]
}
```

## Remaining original duties

- requested-document-and-returned-file: Explain how the request identifies the document and how the selected version and original/archive representation determine the file returned, including every relevant control branch.. Semantic coverage remains unreviewed; computed fields: none.
- authorization-and-selection-order: Identify the authorization checks and branches for the authenticated user, the requested document, and the selected version or original/archive representation, and state where those checks occur relative to selection of the returned file.. Semantic coverage remains unreviewed; computed fields: none.
- alternate-version-authorized-resource: Determine whether selecting another document version or choosing original versus archive changes the resource on which authorization is evaluated, or only changes the representation or file returned after authorization; distinguish all relevant branches.. Semantic coverage remains unreviewed; computed fields: none.
- missing-facts-and-conditional-conclusions: State precisely which source, configuration, deployment, ownership, or object-grant facts needed for a conclusion are unavailable, and identify the exact conclusion each missing fact blocks without assuming behavior outside the allowed evidence.. Semantic coverage remains unreviewed; computed fields: none.
