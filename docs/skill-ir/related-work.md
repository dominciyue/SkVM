# Skill IR Related Work And Literature Calibration

Date: 2026-07-07

## Purpose

This note records the Task 7.5 literature calibration. The goal is not to restart the project design. The goal is to place the current Skill IR AOT work in a stronger research context and fold useful ideas into the implementation plan, benchmark design, and report framing.

The current project remains:

```text
Natural-language skill
  -> Skill IR
  -> validation
  -> AOT passes
  -> lowering
  -> controller / checker / adapter artifacts
  -> benchmark evaluation
```

The literature review strengthens the project in four places:

- research positioning
- benchmark design
- checker / runtime-enforcement semantics
- profile-guided repair interpretation

## Core Positioning

### SkVM / SkillRT

Primary source:

- [SkillRT / SkVM: Compiling Skills for Efficient Execution Everywhere](https://arxiv.org/abs/2604.03088)

This work is the closest system-level neighbor. It treats skills as code and LLMs as heterogeneous processors, then compiles skills for portability and efficiency across model-harness pairs. It also emphasizes capability profiling, environment binding, concurrency extraction, JIT code solidification, and adaptive recompilation.

Relationship to this project:

- We should present Skill IR as an IR-level pass inside the broader SkVM compilation story.
- The project should not claim to replace SkVM. It complements SkVM by making skill semantics explicit before optimization.
- Our emphasis is semantic stability: rules, steps, environment assumptions, runtime checks, and profile-guided repair.

Project adjustment:

- Future benchmark cases should record not only agent/environment/context, but also the capability gap that the IR pass is expected to address.
- The report should compare "capability-based compilation" from SkVM with our "semantic IR and checkable artifacts" angle.

## Skill Evaluation

Primary source:

- [SkillsBench: Benchmarking How Well Agent Skills Work Across Diverse Tasks](https://arxiv.org/abs/2602.12670)

SkillsBench argues that skill evaluation needs paired conditions and deterministic verifiers. It compares no-skill, curated-skill, and self-generated-skill conditions, and reports that curated skills help on average but can produce negative deltas on some tasks. It also observes that focused skills with a small number of modules can outperform large documentation bundles.

Relationship to this project:

- Our experiment matrix should measure improvement relative to the original natural-language skill and should explicitly track negative deltas.
- A single average success rate is not enough. We need worst-case success and variance across agents, environments, and contexts.
- Skill selection should favor focused modules that isolate one workflow or constraint family, rather than huge all-in-one skills.

Project adjustment:

- Task 8 benchmark matrix should include paired identifiers so systems can be compared on the same skill/task/context cell.
- The result schema should include `baselineSystem`, `deltaSuccess`, and `regression` or equivalent derived fields during analysis.
- Corpus construction should flag whether a skill is focused or broad, because breadth is a confounder.

## Runtime Enforcement And Verification

Primary sources:

- [AgentSpec: Customizable Runtime Enforcement for Safe and Reliable LLM Agents](https://arxiv.org/abs/2503.18666)
- [AgentGuard: Runtime Verification of AI Agents](https://arxiv.org/abs/2509.23864)
- [Runtime Compliance Verification for AI Agents / C-Trace](https://arxiv.org/html/2606.19242v1)

AgentSpec frames runtime safety as structured rules with triggers, predicates, and enforcement actions. AgentGuard frames runtime assurance as an inspection layer over agent I/O and abstract events. C-Trace expresses compliance as predicates over execution traces and intercepts tool invocations/model outputs.

Relationship to this project:

- Our `RuntimeCheck` is currently a compact version of this idea: target, assertion, command, and failure action.
- The lowering layer should continue to produce checker artifacts rather than merely prompt text.
- Runtime checks should be evaluated against traces and outputs where possible, not only read by an agent.

Project adjustment:

- Future checker specs should evolve toward `trigger`, `predicate`, and `enforcement` fields when v1 string assertions become too weak.
- Trace schema and benchmark metrics should preserve enough event data to compute rule violations and step coverage deterministically.
- A "No Checker" ablation remains important because it tests whether explicit runtime enforcement contributes beyond clearer instructions.

## Trace Feedback And Skill Repair

Primary sources:

- [Reflexion: Language Agents with Verbal Reinforcement Learning](https://arxiv.org/abs/2303.11366)
- [Voyager: An Open-Ended Embodied Agent with Large Language Models](https://arxiv.org/abs/2305.16291)
- [ToolEmu: Identifying the Risks of LM Agents with an LM-Emulated Sandbox](https://arxiv.org/abs/2309.15817)

Reflexion uses feedback signals and verbal memory to improve later trials without weight updates. Voyager uses execution feedback, errors, self-verification, and a skill library to improve code-like behaviors. ToolEmu shows that agent failures can be studied by emulating tool interactions and evaluating risky trajectories.

Relationship to this project:

- Our profile annotations are a structured alternative to free-form reflective memory.
- Instead of storing only reflective text, we turn repeated failures into typed IR changes: checks, guards, and recovery policies.
- ToolEmu supports the idea that failure-oriented evaluation and adversarial task design matter for agent reliability.

Project adjustment:

- Profile annotations should be described as typed trace feedback, not just logging.
- Benchmark tasks should include failure-provoking contexts, not only normal examples.
- Case studies should show the full chain: trace evidence -> profile annotation -> generated check/recovery -> improved run.

## Agent Interfaces

Primary source:

- [SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering](https://arxiv.org/abs/2405.15793)

SWE-agent argues that agent-facing interfaces affect performance. The agent is a user of tools and benefits from interfaces designed around its needs.

Relationship to this project:

- The adapter artifact should be treated as an agent-computer interface layer for skill execution.
- Environment guards and tool alternatives are not just convenience metadata; they shape the agent's interaction surface.

Project adjustment:

- Adapter documentation and later benchmark cases should track whether failures come from reasoning, tool availability, or poor interface affordances.

## What We Should Not Change Now

The literature does not justify a large redesign at this point.

Keep:

- `SkillIR` as the core representation.
- The current pass split: rule normalization, environment guards, profile-guided repair.
- Lowering into controller, checker, and adapter artifacts.
- The staged implementation plan.

Avoid for now:

- Full probabilistic model checking.
- A separate DSL parser for runtime rules.
- JIT recompilation.
- Automatic concurrency extraction.
- Replacing the existing schema before benchmark scaffolding exists.

These ideas can be discussed as future work after the current research loop runs end to end.

## Concrete Changes To The Project Plan

Task 8 should be sharpened:

- Build paired experiment cases, not only a Cartesian product.
- Preserve a stable `caseId` for comparing systems.
- Use `no-skill | original | ir-static | ir-pgo` as the current main table. Keep `ir-only` as an explicit ablation, `ir-profile` for archived comparisons, and `skvm-aot` outside the table until real upstream integration exists.
- Track focused vs broad skill packaging.
- Make negative deltas visible.

Task 9 should be sharpened:

- Analyzer should compute mean success, worst-case success, variance, and regression count.
- Analyzer should support per-system deltas against a baseline.

Task 10 should be sharpened:

- Experiment design should explicitly cite paired evaluation, deterministic verifiers, negative deltas, and ablations.

Report framing should be sharpened:

- Position this project as "semantic Skill IR for AOT skill optimization" inside the SkVM/SkillRT family.
- Explain that profile-guided repair is typed trace feedback, not prompt memory.
- Explain that checker lowering is a lightweight runtime enforcement path.

## How To Use This Note

Before writing benchmark, analyzer, experiment-design, report, or slides, read this file together with:

```text
docs/skill-ir/skill-ir-aot-optimization-spec.md
docs/skill-ir/skill-ir-aot-optimization-plan.md
docs/skill-ir/aot-passes.md
docs/skill-ir/lowering.md
```

If a future implementation changes the schema or pass behavior because of this literature review, update the relevant component document in the same commit.
