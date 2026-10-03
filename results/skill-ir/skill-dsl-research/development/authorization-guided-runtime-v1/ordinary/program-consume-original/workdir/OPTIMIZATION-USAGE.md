# Optimized skill usage

Delivery: `draft`; bounded behavior: `passed`.

## Use this package

Use the package as an ordinary skill:

`skvm run --prompt "<task>" --skill <package-path> --workdir "<project-dir>" --model "<provider/model>"`

The original task result remains in its original work directory. This package is a separate development candidate.

## Optimized steps

Resolve executable paths relative to the directory containing SKILL.md; pass task input/output paths from the project directory or as absolute paths.

- `generate-github-actions-inventory` (generate-script, selected): `python -B scripts/workflow_inventory.py <arg-1> <output>`
  - inputs/parameter sources: workflow directory supplied as argv[1]; output JSON path supplied as argv[2]
  - fill command placeholders from: workflow directory supplied as argv[1]; output JSON path supplied as argv[2]; caller-selected JSON inventory containing workflow/job permission states and uses references with source evidence; skill: The collector is evidence-only; security assessment and self-verification remain part of the skill workflow.; task: Do not execute workflows, access the network, alter source inputs, or hard-code workflow findings.; environment: Python 3 was observed in the source run; availability remains conditional for other deployments.
  - outputs: caller-selected JSON inventory containing workflow/job permission states and uses references with source evidence
  - preconditions: Python 3 is available; the workflow directory is readable; workflow YAML is within the documented line-oriented subset or unsupported syntax is handled by the agent

## Remaining agent work

- select the authorized workflow scope
- inspect unsupported YAML constructs directly
- perform semantic security assessment and self-verification
- write the scoped report and decide whether patches are warranted

## Failure and fallback

If an optimized step is not applicable or fails, keep the original task result and continue with the package's SKILL.md agent workflow; do not count the fallback as automated success.

Use each program's documented exit codes and diagnostics; this package does not impose a shared exit-code convention. Manifests and validation reports are for diagnosis, not routine prerequisites.

