# Fixed-Source Authorization Assessment

Use only the neutral public brief below and the separately supplied common public requirements paragraph. Do not quote that common paragraph verbatim. Do not rely on an answer key, evaluator, or any unstated facts.

## Source

- Repository: https://github.com/usememos/memos
- Fixed source ref: `cb42e326ba9cc266a6a9570c53e0fe04c62793f4`
- Entry: `server/api/v1/memo_share_service.go:170-213`
- Boundary: `declared-entry`

Inspect only the specified source entry at the fixed ref and report what is visible there. Do not infer source facts that are not visible in the permitted source.

## Accepted policy

- `GetSharedMemo` needs no authentication.
- A current share token grants access only to its exact memo.
- Invalid or expired tokens, and inaccessible memos, yield `NOT_FOUND`.

## Premises

At `GetSharedMemo` handler entry:

- The caller is anonymous.
- If the token resolves, its associated memo is active, private, non-`SPACE`, and has a valid creator.
- Token existence and expiry are unspecified.

## Question

At `GetSharedMemo` handler entry, can an anonymous caller retrieve the private, active, non-`SPACE` memo associated with a supplied share token when this task does not say whether the token exists or is unexpired?

## Required response

Answer the question using the fixed source and the stated premises. Explain:

1. The source-visible branch for a valid token associated with the described memo.
2. The source-visible branches for an invalid or expired token.
3. Any branch for an inaccessible memo that is visible within the specified entry.
4. Which runtime facts are missing and prevent choosing a single concrete outcome, especially token existence and expiry.

Do not invent token state, a separate requested memo identity, deployment success, or any other runtime or source fact. Distinguish conditional conclusions from facts established by the premises.
