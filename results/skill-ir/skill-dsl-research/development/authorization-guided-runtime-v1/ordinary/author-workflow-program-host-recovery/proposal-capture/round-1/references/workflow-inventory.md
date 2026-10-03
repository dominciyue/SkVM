# Offline GitHub Actions workflow inventory

Use the bundled inventory before semantic review when the requested scope contains GitHub Actions workflows and Python 3 is available. Resolve the script relative to the directory containing `SKILL.md`:

```sh
python <skill-dir>/scripts/workflow_inventory.py <workflow-directory> <output-json>
```

Both paths are required and may point anywhere permitted by the task. The command recursively reads `.yml` and `.yaml` files, then writes JSON containing:

- workflow- and job-level `permissions` with `omitted`, `explicit_empty` (`{}`), `declared_null` (a bare `permissions:` with no map entries), or `declared` state;
- every `uses:` reference, its containing job when available, source line, and source-line evidence;
- relative file paths and line counts.

It uses only the Python 3 standard library, performs no network access, and never executes or changes workflows. On success stdout is a concise JSON completion record; diagnostics go to stderr.

## Supported YAML boundary

This is a line-oriented evidence collector, not a complete YAML parser. It supports the common block-style GitHub Actions form: space-indented mappings and sequences, plain or quoted single-line scalars, comments, block scalar bodies, and `{}` for explicit empty permissions. It does not resolve anchors, aliases, merge keys, tags, multi-document semantics, arbitrary flow mappings, or tabs used for indentation. Review unsupported syntax directly or use an appropriate local YAML parser if the task permits it; do not treat partial inventory as a security conclusion.

The inventory does not decide whether permissions are excessive, whether an action reference is trustworthy, or whether a deployment is exploitable. The reviewing agent must inspect the source, account for inherited/default permissions and trust boundaries, perform the skill's dependency/secrets/deep-scan duties within scope, verify findings, and decide whether to propose patches.
