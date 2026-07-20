# Environment Variable Manager

Materialized system: ir-static.

## Intent

Audit environment-variable definitions and references, identify configuration and secret-handling risks, and produce safe synchronized configuration artifacts without exposing or modifying real secrets.

## Inputs

- project-workspace: [required] The current project workspace containing environment files, source code, deployment configuration, or framework configuration to audit.
- requested-scope: [optional] Any user-specified audit scope, output locations, framework, or synchronization target.

## Required Outputs

- env-example: [required] A safe .env.example template containing variable names and documentation but no real secret values.
- env-schema: [required] A .env.schema.json artifact containing structured validation rules inferred from available project evidence.
- audit-report: [required] An environment analysis report in the user-requested format that distinguishes confirmed findings from items requiring human confirmation.

## Preconditions

- workspace-readable: [runtime] The project workspace and files in the requested scope are readable.
- output-contract-known: [runtime] Use the user's exact requested output names and structure when they are specified; otherwise use the skill's documented artifacts.

## Tool Requirements

- tool-filesystem (filesystem): [required] List, read, compare, and write project files within the current workspace.
  - Availability check: Confirm the current project workspace can be listed and required files can be read.
  - Alternatives: agent-native workspace file tools.
  - Linux: Use repository-relative paths and preserve file permissions.
  - Macos: Use repository-relative paths and account for case-insensitive filesystems when applicable.
  - Windows: Use repository-relative paths and native Windows-safe file operations.
- tool-search (text search): [required] Search recursively for environment definitions, code references, deployment references, and possible hardcoded credentials.
  - Availability check: Confirm recursive text search is available or fall back to recursive file inspection.
  - Alternatives: agent-native recursive search, manual recursive file inspection.
  - Linux: Prefer an available recursive search tool without assuming GNU-only flags.
  - Macos: Prefer an available recursive search tool without assuming GNU-only flags.
  - Windows: Prefer an available native recursive search tool such as ripgrep or PowerShell search.

## Environment Assumptions

- env-host-filesystem: [runtime; linux, macos, windows, wsl, container] Path syntax, hidden-file handling, encodings, permissions, and link behavior vary across host operating systems; keep all operations inside the current workspace.
- env-framework-conventions: [runtime; linux, macos, windows, wsl, container] Frameworks and deployment systems differ in environment-file loading, public variable prefixes, build-time versus runtime variables, and monorepo inheritance.

## Execution Steps

1. Discover the audit scope (step-discover-project)
   - Kind: read
   - Required: true
   - Depends on: none
   - Success checks: check-project-scope
   - Description: Inspect the current workspace and user request to locate project files, .env variants, source code, framework configuration, CI, container, and deployment files without assuming an unprovided subdirectory.
2. Inventory environment definitions (step-inventory-definitions)
   - Kind: analyze
   - Required: true
   - Depends on: step-discover-project
   - Success checks: check-secret-redaction
   - Description: Find .env variants and record variable names, source files, and empty status while keeping all real values out of reports and terminal output.
3. Scan code and deployment references (step-scan-references)
   - Kind: analyze
   - Required: true
   - Depends on: step-discover-project
   - Success checks: check-reference-scan
   - Description: Scan JavaScript and TypeScript process.env references, Python os.environ and os.getenv references, and relevant CI, container, deployment, monorepo, and dynamic-access locations.
4. Classify environment findings (step-classify-findings)
   - Kind: analyze
   - Required: true
   - Depends on: step-inventory-definitions, step-scan-references
   - Success checks: check-classification-boundary
   - Description: Compare definitions and references to identify defined-and-used variables, statically unconfirmed unused candidates, used-but-undefined variables, hardcoded sensitive information, example-file drift, and client-exposure risks.
5. Infer validation rules (step-infer-validation)
   - Kind: analyze
   - Required: true
   - Depends on: step-classify-findings
   - Success checks: check-validation-evidence
   - Description: Infer requiredness, safe defaults, URL formats, port ranges, boolean formats, and sensitivity constraints only where project evidence supports them.
6. Write safe audit artifacts (step-write-artifacts)
   - Kind: edit
   - Required: true
   - Depends on: step-classify-findings, step-infer-validation
   - Success checks: check-required-outputs
   - Description: Write the requested report, .env.example, and .env.schema.json using names and structure required by the current task, without changing real .env files or copying production secrets.
7. Verify safety and consistency (step-verify-artifacts)
   - Kind: verify
   - Required: true
   - Depends on: step-write-artifacts
   - Success checks: check-output-verification
   - Description: Re-read generated artifacts, confirm valid structure and requested filenames, ensure real environment files are unchanged, and search outputs for copied secret values before reporting completion.

## Rules

- rule-redact-secrets: [never/high/runtime] Never reveal real environment or secret values in generated artifacts, logs, terminal output, issues, or chat output.
- rule-preserve-real-env: [never/high/runtime] Never delete or modify a real .env file without first presenting the difference and obtaining user confirmation.
- rule-unused-is-unconfirmed: [must/high/runtime] Label variables with no static reference as unconfirmed unused candidates until CI, containers, deployment platforms, and dynamic access are checked.
- rule-safe-example: [must/high/runtime] The generated .env.example contains variable names, safe examples or documentation, and placeholders only; it never copies real production secrets.
- rule-framework-exposure: [must/high/runtime] Treat framework public prefixes as client-exposure boundaries and report sensitive variables that use a public prefix.
- rule-respect-output-contract: [must/medium/runtime] Produce every artifact requested by the user using the exact requested filename and structure.

## Runtime Checks

- preflight-tool-filesystem: preflight on tool-filesystem. Assertion: filesystem is available or an alternative exists: agent-native workspace file tools. On failure: fallback.
- preflight-tool-search: preflight on tool-search. Assertion: text search is available or an alternative exists: agent-native recursive search, manual recursive file inspection. On failure: fallback.
- check-project-scope: step-success on step-discover-project. Assertion: The audit scope is rooted in the current workspace or an explicit user-provided path, and relevant project areas have been identified.. On failure: fallback.
- check-secret-redaction: rule-violation on rule-redact-secrets. Assertion: The inventory and visible output contain variable names, origins, and empty status but no copied real secret values.. On failure: abort.
- check-reference-scan: step-success on step-scan-references. Assertion: Code and relevant deployment or dynamic-access locations were searched using the languages and framework evidence present in the workspace.. On failure: report.
- check-classification-boundary: output on rule-unused-is-unconfirmed. Assertion: The report separates defined-and-used, unconfirmed-unused, used-but-undefined, hardcoded-secret, and exposure-risk findings without overstating static evidence.. On failure: retry.
- check-validation-evidence: step-success on step-infer-validation. Assertion: Requiredness, defaults, types, formats, ranges, and sensitivity constraints are supported by project evidence or explicitly marked as uncertain.. On failure: report.
- check-required-outputs: output on step-write-artifacts. Assertion: The requested report, .env.example, and .env.schema.json exist at the exact requested paths and are parseable where structured output is required.. On failure: retry.
- check-output-verification: output on step-verify-artifacts. Assertion: Generated artifacts are structurally valid, real environment files are unchanged, and no real secret value was copied into output.. On failure: abort.
- check-rule-redact-secrets: rule-violation on rule-redact-secrets. Assertion: Never reveal real environment or secret values in generated artifacts, logs, terminal output, issues, or chat output.. On failure: abort.
- check-rule-preserve-real-env: rule-violation on rule-preserve-real-env. Assertion: Never delete or modify a real .env file without first presenting the difference and obtaining user confirmation.. On failure: abort.
- check-rule-unused-is-unconfirmed: output on rule-unused-is-unconfirmed. Assertion: Label variables with no static reference as unconfirmed unused candidates until CI, containers, deployment platforms, and dynamic access are checked.. On failure: abort.
- check-rule-safe-example: rule-violation on rule-safe-example. Assertion: The generated .env.example contains variable names, safe examples or documentation, and placeholders only; it never copies real production secrets.. On failure: abort.
- check-rule-framework-exposure: rule-violation on rule-framework-exposure. Assertion: Treat framework public prefixes as client-exposure boundaries and report sensitive variables that use a public prefix.. On failure: abort.
- check-rule-respect-output-contract: output on rule-respect-output-contract. Assertion: Produce every artifact requested by the user using the exact requested filename and structure.. On failure: report.

## Recovery Policies

- recovery-scope-current-workspace: when An expected project subdirectory is absent or was not supplied by the user., use-alternative-tool up to 1 time(s). Treat the current work directory as the project root, inspect it directly, and report any remaining scope ambiguity.
- recovery-search-fallback: when The preferred recursive text-search tool is unavailable., use-alternative-tool up to 1 time(s). Use agent-native recursive search or enumerate and inspect relevant text files with platform-native file operations.
- recovery-repair-generated-output: when A generated artifact is missing, malformed, inconsistent, or contains unsafe copied data., retry up to 1 time(s). Repair only generated artifacts, then repeat structure, protected-file, and secret-redaction verification.

## Executable Public Contract Artifact

- Read the protected runtime contract at `.skvm-artifact/public-runtime-contract.json` before producing or repairing outputs.
- Use only confirmed rules for required schema constraints; advisory evidence is not a hard requirement.
- The Runner validates public evidence and may request at most one contract-bound repair.
