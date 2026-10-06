# Authorization inquiry usage

This inquiry was authored from the complete supplied security-review skill and the original natural request. It is intended to be consumed with the ordinary complete-original-skill entry:

```text
skvm run --prompt=<original-natural-request> --skill=<complete-original-SKILL.md> --model=<chosen-model> --adapter=bare-agent --authorization-scope=inquiry.json --authorization-domain-tools --authorization-strategy=operation-evidence-v1 --authorization-method=D1
```

The authored authorization configuration is in `inquiry.json`. It declares one requested user action, `create-issue`, because route inspection, inherited controls, object or unit checks, serializer validation, downstream issue creation, policy comparison, exceptions, and missing deployment facts all concern the same requested action. No source answers, control graph, or source-derived known values are included.

## Consumer scope and evidence

The consumer may use the published source-reading tools and deterministic authorization-check tools under `operation-evidence-v1`. The target source is the read-only copied snapshot in `source`, at the supplied revision and allowed paths. The target source must not be executed. Preserve `source` and the mechanical input files.

The inquiry preserves the supplied identity, repository, source revision, source root, allowed paths, conformance mode, and policy verbatim. The policy is an independently supplied user premise, not a conclusion derived from source.

## Complete skill duties that remain applicable

The complete original security-review skill remains responsible for the requested review, including:

- resolving the supplied source scope and identifying relevant Go/Gitea components;
- reading the applicable skill/reference material as needed;
- tracing the API route through authentication, repository and issues-unit checks, inherited authorization paths, validation, and the issue-creation effect;
- comparing authenticated repository readers with principals holding issue write permission;
- checking relevant alternate paths and exceptions rather than relying only on endpoint-local checks;
- performing cross-file reasoning and a self-verification pass;
- reporting the policy-conformance result with precise source locations, confidence, and source/deployment limits; and
- following the skill's reporting and human-review requirements, including presenting any proposed patches for review only and not applying them automatically.

Because this is a conformance inquiry, the report should clearly distinguish observed source behavior, the supplied policy, and facts that cannot be established from the snapshot.

## Source-only and authoring limits

The source snapshot is read-only and is not executed. Conclusions are limited to the supplied revision and allowed paths. They do not establish behavior of omitted files, other revisions, generated or vendored code outside scope, reverse-proxy or deployment middleware, runtime configuration, database state, feature flags, authentication-provider configuration, or routes and services not represented in the permitted source paths. Deployment verification is required for those facts.

The author's temporary restrictions applied only while creating this inquiry: no target execution, source patching, network access, software installation, model calls, or analysis/check commands. Those restrictions are not consumer instructions. The consumer may use the published source-reading and deterministic authorization-check tools, while still preserving the target source and not executing it.

Review each patch before applying. Nothing has been changed yet.
