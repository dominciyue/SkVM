# Optimized skill usage

Delivery: `draft`; bounded behavior: `not-run`.

## Use this package

Use the package as an ordinary skill:

`skvm run --prompt "<task>" --skill <package-path> --workdir "<project-dir>" --model "<provider/model>"`

The original task result remains in its original work directory. This package is a separate development candidate.

## Optimized steps

No executable step was selected; follow `SKILL.md`.

## Remaining agent work

No residual duty was declared for the selected steps.

## Failure and fallback

If an optimized step is not applicable or fails, keep the original task result and continue with the package's SKILL.md agent workflow; do not count the fallback as automated success.

Exit code 2 means the helper is not applicable to that input. Exit code 1 means a required input, dependency, binding, or program condition failed and should be fixed before retrying the helper.
