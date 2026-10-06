# Authorization inquiry package

This package is a reusable, source-assisted inquiry input for the Paperless document **Download** operation at the pinned source revision. The root `inquiry.json` is intentionally an input package, not an answer: it contains no source conclusions and does not assert which object is authorized or returned.

## Normal use

1. Treat `sourceRoot` (`source`) as the root of the supplied checkout and inspect only the paths in `allowedPaths` unless the caller explicitly supplies a changed package.
2. Pin all source observations to `sourceRef` and identify the exact source ranges supporting each conclusion. Follow the Download entry point, request parsing, version/original/archive representation branches, authenticated-principal propagation, object/document lookup, authorization checks, and file response construction.
3. Answer the three inquiry questions separately:
   - describe behavior and every relevant control branch;
   - compare that behavior with the independent exact-object policy; and
   - distinguish available source facts from missing source or deployment facts.
4. Do not infer ownership, object grants, identity configuration, routing, proxy behavior, provider settings, or other deployment controls. If one is necessary to resolve the result, name the precise missing fact and a safe validation plan.
5. Preserve the distinction between the requested root document, a selected version, an original/archive representation, the principal whose authorization is evaluated, and the object whose file is actually returned. Selecting a version is not by itself evidence that the authorized resource changes.

The package uses `authorization-inquiry-input/v1` at the input root and `authorization-inquiry/v2` inside `inquiry`. `mode`, the operations, questions, premises, and policy belong inside `inquiry`; there is deliberately no duplicated root-level mode or policy. The supplied policy is retained unchanged, including its `external-policy` origin and location. Premises marked `user` are explicit user premises, not findings.

## What may change

A derived package may change `taskId`, repository, source revision, source root, allowed paths, operation wording, entry hints, questions, or explicit user premises when the natural task changes. Keep each question linked to an operation through `operationId`, retain one of the permitted question intents, and keep all schema-required fields and structural limits. Change the policy only when a new policy is independently supplied; do not silently turn an analyst inference into a policy or premise. If source scope changes, update `allowedPaths` and entry hints together and state the new scope.

When reusing this package for a later revision, do not carry conclusions forward merely because the repository name is unchanged. Re-run the source trace against the new pinned revision and re-evaluate relevant deployment facts. A changed source path or authorization branch requires fresh evidence.

## Limits and safety

This package authorizes inquiry over source data only. It does **not** authorize target execution, network calls, live endpoint probing, shared-service testing, credential use, persistence, availability testing, or modification of the target. Never execute target code or make network calls for this package. Use dummy principals and fixtures if a later, separately authorized workflow needs behavioral validation; retain only the minimum safe result and do not test production or shared infrastructure.

Source evidence establishes code paths, not facts omitted from the repository. Do not claim that a proxy, browser, identity provider, object-grant backend, packaging rule, deployment setting, or provider control exists or does not exist unless the allowed source or an explicitly supplied fact establishes it. Do not convert an unresolved external dependency into a confirmed vulnerability or assign severity to an unresolved `needs_validation` condition.

The inquiry is normally a focused guidance/conformance task. It does not by itself request the complete security-audit workflow, an output directory, findings artifacts, a coverage ledger, or a report. It must not be expanded into those artifacts merely because the original skill describes them.

## Remaining responsibilities from the original skill

The reusable input preserves the original skill's independent duties for any agent or parent using it:

- **Source-first boundary analysis:** for every candidate claim, identify the lower-trust principal, accepted input or action, intended control, crossed boundary, affected principal or resource, and concrete observed or owner-observable result. A missing best practice, generic crash, or self-impact is not automatically a finding.
- **Evidence discipline:** cite exact source evidence, distinguish source-established behavior from hypotheses, and use bounded local evidence only when a separately authorized sandbox can enforce no external network, empty allowlisted environment, read-only target/toolchain, scratch-only writes, and explicit resource limits. If those controls cannot be enforced, do not execute target code; record the blocker and a safe validation plan.
- **Deployment awareness:** respect proxy, provider, browser, identity, broker ACL, packaging, and topology controls as real possible controls. Where they are not in source, report `needs_validation` with the exact missing fact rather than guessing.
- **Severity and state discipline:** only confirmed records receive severity; calibrate impact to the demonstrated result; keep `needs_validation` distinct from confirmed and rejected; do not overstate a parser or runtime effect.
- **Smallest effective fix:** if a separate audit identifies a confirmed issue, recommend the narrowest source change at the last trusted decision point and a regression test. This package itself does not modify target source.
- **Full-audit distinction:** only an explicit audit, pen-test, comprehensive/end-to-end review, or report-artifact request activates all six phases: reconnaissance; coverage-led hunting; candidate validation; structured output and schema validation; independent record verification; and target-neutral reporting. That workflow must preserve deterministic coverage, prior-run handling, profile and budget gates, write isolation, independent verification, exact terminal-state rules, and the original `findings.json`, coverage-ledger, and report responsibilities. A focused inquiry such as this one remains guidance mode unless the user explicitly changes the task.

The package therefore supplies the task-specific authorization questions while leaving the original skill's evidence, safety, trust-boundary, uncertainty, reporting, and full-audit responsibilities intact.
