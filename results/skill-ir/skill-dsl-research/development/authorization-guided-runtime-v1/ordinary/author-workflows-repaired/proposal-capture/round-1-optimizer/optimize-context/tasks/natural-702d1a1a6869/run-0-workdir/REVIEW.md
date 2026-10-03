# GitHub Actions Security Review

**Project/scope:** `./source`  
**Review date:** 2026-10-03  
**Mode:** Offline static review using the supplied `security-review` skill  
**Files reviewed:** 1 (`source/release.yml`)  
**Focus:** GitHub Actions token permissions and `uses:` action references only

## Findings Summary

| Severity | Count |
|---|---:|
| 🔴 CRITICAL | 0 |
| 🟠 HIGH | 2 |
| 🟡 MEDIUM | 0 |
| 🔵 LOW | 0 |
| ⚪ INFO | 0 |
| **TOTAL** | **2** |

**Dependency/CVE audit:** Not performed; outside the requested scope and unavailable for live verification in an offline review.  
**Secrets scan:** No repository-wide secrets scan was performed; unrelated whole-repository audit duties are outside scope.  
**Inventory:** See `workflow-inventory.json` for every workflow/job permission declaration and every action-reference occurrence with file/line evidence.

## Scope Resolution and Inventory Summary

The supplied `source` directory contains one YAML file, `source/release.yml`. It is directly under `source/`, not under a conventional `.github/workflows/` directory, but it was treated as the supplied workflow artifact.

The workflow triggers on pushed tags matching `v*` (`source/release.yml:3-6`). Its workflow-level permission map declares:

```yaml
permissions:
  contents: write
  id-token:[REDACTED]
```

Evidence: `source/release.yml:8-10`.

Permission declaration states were kept distinct:

| Job | Declaration state | Statically effective permissions | Evidence |
|---|---|---|---|
| `build` | **Omitted; inherits workflow** | `contents: write`, `id-token:[REDACTED]; unlisted scopes `none` | `source/release.yml:13-21`, inherited from `:8-10` |
| `release` | **Omitted; inherits workflow** | `contents: write`, `id-token:[REDACTED]; unlisted scopes `none` | `source/release.yml:71-74`, inherited from `:8-10` |
| `npm-publish` | **Explicit map** | `contents: read`, `id-token:[REDACTED]; unlisted scopes `none` | `source/release.yml:99-101` |

No workflow or job uses an **explicitly empty** permission declaration such as `permissions: {}`. Omitted job permissions are not recorded as explicitly empty: `build` and `release` inherit the workflow-level map.

Eight `uses:` occurrences were found, comprising six unique references. Every reference uses a mutable major-version tag rather than a full commit SHA:

- `actions/checkout@v4` — lines 23, 76, 112
- `oven-sh/setup-bun@v2` — line 28
- `actions/upload-artifact@v4` — line 63
- `actions/download-artifact@v4` — line 81
- `softprops/action-gh-release@v2` — line 87
- `actions/setup-node@v4` — line 117

## Findings by Category

### Authentication and Access Control: Workflow Token Permissions

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  
🟠 **HIGH — Build and release jobs inherit broader token authority than each job requires**  
**Confidence: HIGH**  
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Locations:**

- Workflow permission map: `source/release.yml:8-10`
- `build` job with no job-level permission override: `source/release.yml:13-21`
- Dependency installation and build commands: `source/release.yml:36-60`
- `release` job with no job-level permission override: `source/release.yml:71-74`
- GitHub release operation: `source/release.yml:86-94`
- Narrower `npm-publish` job map: `source/release.yml:99-101`

**Relevant code:**

```yaml
permissions:
  contents: write
  id-token:[REDACTED]

jobs:
  build:
    runs-on: macos-latest
    # permissions omitted: inherits both write scopes

  release:
    needs: build
    runs-on: ubuntu-latest
    # permissions omitted: inherits both write scopes
```

**Risk:**

The `build` job inherits both `contents: write` and `id-token:[REDACTED] while checking out code, invoking a third-party setup action, installing dependencies, and running project build commands. If any executed action, dependency lifecycle path, or build script were compromised, the job would have repository-content write authority and could request an OIDC token. The build steps shown do not demonstrate a need for either capability beyond ordinary source checkout.

The `release` job needs `contents: write` to create the GitHub release, but it also inherits `id-token:[REDACTED] even though no release step shown requests OIDC authentication. Granting OIDC token issuance to jobs that do not use it unnecessarily expands the credential surface.

The `npm-publish` job is better scoped: it explicitly declares `contents: read` and `id-token:[REDACTED] at lines 99-101.

**Recommended fix (proposal only):**

Declare least-privilege permissions per job instead of granting both write capabilities at workflow scope. Based only on the visible steps, a likely structure is:

```yaml
permissions: {}

jobs:
  build:
    permissions:
      contents: read

  release:
    permissions:
      contents: write

  npm-publish:
    permissions:
      contents: read
      id-token:[REDACTED]
```

Validate whether artifact upload/download behavior or repository policy requires any additional scope before adopting this proposal.

**Reference:** GitHub Actions least-privilege `GITHUB_TOKEN` and OIDC permission design.

**Self-verification:**

- Re-read all three job declarations and the workflow-level map.
- Confirmed `build` has no job-level `permissions` key between lines 13-70.
- Confirmed `release` has no job-level `permissions` key between lines 71-95.
- Confirmed `npm-publish` has an explicit override at lines 99-101.
- Confirmed no visible `build` or `release` step explicitly consumes an OIDC token.
- No upstream reusable workflow or composite action can change the fact that these jobs receive the declared token permissions; however, offline review cannot observe repository rules or runtime token use inside fetched actions.

---

### Supply-Chain Integrity: Action References

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  
🟠 **HIGH — All external actions are referenced by mutable major-version tags**  
**Confidence: HIGH**  
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Locations:**

- `actions/checkout@v4` — `source/release.yml:23`, `:76`, `:112`
- `oven-sh/setup-bun@v2` — `source/release.yml:28`
- `actions/upload-artifact@v4` — `source/release.yml:63`
- `actions/download-artifact@v4` — `source/release.yml:81`
- `softprops/action-gh-release@v2` — `source/release.yml:87`
- `actions/setup-node@v4` — `source/release.yml:117`

**Representative code:**

```yaml
uses: oven-sh/setup-bun@v2
uses: softprops/action-gh-release@v2
uses: actions/setup-node@v4
```

**Risk:**

Major-version tags are movable references. A future tag update or upstream compromise can change the code executed by this release workflow without a corresponding commit in this repository. The impact is elevated because:

- `build` executes tagged actions while holding inherited `contents: write` and `id-token:[REDACTED]
- `release` executes tagged actions while holding inherited `contents: write` and `id-token:[REDACTED]
- `npm-publish` executes tagged actions while able to request an OIDC token used for trusted npm publishing.

A compromised action in these jobs could misuse the job's token, alter release inputs, tamper with artifacts available to later steps, or interfere with package publication.

**Recommended fix (proposal only):**

Pin every external action to a reviewed full-length commit SHA, retaining the release tag in a comment for maintainability. Example form:

```yaml
- uses: actions/checkout@<reviewed-40-character-commit-sha> # v4
```

Use a controlled update mechanism to review and advance pinned SHAs. Exact SHAs are intentionally not proposed here because this was an offline review and no upstream reference resolution or authenticity verification was performed.

**Reference:** GitHub Actions supply-chain hardening; immutable action pinning.

**Self-verification:**

- Enumerated every `uses:` key in the supplied file; there are eight occurrences and six unique references.
- Confirmed each suffix is `@v2` or `@v4`, not a full commit SHA.
- No local actions (`./path`) or reusable-workflow `uses:` references were present.
- Did not infer that any referenced version is currently compromised or vulnerable; the finding concerns mutable reference integrity only.

## Patch Proposals

**Review each patch before applying. Nothing has been changed yet.**

No source patch was applied, as requested. The snippets above are design proposals only. Exact action SHAs require separate, trusted upstream resolution and review.

## Self-Verification Summary

A second static pass was performed against `source/release.yml` to verify:

1. Workflow-level permissions and line evidence.
2. Whether each job declares, omits, or explicitly empties permissions.
3. Effective static inheritance for jobs with omitted declarations.
4. Every `uses:` occurrence and its exact reference suffix.
5. Whether a full commit SHA was used anywhere.
6. Whether findings were limited to permission and action-reference concerns.

The pass confirmed that `build` and `release` omit job-level permissions and inherit the workflow map; `npm-publish` explicitly overrides it; no permission map is explicitly empty; and all eight action uses are tag-based.

## Remaining Review Limits

- This was an **offline static review**. No workflows, actions, scripts, package managers, or deployment operations were executed.
- No live GitHub, marketplace, advisory, npm, repository-setting, environment, branch-protection, tag-protection, or deployment state was queried.
- No claim is made about live CVEs, current action-tag targets, upstream action integrity, action ownership, or whether deployed releases/packages match this file.
- Exact commit SHAs behind action tags were not resolved or verified.
- Repository/organization default token settings, rulesets, protected environments, trusted-publisher configuration, and who may create matching tags were not available for verification.
- The contents of remote actions referenced by `uses:` were not available offline and were not audited.
- Project scripts invoked by `run:` steps and dependency lifecycle behavior were not reviewed because unrelated whole-repository audit duties are outside this task's scope.
- The supplied file's location is nonstandard for a checked-in GitHub workflow. This review does not claim that GitHub currently discovers or executes it at that path.
- Artifact provenance, signing, runtime isolation, and actual npm/GitHub release deployment behavior were not verified.
- No source files were changed and no patches were applied. Only `workflow-inventory.json` and `REVIEW.md` were created as requested.
