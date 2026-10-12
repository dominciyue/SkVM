# Source program execution

Mode: consume; policy: progressive; status: current.

Source meanings remain unreviewed; this is not request-wide certification.

## Current result

```json
{
  "initialRevision": "0e448f6a44a0ace785613818f8c42d4893d4bdbe5336f40550d0a776d1eaaa5c",
  "currentRevision": "0e448f6a44a0ace785613818f8c42d4893d4bdbe5336f40550d0a776d1eaaa5c",
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
      "version": null,
      "original": null
    }
  },
  "termination": "return",
  "returned": {
    "requested_id": 10,
    "authorized_root_id": 10,
    "file_document_id": 11,
    "representation": "archive",
    "path": "v1-archive.pdf",
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
    "value": false,
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
      "id": 11,
      "root_document_id": 10,
      "owner_id": 9,
      "version_index": 1,
      "deleted": false,
      "has_archive_version": true,
      "source_file": "v1-original.pdf",
      "archive_file": "v1-archive.pdf"
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
      "id": 11,
      "root_document_id": 10,
      "owner_id": 9,
      "version_index": 1,
      "deleted": false,
      "has_archive_version": true,
      "source_file": "v1-original.pdf",
      "archive_file": "v1-archive.pdf"
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
      "id": 11,
      "root_document_id": 10,
      "owner_id": 9,
      "version_index": 1,
      "deleted": false,
      "has_archive_version": true,
      "source_file": "v1-original.pdf",
      "archive_file": "v1-archive.pdf"
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
    "value": true,
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
    "value": "archive",
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
    "value": "v1-archive.pdf",
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
      "file_document_id": 11,
      "representation": "archive",
      "path": "v1-archive.pdf",
      "disposition": "attachment"
    },
    "known": true
  },
  "gaps": []
}
```

## Draft proposals

1 retained proposals. Full candidates and diagnostics are in execution.json/report.json.
