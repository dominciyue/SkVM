# Optimized skill usage

Delivery: `draft`; bounded behavior: `not-run`.

## Use this package

Use the package as an ordinary skill:

`skvm run --prompt "<task>" --skill <package-path> --workdir "<project-dir>" --model "<provider/model>"`

The original task result remains in its original work directory. This package is a separate development candidate.

## Optimized steps

Resolve executable paths relative to the directory containing SKILL.md; pass task input/output paths from the project directory or as absolute paths.

- `contract-first-i18n-workflow` (restructure-docs, selected)
  - inputs/parameter sources: project contract/config when supplied; actual source files in task scope; framework/package manifest; locale and output declarations
  - outputs: localized source files within allowed scope; declared locale/config/report artifacts; verification result
  - preconditions: the agent can read the supplied project files; the contract or framework rules define the applicable boundary

## Remaining agent work

- Choose translation wording and semantic mappings
- Handle unsupported formats or ambiguous scope explicitly
- Do not treat self-verification as proof of translation quality

## Failure and fallback

If an optimized step is not applicable or fails, keep the original task result and continue with the package's SKILL.md agent workflow; do not count the fallback as automated success.

Use each program's documented exit codes and diagnostics; this package does not impose a shared exit-code convention. Manifests and validation reports are for diagnosis, not routine prerequisites.

