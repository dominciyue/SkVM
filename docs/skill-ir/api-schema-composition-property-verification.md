# Finite composition oracle

Use independently handwritten Boolean-object predicates, not the witness generator or
its normalized schema, to check allOf/anyOf/oneOf semantics. Finite values comprise absent,
boolean true/false, integer0 and a wrong string for each named property, plus non-object
values. Two-property checks include an escaped property name, root/object/array containers
and reversed branch order. Four-property checks intersect two anyOf/oneOf groups.

Compare every finite value against the public source checker. Separately provide a known
source-valid/full-shape witness for each intersection and test construction. This distinguishes
an oracle error from a candidate-search gap: a conservative unresolved result is not false
validation, but is actionable construction coverage loss. No completeness claim outside
these finite values, no new real samples, no relaxed checker or changed status authority.
Only implement a targeted change if this concrete test exposes a gap.

Actual RED: all finite truth-table comparisons agree with the checker, but all four
intersections of anyOf/oneOf groups fail to construct a supplied known full witness.
The candidate-only allOf merge overwrites composition keys (or selects only one of the
different keys). This is a conservative construction gap, not a checker false acceptance.

Targeted design: after flattening same-instance allOf clauses, count anyOf/oneOf groups.
When more than one group exists, select a branch from each using mixed-radix choices
within the existing64variants, retain all base constraints and merge the selected clauses.
Single-group construction keeps its old path. Nested properties/items are still constructed
normally. Original whole-schema and shape checks remain authoritative, including oneOf
exclusivity. This is not exhaustive search beyond64 combinations and does not change the
supported schema language. Check a shared-property intersection to prevent lockstep branch
selection from missing a simple valid off-diagonal choice.
