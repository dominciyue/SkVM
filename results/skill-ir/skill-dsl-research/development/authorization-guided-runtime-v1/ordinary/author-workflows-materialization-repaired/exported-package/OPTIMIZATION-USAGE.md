# Optimized skill usage

Delivery: `draft`; bounded behavior: `not-run`.

## Use this package

Use the package as an ordinary skill:

`skvm run --prompt "<task>" --skill <package-path> --workdir "<project-dir>" --model "<provider/model>"`

The original task result remains in its original work directory. This package is a separate development candidate.

## Optimized steps

Resolve executable paths relative to the directory containing SKILL.md; pass task input/output paths from the project directory or as absolute paths.

- `clarify-workflow-review-contract` (restructure-docs, selected)
  - inputs/parameter sources: user-requested scan scope; workflow or CI configuration files found within that scope
  - outputs: workflow/job permission inventory with file/line evidence; action uses inventory with ref classification; scoped security report with offline limitations
  - preconditions: the request is focused on workflow or CI configuration; the relevant files are available locally

## Remaining agent work

- interpret YAML and inheritance accurately
- assess security impact
- avoid claiming unavailable live facts

## Failure and fallback

If an optimized step is not applicable or fails, keep the original task result and continue with the package's SKILL.md agent workflow; do not count the fallback as automated success.

Use each program's documented exit codes and diagnostics; this package does not impose a shared exit-code convention. Manifests and validation reports are for diagnosis, not routine prerequisites.

