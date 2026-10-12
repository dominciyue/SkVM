# Source program execution

Mode: edit; policy: progressive; status: current.

Source meanings remain unreviewed; this is not request-wide certification.

## Current result

```json
{
  "initialRevision": "7c4f56a05bdb2b77133ed12dd6fe9a3dfcf83f47dcac0dfa479955e75d2984d8",
  "currentRevision": "7c4f56a05bdb2b77133ed12dd6fe9a3dfcf83f47dcac0dfa479955e75d2984d8",
  "inputs": {},
  "termination": "return",
  "conditions": [
    {
      "step": "permission_guard",
      "identityGaps": [
        "actor",
        "documents"
      ]
    },
    {
      "step": "permission_guard",
      "test": {
        "op": "truthy",
        "language": "python",
        "value": {
          "binding": "permission_result"
        }
      },
      "otherwise": "Insufficient permissions"
    }
  ],
  "gaps": [
    "Guardian object-grant result is not supplied; actual authorization remains conditional.",
    "Explicit-version and representation branches are retained for the natural explanation from the cited source.",
    "documents",
    "external:has_perms_owner_aware",
    "actor",
    "permission_result",
    "request.version",
    "request_doc.root_document_id",
    "request.original",
    "file_doc.has_archive_version",
    "original_requested",
    "use_archive"
  ]
}
```

Detailed inputs and events: execution.json. In a live session use authorization_program_details with a stepId/questionId.

## 1. request_doc — unresolved

Author explanation not supplied.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1401–1415.

```json
{
  "outputs": {
    "known": false
  },
  "gaps": [
    "documents"
  ]
}
```

## 2. root_id — unresolved

Author explanation not supplied.

Executor: host; meaning: authored-program. Source: src/documents/versioning.py:146–156.

```json
{
  "outputs": {
    "known": false
  },
  "gaps": [
    "documents"
  ]
}
```

## 3. root_doc — unresolved

Author explanation not supplied.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1417–1420.

```json
{
  "outputs": {
    "known": false
  },
  "gaps": [
    "documents"
  ]
}
```

## 4. permission_result — unresolved

Author explanation not supplied.

Executor: host; meaning: authored-program. Source: src/documents/permissions.py:624–635.

```json
{
  "inputs": {
    "arguments": {
      "user": {
        "known": false,
        "gaps": [
          "actor"
        ]
      },
      "perms": {
        "known": true,
        "value": "view_document",
        "gaps": []
      },
      "obj": {
        "known": false,
        "gaps": [
          "documents"
        ]
      }
    },
    "name": "has_perms_owner_aware"
  },
  "outputs": {
    "known": false
  },
  "gaps": [
    "external:has_perms_owner_aware",
    "actor",
    "documents"
  ]
}
```

## 5. permission_guard — unresolved

Author explanation not supplied.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1421–1426.

```json
{
  "inputs": {
    "test": {
      "truth": "unknown",
      "residual": {
        "op": "truthy",
        "language": "python",
        "value": {
          "binding": "permission_result"
        }
      },
      "missingBindings": [
        "permission_result"
      ],
      "trace": [
        {
          "op": "truthy",
          "truth": "unknown"
        }
      ],
      "diagnostics": [],
      "valueTrace": [
        {
          "known": false,
          "residual": {
            "binding": "permission_result"
          },
          "missingBindings": [
            "permission_result"
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
    "permission_result",
    "actor",
    "documents"
  ]
}
```

## 6. latest_version — unresolved

Author explanation not supplied.

Executor: host; meaning: authored-program. Source: src/documents/versioning.py:159–166.

```json
{
  "outputs": {
    "known": false
  },
  "gaps": [
    "documents"
  ]
}
```

## 7. default_root_file_doc — unresolved

Author explanation not supplied.

Executor: host; meaning: authored-program. Source: src/documents/versioning.py:159–166.

```json
{
  "outputs": {
    "known": false
  },
  "gaps": [
    "documents"
  ]
}
```

## 8. file_doc — unresolved

Author explanation not supplied.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1388–1399.

```json
{
  "outputs": {
    "known": false
  },
  "gaps": [
    "request.version",
    "request_doc.root_document_id",
    "documents"
  ]
}
```

## 9. original_requested — unresolved

Author explanation not supplied.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1368–1373.

```json
{
  "outputs": {
    "known": false
  },
  "gaps": [
    "request.original"
  ]
}
```

## 10. use_archive — unresolved

Author explanation not supplied.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1442–1445.

```json
{
  "outputs": {
    "known": false
  },
  "gaps": [
    "file_doc.has_archive_version",
    "original_requested"
  ]
}
```

## 11. selected_file — unresolved

Author explanation not supplied.

Executor: host; meaning: authored-program. Source: src/documents/views.py:4948–4965.

```json
{
  "outputs": {
    "known": false
  },
  "gaps": [
    "use_archive",
    "request.version",
    "request_doc.root_document_id",
    "documents"
  ]
}
```

## 12. result — unresolved

Author explanation not supplied.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1442–1448.

```json
{
  "outputs": {
    "known": false
  },
  "gaps": [
    "documents",
    "request.version",
    "request_doc.root_document_id",
    "file_doc.has_archive_version",
    "original_requested",
    "use_archive"
  ]
}
```

## Draft proposals

3 retained proposals. Full candidates and diagnostics are in execution.json/report.json.

## Current raw draft

The raw author proposal is retained separately from the active program and candidate preview. A candidate result is not an adopted execution.

```json
{
  "draftRevision": "20eebc7e0043605833eb368aedcf631551b1f53e9f97a31c9dcb8d007ba9ca93",
  "activeRevision": "7c4f56a05bdb2b77133ed12dd6fe9a3dfcf83f47dcac0dfa479955e75d2984d8",
  "candidateRevision": "20eebc7e0043605833eb368aedcf631551b1f53e9f97a31c9dcb8d007ba9ca93",
  "candidateAdopted": true,
  "stepOrder": [
    "request_doc",
    "root_id",
    "root_doc",
    "permission_result",
    "permission_guard",
    "latest_version",
    "default_root_file_doc",
    "file_doc",
    "original_requested",
    "use_archive",
    "selected_file",
    "result"
  ],
  "diagnostics": [
    {
      "code": "question-property-unresolved",
      "path": "task-property-6807fa12799bbc2f1fec",
      "questionId": "authorization-and-selection-order",
      "message": "Select this original question's declared property requirement.",
      "severity": "error"
    },
    {
      "code": "question-property-source-unresolved",
      "path": "properties",
      "questionId": "authorization-and-selection-order",
      "message": "The property needs one current source occurrence in this question; source identity is not object equivalence. Candidates: [{\"path\":\"src/documents/views.py\",\"startLine\":1442,\"endLine\":1448,\"text\":\"return serve_file(\\n            doc=file_doc,\\n            use_archive=not self.original_requested(request)\\n            and file_doc.has_archive_version,\\n            disposition=disposition,\\n            follow_formatting=request.query_params.get(\\\"follow_formatting\\\", False),\\n        )\"},{\"path\":\"src/documents/views.py\",\"startLine\":1442,\"endLine\":1448,\"text\":\"serve_file(\\n            doc=file_doc,\\n            use_archive=not self.original_requested(request)\\n            and file_doc.has_archive_version,\\n            disposition=disposition,\\n            follow_formatting=request.query_params.get(\\\"follow_formatting\\\", False),\\n        )\"},{\"path\":\"src/documents/views.py\",\"startLine\":1444,\"endLine\":1445,\"text\":\"not self.original_requested(request)\\n            and file_doc.has_archive_version\"},{\"path\":\"src/documents/views.py\",\"startLine\":1444,\"endLine\":1444,\"text\":\"self.original_requested\"},{\"path\":\"src/documents/views.py\",\"startLine\":1444,\"endLine\":1444,\"text\":\"self.original_requested(request)\"},{\"path\":\"src/documents/views.py\",\"startLine\":1445,\"endLine\":1445,\"text\":\"file_doc.has_archive_version\"},{\"path\":\"src/documents/views.py\",\"startLine\":1447,\"endLine\":1447,\"text\":\"request.query_params\"},{\"path\":\"src/documents/views.py\",\"startLine\":1447,\"endLine\":1447,\"text\":\"request.query_params.get\"},{\"path\":\"src/documents/views.py\",\"startLine\":1447,\"endLine\":1447,\"text\":\"request.query_params.get(\\\"follow_formatting\\\", False)\"}]",
      "severity": "error"
    },
    {
      "code": "question-property-source-unresolved",
      "path": "properties",
      "questionId": "authorization-and-selection-order",
      "message": "The property needs one current source occurrence in this question; source identity is not object equivalence. Candidates: [{\"path\":\"src/documents/views.py\",\"startLine\":1442,\"endLine\":1448,\"text\":\"return serve_file(\\n            doc=file_doc,\\n            use_archive=not self.original_requested(request)\\n            and file_doc.has_archive_version,\\n            disposition=disposition,\\n            follow_formatting=request.query_params.get(\\\"follow_formatting\\\", False),\\n        )\"},{\"path\":\"src/documents/views.py\",\"startLine\":1442,\"endLine\":1448,\"text\":\"serve_file(\\n            doc=file_doc,\\n            use_archive=not self.original_requested(request)\\n            and file_doc.has_archive_version,\\n            disposition=disposition,\\n            follow_formatting=request.query_params.get(\\\"follow_formatting\\\", False),\\n        )\"},{\"path\":\"src/documents/views.py\",\"startLine\":1444,\"endLine\":1445,\"text\":\"not self.original_requested(request)\\n            and file_doc.has_archive_version\"},{\"path\":\"src/documents/views.py\",\"startLine\":1444,\"endLine\":1444,\"text\":\"self.original_requested\"},{\"path\":\"src/documents/views.py\",\"startLine\":1444,\"endLine\":1444,\"text\":\"self.original_requested(request)\"},{\"path\":\"src/documents/views.py\",\"startLine\":1445,\"endLine\":1445,\"text\":\"file_doc.has_archive_version\"},{\"path\":\"src/documents/views.py\",\"startLine\":1447,\"endLine\":1447,\"text\":\"request.query_params\"},{\"path\":\"src/documents/views.py\",\"startLine\":1447,\"endLine\":1447,\"text\":\"request.query_params.get\"},{\"path\":\"src/documents/views.py\",\"startLine\":1447,\"endLine\":1447,\"text\":\"request.query_params.get(\\\"follow_formatting\\\", False)\"}]",
      "severity": "error"
    },
    {
      "code": "question-property-source-unresolved",
      "path": "properties",
      "questionId": "authorization-and-selection-order",
      "message": "The property needs one current source occurrence in this question; source identity is not object equivalence. Candidates: [{\"path\":\"src/documents/views.py\",\"startLine\":1421,\"endLine\":1425,\"text\":\"request.user is not None and not has_perms_owner_aware(\\n            request.user,\\n            \\\"view_document\\\",\\n            root_doc,\\n        )\"},{\"path\":\"src/documents/views.py\",\"startLine\":1421,\"endLine\":1425,\"text\":\"request.user is not None and not has_perms_owner_aware(\\n            request.user,\\n            \\\"view_document\\\",\\n            root_doc,\\n        )\"},{\"path\":\"src/documents/views.py\",\"startLine\":1421,\"endLine\":1421,\"text\":\"request.user\"},{\"path\":\"src/documents/views.py\",\"startLine\":1421,\"endLine\":1425,\"text\":\"has_perms_owner_aware(\\n            request.user,\\n            \\\"view_document\\\",\\n            root_doc,\\n        )\"},{\"path\":\"src/documents/views.py\",\"startLine\":1422,\"endLine\":1422,\"text\":\"request.user\"},{\"path\":\"src/documents/views.py\",\"startLine\":1426,\"endLine\":1426,\"text\":\"return HttpResponseForbidden(\\\"Insufficient permissions\\\")\"},{\"path\":\"src/documents/views.py\",\"startLine\":1426,\"endLine\":1426,\"text\":\"HttpResponseForbidden(\\\"Insufficient permissions\\\")\"}]",
      "severity": "error"
    },
    {
      "code": "question-property-unresolved",
      "path": "task-property-8adbe7edc4c1218f5c1d",
      "questionId": "authorization-and-selection-order",
      "message": "Select this original question's declared property requirement.",
      "severity": "error"
    },
    {
      "code": "question-property-source-unresolved",
      "path": "properties",
      "questionId": "authorization-and-selection-order",
      "message": "The property needs one current source occurrence in this question; source identity is not object equivalence. Candidates: [{\"path\":\"src/documents/views.py\",\"startLine\":1437,\"endLine\":1441,\"text\":\"file_doc = self._get_effective_file_doc(\\n            resolved.request_doc,\\n            resolved.root_doc,\\n            request,\\n        )\"},{\"path\":\"src/documents/views.py\",\"startLine\":1437,\"endLine\":1441,\"text\":\"self._get_effective_file_doc(\\n            resolved.request_doc,\\n            resolved.root_doc,\\n            request,\\n        )\"},{\"path\":\"src/documents/views.py\",\"startLine\":1437,\"endLine\":1437,\"text\":\"self._get_effective_file_doc\"},{\"path\":\"src/documents/views.py\",\"startLine\":1438,\"endLine\":1438,\"text\":\"resolved.request_doc\"},{\"path\":\"src/documents/views.py\",\"startLine\":1439,\"endLine\":1439,\"text\":\"resolved.root_doc\"},{\"path\":\"src/documents/views.py\",\"startLine\":1444,\"endLine\":1445,\"text\":\"not self.original_requested(request)\\n            and file_doc.has_archive_version\"},{\"path\":\"src/documents/views.py\",\"startLine\":1444,\"endLine\":1444,\"text\":\"self.original_requested\"},{\"path\":\"src/documents/views.py\",\"startLine\":1444,\"endLine\":1444,\"text\":\"self.original_requested(request)\"},{\"path\":\"src/documents/views.py\",\"startLine\":1445,\"endLine\":1445,\"text\":\"file_doc.has_archive_version\"}]",
      "severity": "error"
    },
    {
      "code": "question-property-source-unresolved",
      "path": "properties",
      "questionId": "authorization-and-selection-order",
      "message": "The property needs one current source occurrence in this question; source identity is not object equivalence. Candidates: [{\"path\":\"src/documents/views.py\",\"startLine\":1421,\"endLine\":1425,\"text\":\"request.user is not None and not has_perms_owner_aware(\\n            request.user,\\n            \\\"view_document\\\",\\n            root_doc,\\n        )\"},{\"path\":\"src/documents/views.py\",\"startLine\":1421,\"endLine\":1425,\"text\":\"request.user is not None and not has_perms_owner_aware(\\n            request.user,\\n            \\\"view_document\\\",\\n            root_doc,\\n        )\"},{\"path\":\"src/documents/views.py\",\"startLine\":1421,\"endLine\":1421,\"text\":\"request.user\"},{\"path\":\"src/documents/views.py\",\"startLine\":1421,\"endLine\":1425,\"text\":\"has_perms_owner_aware(\\n            request.user,\\n            \\\"view_document\\\",\\n            root_doc,\\n        )\"},{\"path\":\"src/documents/views.py\",\"startLine\":1422,\"endLine\":1422,\"text\":\"request.user\"},{\"path\":\"src/documents/views.py\",\"startLine\":1426,\"endLine\":1426,\"text\":\"return HttpResponseForbidden(\\\"Insufficient permissions\\\")\"},{\"path\":\"src/documents/views.py\",\"startLine\":1426,\"endLine\":1426,\"text\":\"HttpResponseForbidden(\\\"Insufficient permissions\\\")\"}]",
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
