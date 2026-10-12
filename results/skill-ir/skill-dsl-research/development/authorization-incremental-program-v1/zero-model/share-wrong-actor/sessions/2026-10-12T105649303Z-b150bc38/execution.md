# Source program execution

Mode: consume; policy: progressive; status: current.

Source meanings remain unreviewed; this is not request-wide certification.

## Current result

```json
{
  "initialRevision": "274790acf4f7510388ba719dcc8dc79aaca642fc38b6a0f1ac9b91261e2e5b86",
  "currentRevision": "274790acf4f7510388ba719dcc8dc79aaca642fc38b6a0f1ac9b91261e2e5b86",
  "inputs": {
    "actor": {
      "id": 7,
      "authenticated": true
    },
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
  "termination": "serializer-object-permission-denied",
  "conditions": [],
  "gaps": [
    "No target creation or storage access is executed.",
    "DRF inherited create and relation-field implementation is not included in this task's allowed snapshot.",
    "Effective grant rows and ORM user identity by primary key are supplied development facts; deployed authentication/backend state remains unknown."
  ]
}
```

Detailed inputs and events: execution.json. In a live session use authorization_program_details with a stepId/questionId.

## 1. authenticated — computed

IsAuthenticated is the first inherited endpoint permission; fixture authentication is an explicit fact.

Executor: host; meaning: authored-program. Source: src/documents/views.py:4696–4710.

```json
{
  "inputs": {
    "test": {
      "truth": "true",
      "residual": null,
      "missingBindings": [],
      "trace": [
        {
          "op": "is-null",
          "truth": "false"
        },
        {
          "op": "not",
          "truth": "true"
        },
        {
          "op": "eq",
          "truth": "true"
        },
        {
          "op": "all",
          "truth": "true"
        }
      ],
      "diagnostics": [],
      "valueTrace": [
        {
          "known": true,
          "value": {
            "id": 7,
            "authenticated": true
          },
          "residual": {
            "literal": {
              "id": 7,
              "authenticated": true
            }
          },
          "missingBindings": [],
          "diagnostics": [],
          "origin": "binding"
        },
        {
          "known": true,
          "value": true,
          "residual": {
            "literal": true
          },
          "missingBindings": [],
          "diagnostics": [],
          "origin": "binding"
        },
        {
          "known": true,
          "value": true,
          "residual": {
            "literal": true
          },
          "missingBindings": [],
          "diagnostics": [],
          "origin": "literal"
        }
      ]
    }
  },
  "outputs": {
    "value": true,
    "known": true
  },
  "gaps": []
}
```

## 2. endpoint_grant — computed

POST maps to add_sharelink under the declared DRF inheritance assumption; select the supplied global grant for this actor.

Executor: host; meaning: authored-program. Source: src/documents/permissions.py:30–44.

```json
{
  "additionalSources": [
    {
      "path": "src/documents/views.py",
      "startLine": 4696,
      "endLine": 4710,
      "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
    }
  ],
  "outputs": {
    "value": {
      "actor_id": 7,
      "permission": "documents.add_sharelink"
    },
    "known": true
  },
  "gaps": []
}
```

## 3. endpoint_allowed — computed

A global model grant is necessary but does not prove exact-document access.

Executor: host; meaning: authored-program. Source: src/documents/permissions.py:30–44.

```json
{
  "additionalSources": [
    {
      "path": "src/documents/views.py",
      "startLine": 4696,
      "endLine": 4710,
      "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
    }
  ],
  "inputs": {
    "test": {
      "truth": "true",
      "residual": null,
      "missingBindings": [],
      "trace": [
        {
          "op": "is-null",
          "truth": "false"
        },
        {
          "op": "not",
          "truth": "true"
        }
      ],
      "diagnostics": [],
      "valueTrace": [
        {
          "known": true,
          "value": {
            "actor_id": 7,
            "permission": "documents.add_sharelink"
          },
          "residual": {
            "literal": {
              "actor_id": 7,
              "permission": "documents.add_sharelink"
            }
          },
          "missingBindings": [],
          "diagnostics": [],
          "origin": "binding"
        }
      ]
    },
    "permission": "documents.add_sharelink",
    "principal": {
      "id": 7,
      "authenticated": true
    }
  },
  "outputs": {
    "value": true,
    "known": true
  },
  "gaps": []
}
```

## 4. document — computed

Finite model of DRF's document relation validation; the supplied population represents eligible related documents.

Executor: host; meaning: authored-program. Source: src/documents/serialisers.py:2857–2867.

```json
{
  "outputs": {
    "value": {
      "id": 10,
      "owner_id": 9
    },
    "known": true
  },
  "gaps": []
}
```

## 5. document_found — computed

The finite relation must resolve to the exact supplied document before field validation; DRF implementation is an explicit gap.

Executor: host; meaning: authored-program. Source: src/documents/serialisers.py:2857–2886.

```json
{
  "inputs": {
    "test": {
      "truth": "true",
      "residual": null,
      "missingBindings": [],
      "trace": [
        {
          "op": "is-null",
          "truth": "false"
        },
        {
          "op": "not",
          "truth": "true"
        }
      ],
      "diagnostics": [],
      "valueTrace": [
        {
          "known": true,
          "value": {
            "id": 10,
            "owner_id": 9
          },
          "residual": {
            "literal": {
              "id": 10,
              "owner_id": 9
            }
          },
          "missingBindings": [],
          "diagnostics": [],
          "origin": "binding"
        }
      ]
    }
  },
  "outputs": {
    "value": true,
    "known": true
  },
  "gaps": []
}
```

## 6. view_model_grant — computed

The serializer separately requires the caller's global documents.view_document permission.

Executor: host; meaning: authored-program. Source: src/documents/serialisers.py:2873–2886.

```json
{
  "outputs": {
    "value": {
      "actor_id": 7,
      "permission": "documents.view_document"
    },
    "known": true
  },
  "gaps": []
}
```

## 7. view_model_allowed — computed

PassUserMixin supplies request.user to the serializer; the global check short-circuits the exact-object helper.

Executor: host; meaning: authored-program. Source: src/documents/serialisers.py:2873–2886.

```json
{
  "additionalSources": [
    {
      "path": "src/documents/views.py",
      "startLine": 406,
      "endLine": 428,
      "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
    }
  ],
  "inputs": {
    "test": {
      "truth": "true",
      "residual": null,
      "missingBindings": [],
      "trace": [
        {
          "op": "is-null",
          "truth": "false"
        },
        {
          "op": "not",
          "truth": "true"
        },
        {
          "op": "is-null",
          "truth": "false"
        },
        {
          "op": "not",
          "truth": "true"
        },
        {
          "op": "all",
          "truth": "true"
        }
      ],
      "diagnostics": [],
      "valueTrace": [
        {
          "known": true,
          "value": {
            "id": 7,
            "authenticated": true
          },
          "residual": {
            "literal": {
              "id": 7,
              "authenticated": true
            }
          },
          "missingBindings": [],
          "diagnostics": [],
          "origin": "binding"
        },
        {
          "known": true,
          "value": {
            "actor_id": 7,
            "permission": "documents.view_document"
          },
          "residual": {
            "literal": {
              "actor_id": 7,
              "permission": "documents.view_document"
            }
          },
          "missingBindings": [],
          "diagnostics": [],
          "origin": "binding"
        }
      ]
    },
    "permission": "documents.view_document",
    "principal": {
      "id": 7,
      "authenticated": true
    },
    "resource": {
      "id": 10,
      "owner_id": 9
    }
  },
  "outputs": {
    "value": true,
    "known": true
  },
  "gaps": []
}
```

## 8. object_grant — computed

Finite development facts represent effective Guardian grants for the exact actor and document, not a precomputed authorization boolean.

Executor: host; meaning: authored-program. Source: src/documents/permissions.py:624–635.

```json
{
  "outputs": {
    "value": null,
    "known": true
  },
  "gaps": []
}
```

## 9. object_allowed — rejected

Owner-aware semantics: unowned OR actor is owner OR the exact object's effective grant; never substitute add_sharelink.

Executor: host; meaning: authored-program. Source: src/documents/serialisers.py:2873–2886.

```json
{
  "additionalSources": [
    {
      "path": "src/documents/permissions.py",
      "startLine": 624,
      "endLine": 635,
      "sha256": "bb2af1efd059d69f489dea57fb579cf78967e607455820cedc2ea21226475065"
    }
  ],
  "inputs": {
    "test": {
      "truth": "false",
      "residual": null,
      "missingBindings": [],
      "trace": [
        {
          "op": "is-null",
          "truth": "false"
        },
        {
          "op": "eq",
          "truth": "false"
        },
        {
          "op": "is-null",
          "truth": "true"
        },
        {
          "op": "not",
          "truth": "false"
        },
        {
          "op": "any",
          "truth": "false"
        }
      ],
      "diagnostics": [],
      "valueTrace": [
        {
          "known": true,
          "value": 9,
          "residual": {
            "literal": 9
          },
          "missingBindings": [],
          "diagnostics": [],
          "origin": "binding"
        },
        {
          "known": true,
          "value": 9,
          "residual": {
            "literal": 9
          },
          "missingBindings": [],
          "diagnostics": [],
          "origin": "binding"
        },
        {
          "known": true,
          "value": 7,
          "residual": {
            "literal": 7
          },
          "missingBindings": [],
          "diagnostics": [],
          "origin": "binding"
        },
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
    },
    "permission": "view_document",
    "principal": {
      "id": 7,
      "authenticated": true
    },
    "resource": {
      "id": 10,
      "owner_id": 9
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
