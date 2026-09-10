# Existing skill-body relatedness check

D7 reports repository-distinct and non-identical bodies, not proven independent genealogy.
Before interpreting new-member counts, compare the existing54 primary SKILL bodies from
the six explicitly exposed acquisition indices. Read only kind=skill files with matching
archived hashes; nested resource SKILL files are not extra primary members. No acquisition,
new search, held-out read or execution of downloaded instructions.

Record raw SHA equality, normalized-token equality and all pairwise5-token shingle overlap.
Tokenize ASCII words/numbers/underscores and individual other Unicode letters/numbers,
case-fold, ignore punctuation/whitespace. This is lexical relatedness, not semantic plagiarism
detection. Report shared/union and directional containment with exact cardinalities.

Review flags fixed before running: raw/normalized equality; otherwise at least100shingles
in the shorter body and Jaccard>=0.5 or containment>=0.8 in either direction. Flagging
does not establish copying; low overlap does not prove independent authorship. Keep all
pairs, not only flagged pairs. Source membership and previous first-run outcomes stay intact.
Inspect flagged pairs' source identity and relevant text spans before interpreting them.

TDD exact copy, formatting/case normalization, embedded short body in a longer one and
unrelated text. Run once on the existing corpus, archive paths/hashes/full pair table and
summarize any implications for previously stated independent-member evidence.

Actual:54 bodies,1431 pairs,0 errors,2 flags. Both were already excluded: Pactflow's
exact copy and the explicitly attributed LambdaTest→FrancoStino spec-generator derivative
(Jaccard0.8451). Full original bodies and old membership review were personally checked;
no membership/runtime outcome changed. See results/skill-ir/skill-family-source-relatedness-20260911/
for the complete matrix, TDD evidence and interpretation. Low-overlap bodies remain
genealogically unproven. Run `bun scripts/skill-ir/skill-family-source-relatedness.ts --out=<new-dir>`.
