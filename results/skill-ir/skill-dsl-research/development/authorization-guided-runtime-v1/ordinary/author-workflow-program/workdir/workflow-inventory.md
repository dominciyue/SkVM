# Offline GitHub Actions workflow inventory

`workflow-inventory.py` is a reusable local command for bounded, repeatable workflow review:

```powershell
python .\workflow-inventory.py <workflow-directory> <output-json>
```

Example:

```powershell
python .\workflow-inventory.py .\source .\workflow-inventory.json
```

It recursively enumerates `.yml` and `.yaml` files and records workflow-level and job-level `permissions`, preserving the distinction between `omitted`, an explicitly empty map (`{}`), and a declared value. It also records every `uses:` reference with file path, job association where available, line number, and source-line evidence. The output is JSON.

## Supported runtime and dependencies

- Tested with **Python 3.12.13**.
- Requires only the Python standard library; no packages, network access, GitHub API, YAML library, workflow execution, or source modification is required.
- Node.js is not required. Python was selected because it is available in the review environment.

## YAML support boundary

This is deliberately a small inventory command, not a general YAML parser or semantic security assessor. It supports the ordinary GitHub Actions syntax used by this task: indentation-based mappings and lists, quoted/plain scalar values, comments, nested step mappings, and `{}` for explicit empty permissions. It does **not** evaluate expressions or anchors/aliases/merge keys, custom YAML tags, or every YAML scalar/flow-collection form. Unsupported constructs must be reviewed by the agent rather than silently treated as security conclusions. The command never executes workflow content.

The reviewing agent retains responsibility for semantic security assessment, deployment assumptions, and patch decisions. The original security-review skill's other duties remain outside this bounded inventory task.
