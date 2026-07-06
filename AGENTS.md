# Project Rules for Skill IR AOT Optimization

These rules apply to all work in this repository unless a more specific `AGENTS.md` in a subdirectory overrides them.

## 1. Startup Checklist

Before starting any substantive work in this repository:

1. Read this file.
2. Run `git status --short --branch`.
3. Read the current project spec:
   - `docs/skill-ir/skill-ir-aot-optimization-spec.md`
4. Read the current implementation plan:
   - `docs/skill-ir/skill-ir-aot-optimization-plan.md`
5. Read the documentation for the specific component being changed.
6. If the component documentation does not exist yet, create it as part of the work.

Do not implement from memory when a relevant project document exists.

## 2. Plan And Spec Discipline

Work must stay aligned with the current spec and plan.

- Keep an explicit working plan before editing code.
- If the implementation reveals that the large direction should change, stop and explain the change before proceeding.
- If a smaller design detail changes, update the relevant documentation in the same stage of work.
- If the implementation plan becomes stale, update the plan before continuing.
- Keep visible work history through commits and conversation log updates.

The project direction is currently:

> Skill IR as an AOT pass inside SkVM for improving cross-agent, cross-environment, and cross-context skill stability.

## 3. Stage Logging

After each meaningful stage of work, append a short record to:

```text
D:\skill优化\conversation_log.md
```

The entry should include:

- Date.
- Stage or feature name.
- Files changed.
- Key decisions.
- Verification commands and results.
- Any plan/spec/documentation updates.
- Open risks or follow-up tasks.

When the work is tightly coupled to this repository, also prefer adding or updating repo-local documentation under:

```text
docs/skill-ir/
```

## 4. Component Documentation

Every non-trivial component or feature must have documentation. The documentation should be updated in the same stage as the code change.

At minimum, component documentation should cover:

- What the component does.
- How it is implemented at a high level.
- How it works at runtime.
- Public types, functions, commands, or files.
- Command-line usage when applicable.
- How to test or verify it.
- Important assumptions and failure modes.
- Notes for future modification.

This list is a floor, not a ceiling. Add or remove sections based on what makes the component understandable and maintainable.

## 5. Testing And Verification

For implementation work, use test-driven development:

1. Write the failing test first.
2. Run it and confirm it fails for the expected reason.
3. Implement the minimal code needed.
4. Run the test and confirm it passes.
5. Run the relevant broader verification before committing.

Before claiming a stage is complete, run fresh verification commands and record the results.

## 6. Git Hygiene

- Work on the `skill-ir-aot` branch or a dedicated feature branch, not `main`.
- Keep commits focused and named by purpose.
- Do not revert unrelated user changes.
- `origin` is the user's fork.
- `upstream` is the school repository and should not be pushed to.

## 7. Documentation Encoding

Write Markdown, JSON, and TypeScript files as UTF-8. Prefer ASCII for code unless the file already uses another convention or Chinese documentation is specifically useful.
