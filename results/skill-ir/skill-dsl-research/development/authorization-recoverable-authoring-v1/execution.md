# Current automatic program: source reading, writing and execution

Origin: A0 model raw, selected before C0; no developer semantic edits. All results are read-only local computation, with zero target execution.

## Actual authoring process

A0 first used 53 tool units. Two malformed/unconfirmed-source proposals were rejected; the adopted two-step helper program returned only requested_document_id=10. Its full raw and answer are preserved. The shared continuation decision omitted self-declared source gaps despite 11 total units remaining.

After the diagnosed shared fix, the unique scope-feedback confirmation resumed the known completed durable thread. Three recorded turns used 22 total tool units. The model read source, patched its own draft and then supplied the selected 12-step raw. The original and repair costs remain separate.

| Tool unit | Actual action | Source |
|---:|---|---|
| 2 | authorization_program_details |  |
| 3 | source_read | src/documents/views.py:1008–1027 |
| 4 | source_read | src/documents/views.py:1368–1448 |
| 5 | source_read | src/documents/views.py:1834–1839 |
| 6 | source_read | src/documents/views.py:2503–2516 |
| 7 | source_read | src/documents/views.py:4941–4995 |
| 8 | source_read | src/documents/versioning.py:136–195 |
| 9 | source_read | src/documents/permissions.py:30–53 |
| 10 | source_read | src/documents/permissions.py:624–635 |
| 11 | source_read | src/paperless/urls.py:74–100 |
| 12 | source_read | framework/rest_framework-3.18.1/rest_framework/views.py:404–421 |
| 13 | source_read | framework/rest_framework-3.18.1/rest_framework/views.py:490–523 |
| 14 | source_read | framework/rest_framework-3.18.1/rest_framework/permissions.py:233–246 |
| 15 | source_read | framework/rest_framework-3.18.1/rest_framework/generics.py:79–105 |
| 16 | authorization_program_patch |  |
| 18 | authorization_program_details |  |
| 19 | authorization_program_patch |  |
| 20 | authorization_program_patch |  |
| 21 | authorization_program |  |

## Default execution

```json
{
  "status": "conditional",
  "returned": {
    "requested_document_id": 10,
    "authorization_root_document_id": 10,
    "returned_document_id": 11,
    "archive_representation": true,
    "returned_file": "v1-archive.pdf"
  },
  "termination": "return"
}
```

| Step | Operation | Outcome |
|---|---|---|
| request_doc | select | computed |
| root_doc | value | computed |
| owner_or_unowned | value | computed |
| guardian_grant | external | unresolved |
| authorization_allowed | value | computed |
| authorization_guard | guard | computed |
| latest_version | select | computed |
| file_doc | value | computed |
| original_requested | value | computed |
| use_archive | value | computed |
| selected_file | value | computed |
| lookup_result | return | computed |

The descriptor is conditional, not a permitted production download. Actual gaps:

- The actual Guardian ObjectPermissionChecker.has_perm result is unspecified and remains external.
- The development input has no explicit version parameter; invalid, not-found, unrelated, empty-string, and explicit include-deleted version branches are retained for the natural source explanation rather than computed here.
- Authentication configuration, global model permission, deployment controls, actual grants, and backing-file existence are not supplied runtime facts.
- This function contract does not certify the complete request operation or discharge the other original questions.
- external:ObjectPermissionChecker.has_perm

## Same-byte variation results

Return field names are mapped only for evaluation, according to the model raw return expressions. Exact JSON-shape comparison is also retained.

| Scenario | Values match | Values/rejection and conditions match |
|---|---|---|
| root-default | true | true |
| empty-version | false | false |
| explicit-version | true | true |
| explicit-deleted-version | false | false |
| invalid-version | false | false |
| other-root-version | false | false |
| ordering | false | false |
| ordering-tie | false | false |
| denied | false | false |
| granted | true | false |
| root-fallback | true | true |
| no-external | true | false |
| reordered | true | true |
| unrelated-document | true | true |

This exposed development matrix does not prove complete request behavior. Empty/explicit-deleted/invalid/unrelated version, order and permission branches still require source authoring. Original four-question natural explanations are evaluated separately.

## Inspectable evidence

- [Selected model raw](authoring/automatic-program.json)
- [First raw](authoring/automatic-program-A0-first.json)
- [Full variation events](evaluation/selected/variation-matrix.json)
- [First answer](evaluation/answers/A0-first.txt)
- [Final repair answer](evaluation/answers/A0-scope-feedback.txt)
- [Author timeline](evaluation/timeline-A0-scope-feedback.json)
- [Portable fresh/previous verification](verification/portable.json)
- [Changed-source withdrawal](verification/source-change.json)

Raw session paths and thread/turn identities remain in attempts.json; local raw archives retain every event, checkpoint and answer.

## Completed consumption and maintenance

The selected raw remains unchanged. C0 and C1 actually received it with no program/patch write tools; the C1 previous archive restored eligible materials and recomputed the empty input, never the prior answer. C1 explicitly corrected file11 to source-backed file12 in prose. The program itself still computes file11. C2 made 26 tool calls before the 45-minute timeout, delivered no answer, and a single later read-only query found its interrupted terminal. The original local unknown record remains intact.

| Purpose | Input (cache included) | Output | Account tools / native units | Duration ms | Natural four-question quality |
|---|---:|---:|---:|---:|---|
| C0 | 1,753,278 | 9,854 | 40 / 48 | 485,351 | partial/full/full/full |
| B0 | 814,118 | 6,435 | 61 / 61 | 365,116 | partial/full/full/full |
| B1 | 506,229 | 7,439 | 54 / 54 | 374,077 | partial/full/full/full |
| C1 | 1,243,189 | 10,766 | 58 / 58 | 607,858 | partial/full/full/full |
| C2 | 592,430 observed partial | 2,061 observed partial | 26 / 34 | 2,701,530 local timeout | not delivered |
| S0 | 2,529,934 | 9,569 | 46 / 46 | 538,728 | partial/full/full/partial |

Both paired consumers used more input/output and time with no full-question quality gain. C0 used fewer tools; this does not establish overall savings. Selected A0 authoring plus repair adds 3,528,206 input and 24,812 output, separately from independent A1 and S0. Total observed usage is 15,126,421 input (including 13,788,416 cached) and 84,408 output, including partial C2 usage. Final USD, hidden requests, C2 final usage, developer/scout cost and human effort are unknown.

S0 restored the selected raw against a copied source where the permission condition lost its negation. Five source-dependent materials were invalidated, three retained, and old computed return was withdrawn. In one turn, the model read the changed source and made one atomic guard patch. Current owner=true then makes the continuation guard false: execution rejects with HTTP403 before version/file selection, retaining unresolved external conditions. The original source and fixed consumer raw are unchanged. This is a successful local source-change repair, not full program completion.

See [comparison](evaluation/comparison.json), [quality](evaluation/quality.json), [provenance](verification/provenance-and-consumption.json), [C2 reconciliation](verification/C2-disposition.json), and [summary](summary.json). Remaining raw gaps are empty/explicit/invalid versions, root lookup, ordering and external argument matching; whole-operation properties remain uncertified. Engineering and the finite queue are complete; the automatic main chain and research goal are not.
