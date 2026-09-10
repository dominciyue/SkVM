# Explicit pinned resource supplements

D7 full-body review found references outside lexical closure: a5c target process scripts,
anhtester root-relative workflows/rules, and alireza bold bare script names. Their real
pinned Git trees contain those resources. Do not label them missing solely because the
lexical planner missed them, or change the frozen runtime to infer their meaning.

Acquisition-only supplement: explicit skillId/path declarations, resolve the same pinned
commit tree, require regular blob plus exact size/OID, cache authenticated reads as before.
Write immutable supplemental files and a new source index, preserving initial sources.json
and its issues. Mark which issues were resolved by source review. No downloaded code runs.
Limit each supplement to1MiB and declared paths, no branch/default-head drift. Read complete
required resources before mapping. Follow-up analysis binds the supplemental source index.

Steps: RED pinned-blob verification test; implement supplementary CLI reusing createAcquirer;
fetch only the eight declared semantic resources; read, classify, map; verify frozen core
hashes then first-run. This is resource acquisition repair, not a new candidate success branch.

Further dependencies use --source-index=<prior-index.json> --output-index=<new-index.json>
with a separate config. Paths must be repository-relative and different; write-exclusive
output preserves old bytes and priorReview chains the earlier supplement evidence.
