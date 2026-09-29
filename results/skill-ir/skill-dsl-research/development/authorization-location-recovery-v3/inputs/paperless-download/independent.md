# Fixed-Source Authorization Assessment

Assess the authorization behavior of the specified handler using only the fixed source entry and the neutral brief below. Do not rely on other repository revisions, inferred implementation details, external documentation, or unstated assumptions. A common public requirements paragraph is supplied separately to all methods; do not quote it verbatim.

## Source

- **Repository:** https://github.com/paperless-ngx/paperless-ngx
- **Fixed source ref:** `126ec414a8b65158368653a2604ae58415e43103`
- **Entry:** `src/documents/views.py:1834-1839`
- **Inspection boundary:** `declared-entry`

Use the source at the fixed ref and entry as the controlling evidence. Do not invent source facts or decide the result from policy alone.

## Accepted policy

A download must pass the owner-aware `view_document` check on the root document before serving any selected file version.

## Question

At `DocumentViewSet.download` handler entry, can an authenticated user download a requested version document they own when its root document is owned by someone else and they lack an object view grant on that root?

## Premises

Assume all of the following at handler entry:

- The authenticated caller has the required global document view permission.
- The caller owns the requested version.
- A different user owns the existing root document.
- The caller has no object view grant on that root.
- The documents exist.

## Required response

Give a source-grounded authorization assessment at the declared-entry boundary. Explicitly:

1. Identify which object is checked by the relevant authorization logic.
2. Identify which file object would be served if the request proceeds.
3. Keep version ownership distinct from authorization on the root document.
4. Explain how the fixed source relates to the accepted policy and the stated premises.
5. State the conclusion only from the evidence available at the specified source entry; do not add facts from elsewhere in the repository.
