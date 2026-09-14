# Optimized skill usage

Delivery: `draft`; bounded behavior: `not-run`.

## Use this package

Use the package as an ordinary skill:

`skvm run --prompt "<task>" --skill <package-path> --workdir "<project-dir>" --model "<provider/model>"`

The original task result remains in its original work directory. This package is a separate development candidate.

## Optimized steps

- `clarify-contract-first-workflow` (restructure-docs, selected)
  - inputs/parameter sources: an optional project-supplied i18n contract, manifest, or configuration; the user-declared or discovered source files and existing project metadata
  - outputs: a contract-bounded extraction, replacement, locale-generation, reporting, and verification procedure in SKILL.md
  - preconditions: the agent can read the project instructions and relevant local files

## Remaining agent work

- interpret semantic user-visible text when no exact confirmation rule exists
- produce accurate translations and preserve behavior
- select and run project-appropriate validation where available

## Failure and fallback

If an optimized step is not applicable or fails, keep the original task result and continue with the package's SKILL.md agent workflow; do not count the fallback as automated success.

Exit code 2 means the helper is not applicable to that input. Exit code 1 means a required input, dependency, binding, or program condition failed and should be fixed before retrying the helper.

