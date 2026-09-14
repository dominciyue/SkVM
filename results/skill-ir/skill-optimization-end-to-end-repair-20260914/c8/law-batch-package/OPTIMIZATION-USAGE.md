# Optimized skill usage

Delivery: `draft`; bounded behavior: `not-run`.

## Use this package

Use the package as an ordinary skill:

`skvm run --prompt "<task>" --skill <package-path> --workdir "<project-dir>" --model "<provider/model>"`

The original task result remains in its original work directory. This package is a separate development candidate.

## Optimized steps

- `generate-contract-checker` (generate-script, selected): `python -B scripts/contract_checker.py`
  - inputs/parameter sources: --root: completed per-input root containing protected inputs and outputs; --contract: JSON contract path; --source: original source document path
  - outputs: concise JSON completion summary on stdout; exit status 0 only when all supported checks pass
  - preconditions: Python 3 is available; the contract uses the observed object shape for protectedInputs, outputs, reviewEvidence, and exactOutputSet; the completed root contains the contract-relative protected inputs and outputs
- `document-contract-workflow` (restructure-docs, selected)
  - inputs/parameter sources: skill resource root; input document path; optional JSON contract and per-input root
  - outputs: copy-ready conversion and contract-check commands
  - preconditions: the agent is operating from the declared skill resource root

## Remaining agent work

- classify the document under the supplied contract
- compare protected-input hashes before and after processing when snapshots are available
- review semantic quality not declared as a deterministic invariant
- select the contract path only when the task supplies one
- retain the original broad workflow for inputs without the supported contract shape

## Failure and fallback

If an optimized step is not applicable or fails, keep the original task result and continue with the package's SKILL.md agent workflow; do not count the fallback as automated success.

Exit code 2 means the helper is not applicable to that input. Exit code 1 means a required input, dependency, binding, or program condition failed and should be fixed before retrying the helper.
