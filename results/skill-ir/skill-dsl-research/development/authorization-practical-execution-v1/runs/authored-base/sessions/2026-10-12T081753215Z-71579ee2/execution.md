# Source program execution

Mode: consume; policy: progressive; status: current.

Source meanings remain unreviewed; this is not request-wide certification.

## 1. request_include_deleted — computed

file_response passes its own include_deleted=True to requested/root lookup.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1430–1434.

```json
{
  "inputs": {
    "expression": {
      "literal": true
    }
  },
  "outputs": {
    "value": true,
    "known": true
  },
  "gaps": []
}
```

## 2. request_doc — unresolved

Select the requested pk from the supplied complete finite global-object population, including deleted records.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1408–1415.

```json
{
  "inputs": {
    "from": "documents",
    "rows": {
      "known": false,
      "gaps": [
        "documents"
      ]
    },
    "where": {
      "op": "eq",
      "left": {
        "binding": "row.id"
      },
      "right": {
        "binding": "request.pk"
      }
    }
  },
  "outputs": {
    "known": false
  },
  "gaps": [
    "documents"
  ]
}
```

## 3. request_found — unresolved

Missing requested document stops before root authorization.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1410–1415.

```json
{
  "inputs": {
    "test": {
      "truth": "unknown",
      "residual": {
        "op": "not",
        "arg": {
          "op": "is-null",
          "value": {
            "binding": "request_doc"
          }
        }
      },
      "missingBindings": [
        "request_doc"
      ],
      "trace": [
        {
          "op": "is-null",
          "truth": "unknown"
        },
        {
          "op": "not",
          "truth": "unknown"
        }
      ],
      "diagnostics": [],
      "valueTrace": [
        {
          "known": false,
          "residual": {
            "binding": "request_doc"
          },
          "missingBindings": [
            "request_doc"
          ],
          "diagnostics": [],
          "origin": "binding"
        }
      ]
    }
  },
  "outputs": {
    "known": false
  },
  "gaps": [
    "request_doc"
  ]
}
```

## 4. root_lookup — unresolved

Fallback root lookup has the requested/root helper's own include_deleted=True.

Executor: host; meaning: authored-program. Source: src/documents/versioning.py:154–156.

```json
{
  "inputs": {
    "when": {
      "truth": "unknown",
      "residual": {
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
      "missingBindings": [
        "related_root",
        "request_doc.root_document_id"
      ],
      "trace": [
        {
          "op": "is-null",
          "truth": "unknown"
        },
        {
          "op": "not",
          "truth": "unknown"
        },
        {
          "op": "is-null",
          "truth": "unknown"
        },
        {
          "op": "all",
          "truth": "unknown"
        }
      ],
      "diagnostics": [],
      "valueTrace": [
        {
          "known": false,
          "residual": {
            "binding": "request_doc.root_document_id"
          },
          "missingBindings": [
            "request_doc.root_document_id"
          ],
          "diagnostics": [],
          "origin": "binding"
        },
        {
          "known": false,
          "residual": {
            "binding": "related_root"
          },
          "missingBindings": [
            "related_root"
          ],
          "diagnostics": [],
          "origin": "binding"
        }
      ]
    }
  },
  "outputs": {
    "known": false
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
  "gaps": [
    "related_root",
    "request_doc.root_document_id"
  ]
}
```

## 5. root_doc — unresolved

Root records return themselves; a loaded relation wins; otherwise root lookup or requested record fallback.

Executor: host; meaning: authored-program. Source: src/documents/versioning.py:146–156.

```json
{
  "inputs": {
    "expression": {
      "choose": {
        "test": {
          "op": "is-null",
          "value": {
            "binding": "request_doc.root_document_id"
          }
        },
        "then": {
          "ref": "request_doc"
        },
        "else": {
          "coalesce": [
            {
              "ref": "related_root"
            },
            {
              "ref": "root_lookup"
            },
            {
              "ref": "request_doc"
            }
          ]
        }
      }
    }
  },
  "outputs": {
    "known": false
  },
  "gaps": [
    "request_doc.root_document_id",
    "documents",
    "related_root"
  ]
}
```

## 6. checker_constructed — unresolved

The external checker constructor executes even on the unowned/owner shortcut; normal completion is an explicit external assumption.

Executor: host; meaning: authored-program. Source: src/documents/permissions.py:634–634.

```json
{
  "inputs": {
    "when": {
      "truth": "unknown",
      "residual": {
        "op": "not",
        "arg": {
          "op": "is-null",
          "value": {
            "binding": "actor"
          }
        }
      },
      "missingBindings": [
        "actor"
      ],
      "trace": [
        {
          "op": "is-null",
          "truth": "unknown"
        },
        {
          "op": "not",
          "truth": "unknown"
        }
      ],
      "diagnostics": [],
      "valueTrace": [
        {
          "known": false,
          "residual": {
            "binding": "actor"
          },
          "missingBindings": [
            "actor"
          ],
          "diagnostics": [],
          "origin": "binding"
        }
      ]
    }
  },
  "outputs": {
    "known": false
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
  "gaps": [
    "actor"
  ]
}
```

## 7. checker_completion — unresolved

Continue only conditionally when external constructor completion is unknown.

Executor: host; meaning: authored-program. Source: src/documents/permissions.py:634–634.

```json
{
  "inputs": {
    "when": {
      "truth": "unknown",
      "residual": {
        "op": "not",
        "arg": {
          "op": "is-null",
          "value": {
            "binding": "actor"
          }
        }
      },
      "missingBindings": [
        "actor"
      ],
      "trace": [
        {
          "op": "is-null",
          "truth": "unknown"
        },
        {
          "op": "not",
          "truth": "unknown"
        }
      ],
      "diagnostics": [],
      "valueTrace": [
        {
          "known": false,
          "residual": {
            "binding": "actor"
          },
          "missingBindings": [
            "actor"
          ],
          "diagnostics": [],
          "origin": "binding"
        }
      ]
    }
  },
  "outputs": {
    "known": false
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
  "gaps": [
    "actor"
  ]
}
```

## 8. object_grant — unresolved

External object grant is consulted only after unowned and same-owner shortcuts; it stays unknown without an exact argument assumption.

Executor: host; meaning: authored-program. Source: src/documents/permissions.py:635–635.

```json
{
  "inputs": {
    "when": {
      "truth": "unknown",
      "residual": {
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
      "missingBindings": [
        "actor",
        "actor.id",
        "root_doc.owner_id"
      ],
      "trace": [
        {
          "op": "is-null",
          "truth": "unknown"
        },
        {
          "op": "not",
          "truth": "unknown"
        },
        {
          "op": "is-null",
          "truth": "unknown"
        },
        {
          "op": "not",
          "truth": "unknown"
        },
        {
          "op": "eq",
          "truth": "unknown"
        },
        {
          "op": "not",
          "truth": "unknown"
        },
        {
          "op": "all",
          "truth": "unknown"
        }
      ],
      "diagnostics": [],
      "valueTrace": [
        {
          "known": false,
          "residual": {
            "binding": "actor"
          },
          "missingBindings": [
            "actor"
          ],
          "diagnostics": [],
          "origin": "binding"
        },
        {
          "known": false,
          "residual": {
            "binding": "root_doc.owner_id"
          },
          "missingBindings": [
            "root_doc.owner_id"
          ],
          "diagnostics": [],
          "origin": "binding"
        },
        {
          "known": false,
          "residual": {
            "binding": "root_doc.owner_id"
          },
          "missingBindings": [
            "root_doc.owner_id"
          ],
          "diagnostics": [],
          "origin": "binding"
        },
        {
          "known": false,
          "residual": {
            "binding": "actor.id"
          },
          "missingBindings": [
            "actor.id"
          ],
          "diagnostics": [],
          "origin": "binding"
        }
      ]
    }
  },
  "outputs": {
    "known": false
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
  "gaps": [
    "actor",
    "actor.id",
    "root_doc.owner_id"
  ]
}
```

## 9. root_authorized — unresolved

For non-null user, owner-aware permission is checked on root_doc before effective-file selection. Null user skips this local check only; this says nothing about request authentication.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1421–1427.

```json
{
  "inputs": {
    "test": {
      "truth": "unknown",
      "residual": {
        "op": "any",
        "args": [
          {
            "op": "is-null",
            "value": {
              "binding": "actor"
            }
          },
          {
            "op": "is-null",
            "value": {
              "binding": "root_doc.owner_id"
            }
          },
          {
            "op": "eq",
            "left": {
              "binding": "root_doc.owner_id"
            },
            "right": {
              "binding": "actor.id"
            }
          },
          {
            "op": "truthy",
            "language": "python",
            "value": {
              "binding": "object_grant"
            }
          }
        ]
      },
      "missingBindings": [
        "actor",
        "actor.id",
        "object_grant",
        "root_doc.owner_id"
      ],
      "trace": [
        {
          "op": "is-null",
          "truth": "unknown"
        },
        {
          "op": "is-null",
          "truth": "unknown"
        },
        {
          "op": "eq",
          "truth": "unknown"
        },
        {
          "op": "truthy",
          "truth": "unknown"
        },
        {
          "op": "any",
          "truth": "unknown"
        }
      ],
      "diagnostics": [],
      "valueTrace": [
        {
          "known": false,
          "residual": {
            "binding": "actor"
          },
          "missingBindings": [
            "actor"
          ],
          "diagnostics": [],
          "origin": "binding"
        },
        {
          "known": false,
          "residual": {
            "binding": "root_doc.owner_id"
          },
          "missingBindings": [
            "root_doc.owner_id"
          ],
          "diagnostics": [],
          "origin": "binding"
        },
        {
          "known": false,
          "residual": {
            "binding": "root_doc.owner_id"
          },
          "missingBindings": [
            "root_doc.owner_id"
          ],
          "diagnostics": [],
          "origin": "binding"
        },
        {
          "known": false,
          "residual": {
            "binding": "actor.id"
          },
          "missingBindings": [
            "actor.id"
          ],
          "diagnostics": [],
          "origin": "binding"
        },
        {
          "known": false,
          "residual": {
            "binding": "object_grant"
          },
          "missingBindings": [
            "object_grant"
          ],
          "diagnostics": [],
          "origin": "binding"
        }
      ]
    },
    "permission": "view_document"
  },
  "outputs": {
    "known": false
  },
  "gaps": [
    "actor",
    "actor.id",
    "object_grant",
    "root_doc.owner_id",
    "request_doc.root_document_id",
    "documents",
    "related_root"
  ]
}
```

## 10. direct_requested_version — unresolved

A requested version with no version parameter returns itself after root authorization.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1394–1399.

```json
{
  "inputs": {
    "expression": {
      "test": {
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
              "binding": "request.version"
            }
          }
        ]
      }
    }
  },
  "outputs": {
    "known": false
  },
  "gaps": [
    "request.version",
    "request_doc.root_document_id"
  ]
}
```

## 11. version_include_deleted — unresolved

Version selection independently uses presence, not truthiness, to choose its manager; empty string is present.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1375–1381.

```json
{
  "inputs": {
    "expression": {
      "test": {
        "op": "not",
        "arg": {
          "op": "is-null",
          "value": {
            "binding": "request.version"
          }
        }
      }
    }
  },
  "outputs": {
    "known": false
  },
  "gaps": [
    "request.version"
  ]
}
```

## 12. explicit_version — unresolved

The inner selector separately uses truthiness: null and empty string choose latest.

Executor: host; meaning: authored-program. Source: src/documents/versioning.py:175–182.

```json
{
  "inputs": {
    "expression": {
      "test": {
        "op": "truthy",
        "language": "python",
        "value": {
          "binding": "request.version"
        }
      }
    }
  },
  "outputs": {
    "known": false
  },
  "gaps": [
    "request.version"
  ]
}
```

## 13. version_id — unresolved

Parse explicit version as bounded decimal; invalid ASCII maps to null and unsupported Python integer forms remain gaps.

Executor: host; meaning: authored-program. Source: src/documents/versioning.py:184–187.

```json
{
  "inputs": {
    "when": {
      "truth": "unknown",
      "residual": {
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
      "missingBindings": [
        "direct_requested_version",
        "explicit_version"
      ],
      "trace": [
        {
          "op": "truthy",
          "truth": "unknown"
        },
        {
          "op": "not",
          "truth": "unknown"
        },
        {
          "op": "truthy",
          "truth": "unknown"
        },
        {
          "op": "all",
          "truth": "unknown"
        }
      ],
      "diagnostics": [],
      "valueTrace": [
        {
          "known": false,
          "residual": {
            "binding": "direct_requested_version"
          },
          "missingBindings": [
            "direct_requested_version"
          ],
          "diagnostics": [],
          "origin": "binding"
        },
        {
          "known": false,
          "residual": {
            "binding": "explicit_version"
          },
          "missingBindings": [
            "explicit_version"
          ],
          "diagnostics": [],
          "origin": "binding"
        }
      ]
    }
  },
  "outputs": {
    "known": false
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
  "gaps": [
    "direct_requested_version",
    "explicit_version"
  ]
}
```

## 14. version_valid — unresolved

Invalid explicit version returns before candidate/file selection.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1382–1383.

```json
{
  "inputs": {
    "when": {
      "truth": "unknown",
      "residual": {
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
      "missingBindings": [
        "direct_requested_version",
        "explicit_version"
      ],
      "trace": [
        {
          "op": "truthy",
          "truth": "unknown"
        },
        {
          "op": "not",
          "truth": "unknown"
        },
        {
          "op": "truthy",
          "truth": "unknown"
        },
        {
          "op": "all",
          "truth": "unknown"
        }
      ],
      "diagnostics": [],
      "valueTrace": [
        {
          "known": false,
          "residual": {
            "binding": "direct_requested_version"
          },
          "missingBindings": [
            "direct_requested_version"
          ],
          "diagnostics": [],
          "origin": "binding"
        },
        {
          "known": false,
          "residual": {
            "binding": "explicit_version"
          },
          "missingBindings": [
            "explicit_version"
          ],
          "diagnostics": [],
          "origin": "binding"
        }
      ]
    }
  },
  "outputs": {
    "known": false
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
  "gaps": [
    "direct_requested_version",
    "explicit_version"
  ]
}
```

## 15. candidate — unresolved

Explicit candidate selection uses only its own include_deleted argument.

Executor: host; meaning: authored-program. Source: src/documents/versioning.py:189–192.

```json
{
  "inputs": {
    "when": {
      "truth": "unknown",
      "residual": {
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
      "missingBindings": [
        "direct_requested_version",
        "explicit_version"
      ],
      "trace": [
        {
          "op": "truthy",
          "truth": "unknown"
        },
        {
          "op": "not",
          "truth": "unknown"
        },
        {
          "op": "truthy",
          "truth": "unknown"
        },
        {
          "op": "all",
          "truth": "unknown"
        }
      ],
      "diagnostics": [],
      "valueTrace": [
        {
          "known": false,
          "residual": {
            "binding": "direct_requested_version"
          },
          "missingBindings": [
            "direct_requested_version"
          ],
          "diagnostics": [],
          "origin": "binding"
        },
        {
          "known": false,
          "residual": {
            "binding": "explicit_version"
          },
          "missingBindings": [
            "explicit_version"
          ],
          "diagnostics": [],
          "origin": "binding"
        }
      ]
    }
  },
  "outputs": {
    "known": false
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
  "gaps": [
    "direct_requested_version",
    "explicit_version"
  ]
}
```

## 16. candidate_found — unresolved

No selected candidate stops the response.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1384–1385.

```json
{
  "inputs": {
    "when": {
      "truth": "unknown",
      "residual": {
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
      "missingBindings": [
        "direct_requested_version",
        "explicit_version"
      ],
      "trace": [
        {
          "op": "truthy",
          "truth": "unknown"
        },
        {
          "op": "not",
          "truth": "unknown"
        },
        {
          "op": "truthy",
          "truth": "unknown"
        },
        {
          "op": "all",
          "truth": "unknown"
        }
      ],
      "diagnostics": [],
      "valueTrace": [
        {
          "known": false,
          "residual": {
            "binding": "direct_requested_version"
          },
          "missingBindings": [
            "direct_requested_version"
          ],
          "diagnostics": [],
          "origin": "binding"
        },
        {
          "known": false,
          "residual": {
            "binding": "explicit_version"
          },
          "missingBindings": [
            "explicit_version"
          ],
          "diagnostics": [],
          "origin": "binding"
        }
      ]
    }
  },
  "outputs": {
    "known": false
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
  "gaps": [
    "direct_requested_version",
    "explicit_version"
  ]
}
```

## 17. candidate_belongs — unresolved

Candidate must equal the authorized root or refer to that root.

Executor: host; meaning: authored-program. Source: src/documents/versioning.py:193–195.

```json
{
  "inputs": {
    "when": {
      "truth": "unknown",
      "residual": {
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
      "missingBindings": [
        "direct_requested_version",
        "explicit_version"
      ],
      "trace": [
        {
          "op": "truthy",
          "truth": "unknown"
        },
        {
          "op": "not",
          "truth": "unknown"
        },
        {
          "op": "truthy",
          "truth": "unknown"
        },
        {
          "op": "all",
          "truth": "unknown"
        }
      ],
      "diagnostics": [],
      "valueTrace": [
        {
          "known": false,
          "residual": {
            "binding": "direct_requested_version"
          },
          "missingBindings": [
            "direct_requested_version"
          ],
          "diagnostics": [],
          "origin": "binding"
        },
        {
          "known": false,
          "residual": {
            "binding": "explicit_version"
          },
          "missingBindings": [
            "explicit_version"
          ],
          "diagnostics": [],
          "origin": "binding"
        }
      ]
    }
  },
  "outputs": {
    "known": false
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
  "gaps": [
    "direct_requested_version",
    "explicit_version"
  ]
}
```

## 18. latest_candidate — unresolved

Latest selection uses its own manager and source ordering, with root fallback when empty.

Executor: host; meaning: authored-program. Source: src/documents/versioning.py:159–166.

```json
{
  "inputs": {
    "when": {
      "truth": "unknown",
      "residual": {
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
      "missingBindings": [
        "direct_requested_version",
        "explicit_version"
      ],
      "trace": [
        {
          "op": "truthy",
          "truth": "unknown"
        },
        {
          "op": "not",
          "truth": "unknown"
        },
        {
          "op": "truthy",
          "truth": "unknown"
        },
        {
          "op": "not",
          "truth": "unknown"
        },
        {
          "op": "all",
          "truth": "unknown"
        }
      ],
      "diagnostics": [],
      "valueTrace": [
        {
          "known": false,
          "residual": {
            "binding": "direct_requested_version"
          },
          "missingBindings": [
            "direct_requested_version"
          ],
          "diagnostics": [],
          "origin": "binding"
        },
        {
          "known": false,
          "residual": {
            "binding": "explicit_version"
          },
          "missingBindings": [
            "explicit_version"
          ],
          "diagnostics": [],
          "origin": "binding"
        }
      ]
    }
  },
  "outputs": {
    "known": false
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
  "gaps": [
    "direct_requested_version",
    "explicit_version"
  ]
}
```

## 19. latest_file — unresolved

An empty latest-version selection returns the authorized root.

Executor: host; meaning: authored-program. Source: src/documents/versioning.py:165–166.

```json
{
  "inputs": {
    "when": {
      "truth": "unknown",
      "residual": {
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
      "missingBindings": [
        "direct_requested_version",
        "explicit_version"
      ],
      "trace": [
        {
          "op": "truthy",
          "truth": "unknown"
        },
        {
          "op": "not",
          "truth": "unknown"
        },
        {
          "op": "truthy",
          "truth": "unknown"
        },
        {
          "op": "not",
          "truth": "unknown"
        },
        {
          "op": "all",
          "truth": "unknown"
        }
      ],
      "diagnostics": [],
      "valueTrace": [
        {
          "known": false,
          "residual": {
            "binding": "direct_requested_version"
          },
          "missingBindings": [
            "direct_requested_version"
          ],
          "diagnostics": [],
          "origin": "binding"
        },
        {
          "known": false,
          "residual": {
            "binding": "explicit_version"
          },
          "missingBindings": [
            "explicit_version"
          ],
          "diagnostics": [],
          "origin": "binding"
        }
      ]
    }
  },
  "outputs": {
    "known": false
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
  "gaps": [
    "direct_requested_version",
    "explicit_version"
  ]
}
```

## 20. file_doc — unresolved

The selected file object is computed after root permission; explicit selection is not a second permission check.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1388–1399.

```json
{
  "inputs": {
    "expression": {
      "choose": {
        "test": {
          "op": "truthy",
          "language": "python",
          "value": {
            "binding": "direct_requested_version"
          }
        },
        "then": {
          "ref": "request_doc"
        },
        "else": {
          "choose": {
            "test": {
              "op": "truthy",
              "language": "python",
              "value": {
                "binding": "explicit_version"
              }
            },
            "then": {
              "ref": "candidate"
            },
            "else": {
              "ref": "latest_file"
            }
          }
        }
      }
    }
  },
  "outputs": {
    "known": false
  },
  "gaps": [
    "direct_requested_version",
    "documents",
    "explicit_version"
  ]
}
```

## 21. original_requested — unresolved

Only exact string true requests original; absent original must be supplied as null in complete query facts.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1369–1373.

```json
{
  "inputs": {
    "expression": {
      "test": {
        "op": "eq",
        "left": {
          "binding": "request.original"
        },
        "right": {
          "literal": "true"
        }
      }
    }
  },
  "outputs": {
    "known": false
  },
  "gaps": [
    "request.original"
  ]
}
```

## 22. use_archive — unresolved

Representation follows selected file archive availability and exact original request; root authorization remains unchanged.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1442–1448.

```json
{
  "inputs": {
    "expression": {
      "test": {
        "op": "all",
        "args": [
          {
            "op": "not",
            "arg": {
              "op": "truthy",
              "language": "python",
              "value": {
                "binding": "original_requested"
              }
            }
          },
          {
            "op": "truthy",
            "language": "python",
            "value": {
              "binding": "file_doc.has_archive_version"
            }
          }
        ]
      }
    }
  },
  "outputs": {
    "known": false
  },
  "gaps": [
    "file_doc.has_archive_version",
    "original_requested"
  ]
}
```

## 23. representation — unresolved

serve_file chooses archive or source representation.

Executor: host; meaning: authored-program. Source: src/documents/views.py:4941–4970.

```json
{
  "inputs": {
    "expression": {
      "choose": {
        "test": {
          "op": "truthy",
          "language": "python",
          "value": {
            "binding": "use_archive"
          }
        },
        "then": {
          "literal": "archive"
        },
        "else": {
          "literal": "original"
        }
      }
    }
  },
  "outputs": {
    "known": false
  },
  "gaps": [
    "use_archive"
  ]
}
```

## 24. selected_path — unresolved

File location is a supplied source-object field; no disk or business code is executed.

Executor: host; meaning: authored-program. Source: src/documents/views.py:4941–4970.

```json
{
  "inputs": {
    "expression": {
      "choose": {
        "test": {
          "op": "truthy",
          "language": "python",
          "value": {
            "binding": "use_archive"
          }
        },
        "then": {
          "field": {
            "of": {
              "ref": "file_doc"
            },
            "key": "archive_file"
          }
        },
        "else": {
          "field": {
            "of": {
              "ref": "file_doc"
            },
            "key": "source_file"
          }
        }
      }
    }
  },
  "outputs": {
    "known": false
  },
  "gaps": [
    "use_archive",
    "direct_requested_version",
    "documents",
    "explicit_version"
  ]
}
```

## 25. returned_file — unresolved

Conditional file-response descriptor after computed selection. Actual storage open, formatting, headers and external exceptions remain separate gaps, not a claimed successful network response.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1442–1448.

```json
{
  "inputs": {
    "expression": {
      "record": {
        "requested_id": {
          "field": {
            "of": {
              "ref": "request_doc"
            },
            "key": "id"
          }
        },
        "authorized_root_id": {
          "field": {
            "of": {
              "ref": "root_doc"
            },
            "key": "id"
          }
        },
        "file_document_id": {
          "field": {
            "of": {
              "ref": "file_doc"
            },
            "key": "id"
          }
        },
        "representation": {
          "ref": "representation"
        },
        "path": {
          "ref": "selected_path"
        },
        "disposition": {
          "literal": "attachment"
        }
      }
    }
  },
  "outputs": {
    "known": false
  },
  "gaps": [
    "documents",
    "request_doc.root_document_id",
    "related_root",
    "direct_requested_version",
    "explicit_version",
    "use_archive"
  ]
}
```

## Remaining gaps

["Request-level routing/authentication/permission checks require independent original-source review.","Storage existence/opening, filename formatting, FileResponse and header behavior are outside the finite selection descriptor.","ORM/database failure and external checker behavior are not executed; source summaries are authored and unreviewed.","documents","request_doc","related_root","request_doc.root_document_id","actor","actor.id","root_doc.owner_id","object_grant","request.version","direct_requested_version","explicit_version","request.original","file_doc.has_archive_version","original_requested","use_archive"]

## Draft proposals

[]
