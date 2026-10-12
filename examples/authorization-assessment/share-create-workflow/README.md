# Share creation: exact-document checks in a finite offline program

This developer-authored example follows ShareLinkViewSet, PassUserMixin,
ShareLinkSerializer.validate_document and has_perms_owner_aware in the supplied
Paperless snapshot. It retains the original independent policy: the caller needs
view_document on the exact document; add_sharelink or knowing an ID is insufficient.

The same public select, guard and return operators as Download compute the
endpoint global grant, exact document lookup, separate view_document global grant,
and owner/unowned/effective object-grant branches. Grant rows are supplied development
facts, not derived backend results or real deployment evidence. The allowed source
does not contain the inherited DRF implementation; those framework assumptions and
normal permission-checker construction remain explicit. The result is a conditional
analysis descriptor, never a database write or an actual share link.

Run from the repository root:

```powershell
bun src/index.ts authorization inquiry check --input=examples/authorization-assessment/share-create-workflow/inputs/allowed.json --domain-program=examples/authorization-assessment/share-create-workflow/program.json --strategy=question-checked-v1 --execution-policy=progressive --program-context=compact --out=results/local-share-create
bun src/index.ts authorization inquiry inspect --out=<printed-session-path>
```

Other inputs are denied, missing-principal, wrong-resource, wrong-actor and
unknown-grants. Empty grants are a known finite absence; omitted grants are unknown.
Changing the requested document while retaining a grant for another document must
deny. Source meanings remain unreviewed in the machine report; the offline review
is separate. This is development portability across two exposed tasks, not a claim
of new-skill automatic authoring. No model call is made, and the old sealed-unknown
ShareLink model request is not retried.
