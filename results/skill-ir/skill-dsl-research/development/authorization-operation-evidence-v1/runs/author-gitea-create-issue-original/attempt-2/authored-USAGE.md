# Usage

Run this authorization inquiry through the ordinary complete-original-skill entry documented by the host:

```text
skvm run --prompt=<original-natural-request> --skill=<complete-original-SKILL.md> --model=<chosen-model> --adapter=bare-agent --authorization-scope=inquiry.json --authorization-domain-tools --authorization-strategy=operation-evidence-v1 --authorization-method=D1
```

Run it from the work-directory root containing `inquiry.json`, `task.json`, and `source/`. The source root in the authored configuration is the relative path `source`.

## Authored configuration

`inquiry.json` is a complete `authorization-inquiry-input/v1` document. Its `inquiry` member is an `authorization-inquiry/v2` declaration that preserves the supplied:

- task ID: `gitea-create-issue`;
- repository: `go-gitea/gitea`;
- source revision: `fc28937a8d772fe9e4025c9b5f24d5db4d86610b`;
- source root and allowed paths;
- `conformance` mode; and
- independently supplied policy, verbatim.

The declaration contains one operation, `create-issue`, because the natural request asks about one actual user action: creating an issue through `CreateIssue` and its API route. Reporting duties are not modeled as separate operations. Every behavior, policy-comparison, and scope question uses that same operation ID.

## `operation-evidence-v1` expectations

Evidence for `create-issue` should address the complete requested authorization path, not merely the endpoint-local handler:

1. locate `CreateIssue` and its API route;
2. trace route-level authentication and authorization controls;
3. trace repository, issues-unit, and any relevant issue/object checks;
4. account for inherited permission paths and relevant exceptions;
5. account for request serializer or validation controls where they affect reaching the operation;
6. trace the issue-creation effect;
7. compare authenticated repository readers with principals holding write permission to the repository's issues unit;
8. compare observed behavior with the supplied policy; and
9. identify missing facts and precise source or deployment limits.

The host supplies no target question set, source answers, control graph, or source-derived known values. Those must not be invented.

## Remaining complete-skill duties

The consumer must use the complete original skill, not a reduced authorization-only substitute. All applicable original security-review duties remain, including scope resolution, relevant dependency/secrets review where supported by the authorized paths, cross-file data-flow analysis, self-verification, severity and confidence reporting, exact source citations, and concrete proposed patches for verified CRITICAL or HIGH findings.

Nothing is auto-applied. If patches are proposed, the report must state:

**Review each patch before applying. Nothing has been changed yet.**

The conformance report should clearly distinguish:

- source-observed behavior;
- the independently supplied policy;
- the compliance conclusion;
- relevant exceptions; and
- facts unavailable from the authorized source snapshot.

## Consumer tools and source-only limits

The consumer may use the published source-reading, deterministic authorization-check, and model-backed source-interpretation facilities available to the complete skill and invocation. The authoring-session restrictions do not prohibit those ordinary consumer tools.

The target source remains read-only and must not be executed or patched. It is an ordinary copied snapshot under `source/`, not a live deployment. Inspect only the paths authorized by `inquiry.json`.

Conclusions are limited to revision `fc28937a8d772fe9e4025c9b5f24d5db4d86610b` and the supplied allowed paths. Do not silently assume deployment facts such as runtime configuration, feature flags, reverse-proxy behavior, live route wiring, authentication-provider settings, repository or organization state, database contents, or effective permissions. If such facts are absent from authorized source evidence, report them as unavailable and explain how they limit the conclusion.

Preserve `source/` and all mechanical input files unchanged.
