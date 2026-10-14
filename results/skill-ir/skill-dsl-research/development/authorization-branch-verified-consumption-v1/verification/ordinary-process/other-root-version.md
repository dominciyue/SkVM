# Source program execution

Mode: consume; policy: progressive; status: current.

Source meanings remain unreviewed; this is not request-wide certification.

## Current result

```json
{
  "outcome": {
    "execution": "conditional",
    "termination": "return",
    "requiredPremises": [],
    "executionGaps": [
      "external:ObjectPermissionChecker.has_perm",
      "file_doc.has_archive_version",
      "use_archive",
      "field-object-required:archive_file",
      "field-object-required:source_file",
      "field-object-required:id"
    ],
    "coverageGaps": [
      "Router dispatch, authentication, global permission, object grants, and deployment storage facts remain unresolved.",
      "Further source-visible root, permission, version, and representation branches remain to be authored.",
      {
        "id": "obligation-96d49612ec29c936ec10061d",
        "source": {
          "path": "src/documents/permissions.py",
          "startLine": 634,
          "endLine": 634,
          "sha256": "bb2af1efd059d69f489dea57fb579cf78967e607455820cedc2ea21226475065"
        },
        "text": "ObjectPermissionChecker(user)",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-c75486d6c7db74af8a22a638",
        "source": {
          "path": "src/documents/permissions.py",
          "startLine": 635,
          "endLine": 635,
          "sha256": "bb2af1efd059d69f489dea57fb579cf78967e607455820cedc2ea21226475065"
        },
        "text": "return obj.owner is None or obj.owner == user or checker.has_perm(perms, obj)",
        "kind": "return-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-1d7b625038e45aeee2be7589",
        "source": {
          "path": "src/documents/permissions.py",
          "startLine": 635,
          "endLine": 635,
          "sha256": "bb2af1efd059d69f489dea57fb579cf78967e607455820cedc2ea21226475065"
        },
        "text": "checker.has_perm(perms, obj)",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-21096bf68f93f8215e2c36df",
        "source": {
          "path": "src/documents/versioning.py",
          "startLine": 149,
          "endLine": 149,
          "sha256": "de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766"
        },
        "text": "doc.root_document_id is None",
        "kind": "branch-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-4bc711198e2d35a8cc50600a",
        "source": {
          "path": "src/documents/versioning.py",
          "startLine": 150,
          "endLine": 150,
          "sha256": "de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766"
        },
        "text": "return doc",
        "kind": "return-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-256ef80c1898a20bb51d8408",
        "source": {
          "path": "src/documents/versioning.py",
          "startLine": 151,
          "endLine": 151,
          "sha256": "de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766"
        },
        "text": "doc.root_document is not None",
        "kind": "branch-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-5cb48316cdba057d46143d97",
        "source": {
          "path": "src/documents/versioning.py",
          "startLine": 152,
          "endLine": 152,
          "sha256": "de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766"
        },
        "text": "return doc.root_document",
        "kind": "return-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-fec3809d362043f6f8dce8ac",
        "source": {
          "path": "src/documents/versioning.py",
          "startLine": 154,
          "endLine": 154,
          "sha256": "de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766"
        },
        "text": "_document_manager(include_deleted=include_deleted)",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-c8883607777d9d88cbe4e91e",
        "source": {
          "path": "src/documents/versioning.py",
          "startLine": 155,
          "endLine": 155,
          "sha256": "de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766"
        },
        "text": "manager.only(\"id\")",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-ddd342baa3ba5b12a989c0b3",
        "source": {
          "path": "src/documents/versioning.py",
          "startLine": 155,
          "endLine": 155,
          "sha256": "de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766"
        },
        "text": "manager.only(\"id\").filter(id=doc.root_document_id)",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-46d9d55473d312e61f189ed5",
        "source": {
          "path": "src/documents/versioning.py",
          "startLine": 155,
          "endLine": 155,
          "sha256": "de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766"
        },
        "text": "manager.only(\"id\").filter(id=doc.root_document_id).first()",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-f9b36f97b7382568793183f0",
        "source": {
          "path": "src/documents/versioning.py",
          "startLine": 156,
          "endLine": 156,
          "sha256": "de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766"
        },
        "text": "return root_doc or doc",
        "kind": "return-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-f53cd663cac0400399c6db2d",
        "source": {
          "path": "src/documents/versioning.py",
          "startLine": 164,
          "endLine": 164,
          "sha256": "de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766"
        },
        "text": "_document_manager(include_deleted=include_deleted)",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-8bddf5fe0d691479f97ca4b8",
        "source": {
          "path": "src/documents/versioning.py",
          "startLine": 165,
          "endLine": 165,
          "sha256": "de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766"
        },
        "text": "versions_newest_first(manager.filter(root_document=root_doc)).first()",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-32c65c7399ede7524ab681e7",
        "source": {
          "path": "src/documents/versioning.py",
          "startLine": 165,
          "endLine": 165,
          "sha256": "de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766"
        },
        "text": "versions_newest_first(manager.filter(root_document=root_doc))",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-ce801cdb4b2f2ae2b9c6ccb7",
        "source": {
          "path": "src/documents/versioning.py",
          "startLine": 165,
          "endLine": 165,
          "sha256": "de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766"
        },
        "text": "manager.filter(root_document=root_doc)",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-fa090a6682c41172fd6b1923",
        "source": {
          "path": "src/documents/versioning.py",
          "startLine": 166,
          "endLine": 166,
          "sha256": "de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766"
        },
        "text": "return latest or root_doc",
        "kind": "return-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-c47881f7e542166a391980f6",
        "source": {
          "path": "src/documents/versioning.py",
          "startLine": 175,
          "endLine": 175,
          "sha256": "de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766"
        },
        "text": "get_request_version_param(request)",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-0ade251e52adc93c4c70a090",
        "source": {
          "path": "src/documents/versioning.py",
          "startLine": 176,
          "endLine": 176,
          "sha256": "de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766"
        },
        "text": "not version_param",
        "kind": "branch-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-ad4e805198dba9ee6e0ee50f",
        "source": {
          "path": "src/documents/versioning.py",
          "startLine": 177,
          "endLine": 182,
          "sha256": "de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766"
        },
        "text": "return VersionResolution(\n            document=get_latest_version_for_root(\n                root_doc,\n                include_deleted=include_deleted,\n            ),\n        )",
        "kind": "return-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-3018c28d35e1eef664f2ffab",
        "source": {
          "path": "src/documents/versioning.py",
          "startLine": 177,
          "endLine": 182,
          "sha256": "de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766"
        },
        "text": "VersionResolution(\n            document=get_latest_version_for_root(\n                root_doc,\n                include_deleted=include_deleted,\n            ),\n        )",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-20c15dd69c2ed702ea886739",
        "source": {
          "path": "src/documents/versioning.py",
          "startLine": 178,
          "endLine": 181,
          "sha256": "de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766"
        },
        "text": "get_latest_version_for_root(\n                root_doc,\n                include_deleted=include_deleted,\n            )",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-dd40e23d02e445535f1ec354",
        "source": {
          "path": "src/documents/versioning.py",
          "startLine": 185,
          "endLine": 185,
          "sha256": "de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766"
        },
        "text": "int(version_param)",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-9c26a7b694c9f0e197ac3a61",
        "source": {
          "path": "src/documents/versioning.py",
          "startLine": 187,
          "endLine": 187,
          "sha256": "de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766"
        },
        "text": "return VersionResolution(document=None, error=VersionResolutionError.INVALID)",
        "kind": "return-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-86f510dbd317058965648859",
        "source": {
          "path": "src/documents/versioning.py",
          "startLine": 187,
          "endLine": 187,
          "sha256": "de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766"
        },
        "text": "VersionResolution(document=None, error=VersionResolutionError.INVALID)",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-aeaaf8bb42e8f8a9bfbb0dbb",
        "source": {
          "path": "src/documents/versioning.py",
          "startLine": 189,
          "endLine": 189,
          "sha256": "de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766"
        },
        "text": "_document_manager(include_deleted=include_deleted)",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-faf0f4bcb5a035c7ef842916",
        "source": {
          "path": "src/documents/versioning.py",
          "startLine": 190,
          "endLine": 190,
          "sha256": "de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766"
        },
        "text": "manager.only(\"id\", \"root_document_id\").filter(id=version_id)",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-c0fa8a3df85409d49f89389e",
        "source": {
          "path": "src/documents/versioning.py",
          "startLine": 190,
          "endLine": 190,
          "sha256": "de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766"
        },
        "text": "manager.only(\"id\", \"root_document_id\")",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-db2d61b0089ab34c5e53dddc",
        "source": {
          "path": "src/documents/versioning.py",
          "startLine": 190,
          "endLine": 190,
          "sha256": "de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766"
        },
        "text": "manager.only(\"id\", \"root_document_id\").filter(id=version_id).first()",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-166b624bdb8227610d965083",
        "source": {
          "path": "src/documents/versioning.py",
          "startLine": 191,
          "endLine": 191,
          "sha256": "de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766"
        },
        "text": "candidate is None",
        "kind": "branch-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-effbd7148251a2a7b73c4e9a",
        "source": {
          "path": "src/documents/versioning.py",
          "startLine": 192,
          "endLine": 192,
          "sha256": "de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766"
        },
        "text": "return VersionResolution(document=None, error=VersionResolutionError.NOT_FOUND)",
        "kind": "return-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-456c045396aaa175d0d3d5dc",
        "source": {
          "path": "src/documents/versioning.py",
          "startLine": 192,
          "endLine": 192,
          "sha256": "de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766"
        },
        "text": "VersionResolution(document=None, error=VersionResolutionError.NOT_FOUND)",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-9a53dcfe681376ee69f8ee07",
        "source": {
          "path": "src/documents/versioning.py",
          "startLine": 193,
          "endLine": 193,
          "sha256": "de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766"
        },
        "text": "candidate.id != root_doc.id and candidate.root_document_id != root_doc.id",
        "kind": "branch-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-817deabfd6d2827699a10cb8",
        "source": {
          "path": "src/documents/versioning.py",
          "startLine": 194,
          "endLine": 194,
          "sha256": "de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766"
        },
        "text": "return VersionResolution(document=None, error=VersionResolutionError.NOT_FOUND)",
        "kind": "return-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-b14b45fff0e523d89665a120",
        "source": {
          "path": "src/documents/versioning.py",
          "startLine": 194,
          "endLine": 194,
          "sha256": "de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766"
        },
        "text": "VersionResolution(document=None, error=VersionResolutionError.NOT_FOUND)",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-8e453de5c95dddf7a7f60ab6",
        "source": {
          "path": "src/documents/versioning.py",
          "startLine": 195,
          "endLine": 195,
          "sha256": "de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766"
        },
        "text": "return VersionResolution(document=candidate)",
        "kind": "return-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-1b85a8ee3bb29879a02da058",
        "source": {
          "path": "src/documents/versioning.py",
          "startLine": 195,
          "endLine": 195,
          "sha256": "de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766"
        },
        "text": "VersionResolution(document=candidate)",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-315b3897688fdd18937348ad",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 1370,
          "endLine": 1373,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "return (\n            \"original\" in request.query_params\n            and request.query_params[\"original\"] == \"true\"\n        )",
        "kind": "return-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-4709097cdd7ae4cc8091c4ab",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 1376,
          "endLine": 1376,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "get_request_version_param(request)",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-734da2050148f1662cef491d",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 1377,
          "endLine": 1381,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "resolve_requested_version_for_root(\n            root_doc,\n            request,\n            include_deleted=version_requested,\n        )",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-83a18a7c51184ce0b3d43865",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 1382,
          "endLine": 1382,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "resolution.error == VersionResolutionError.INVALID",
        "kind": "branch-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-5bb86404b9568ce0f707eb31",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 1383,
          "endLine": 1383,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "raise NotFound(\"Invalid version parameter\")",
        "kind": "error-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-aeb89b34abf1ed6b1e68c9ad",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 1383,
          "endLine": 1383,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "NotFound(\"Invalid version parameter\")",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-05e5c01d0451318c1df9a2da",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 1384,
          "endLine": 1384,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "resolution.document is None",
        "kind": "branch-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-f70eadcba42172c0ce634515",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 1385,
          "endLine": 1385,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "raise Http404",
        "kind": "error-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-b9d4db4d9110ed10f7f95ea3",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 1386,
          "endLine": 1386,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "return resolution.document",
        "kind": "return-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-916f10a06d73d8aa20078aea",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 1394,
          "endLine": 1397,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "(\n            request_doc.root_document_id is not None\n            and get_request_version_param(request) is None\n        )",
        "kind": "branch-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-eb52e13b662108d8d0a876d3",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 1396,
          "endLine": 1396,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "get_request_version_param(request)",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-3375afc7bf04b233f4be6a02",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 1398,
          "endLine": 1398,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "return request_doc",
        "kind": "return-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-18c1d1e50b08771ba08847d1",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 1399,
          "endLine": 1399,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "return self._resolve_file_doc(root_doc, request)",
        "kind": "return-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-12ddd92c37ddedeabd72c09e",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 1399,
          "endLine": 1399,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "self._resolve_file_doc(root_doc, request)",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-2bfdba999beeb001d81b63fb",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 1410,
          "endLine": 1413,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "manager.select_related(\n                \"owner\",\n                \"root_document\",\n            )",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-1da58c1ab50ff4100816e96b",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 1410,
          "endLine": 1413,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "manager.select_related(\n                \"owner\",\n                \"root_document\",\n            ).get(id=pk)",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-8ed0ef7c0af5c5eb787a7aa4",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 1415,
          "endLine": 1415,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "raise Http404",
        "kind": "error-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-a82d0026ee94ec8bd455e686",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 1417,
          "endLine": 1420,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "get_root_document(\n            request_doc,\n            include_deleted=include_deleted,\n        )",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-1dc49a4d6cdc61a6aae46ea8",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 1421,
          "endLine": 1425,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "request.user is not None and not has_perms_owner_aware(\n            request.user,\n            \"view_document\",\n            root_doc,\n        )",
        "kind": "branch-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-b3c130de9b77fc3b45821324",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 1421,
          "endLine": 1425,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "has_perms_owner_aware(\n            request.user,\n            \"view_document\",\n            root_doc,\n        )",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-c6b91078a5251ec6048f8120",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 1426,
          "endLine": 1426,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "return HttpResponseForbidden(\"Insufficient permissions\")",
        "kind": "return-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-6bd2538eed7fd615d5b616d8",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 1426,
          "endLine": 1426,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "HttpResponseForbidden(\"Insufficient permissions\")",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-4df0f79cfd5481fe2c889546",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 1427,
          "endLine": 1427,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "return ResolvedRequestDocs(request_doc=request_doc, root_doc=root_doc)",
        "kind": "return-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-7ad63b0ec995ba5a58e02e65",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 1427,
          "endLine": 1427,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "ResolvedRequestDocs(request_doc=request_doc, root_doc=root_doc)",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-45b0e22c7a0070d6364c9df6",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 1430,
          "endLine": 1434,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "self._resolve_request_and_root_doc(\n            pk,\n            request,\n            include_deleted=True,\n        )",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-b83a17dffaa456280da23e2e",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 1435,
          "endLine": 1435,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "isinstance(resolved, HttpResponseForbidden)",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-2d958c94f976fd06e50c5f38",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 1435,
          "endLine": 1435,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "isinstance(resolved, HttpResponseForbidden)",
        "kind": "branch-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-b8a11b5f3ebb1cba0075c44f",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 1436,
          "endLine": 1436,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "return resolved",
        "kind": "return-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-5c5889570a6193d477900f7c",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 1437,
          "endLine": 1441,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "self._get_effective_file_doc(\n            resolved.request_doc,\n            resolved.root_doc,\n            request,\n        )",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-d91c964076d74d2054543d6f",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 1442,
          "endLine": 1448,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "return serve_file(\n            doc=file_doc,\n            use_archive=not self.original_requested(request)\n            and file_doc.has_archive_version,\n            disposition=disposition,\n            follow_formatting=request.query_params.get(\"follow_formatting\", False),\n        )",
        "kind": "return-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-061c14179235013f8fb178b3",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 1442,
          "endLine": 1448,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "serve_file(\n            doc=file_doc,\n            use_archive=not self.original_requested(request)\n            and file_doc.has_archive_version,\n            disposition=disposition,\n            follow_formatting=request.query_params.get(\"follow_formatting\", False),\n        )",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-a24f45e381728f384a39777f",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 1444,
          "endLine": 1444,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "self.original_requested(request)",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-6558140e94502c9ebcd10d79",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 1447,
          "endLine": 1447,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "request.query_params.get(\"follow_formatting\", False)",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-29f3415758b2c1f19f5a1eec",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 1837,
          "endLine": 1837,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "return self.file_response(pk, request, \"attachment\")",
        "kind": "return-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-18c6c02b4856a6f951961b22",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 1837,
          "endLine": 1837,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "self.file_response(pk, request, \"attachment\")",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-c4b554d2cacca394439d989b",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 1839,
          "endLine": 1839,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "raise Http404",
        "kind": "error-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-418feb90bcb7728304fd5a74",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 4948,
          "endLine": 4948,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "use_archive",
        "kind": "branch-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-ec5730e7223719d90da3eb5e",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 4949,
          "endLine": 4949,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "TYPE_CHECKING",
        "kind": "branch-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-f8a3f44ca6d9f9d729e83c19",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 4956,
          "endLine": 4956,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "doc.get_public_filename(archive=True)",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-55d4dc2da19db59724107a60",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 4960,
          "endLine": 4960,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "TYPE_CHECKING",
        "kind": "branch-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-b5ae69c0608c5da8431c1b39",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 4964,
          "endLine": 4964,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "doc.get_public_filename()",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-e7dd11a0a2ee02f769ac1cf2",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 4967,
          "endLine": 4967,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "mime_type in {\"application/csv\", \"text/csv\"} and disposition == \"inline\"",
        "kind": "branch-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-95105d48471f0f467afef2f9",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 4970,
          "endLine": 4970,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "mime_type in {\"text/plain\", \"text/csv\", \"application/csv\"}",
        "kind": "branch-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-9263672cec74fe33934b79c4",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 4973,
          "endLine": 4973,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "FileResponse(file_handle, content_type=mime_type)",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-4227956e63a714dbb50ae8f4",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 4979,
          "endLine": 4985,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "normalize(\"NFKD\", filename.replace(\",\", \"_\"))\n        .encode(\n            \"ascii\",\n            \"ignore\",\n        )\n        .decode(\"ascii\")\n        .replace(\"\\\\\", \"_\")",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-325d00d9b31f0decfca25635",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 4979,
          "endLine": 4986,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "normalize(\"NFKD\", filename.replace(\",\", \"_\"))\n        .encode(\n            \"ascii\",\n            \"ignore\",\n        )\n        .decode(\"ascii\")\n        .replace(\"\\\\\", \"_\")\n        .replace('\"', \"_\")",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-c9c2e6802f33ea1cca31958f",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 4979,
          "endLine": 4979,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "normalize(\"NFKD\", filename.replace(\",\", \"_\"))",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-710b804c415000c833aac4f3",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 4979,
          "endLine": 4984,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "normalize(\"NFKD\", filename.replace(\",\", \"_\"))\n        .encode(\n            \"ascii\",\n            \"ignore\",\n        )\n        .decode(\"ascii\")",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-fcc772937c4579b68985f8f8",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 4979,
          "endLine": 4983,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "normalize(\"NFKD\", filename.replace(\",\", \"_\"))\n        .encode(\n            \"ascii\",\n            \"ignore\",\n        )",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-42fa2b2849c0a637a3fa2b1c",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 4979,
          "endLine": 4979,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "filename.replace(\",\", \"_\")",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-4b89beab64d4396f99f720a5",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 4988,
          "endLine": 4988,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "quote(filename)",
        "kind": "call-completion",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      },
      {
        "id": "obligation-889aa3d65c129c35c1e74ab6",
        "source": {
          "path": "src/documents/views.py",
          "startLine": 4995,
          "endLine": 4995,
          "sha256": "4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb"
        },
        "text": "return response",
        "kind": "return-exit",
        "origin": "source-structure",
        "stepIds": [],
        "declarationIds": [],
        "state": "unmapped",
        "diagnostics": []
      }
    ],
    "executedAssumptions": [],
    "outputFields": [],
    "legacyStatus": "conditional",
    "semanticSupport": "unreviewed",
    "requestOperationCertified": false
  },
  "initialRevision": "8fa9e08d6873ca9461dadd34ab42539fcea93922c4162d77e05734ade7097eae",
  "currentRevision": "8fa9e08d6873ca9461dadd34ab42539fcea93922c4162d77e05734ade7097eae",
  "inputBinding": {
    "scopeQuestionId": "requested-document-and-returned-file",
    "inputQuestionId": "requested-document-and-returned-file",
    "origin": "explicit",
    "datasetPresent": true,
    "diagnostics": []
  },
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
      "version": "20",
      "original": null
    }
  },
  "termination": "return",
  "conditions": [],
  "gaps": [
    "Further source-visible root, permission, version, and representation branches remain to be authored.",
    "external:ObjectPermissionChecker.has_perm",
    "file_doc.has_archive_version",
    "use_archive",
    "field-object-required:archive_file",
    "field-object-required:source_file",
    "field-object-required:id"
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

## 2. root_lookup — computed

Author explanation not supplied.

Executor: host; meaning: authored-program. Source: src/documents/versioning.py:146–156.

```json
{
  "outputs": {
    "value": null,
    "known": true
  },
  "gaps": []
}
```

## 3. root_doc — computed

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

## 4. owner_allows — computed

Author explanation not supplied.

Executor: host; meaning: authored-program. Source: src/documents/permissions.py:624–635.

```json
{
  "outputs": {
    "value": true,
    "known": true
  },
  "gaps": []
}
```

## 5. object_grant — unresolved

Author explanation not supplied.

Executor: host; meaning: authored-program. Source: src/documents/permissions.py:624–635.

```json
{
  "inputs": {
    "arguments": {
      "user": {
        "known": true,
        "value": 7,
        "gaps": []
      },
      "resource": {
        "known": true,
        "value": 10,
        "gaps": []
      },
      "permission": {
        "known": true,
        "value": "view_document",
        "gaps": []
      }
    },
    "name": "ObjectPermissionChecker.has_perm",
    "externalMatch": {
      "status": "no-fact",
      "sameNameCount": 0,
      "exactMatchCount": 0,
      "candidates": [],
      "candidatesTruncated": false,
      "instruction": "Only exact name and complete argument values bind a fact. Use source-supported explicit field projections to align supplied facts; never borrow another object or permission grant. Supplied facts remain unreviewed assumptions."
    }
  },
  "outputs": {
    "known": false
  },
  "gaps": [
    "external:ObjectPermissionChecker.has_perm"
  ]
}
```

## 6. authorization — computed

Author explanation not supplied.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1421–1426.

```json
{
  "inputs": {
    "test": {
      "truth": "true",
      "residual": null,
      "missingBindings": [],
      "trace": [
        {
          "op": "truthy",
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
          "value": true,
          "residual": {
            "literal": true
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

## 7. latest_visible — computed

Author explanation not supplied.

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
  "gaps": []
}
```

## 8. latest_all — computed

Author explanation not supplied.

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
  "gaps": []
}
```

## 9. requested_version_id — computed

Author explanation not supplied.

Executor: host; meaning: authored-program. Source: src/documents/versioning.py:173–178.

```json
{
  "outputs": {
    "value": 20,
    "known": true
  },
  "gaps": []
}
```

## 10. explicit_version — computed

Author explanation not supplied.

Executor: host; meaning: authored-program. Source: src/documents/versioning.py:169–195.

```json
{
  "outputs": {
    "value": null,
    "known": true
  },
  "gaps": []
}
```

## 11. file_doc — computed

Author explanation not supplied.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1375–1399.

```json
{
  "outputs": {
    "value": null,
    "known": true
  },
  "gaps": []
}
```

## 12. use_archive — unresolved

Author explanation not supplied.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1368–1373.

```json
{
  "outputs": {
    "known": false
  },
  "gaps": [
    "file_doc.has_archive_version"
  ]
}
```

## 13. selected_file — unresolved

Author explanation not supplied.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1442–1448.

```json
{
  "outputs": {
    "known": false
  },
  "gaps": [
    "use_archive",
    "field-object-required:archive_file",
    "field-object-required:source_file"
  ]
}
```

## 14. result — unresolved

Author explanation not supplied.

Executor: host; meaning: authored-program. Source: src/documents/views.py:1429–1448.

```json
{
  "outputs": {
    "known": false
  },
  "gaps": [
    "field-object-required:id",
    "file_doc.has_archive_version",
    "use_archive",
    "field-object-required:archive_file",
    "field-object-required:source_file"
  ]
}
```

## Draft proposals

0 retained proposals. Full candidates and diagnostics are in execution.json/report.json.

## Current raw draft

The raw author proposal is retained separately from the active program and candidate preview. A candidate result is not an adopted execution.

```json
{
  "activeRevision": "8fa9e08d6873ca9461dadd34ab42539fcea93922c4162d77e05734ade7097eae"
}
```

## Remaining original duties

- requested-document-and-returned-file: Explain how the request identifies the document and how the selected version and original/archive representation determine the file returned, including every relevant control branch.. Semantic coverage remains unreviewed; computed fields: none.
- authorization-and-selection-order: Identify the authorization checks and branches for the authenticated user, the requested document, and the selected version or original/archive representation, and state where those checks occur relative to selection of the returned file.. Semantic coverage remains unreviewed; computed fields: none.
- alternate-version-authorized-resource: Determine whether selecting another document version or choosing original versus archive changes the resource on which authorization is evaluated, or only changes the representation or file returned after authorization; distinguish all relevant branches.. Semantic coverage remains unreviewed; computed fields: none.
- missing-facts-and-conditional-conclusions: State precisely which source, configuration, deployment, ownership, or object-grant facts needed for a conclusion are unavailable, and identify the exact conclusion each missing fact blocks without assuming behavior outside the allowed evidence.. Semantic coverage remains unreviewed; computed fields: none.
