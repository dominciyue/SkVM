# Reusable inquiry package

This package captures a source-assisted authorization inquiry for the Paperless Download operation. The root `inquiry.json` is the complete input artifact: it preserves the supplied repository, revision, source root, allowed paths, behavior mode, operation, questions, and the explicit user premise that ownership and object grants are unspecified.

## Normal use

1. Resolve the repository at the exact `sourceRef` supplied in `inquiry.json`.
2. Treat `sourceRoot` as the source boundary and inspect only the listed `allowedPaths` (and files made available through the package's authorized source mechanism, if any).
3. Start at the Download operation and trace request routing, document lookup, authentication and permission branches, version selection, original/archive selection, and file-response construction.
4. Answer each question with precise source locations and distinguish:
   - the requested document identity;
   - the selected version or original/archive representation;
   - the object or resource used by each authorization check; and
   - the file ultimately returned.
5. Analyze both permitted and denied branches. Do not assume ownership, object grants, deployment routing, or other controls that are not established by the available source.
6. Mark unavailable source, configuration, identity, deployment, or grant facts explicitly as missing facts, together with the exact conclusion they prevent.

The package is reusable for the same inquiry shape at the recorded revision. If the target revision, repository, source boundary, allowed paths, operation semantics, or authorization assumptions change, update the corresponding metadata and inquiry text rather than silently reusing conclusions.

## What may change

A consumer may adapt the operation and question wording for a new revision or equivalent Download implementation, provided the authorization-inquiry schemas remain valid and the distinction between document identity, representation selection, authorization resource, and returned file is retained. User-origin premises must remain clearly marked as user premises. New premises must not be presented as source facts.

If additional source is needed, expand `allowedPaths` deliberately and record that scope change. If deployment behavior, identity-provider behavior, object grants, ownership, URL routing, storage configuration, or provider controls are needed, identify them as external validation requirements instead of inventing them. A changed mode or policy requires a new inquiry package or an explicit upstream authorization to change those fields; do not duplicate mode or policy at the input root.

## Limits and safety

This is an inquiry input, not an audit result or a correctness claim. It contains no source-derived answer, control graph, vulnerability determination, severity, or authorization conclusion. It does not authorize access to live systems, production data, other users' documents, external services, or shared infrastructure.

Use source inspection and, only when separately authorized and fully sandboxed, minimal local fixture-based checks. Never execute target code or make network calls for this package's normal use. Do not infer ownership or object grants from the user identity alone. Do not treat a selected version or archive as a separately authorized resource unless the source demonstrates that relationship.

## Remaining original skill responsibilities

The original security-audit skill remains authoritative for any later audit or validation work. In particular, it still requires preserving trust-boundary reasoning; naming the lower-trust principal, accepted input, intended control, crossed boundary, affected resource, and concrete result; separating source evidence from deployment facts; using precise `needs_validation` treatment for blocked external facts; and recommending only the smallest effective source fix when a confirmed issue is actually established.

For a full audit request, the original skill's complete workflow and independent duties still apply: reconnaissance; deterministic coverage planning and prior-run handling; isolated hunting waves; candidate consolidation and fresh validation; structured schema-validated findings and coverage ledgers; independent record verification; target-neutral reports; write isolation; exact source evidence; and explicit terminal-state/incompleteness reporting. Its sandbox rules remain unchanged, including no external network, empty allowlisted environments, read-only targets, bounded resources, dummy principals and secrets, and no live or shared-environment probing. This reusable package does not waive, compress, or replace those responsibilities.
