# Source program execution

Mode: edit; policy: progressive; status: current.

Source meanings remain unreviewed; this is not request-wide certification.

## Current result

```json
{
  "initialRevision": "bb3330581ee139117f78e1a449c1767c39c4b68e23029a25ff41f4b8f5ab3da2",
  "currentRevision": "bb3330581ee139117f78e1a449c1767c39c4b68e23029a25ff41f4b8f5ab3da2",
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
    "request_document_id": 10,
    "authorized_root_id": 10
  },
  "conditions": [],
  "gaps": [
    "Whether the authenticated actor has the GET model permission required by PaperlessObjectPermissions is not supplied.",
    "For a non-owner root document, the result of the Guardian object-permission lookup is not supplied.",
    "This compact executable scenario models lookup and the owner/unowned authorization shortcuts; version and representation branches are explained from source in the natural answer."
  ]
}
```

Detailed inputs and events: execution.json. In a live session use authorization_program_details with a stepId/questionId.

## 1. request_doc — computed

Author explanation not supplied.

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

## 2. root_doc — computed

Author explanation not supplied.

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

## 3. root_owner_guard — computed

Author explanation not supplied.

Executor: host; meaning: authored-program. Source: src/documents/permissions.py:624–635.

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

## 4. scenario_result — computed

Author explanation not supplied.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1421–1427.

```json
{
  "outputs": {
    "value": {
      "request_document_id": 10,
      "authorized_root_id": 10
    },
    "known": true
  },
  "gaps": []
}
```

## Draft proposals

2 retained proposals. Full candidates and diagnostics are in execution.json/report.json.
