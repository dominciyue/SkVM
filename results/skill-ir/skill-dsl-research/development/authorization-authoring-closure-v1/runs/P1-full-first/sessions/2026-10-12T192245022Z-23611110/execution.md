# Source program execution

Mode: consume; policy: progressive; status: current.

Source meanings remain unreviewed; this is not request-wide certification.

## Current result

```json
{
  "initialRevision": "cbf5a2b8a9e31a17e60abfe724594a746839d289720bb873dc2a5b7fd10b0a0d",
  "currentRevision": "cbf5a2b8a9e31a17e60abfe724594a746839d289720bb873dc2a5b7fd10b0a0d",
  "inputs": {
    "actor": {
      "id": 7
    },
    "documents": {
      "finiteRecords": 4
    },
    "related_root": null,
    "request": {
      "pk": 10,
      "version": "",
      "original": null
    }
  },
  "termination": "return",
  "returned": {
    "requested_id": 10,
    "authorized_root_id": 10,
    "file_document_id": 12,
    "representation": "original",
    "path": "v2-original.txt",
    "disposition": "attachment"
  },
  "conditions": [],
  "gaps": [
    "Request-level routing/authentication/permission checks require independent original-source review.",
    "Storage existence/opening, filename formatting, FileResponse and header behavior are outside the finite selection descriptor.",
    "ORM/database failure and external checker behavior are not executed; source summaries are authored and unreviewed."
  ]
}
```

Detailed inputs and events: execution.json. In a live session use authorization_program_details with a stepId/questionId.

## 1. request_include_deleted — computed

file_response passes its own include_deleted=True to requested/root lookup.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1430–1434.

```json
{
  "outputs": {
    "value": true,
    "known": true
  },
  "gaps": []
}
```

## 2. request_doc — computed

Select the requested pk from the supplied complete finite global-object population, including deleted records.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1408–1415.

```json
{
  "outputs": {
    "value": {
      "id": 10,
      "root_document_id": null,
      "owner_id": 7,
      "version_index": null,
      "deleted": false,
      "has_archive_version": true,
      "source_file": "root-original.pdf",
      "archive_file": "root-archive.pdf"
    },
    "known": true
  },
  "gaps": []
}
```

## 3. request_found — computed

Missing requested document stops before root authorization.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1410–1415.

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
            "root_document_id": null,
            "owner_id": 7,
            "version_index": null,
            "deleted": false,
            "has_archive_version": true,
            "source_file": "root-original.pdf",
            "archive_file": "root-archive.pdf"
          },
          "residual": {
            "literal": {
              "id": 10,
              "root_document_id": null,
              "owner_id": 7,
              "version_index": null,
              "deleted": false,
              "has_archive_version": true,
              "source_file": "root-original.pdf",
              "archive_file": "root-archive.pdf"
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

## 4. root_lookup — skipped

Fallback root lookup has the requested/root helper's own include_deleted=True.

Executor: host; meaning: authored-program. Source: src/documents/versioning.py:154–156.

```json
{
  "outputs": {
    "known": true,
    "value": null
  },
  "condition": {
    "op": "all",
    "args": [
      {
        "op": "not",
        "arg": {
          "op": "is-null",
          "value": {
            "binding": "request_doc.root_document_id"
          }
        }
      },
      {
        "op": "is-null",
        "value": {
          "binding": "related_root"
        }
      }
    ]
  },
  "gaps": []
}
```

## 5. root_doc — computed

Root records return themselves; a loaded relation wins; otherwise root lookup or requested record fallback.

Executor: host; meaning: authored-program. Source: src/documents/versioning.py:146–156.

```json
{
  "outputs": {
    "value": {
      "id": 10,
      "root_document_id": null,
      "owner_id": 7,
      "version_index": null,
      "deleted": false,
      "has_archive_version": true,
      "source_file": "root-original.pdf",
      "archive_file": "root-archive.pdf"
    },
    "known": true
  },
  "gaps": []
}
```

## 6. checker_constructed — computed

The external checker constructor executes even on the unowned/owner shortcut; normal completion is an explicit external assumption.

Executor: host; meaning: external-assumption. Source: src/documents/permissions.py:634–634.

```json
{
  "inputs": {
    "when": {
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
            "id": 7
          },
          "residual": {
            "literal": {
              "id": 7
            }
          },
          "missingBindings": [],
          "diagnostics": [],
          "origin": "binding"
        }
      ]
    },
    "arguments": {
      "user": {
        "known": true,
        "value": 7,
        "gaps": []
      }
    },
    "name": "ObjectPermissionChecker.construct",
    "assumption": {
      "name": "ObjectPermissionChecker.construct",
      "arguments": {
        "user": 7
      },
      "value": true,
      "reason": "Development fixture assumes normal external constructor completion, not a grant."
    }
  },
  "outputs": {
    "value": true,
    "known": true
  },
  "condition": {
    "op": "not",
    "arg": {
      "op": "is-null",
      "value": {
        "binding": "actor"
      }
    }
  },
  "gaps": []
}
```

## 7. checker_completion — computed

Continue only conditionally when external constructor completion is unknown.

Executor: host; meaning: authored-program. Source: src/documents/permissions.py:634–634.

```json
{
  "inputs": {
    "when": {
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
            "id": 7
          },
          "residual": {
            "literal": {
              "id": 7
            }
          },
          "missingBindings": [],
          "diagnostics": [],
          "origin": "binding"
        }
      ]
    },
    "test": {
      "truth": "true",
      "residual": null,
      "missingBindings": [],
      "trace": [
        {
          "op": "truthy",
          "truth": "true"
        }
      ],
      "diagnostics": [],
      "valueTrace": [
        {
          "known": true,
          "value": true,
          "residual": {
            "literal": true
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
  "condition": {
    "op": "not",
    "arg": {
      "op": "is-null",
      "value": {
        "binding": "actor"
      }
    }
  },
  "gaps": []
}
```

## 8. object_grant — skipped

External object grant is consulted only after unowned and same-owner shortcuts; it stays unknown without an exact argument assumption.

Executor: host; meaning: authored-program. Source: src/documents/permissions.py:635–635.

```json
{
  "inputs": {
    "when": {
      "truth": "false",
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
          "op": "eq",
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
          "value": {
            "id": 7
          },
          "residual": {
            "literal": {
              "id": 7
            }
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
          "value": 7,
          "residual": {
            "literal": 7
          },
          "missingBindings": [],
          "diagnostics": [],
          "origin": "binding"
        }
      ]
    }
  },
  "outputs": {
    "known": true,
    "value": null
  },
  "condition": {
    "op": "all",
    "args": [
      {
        "op": "not",
        "arg": {
          "op": "is-null",
          "value": {
            "binding": "actor"
          }
        }
      },
      {
        "op": "not",
        "arg": {
          "op": "is-null",
          "value": {
            "binding": "root_doc.owner_id"
          }
        }
      },
      {
        "op": "not",
        "arg": {
          "op": "eq",
          "left": {
            "binding": "root_doc.owner_id"
          },
          "right": {
            "binding": "actor.id"
          }
        }
      }
    ]
  },
  "gaps": []
}
```

## 9. root_authorized — computed

For non-null user, owner-aware permission is checked on root_doc before effective-file selection. Null user skips this local check only; this says nothing about request authentication.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1421–1427.

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
      "truth": "true",
      "residual": null,
      "missingBindings": [],
      "trace": [
        {
          "op": "is-null",
          "truth": "false"
        },
        {
          "op": "is-null",
          "truth": "false"
        },
        {
          "op": "eq",
          "truth": "true"
        },
        {
          "op": "any",
          "truth": "true"
        }
      ],
      "diagnostics": [],
      "valueTrace": [
        {
          "known": true,
          "value": {
            "id": 7
          },
          "residual": {
            "literal": {
              "id": 7
            }
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
          "value": 7,
          "residual": {
            "literal": 7
          },
          "missingBindings": [],
          "diagnostics": [],
          "origin": "binding"
        }
      ]
    },
    "permission": "view_document",
    "principal": {
      "id": 7
    },
    "resource": {
      "id": 10,
      "root_document_id": null,
      "owner_id": 7,
      "version_index": null,
      "deleted": false,
      "has_archive_version": true,
      "source_file": "root-original.pdf",
      "archive_file": "root-archive.pdf"
    }
  },
  "outputs": {
    "value": true,
    "known": true
  },
  "gaps": []
}
```

## 10. direct_requested_version — computed

A requested version with no version parameter returns itself after root authorization.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1394–1399.

```json
{
  "outputs": {
    "value": false,
    "known": true
  },
  "gaps": []
}
```

## 11. version_include_deleted — computed

Version selection independently uses presence, not truthiness, to choose its manager; empty string is present.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1375–1381.

```json
{
  "outputs": {
    "value": true,
    "known": true
  },
  "gaps": []
}
```

## 12. explicit_version — computed

The inner selector separately uses truthiness: null and empty string choose latest.

Executor: host; meaning: authored-program. Source: src/documents/versioning.py:175–182.

```json
{
  "outputs": {
    "value": false,
    "known": true
  },
  "gaps": []
}
```

## 13. version_id — skipped

Parse explicit version as bounded decimal; invalid ASCII maps to null and unsupported Python integer forms remain gaps.

Executor: host; meaning: authored-program. Source: src/documents/versioning.py:184–187.

```json
{
  "outputs": {
    "known": true,
    "value": null
  },
  "condition": {
    "op": "all",
    "args": [
      {
        "op": "not",
        "arg": {
          "op": "truthy",
          "language": "python",
          "value": {
            "binding": "direct_requested_version"
          }
        }
      },
      {
        "op": "truthy",
        "language": "python",
        "value": {
          "binding": "explicit_version"
        }
      }
    ]
  },
  "gaps": []
}
```

## 14. version_valid — skipped

Invalid explicit version returns before candidate/file selection.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1382–1383.

```json
{
  "inputs": {
    "when": {
      "truth": "false",
      "residual": null,
      "missingBindings": [],
      "trace": [
        {
          "op": "truthy",
          "truth": "false"
        },
        {
          "op": "not",
          "truth": "true"
        },
        {
          "op": "truthy",
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
          "value": false,
          "residual": {
            "literal": false
          },
          "missingBindings": [],
          "diagnostics": [],
          "origin": "binding"
        },
        {
          "known": true,
          "value": false,
          "residual": {
            "literal": false
          },
          "missingBindings": [],
          "diagnostics": [],
          "origin": "binding"
        }
      ]
    }
  },
  "outputs": {
    "known": true,
    "value": null
  },
  "condition": {
    "op": "all",
    "args": [
      {
        "op": "not",
        "arg": {
          "op": "truthy",
          "language": "python",
          "value": {
            "binding": "direct_requested_version"
          }
        }
      },
      {
        "op": "truthy",
        "language": "python",
        "value": {
          "binding": "explicit_version"
        }
      }
    ]
  },
  "gaps": []
}
```

## 15. candidate — skipped

Explicit candidate selection uses only its own include_deleted argument.

Executor: host; meaning: authored-program. Source: src/documents/versioning.py:189–192.

```json
{
  "outputs": {
    "known": true,
    "value": null
  },
  "condition": {
    "op": "all",
    "args": [
      {
        "op": "not",
        "arg": {
          "op": "truthy",
          "language": "python",
          "value": {
            "binding": "direct_requested_version"
          }
        }
      },
      {
        "op": "truthy",
        "language": "python",
        "value": {
          "binding": "explicit_version"
        }
      }
    ]
  },
  "gaps": []
}
```

## 16. candidate_found — skipped

No selected candidate stops the response.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1384–1385.

```json
{
  "inputs": {
    "when": {
      "truth": "false",
      "residual": null,
      "missingBindings": [],
      "trace": [
        {
          "op": "truthy",
          "truth": "false"
        },
        {
          "op": "not",
          "truth": "true"
        },
        {
          "op": "truthy",
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
          "value": false,
          "residual": {
            "literal": false
          },
          "missingBindings": [],
          "diagnostics": [],
          "origin": "binding"
        },
        {
          "known": true,
          "value": false,
          "residual": {
            "literal": false
          },
          "missingBindings": [],
          "diagnostics": [],
          "origin": "binding"
        }
      ]
    }
  },
  "outputs": {
    "known": true,
    "value": null
  },
  "condition": {
    "op": "all",
    "args": [
      {
        "op": "not",
        "arg": {
          "op": "truthy",
          "language": "python",
          "value": {
            "binding": "direct_requested_version"
          }
        }
      },
      {
        "op": "truthy",
        "language": "python",
        "value": {
          "binding": "explicit_version"
        }
      }
    ]
  },
  "gaps": []
}
```

## 17. candidate_belongs — skipped

Candidate must equal the authorized root or refer to that root.

Executor: host; meaning: authored-program. Source: src/documents/versioning.py:193–195.

```json
{
  "inputs": {
    "when": {
      "truth": "false",
      "residual": null,
      "missingBindings": [],
      "trace": [
        {
          "op": "truthy",
          "truth": "false"
        },
        {
          "op": "not",
          "truth": "true"
        },
        {
          "op": "truthy",
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
          "value": false,
          "residual": {
            "literal": false
          },
          "missingBindings": [],
          "diagnostics": [],
          "origin": "binding"
        },
        {
          "known": true,
          "value": false,
          "residual": {
            "literal": false
          },
          "missingBindings": [],
          "diagnostics": [],
          "origin": "binding"
        }
      ]
    }
  },
  "outputs": {
    "known": true,
    "value": null
  },
  "condition": {
    "op": "all",
    "args": [
      {
        "op": "not",
        "arg": {
          "op": "truthy",
          "language": "python",
          "value": {
            "binding": "direct_requested_version"
          }
        }
      },
      {
        "op": "truthy",
        "language": "python",
        "value": {
          "binding": "explicit_version"
        }
      }
    ]
  },
  "gaps": []
}
```

## 18. latest_candidate — computed

Latest selection uses its own manager and source ordering, with root fallback when empty.

Executor: host; meaning: authored-program. Source: src/documents/versioning.py:159–166.

```json
{
  "outputs": {
    "value": {
      "id": 12,
      "root_document_id": 10,
      "owner_id": 9,
      "version_index": 2,
      "deleted": true,
      "has_archive_version": false,
      "source_file": "v2-original.txt",
      "archive_file": null
    },
    "known": true
  },
  "condition": {
    "op": "all",
    "args": [
      {
        "op": "not",
        "arg": {
          "op": "truthy",
          "language": "python",
          "value": {
            "binding": "direct_requested_version"
          }
        }
      },
      {
        "op": "not",
        "arg": {
          "op": "truthy",
          "language": "python",
          "value": {
            "binding": "explicit_version"
          }
        }
      }
    ]
  },
  "gaps": []
}
```

## 19. latest_file — computed

An empty latest-version selection returns the authorized root.

Executor: host; meaning: authored-program. Source: src/documents/versioning.py:165–166.

```json
{
  "outputs": {
    "value": {
      "id": 12,
      "root_document_id": 10,
      "owner_id": 9,
      "version_index": 2,
      "deleted": true,
      "has_archive_version": false,
      "source_file": "v2-original.txt",
      "archive_file": null
    },
    "known": true
  },
  "condition": {
    "op": "all",
    "args": [
      {
        "op": "not",
        "arg": {
          "op": "truthy",
          "language": "python",
          "value": {
            "binding": "direct_requested_version"
          }
        }
      },
      {
        "op": "not",
        "arg": {
          "op": "truthy",
          "language": "python",
          "value": {
            "binding": "explicit_version"
          }
        }
      }
    ]
  },
  "gaps": []
}
```

## 20. file_doc — computed

The selected file object is computed after root permission; explicit selection is not a second permission check.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1388–1399.

```json
{
  "outputs": {
    "value": {
      "id": 12,
      "root_document_id": 10,
      "owner_id": 9,
      "version_index": 2,
      "deleted": true,
      "has_archive_version": false,
      "source_file": "v2-original.txt",
      "archive_file": null
    },
    "known": true
  },
  "gaps": []
}
```

## 21. original_requested — computed

Only exact string true requests original; absent original must be supplied as null in complete query facts.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1369–1373.

```json
{
  "outputs": {
    "value": false,
    "known": true
  },
  "gaps": []
}
```

## 22. use_archive — computed

Representation follows selected file archive availability and exact original request; root authorization remains unchanged.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1442–1448.

```json
{
  "outputs": {
    "value": false,
    "known": true
  },
  "gaps": []
}
```

## 23. representation — computed

serve_file chooses archive or source representation.

Executor: host; meaning: authored-program. Source: src/documents/views.py:4941–4970.

```json
{
  "outputs": {
    "value": "original",
    "known": true
  },
  "gaps": []
}
```

## 24. selected_path — computed

File location is a supplied source-object field; no disk or business code is executed.

Executor: host; meaning: authored-program. Source: src/documents/views.py:4941–4970.

```json
{
  "outputs": {
    "value": "v2-original.txt",
    "known": true
  },
  "gaps": []
}
```

## 25. returned_file — computed

Conditional file-response descriptor after computed selection. Actual storage open, formatting, headers and external exceptions remain separate gaps, not a claimed successful network response.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1442–1448.

```json
{
  "outputs": {
    "value": {
      "requested_id": 10,
      "authorized_root_id": 10,
      "file_document_id": 12,
      "representation": "original",
      "path": "v2-original.txt",
      "disposition": "attachment"
    },
    "known": true
  },
  "gaps": []
}
```

## Draft proposals

1 retained proposals. Full candidates and diagnostics are in execution.json/report.json.

## Current raw draft

The raw author proposal is retained separately from the active program and candidate preview. A candidate result is not an adopted execution.

```json
{
  "draftRevision": "cb3d90a257eb6f139100b29f52c1c1c62f8b621c947fc0b7e33b2b292843c574",
  "activeRevision": "cbf5a2b8a9e31a17e60abfe724594a746839d289720bb873dc2a5b7fd10b0a0d",
  "candidateRevision": "cb3d90a257eb6f139100b29f52c1c1c62f8b621c947fc0b7e33b2b292843c574",
  "candidateAdopted": true,
  "stepOrder": [
    "request_include_deleted",
    "request_doc",
    "request_found",
    "root_lookup",
    "root_doc",
    "checker_constructed",
    "checker_completion",
    "object_grant",
    "root_authorized",
    "direct_requested_version",
    "version_include_deleted",
    "explicit_version",
    "version_id",
    "version_valid",
    "candidate",
    "candidate_found",
    "candidate_belongs",
    "latest_candidate",
    "latest_file",
    "file_doc",
    "original_requested",
    "use_archive",
    "representation",
    "selected_path",
    "returned_file"
  ],
  "diagnostics": []
}
```

## Remaining original duties

- requested-document-and-returned-file: Explain how the request identifies the document and how the selected version and original/archive representation determine the file returned, including every relevant control branch.. Semantic coverage remains unreviewed; computed fields: requested_id, authorized_root_id, file_document_id, representation, path, disposition.
- authorization-and-selection-order: Identify the authorization checks and branches for the authenticated user, the requested document, and the selected version or original/archive representation, and state where those checks occur relative to selection of the returned file.. Semantic coverage remains unreviewed; computed fields: none.
- alternate-version-authorized-resource: Determine whether selecting another document version or choosing original versus archive changes the resource on which authorization is evaluated, or only changes the representation or file returned after authorization; distinguish all relevant branches.. Semantic coverage remains unreviewed; computed fields: none.
- missing-facts-and-conditional-conclusions: State precisely which source, configuration, deployment, ownership, or object-grant facts needed for a conclusion are unavailable, and identify the exact conclusion each missing fact blocks without assuming behavior outside the allowed evidence.. Semantic coverage remains unreviewed; computed fields: none.
