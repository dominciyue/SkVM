# AH anonymous semantic review

Each packet contains one fixed public task state, its accepted rubric and source
bytes, and anonymous model answers. The packet excludes arm names and final
method conclusions. Review every row and every rubric criterion independently.

For each criterion, `disposition` and `scope`, write:

- `status`: `supported`, `contradicted`, `missing`, or `uncertain`.
- `answerLocation`: a short location within `result` (for example
  `results[0].explanation`, `results[0].facts[2]`, or `scopeClaim`); use `null`
  when the answer omits the point.
- `reason`: one concise source-grounded sentence explaining the judgment.

`supported` requires an actually present, source-consistent answer; labels or
citations alone do not prove a causal relationship. Accept equivalent wording.
Use `uncertain` for genuinely ambiguous text or contested source evidence, and
explain what blocks a decision. Record contradictory claims even when the final
label happens to be correct. Distinguish actual allow/deny/unknown behavior from
policy-conformance disposition as the rubric directs. Review initial and repair
rows separately when both exist. Do not infer which arm generated a row.

Write one UTF-8 JSON file per assigned case to the supplied temporary directory,
with this structure (criterion IDs must match that case's rubric):

```json
{
  "schemaVersion": "authorization-ah-blind-decisions/v1",
  "caseId": "case-id",
  "reviewer": "independent-read-only-agent",
  "rows": {
    "Ranonymous": {
      "criteria": {
        "criterion-id": {"status": "supported", "answerLocation": "results[0].explanation", "reason": "The answer traces the stated control to the effect at the cited lines."}
      },
      "disposition": {"status": "supported", "answerLocation": "results[0].conclusion", "reason": "The reported policy label matches the fixed source behavior under this state."},
      "scope": {"status": "supported", "answerLocation": "scopeClaim", "reason": "The answer stays within the declared route and fixed source scope."}
    }
  }
}
```

The per-case source text and rubric are evaluator material and were never
opened by the generation runner. The output is a review draft. The main agent
validates its row coverage and source basis before recording the final review.
