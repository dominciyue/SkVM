# Branch-sensitive negative witness development

Observed gap: negative mutation uses only the first full valid witness. In the real Front
AnalyticsFilters anyOf, the first witness contains tag_ids. Mutating teammate_ids/channel_ids
etc leaves that first branch valid; some target parents are absent altogether. Fifteen
later-branch obligations remain unresolved. Five Adatree oneOf targets show a related risk.
Other failures (binary annotation format or required on a string) are not assumed fixable.

The permissive-competitor test additionally exposed a real crash: a string first witness
was treated as the parent of a property mutation. Non-object parents now yield no mutation,
retaining unresolved instead of throwing. Its original RED is retained with the branch tests.

Keep original minimal/full witnesses and already-covered negative rows unchanged. On an
unresolved anyOf/oneOf target, lazily seek alternative full valid witnesses using the same
source-driven candidate algorithm. Start after the first full search's successful variant;
all original plus fallback full-witness variants stay within the original0..63 range.
Deduplicate valid alternatives, and compute them once per schema. Each must pass the original
whole-schema oracle and full-shape checker before it becomes a mutation base. No source
projection is substituted for the checker. Unsupported/full-unavailable inputs stay as before.

Try existing targeted mutations on these alternatives and accept only an overall invalid
value with the exact original keyword, instance path, validation schema path and required
property identity. Do not relax checker, reinterpret valid-other-branch values as invalid,
delete obligations or infer HTTP status. No repository/operation identity in the algorithm.
There can be additional oracle work, but no extra full-witness search variants beyond64;
record real semantic changes and runtime observation, without promising general speedup.

TDD nested locally referenced anyOf and oneOf branches; retain original first full witness;
independent checker must reject wrong target/valid alternative substitutions. A permissive
anyOf competitor must remain unresolved when no overall invalid target value is available.
Run current witness/case regressions then one new12-input development comparison, retaining
original reports and failures. Derived source-duty integration uses the same implementation.
