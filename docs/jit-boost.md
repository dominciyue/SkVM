# JIT-boost: runtime code templates

`jit-boost` builds executable templates from a warmup conversation log. During later runs, a promoted template can handle a matching task without another LLM call. A successful shortcut ends the agent run, so the template must cover the requested work.

## Concepts

A **boost candidate** binds three things:

- a **code signature** — a loose regex that matches the kind of tool-call code the agent tends to emit for this pattern;
- a **template** — the executable code that replaces the LLM call, with `${param}` holes for inputs/outputs;
- a **parameter spec** — how to extract template inputs from the user prompt (regex first, optional LLM fallback).

A **Solidifier** holds one entry per candidate. Each entry is observed during runs and progresses through a small state machine: after enough consecutive matches a candidate is **promoted** (eligible to short-circuit), and after enough consecutive failed executions it is **demoted** back. State is persisted per skill so observations accumulate across sessions.

## Compile pipeline

The compiler reads a real run's tool calls alongside the skill directory. The trace supplies observed code patterns; the skill supplies their context and conventions.

```
warmup conv log ─┐
                 ├─► Phase 1 ─► [candidate w/ signature, no template]
skill dir ───────┤            (one structured LLM call)
                 │
                 └─► Phase 2 ─► [candidate w/ template]
                              (headless agent over the skill dir)
```

Both phases are model- and harness-agnostic: Phase 1 dispatches through the provider registry, Phase 2 through the configured headless-agent driver.

- **Phase 1** asks an LLM to read the warmup's tool-call code and produce loose regex signatures + parameter definitions.
- **Phase 2** gives a headless agent the full skill directory and the Phase 1 candidates, and asks it to fill in working `${param}`-shaped templates that obey the skill's conventions.

The output is one `boost-candidates.json` per skill. A harness needs the runtime hooks below to consume it; this interface alone does not establish cross-model reliability.

## Runtime — Solidifier hooks

At run time the Solidifier installs three hooks into the agent loop:

- **before each LLM call** — if a candidate is promoted and the prompt's keywords match, extract its parameters, execute the template, and replace the would-be LLM response with the template's output. The agent run ends immediately on a successful short-circuit.
- **after each LLM call** — match each emitted tool call against every candidate's signature; bump the consecutive-match counter; promote when threshold is reached.
- **after each tool call** — currently unused by jit-boost itself.

A failed short-circuit increments a fallback counter; the agent loop continues normally and the candidate is demoted after enough consecutive failures.

## Integration — what an agent harness must provide

`jit-boost` is harness-agnostic. To integrate, an agent harness must accept a `RuntimeHooks` bag and, in its run loop:

1. Before each LLM call, invoke every `beforeLLM` hook and respect a "replace" return — skip the LLM call and end the run with the hook-supplied text and tool results.
2. After each LLM call, invoke every `afterLLM` hook with the response and iteration index.
3. Optionally, invoke `afterTool` hooks after each tool execution.

The interface lives at `src/runtime/types.ts` and the reference implementation is `src/adapters/bare-agent.ts`. CLI-wrapping adapters that delegate the loop to an upstream tool are not currently wired up — they would need either out-of-process event tailing or replacing the upstream loop entirely.

## When it helps, when it doesn't

The intended use is a repetitive task whose final artifact can be produced by one parameterized program, such as converting a known input format to JSON. Whether it helps a particular skill depends on successful matching, template coverage and measured execution costs.

Less useful when:

- The task fundamentally requires multiple tool calls and intermediate reasoning — a short-circuit ends the run, so the template would have to subsume every step.
- The agent does several exploratory calls before the matching one — promotion happens on observation, so the early calls still cost an LLM round; the win is the tail of the run.
- The agent's emitted code is highly variable — the regex either over-matches (false positives, demotion churn) or under-matches (no promotion at all).
