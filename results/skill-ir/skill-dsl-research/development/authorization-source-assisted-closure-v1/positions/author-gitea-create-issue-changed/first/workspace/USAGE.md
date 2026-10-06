# Authorization inquiry package usage

This package turns the supplied Gitea authorization task into a reusable, source-assisted inquiry. The input is pinned to repository `go-gitea/gitea`, revision `fc28937a8d772fe9e4025c9b5f24d5db4d86610b`, and the declared `source` root. A reviewer should use `inquiry.json` as the machine-readable contract and inspect only the listed `allowedPaths` unless the package is deliberately revised.

## Normal source-assisted use

1. Load `inquiry.json` and validate the `authorization-inquiry-input/v1` shape.
2. Resolve the source tree at the specified `sourceRef` under `source`.
3. Start at the CreateIssue route and registration hints, then follow calls through shared middleware and helpers into repository, unit, permission, issue, conversion, settings, and service code.
4. Answer each operation and question with precise file and line references from the pinned source. Trace both the route-level path and downstream issue-creation effect.
5. Separate authenticated repository-reader access from issue-unit write permission. Treat the policy in the package as an independently supplied conformance criterion, not as a conclusion.
6. Check exceptions and alternate controls, including shared middleware, repository/organization behavior, unit enablement, configuration, and other visible entry points in scope.
7. State whether the effective implementation conforms to the policy and identify source or deployment limits. Do not infer behavior from files outside the declared source scope without labeling that limitation.

The questions intentionally cover behavior, policy comparison, and scope. Empty `premises` arrays mean that no additional premise was supplied for that question. Where the policy is repeated as a question premise, it is explicitly marked with `origin: "user"`; no implementation result is preloaded.

## What may change

A maintainer may revise the package when the target revision, repository, source root, allowed paths, operation wording, or independently supplied policy changes. When changing authorization semantics, update the top-level mechanical metadata and the inquiry policy together, and adjust only the affected operations/questions. Keep `schemaVersion`, required fields, operation/question identifiers, and the policy origin/location valid. A new source revision should be re-reviewed rather than assumed equivalent.

The package is intentionally limited to the paths in `allowedPaths`. Expanding that list changes the review scope; removing a path can make a previously requested trace incomplete. Changes to the policy are substantive: they require a fresh conformance comparison and must not be treated as a formatting-only edit.

## Limits and safety

This package is an inquiry specification, not a source finding or authorization decision. It does not contain answers, a control graph, patches, or claims about the Gitea revision. It does not authorize access to additional repositories or files. Do not execute target code, invoke build or test commands, make network calls, or modify the target source while using it.

Source evidence may not reveal deployment-specific middleware, reverse-proxy authentication, plugins, configuration, alternate API versions, or entry points outside `allowedPaths`. Report those as limits or deployment-dependent conditions rather than silently assuming they do or do not exist. Distinguish authentication, repository access, unit enablement, permission checks, validation, and the final issue-creation side effect.

## Remaining original skill responsibilities

The original security-review skill remains responsible for its own workflow when that skill is invoked for a security review: resolve scope, identify languages/frameworks, audit dependencies first, scan secrets and exposure, perform the vulnerability and cross-file data-flow review, self-verify findings, assign severity and confidence, and produce the required security report and human-reviewable patches. Nothing in this authorization inquiry replaces those duties, changes the original skill's independent policy, or permits automatic patch application. Reviewers must preserve the original skill's reporting, evidence, and approval requirements when combining this package with that skill.
