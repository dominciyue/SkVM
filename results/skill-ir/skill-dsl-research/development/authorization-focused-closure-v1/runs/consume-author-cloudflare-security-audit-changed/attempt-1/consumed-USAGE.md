# Authorization inquiry usage

This portable folder defines a focused, source-based authorization inquiry for `paperless-ngx/paperless-ngx` at source ref `126ec414a8b65158368653a2604ae58415e43103`. The copied source root is the relative path `source`, and inquiry access is bounded by the `allowedPaths` in `inquiry.json`.

The inquiry uses conformance mode and preserves the independently supplied owner-only sharing policy verbatim. Its questions separate the caller, exact document, proposed share, endpoint operation, object authorization, inherited permission behavior, serializer behavior, and persistence boundary. They ask the analysis to distinguish ownership from object-level `view_document`, global model permission, and document existence rather than treating those concepts as interchangeable.

## Check the declaration

From this portable folder, run:

```sh
skvm authorization inquiry check --input=inquiry.json --method=D1 --strategy=focused-closure-v1
```

This checks the inquiry declaration and its bounded focused closure. It does not execute the target application and is not a whole-repository security audit.

## Run the inquiry

Use a configured model identifier:

```sh
skvm authorization inquiry run --input=inquiry.json --out=runs --model=<configured-model-id> --method=D1 --strategy=focused-closure-v1
```

Then inspect the completed output:

```sh
skvm authorization inquiry inspect --out=runs
```

Do not treat an unknown or incomplete run as completed, and do not resend unknown completion as prior evidence.

## Revise the inquiry without analyzing source

Create an edit document shaped as follows:

```json
{
  "schemaVersion": "authorization-inquiry-edit/v1",
  "reason": "Explain why the declaration is changing",
  "operations": [
    {
      "kind": "request",
      "questionId": "policy-conformance-and-missing-facts",
      "statement": "Replacement request text"
    }
  ]
}
```

Supported operations are:

- `{"kind":"request","questionId":"...","statement":"..."}`
- `{"kind":"premises","questionId":"...","premises":[{"text":"...","origin":"user"}]}`
- `{"kind":"policy","policy":{"text":"...","origin":"user|external-policy","location":"..."}}`

Apply the edit mechanically:

```sh
skvm authorization inquiry edit --input=inquiry.json --edit=change.json --out=changed.json
```

Editing does not analyze the repository. Compare a changed declaration only against known completed, checked, bounded output produced from the same source and strategy:

```sh
skvm authorization inquiry compare --input=changed.json --previous=runs --strategy=focused-closure-v1
```

If reuse is valid, run the changed inquiry with the same configured model and prior output:

```sh
skvm authorization inquiry run --input=changed.json --out=changed-runs --model=<same-model-id> --method=D1 --strategy=focused-closure-v1 --previous=runs
```

A source change requires a fresh run rather than reuse of prior results.

## Remaining analysis duties

This configuration intentionally contains questions and user-supplied premises, not answers or source-derived conclusions. The inquiry runner still must:

1. Verify source identity and stay within the declared source root, source ref, and allowed paths.
2. Locate the `ShareLinkViewSet` route and trace request dispatch, action selection, inherited viewset behavior, permission selection, queryset use, serializer selection, validation, creation hooks, and persistence.
3. Establish how the request identifies the exact existing document and whether every relevant lookup or related-field queryset is principal-scoped.
4. Identify which controls run automatically and which require explicit invocation, especially Django REST Framework object-permission checks during create operations.
5. Distinguish endpoint/model authorization from authorization over the exact document.
6. Compare owner status, object-level `view_document`, global model permission, and existence-only lookup as separate cases.
7. Determine the last trusted authorization decision before the share is persisted and check whether later client-controlled or serializer-derived values can change the selected document.
8. Report source behavior and policy conformance without inventing deployment, identity, database, router, or framework facts absent from the bounded source.
9. State each decisive missing fact specifically and give a safe owner-observed or bounded local validation plan where source alone cannot resolve it.

No target code should be executed merely to use this declaration. Any later dynamic validation remains subject to the security workflow's sandbox requirements: no external network, an empty allowlisted environment, read-only target and toolchain, scratch-only writes, strict resource limits, dummy principals and data, and no probing of deployed or shared services. If those controls are unavailable, retain the issue as needing validation and describe the blocker rather than executing.

## Scope and broader responsibilities

This is a focused authorization-conformance inquiry, not a complete security audit, penetration test, or complete coverage claim. It does not replace broader reconnaissance, deterministic coverage planning, vulnerability hunting, independent candidate validation, structured findings, record verification, or final reporting.

If a later request asks for a full, comprehensive, or end-to-end audit, a penetration test, or report artifacts, use the complete security-audit workflow and all applicable companion guidance. That broader workflow must preserve trust-boundary evidence requirements, safe local-only execution, write isolation, coverage accounting, independent verification, severity only for confirmed findings, explicit `needs_validation` blockers, schema validation, and target-neutral reporting. A scoped or quick run must continue to present itself as partial coverage.
