# Authorization inquiry package

This package turns the supplied Gitea authorization-review task into a reusable, source-assisted inquiry. The package is intentionally an inquiry input, not a security finding or control-graph answer.

## Normal use

1. Provide the package to an authorization-review process that supports `authorization-inquiry-input/v1`.
2. Make the revision identified by `sourceRef` available under the declared `sourceRoot` (`source`).
3. Restrict source inspection to `allowedPaths`.
4. Resolve the listed operations and questions in the declared `conformance` mode.
5. Trace the API route through shared controls, repository and issue-unit authorization, and the issue-creation effect before comparing behavior with the supplied policy.
6. Report source-backed conclusions separately from unresolved deployment or out-of-scope conditions.

The inquiry preserves the supplied repository, revision, path allowlist, task identity, policy text, policy origin and policy location. The policy is an explicit user premise and must be evaluated independently against the source; it is not a source-derived conclusion.

## What can be changed

The package may be reused with a different source revision or repository by updating the mechanical metadata and, where necessary, the path allowlist and entry hints. Questions and operations may be narrowed or extended while retaining their authorization-inquiry structure. A changed policy should be represented in the nested `inquiry.policy` object with its correct origin and location.

When adapting the package, keep:

- the root schema as `authorization-inquiry-input/v1`;
- the nested inquiry schema as `authorization-inquiry/v2`;
- `mode` as `conformance` unless the consuming workflow explicitly supports another mode;
- operation and question identifiers unique and stable;
- each question's `operationId` pointing to an operation;
- explicit user premises in question `premises` only when they are supplied assumptions, each marked with `origin: "user"`;
- the policy nested under `inquiry.policy`, without duplicating mode or policy at the input root.

## Limits

This package does not read, execute, modify, or validate the target Gitea source. It does not make network calls, resolve dependencies, inspect runtime configuration, or establish deployment facts. The allowed paths and source revision constrain what a later reviewer can substantiate. Behavior implemented outside those paths, generated or vendored code, reverse proxies, deployment middleware, feature flags, identity-provider configuration, database state, permissions configured at runtime, and version-specific integration behavior may remain unresolved unless separately supplied and authorized for review.

The questions require comparing authenticated repository readers with principals having write permission to the repository's issues unit. They also require checking route-level controls, shared authorization helpers, repository and issue-unit checks, relevant exceptions, and the issue creation effect. Endpoint-local checks must not be treated as the whole path without tracing those surrounding controls.

## Remaining original skill responsibilities

The original security-review skill remains responsible for the actual review process after this inquiry is consumed. In particular, the reviewer must resolve scope, identify languages and frameworks, audit relevant dependencies, scan secrets and exposure across the permitted material, perform the applicable vulnerability and data-flow analysis, inspect cross-file behavior, self-verify each finding, assign severity and confidence, and produce the required report format. Where the broader skill calls for patches, patches must be proposed for human review only and never applied automatically.

For this task specifically, the consuming reviewer must also preserve the distinction between source evidence, the independently supplied policy, and deployment limits. It must not answer from this package alone, invent source results, generate a definitive control graph without evidence, or treat the policy as proof that the implementation conforms.

No target code has been executed and no network call is required by this package.
