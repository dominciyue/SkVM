# Optimized skill usage

Delivery: `draft`; bounded behavior: `not-run`.

## Use this package

Use the package as an ordinary skill:

`skvm run --prompt "<task>" --skill <package-path> --workdir "<project-dir>" --model "<provider/model>"`

The original task result remains in its original work directory. This package is a separate development candidate.

## Optimized steps

- `route-contract-bound-work` (restructure-docs, selected)
  - inputs/parameter sources: task-supplied machine-readable contract path; source document path
  - outputs: only outputs declared by the active task contract
  - preconditions: the task actually supplies a readable machine-readable contract; the agent can determine whether the bundled CLI is compatible with that contract
- `make-common-cli-independent-of-unused-fallbacks` (reuse-script, selected): `python -B scripts/law_to_markdown.py`
  - inputs/parameter sources: input path supplied by the user; optional law decision and artifact level
  - outputs: review report and conditionally a final Markdown deliverable
  - preconditions: Python is available; format-specific packages are installed only when the corresponding local fallback is selected

## Remaining agent work

- interpret contract semantics and classify the document
- manually satisfy contract-only output/report requirements when the CLI is incompatible
- select the correct classification parameter
- obtain consent and ensure dependencies exist before PDF/DOCX fallback

## Failure and fallback

If an optimized step is not applicable or fails, keep the original task result and continue with the package's SKILL.md agent workflow; do not count the fallback as automated success.

Exit code 2 means the helper is not applicable to that input. Exit code 1 means a required input, dependency, binding, or program condition failed and should be fixed before retrying the helper.
