# Usage

This inquiry is authored for the complete original `security-review` skill and the supplied Gitea authorization-conformance task. Run it with the ordinary complete-original-skill entry:

```text
skvm run --prompt=<original-natural-request> --skill=<complete-original-SKILL.md> --model=<chosen-model> --adapter=bare-agent --authorization-scope=inquiry.json --authorization-domain-tools --authorization-strategy=operation-evidence-v1 --authorization-method=D1
```

The command is intended to be run from the directory containing `inquiry.json`; `sourceRoot` is `source`, so the copied source snapshot remains relative to the inquiry. The authored authorization configuration is in `inquiry.json` and preserves the supplied task identity, repository, source revision, allowed paths, `conformance` mode, and policy verbatim.

## Authored operation and evidence scope

The inquiry declares one operation, `create-issue`, because the request concerns one user action: creating an issue through CreateIssue and its API route. All requested evidence duties refer to that same `operationId`:

- trace the API route, route-level controls, repository and issues-unit or issue-object checks, validation/serialization controls, inherited permission paths, relevant exceptions, and the issue-creation effect;
- compare authenticated repository readers with principals having write permission to the repository's issues unit;
- compare the traced behavior with the independently supplied policy; and
- state source, deployment, and missing-fact limits.

`operation-evidence-v1` should require evidence tied to this single operation and should not treat endpoint-local checks as the complete authorization path. Reporting responsibilities are not separate operations.

## Remaining complete-skill duties

The original security-review skill remains in force except where the task's authorization scope narrows the work. The agent must still follow the complete skill's applicable duties, including:

1. resolve the supplied scope and identify the relevant Go/Gitea components;
2. read the applicable bundled reference material as needed;
3. audit dependencies before source review where dependency manifests are within the authorized scope;
4. inspect secrets and exposure risks only within the authorized source scope;
5. perform the requested authorization/data-flow review across the allowed paths;
6. self-verify each potential finding and distinguish genuine behavior from false positives or missing facts;
7. report findings with severity, confidence, exact source locations, and clear risk explanations when applicable; and
8. propose patches for applicable CRITICAL or HIGH findings, while stating: **Review each patch before applying. Nothing has been changed yet.**

The task is specifically a policy-conformance inquiry. The report should therefore clearly separate observed source behavior, policy comparison, exceptions, and uncertainty rather than inventing source behavior or deriving the policy from code.

## Source-only and deployment limits

- Review only `source` and the allowed paths supplied in `inquiry.json`; do not assume facts from files outside that scope.
- The source is an ordinary copied snapshot for revision `fc28937a8d772fe9e4025c9b5f24d5db4d86610b`, not a live deployment.
- Do not execute target code, patch the source, install software, use the network, call another model, or launch analysis/check commands as part of this task.
- The snapshot alone cannot establish deployment-specific route registration, reverse-proxy behavior, authentication middleware configuration, feature flags, organization/repository settings, external identity-provider behavior, database state, or runtime permission data unless those facts are explicitly represented in the authorized source.
- Do not infer source answers, a control graph, or known values from the host. If a deployment fact is absent, report it as unavailable and explain how that limits the conclusion.
- Preserve the source and mechanical files. Nothing in the source tree is to be changed by this inquiry.
